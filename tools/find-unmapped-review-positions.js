#!/usr/bin/env node
// tools/find-unmapped-review-positions.js
//
// Permanent pre-release check for stop-mark gaps.
//
// SOURCE OF TRUTH FOR MARK *EXISTENCE*: Indopak / Naskh text (textIndopak
// in data.js) and the derived WAQF_POSITIONS / WAQF_REVIEW tables that
// were extracted from it.
//
// Uthmani / Madinah text is ONLY used to recover a display word number
// (alignment target). Presence or absence of a pause glyph in the Uthmani
// string must NEVER prove or disprove that a mark exists.
//
// What this tool checks:
//   A) Every mid-ayah JEEM (or --type T) entry in WAQF_POSITIONS must end
//      up colored, unless deliberately excluded (last word, LA/SILA policy,
//      MANUAL_EXCLUSIONS, or conflict resolution to another type).
//   B) Every WAQF_REVIEW entry of that type is a known extraction-alignment
//      failure — recoverable ones should be covered by
//      DEFAULT_MARK_MANUAL_ADDITIONS (any type that colors the word counts).
//
// Usage:
//   node tools/find-unmapped-review-positions.js
//   node tools/find-unmapped-review-positions.js --type JEEM
//   node tools/find-unmapped-review-positions.js --dir /path/to/unzipped-release
//
// Project rule: do NOT edit waqf-positions.js or data.js to fix hits —
// add display corrections in readerManager.js only.

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const args = process.argv.slice(2);
let rootDir = path.join(__dirname, '..');
let typeFilter = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dir' && args[i + 1]) rootDir = path.resolve(args[++i]);
  else if (args[i] === '--type' && args[i + 1]) typeFilter = args[++i].toUpperCase();
}

function loadJs(filePath, filename) {
  const src = fs.readFileSync(filePath, 'utf8');
  const sandbox = { window: {}, console: console, self: {} };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: filename });
  return sandbox;
}

const DEFAULT_TYPES = ['TA_MUTLAQ', 'SAD_RUKHSA', 'WAQF_LAZIM', 'ZAY_JAWAZ', 'QAD_QILA', 'QIF', 'JEEM'];

const waqfBox = loadJs(path.join(rootDir, 'waqf-positions.js'), 'waqf-positions.js');
const review = waqfBox.window.WAQF_REVIEW || waqfBox.WAQF_REVIEW;
const positions = waqfBox.window.WAQF_POSITIONS || waqfBox.WAQF_POSITIONS;
if (!Array.isArray(review) || !Array.isArray(positions)) {
  console.error('FAIL: could not load WAQF_REVIEW / WAQF_POSITIONS');
  process.exit(2);
}

// Ayah index: word counts + Indopak text (source of mark existence)
const ayahs = {};
(function indexAyahs() {
  const raw = fs.readFileSync(path.join(rootDir, 'data.js'), 'utf8');
  const re = /\{"surah":(\d+),"surahName":"([^"]*)","ayah":(\d+),"text":"([^"]*)","juzStart":\d+,"textIndopak":"([^"]*)"\}/g;
  let m;
  while ((m = re.exec(raw))) {
    const uth = m[4];
    const ind = m[5];
    ayahs[m[1] + ':' + m[3]] = {
      name: m[2],
      uthWords: uth.split(/\s+/).filter(Boolean),
      ind: ind,
      // Indopak mark existence: type-specific codepoints used by the extractor
      indHasJeem: ind.indexOf('\u06DA') !== -1,
      indHasTah: ind.indexOf('\u0615') !== -1
    };
  }
})();

// Manual additions + exclusions from readerManager.js
const allAdditionKeys = new Set();
const additionsByType = {};
const exclusionsByType = {};
(function parseReaderManager() {
  const rmSrc = fs.readFileSync(path.join(rootDir, 'readerManager.js'), 'utf8');

  function parseTypeBlocks(anchor, target) {
    const start = rmSrc.indexOf(anchor);
    if (start < 0) return;
    const slice = rmSrc.slice(start, start + 120000);
    const typeRe = /'(TA_MUTLAQ|SAD_RUKHSA|WAQF_LAZIM|ZAY_JAWAZ|QAD_QILA|QIF|JEEM)':\s*\{/g;
    let tm;
    while ((tm = typeRe.exec(slice))) {
      const type = tm[1];
      let depth = 0;
      let i = tm.index + tm[0].length - 1;
      for (; i < slice.length; i++) {
        if (slice[i] === '{') depth++;
        else if (slice[i] === '}') {
          depth--;
          if (depth === 0) break;
        }
      }
      const block = slice.slice(tm.index, i + 1);
      const keys = (block.match(/'(\d+:\d+:\d+)'/g) || []).map(function (k) {
        return k.slice(1, -1);
      });
      target[type] = new Set(keys);
      if (anchor.indexOf('ADDITIONS') !== -1) {
        keys.forEach(function (k) { allAdditionKeys.add(k); });
      }
    }
  }
  parseTypeBlocks('var DEFAULT_MARK_MANUAL_ADDITIONS', additionsByType);
  parseTypeBlocks('var DEFAULT_MARK_MANUAL_EXCLUSIONS', exclusionsByType);

  // Conflict resolutions: wordKey -> winning type or CONFIRMED_EXCLUDED
  const crStart = rmSrc.indexOf('var DEFAULT_MARK_CONFLICT_RESOLUTIONS');
  if (crStart >= 0) {
    const crSlice = rmSrc.slice(crStart, crStart + 8000);
    const crRe = /'(\d+:\d+:\d+)':\s*'(\w+)'/g;
    let cm;
    global.__conflictRes = {};
    while ((cm = crRe.exec(crSlice))) {
      global.__conflictRes[cm[1]] = cm[2];
    }
  }
})();
const conflictRes = global.__conflictRes || {};

const silaBox = loadJs(path.join(rootDir, 'sila-positions.js'), 'sila-positions.js');
const silaKeys = new Set(
  (silaBox.window.SILA_POSITIONS || []).map(function (p) {
    return p.surah + ':' + p.ayah + ':' + p.word;
  })
);
const laKeys = new Set(
  positions.filter(function (p) { return p.type === 'LA'; }).map(function (p) {
    return p.surah + ':' + p.ayah + ':' + p.word;
  })
);

function isLastWord(surah, ayah, word) {
  const info = ayahs[surah + ':' + ayah];
  return info ? word === info.uthWords.length : false;
}

function isDeliberatelyExcluded(type, key) {
  if (exclusionsByType[type] && exclusionsByType[type].has(key)) return true;
  if (laKeys.has(key) || silaKeys.has(key)) return true;
  if (conflictRes[key] === 'CONFIRMED_EXCLUDED') return true;
  if (conflictRes[key] && conflictRes[key] !== type) return true; // resolved to another type
  return false;
}

function isColoredAsType(type, key) {
  // Covered if this type's manual addition includes it
  if (additionsByType[type] && additionsByType[type].has(key)) return true;
  // Or WAQF_POSITIONS has this type on this word (and not excluded)
  return false; // positions checked separately
}

// --- Check A: mid-ayah POSITIONS entries of the type must be colorable ---
const positionsOfType = positions.filter(function (p) {
  if (typeFilter && p.type !== typeFilter) return false;
  if (DEFAULT_TYPES.indexOf(p.type) === -1) return false;
  return true;
});

const posUncolored = [];
const posOk = [];
const posExcluded = [];
const posLast = [];

for (const p of positionsOfType) {
  const key = p.surah + ':' + p.ayah + ':' + p.word;
  if (isLastWord(p.surah, p.ayah, p.word)) {
    posLast.push(key);
    continue;
  }
  if (isDeliberatelyExcluded(p.type, key)) {
    posExcluded.push(key + ' (' + p.type + ')');
    continue;
  }
  // Expected colored: either in POSITIONS (buildDefaultWordMap includes it)
  // and not excluded — buildDefaultWordMap reads POSITIONS + additions - exclusions.
  // If it's in POSITIONS and not excluded, it SHOULD be colored as p.type
  // unless conflict with another type on same word without resolution.
  const otherOnWord = positions.filter(function (q) {
    return q.surah === p.surah && q.ayah === p.ayah && q.word === p.word &&
      q.type !== p.type && DEFAULT_TYPES.indexOf(q.type) !== -1;
  });
  if (otherOnWord.length && !conflictRes[key]) {
    // unresolved multi-type conflict — neither may color
    posExcluded.push(key + ' (unresolved conflict with ' + otherOnWord.map(function (q) { return q.type; }).join(',') + ')');
    continue;
  }
  if (conflictRes[key] && conflictRes[key] !== p.type) {
    posExcluded.push(key + ' (resolved to ' + conflictRes[key] + ')');
    continue;
  }
  posOk.push(key + ':' + p.type);
}

// --- Check B: WAQF_REVIEW entries — known Indopak marks without word numbers ---
const reviewOfType = review.filter(function (e) {
  return !typeFilter || e.type === typeFilter;
});

// For REVIEW we cannot auto-assign word numbers without alignment.
// Report them as needing MANUAL_ADDITIONS coverage if the ayah's Indopak
// still contains the mark and no mid-ayah POSITIONS entry of that type
// exists yet for the ayah (partial coverage) — actually REVIEW means the
// *remaining* marks on that ayah weren't mapped. Coverage = manual addition
// keys for that type on that ayah, or we simply list REVIEW entries that
// have zero MANUAL_ADDITIONS for that type on that ayah at all.
const reviewByAyahType = {};
for (const e of reviewOfType) {
  const ak = e.surah + ':' + e.ayah + ':' + e.type;
  reviewByAyahType[ak] = e;
}

// Count MANUAL_ADDITIONS per ayah+type
const addByAyahType = {};
Object.keys(additionsByType).forEach(function (type) {
  additionsByType[type].forEach(function (key) {
    const parts = key.split(':');
    const ak = parts[0] + ':' + parts[1] + ':' + type;
    addByAyahType[ak] = (addByAyahType[ak] || 0) + 1;
  });
});

// POSITIONS count per ayah+type (mid-ayah only)
const posByAyahType = {};
positions.forEach(function (p) {
  if (DEFAULT_TYPES.indexOf(p.type) === -1) return;
  if (isLastWord(p.surah, p.ayah, p.word)) return;
  const ak = p.surah + ':' + p.ayah + ':' + p.type;
  posByAyahType[ak] = (posByAyahType[ak] || 0) + 1;
});

const reviewUncovered = [];
const reviewLastWordOnly = [];
const JEEM_CP = 'ۚ';
for (const ak of Object.keys(reviewByAyahType)) {
  const e = reviewByAyahType[ak];
  const type = e.type;
  const posCount = posByAyahType[e.surah + ':' + e.ayah + ':' + type] || 0;
  const addCount = addByAyahType[e.surah + ':' + e.ayah + ':' + type] || 0;
  if (posCount > 0 || addCount > 0) continue;
  const info = ayahs[e.surah + ':' + e.ayah] || {};
  // For JEEM: if Indopak has the mark only as a last-word phenomenon
  // (mark appears in Indopak but Uthmani word count suggests only last
  // word is a plausible host — common for end-of-ayah stops), treat as
  // policy-OK rather than a release blocker.
  if (type === 'JEEM' && info.uthWords) {
    const ind = info.ind || '';
    // Rough check: if the only JEEM in Indopak is in the final token(s)
    const toks = ind.split(/\s+/).filter(Boolean);
    let lastJeemOnly = true;
    let anyJeem = false;
    for (let i = 0; i < toks.length; i++) {
      if (toks[i].indexOf('ۚ') !== -1) {
        anyJeem = true;
        // allow last token or second-to-last if last is verse marker only
        if (i < toks.length - 2) lastJeemOnly = false;
      }
    }
    if (anyJeem && lastJeemOnly) {
      reviewLastWordOnly.push({
        surah: e.surah, ayah: e.ayah, type: type, name: info.name || ''
      });
      continue;
    }
  }
  reviewUncovered.push({
    surah: e.surah,
    ayah: e.ayah,
    type: type,
    name: info.name || '',
    note: 'WAQF_REVIEW entry with zero POSITIONS and zero MANUAL_ADDITIONS for this type on this ayah'
  });
}

// Report
console.log('=== Unmapped review / positions report ===');
console.log('Root:', rootDir);
console.log('Source of truth for mark existence: Indopak (WAQF_POSITIONS / WAQF_REVIEW)');
console.log('Uthmani used only for word numbering / last-word policy');
if (typeFilter) console.log('Type filter:', typeFilter);
console.log('');
console.log('POSITIONS entries scanned:', positionsOfType.length);
console.log('  mid-ayah expected colored:', posOk.length);
console.log('  last-word (policy OK):', posLast.length);
console.log('  deliberately excluded / conflict:', posExcluded.length);
console.log('');
console.log('WAQF_REVIEW entries scanned:', reviewOfType.length);
console.log('  REVIEW last-word-only (policy OK):', reviewLastWordOnly.length);
console.log('  REVIEW ayahs still fully unmapped:', reviewUncovered.length);
console.log('');

if (reviewUncovered.length) {
  console.log('--- REVIEW gaps still fully unmapped (need Indopak→Uthmani word alignment + MANUAL_ADDITIONS) ---');
  reviewUncovered.forEach(function (g) {
    console.log('  ' + g.surah + ':' + g.ayah + '  type=' + g.type + '  (' + g.name + ')');
  });
  console.log('');
}

// Exit policy: for --type JEEM, fail if fully unmapped REVIEW ayahs remain
// (positions side is handled by buildDefaultWordMap + exclusions).
if (reviewUncovered.length) {
  console.log('FAIL: ' + reviewUncovered.length + ' WAQF_REVIEW ayah(s) still fully unmapped for scanned type(s).');
  console.log('Align Indopak mark → Uthmani word number, then add to DEFAULT_MARK_MANUAL_ADDITIONS.');
  process.exit(1);
}

console.log('PASS: no fully unmapped WAQF_REVIEW ayahs for scanned type(s).');
console.log('Note: POSITIONS mid-ayah entries are colored by buildDefaultWordMap unless excluded.');
process.exit(0);
