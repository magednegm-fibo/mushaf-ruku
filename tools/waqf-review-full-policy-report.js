#!/usr/bin/env node
// tools/waqf-review-full-policy-report.js
//
// Permanent full-policy reconciliation report for WAQF_REVIEW.
//
// find-unmapped-review-positions.js (the older sibling tool) answers a
// narrower question: "is this (surah:ayah:type) covered by WAQF_POSITIONS
// or DEFAULT_MARK_MANUAL_ADDITIONS?" It does NOT know about the two
// project-wide exclusion policies already implemented in readerManager.js:
//
//   1) Type-conflict exclusion: if the mark's word also carries a
//      stronger/incompatible mark (لا / صلي / تعانق, or a losing side of
//      a documented type-vs-type conflict), the word is never colored —
//      see DEFAULT_MARK_MANUAL_EXCLUSIONS and
//      DEFAULT_MARK_CONFLICT_RESOLUTIONS in readerManager.js.
//   2) Last-word ("رأس آية") exclusion: every DEFAULT_MARK_TYPES type
//      EXCEPT WAQF_LAZIM is never colored when the mark's word is the
//      ayah's last word (the ayah break itself already signals a stop).
//      WAQF_LAZIM is the one explicit, direct-request exception — see the
//      comment above DEFAULT_WAQF_LAZIM_WORDS in readerManager.js.
//
// A WAQF_REVIEW entry that will NEVER be colored regardless of whether a
// human ever finds its exact word (because it's always going to be
// excluded by one of the two policies above) is not a real open task. This
// tool reclassifies the "needs human" bucket from find-unmapped-review-
// positions.js into four buckets instead of two:
//
//   - already covered before this run (WAQF_POSITIONS / Manual Additions)
//   - resolved by the current DEFAULT_MARK_MANUAL_ADDITIONS state
//   - excluded by project policy (conflict or last-word) — will never need
//     a manual addition, no matter how precisely the word is identified
//   - genuinely still needs a human decision
//
// KNOWN_CONFLICT_EXCLUSIONS below is a small, explicit, hand-verified map
// (word-level exclusions confirmed directly in readerManager.js, or
// ayah-level LA/SILA coexistence confirmed by direct visual inspection of
// a physical mushaf) — never inferred or guessed.
//
// Input: WAQF_REVIEW_REPORT.md (the per-case markdown table this project
// already generates — surah:ayah, نص النسخ، ...، بشري؟). This tool does
// not regenerate that report; it reconciles it against the CURRENT
// readerManager.js / waqf-positions.js / data.js state.
//
// Usage:
//   node tools/waqf-review-full-policy-report.js
//   node tools/waqf-review-full-policy-report.js --dir /path/to/unzipped-release
//
// Project rule: read-only. Never edits waqf-positions.js, data.js, or
// readerManager.js — reports only.

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const args = process.argv.slice(2);
let rootDir = path.join(__dirname, '..');
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dir' && args[i + 1]) rootDir = path.resolve(args[++i]);
}

const DEFAULT_TYPES = ['TA_MUTLAQ', 'SAD_RUKHSA', 'WAQF_LAZIM', 'ZAY_JAWAZ', 'QAD_QILA', 'QIF', 'JEEM'];
// The one documented exception (readerManager.js, DEFAULT_WAQF_LAZIM_WORDS
// comment): "بخلاف ط وص أعلاه: تُضاف بالكامل... لا يُطبَّق استثناء
// 'آخر كلمة' هنا إطلاقًا".
// Types where the last-word exclusion is an EXPLICIT, direct-request
// project policy (documented as "طلب مباشر صريح" in readerManager.js).
// ZAY_JAWAZ is deliberately NOT included here: its last-word exclusion is
// still only an analogy-based assumption in readerManager.js, not a
// direct request. The three ZAY_JAWAZ cases that used to depend on that
// assumption are now resolved through KNOWN_CONFLICT_EXCLUSIONS instead
// (confirmed LA/SILA coexistence, verified against a physical mushaf) —
// so the last-word question for ZAY_JAWAZ in general remains open, it
// just no longer blocks any case in the current review batch.
const LAST_WORD_EXPLICIT_TYPES = new Set(['TA_MUTLAQ', 'SAD_RUKHSA', 'QAD_QILA', 'QIF', 'JEEM']);

function loadJs(filePath, filename) {
  const src = fs.readFileSync(filePath, 'utf8');
  const sandbox = { window: {}, console: console, self: {} };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: filename });
  return sandbox;
}

function extractBoundedObject(rmSrc, varName) {
  const anchor = 'var ' + varName;
  const start = rmSrc.indexOf(anchor);
  if (start < 0) return '{}';
  const braceStart = rmSrc.indexOf('{', start);
  let depth = 0, i = braceStart;
  for (; i < rmSrc.length; i++) {
    if (rmSrc[i] === '{') depth++;
    else if (rmSrc[i] === '}') { depth--; if (depth === 0) break; }
  }
  return rmSrc.slice(braceStart, i + 1);
}

function parseTypeBlocksBounded(objSrc) {
  const target = {};
  const typeRe = /'(TA_MUTLAQ|SAD_RUKHSA|WAQF_LAZIM|ZAY_JAWAZ|QAD_QILA|QIF|JEEM)':\s*\{/g;
  let tm;
  while ((tm = typeRe.exec(objSrc))) {
    const type = tm[1];
    let depth = 0, i = tm.index + tm[0].length - 1;
    for (; i < objSrc.length; i++) {
      if (objSrc[i] === '{') depth++;
      else if (objSrc[i] === '}') { depth--; if (depth === 0) break; }
    }
    const block = objSrc.slice(tm.index, i + 1);
    const keys = (block.match(/'(\d+:\d+:\d+)'/g) || []).map(k => k.slice(1, -1));
    target[type] = target[type] || new Set();
    keys.forEach(k => target[type].add(k));
  }
  return target;
}

function buildAyahIndex(dir) {
  const ayahs = {};
  const raw = fs.readFileSync(path.join(dir, 'data.js'), 'utf8');
  const re = /\{"surah":(\d+),"surahName":"([^"]*)","ayah":(\d+),"text":"((?:[^"\\]|\\.)*)","juzStart":\d+,"textIndopak":"((?:[^"\\]|\\.)*)"\}/g;
  let m;
  while ((m = re.exec(raw))) {
    const uth = JSON.parse('"' + m[4] + '"');
    const ind = JSON.parse('"' + m[5] + '"');
    ayahs[m[1] + ':' + m[3]] = {
      name: m[2],
      uthWords: uth.split(/\s+/).filter(Boolean),
      indTokens: ind.split(/\s+/).filter(Boolean)
    };
  }
  return ayahs;
}

function isLastWord(ayahs, surah, ayah, word) {
  const info = ayahs[surah + ':' + ayah];
  return info ? word === info.uthWords.length : false;
}

function buildCoverage(dir) {
  const waqfBox = loadJs(path.join(dir, 'waqf-positions.js'), 'waqf-positions.js');
  const positions = waqfBox.window.WAQF_POSITIONS || [];
  const rmSrc = fs.readFileSync(path.join(dir, 'readerManager.js'), 'utf8');
  const additionsByType = parseTypeBlocksBounded(extractBoundedObject(rmSrc, 'DEFAULT_MARK_MANUAL_ADDITIONS'));
  const ayahs = buildAyahIndex(dir);

  const posByAyahType = {};
  positions.forEach(function (p) {
    if (DEFAULT_TYPES.indexOf(p.type) === -1) return;
    if (isLastWord(ayahs, p.surah, p.ayah, p.word)) return;
    const ak = p.surah + ':' + p.ayah + ':' + p.type;
    posByAyahType[ak] = (posByAyahType[ak] || 0) + 1;
  });
  const addByAyahType = {};
  Object.keys(additionsByType).forEach(function (type) {
    additionsByType[type].forEach(function (key) {
      const parts = key.split(':');
      const ak = parts[0] + ':' + parts[1] + ':' + type;
      addByAyahType[ak] = (addByAyahType[ak] || 0) + 1;
    });
  });
  return { posByAyahType, addByAyahType, ayahs };
}

function isCoveredByData(cov, surah, ayah, type) {
  const ak = surah + ':' + ayah + ':' + type;
  if ((cov.posByAyahType[ak] || 0) > 0 || (cov.addByAyahType[ak] || 0) > 0) return true;
  if (type === 'JEEM') {
    const info = cov.ayahs[surah + ':' + ayah] || {};
    const toks = info.indTokens || [];
    let lastJeemOnly = true, anyJeem = false;
    for (let i = 0; i < toks.length; i++) {
      if (toks[i].indexOf('\u06DA') !== -1) { anyJeem = true; if (i < toks.length - 2) lastJeemOnly = false; }
    }
    if (anyJeem && lastJeemOnly) return true;
  }
  return false;
}

// Parse WAQF_REVIEW_REPORT.md's per-type tables into the "needs human"
// (بشري؟ = نعم) case list, restricted to the 7 coloring types.
function parseHumanCases(dir) {
  const md = fs.readFileSync(path.join(dir, 'WAQF_REVIEW_REPORT.md'), 'utf8');
  const lines = md.split('\n');
  let currentType = null;
  const cases = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = line.match(/^## ([A-Z_]+) \(\d+\)/);
    if (h) { currentType = h[1]; continue; }
    if (!currentType) continue;
    if (!line.startsWith('|')) continue;
    if (line.indexOf('سورة:آية') !== -1) continue;
    if (line.indexOf('---') !== -1) continue;
    const cols = line.split('|').map(s => s.trim());
    if (cols.length < 12) continue;
    const [, surahAyah, naskhWord, madinaWord, reason, sugg0, sugg1, confidence, madinaSymbol, manual, auto, human] = cols;
    if (human !== 'نعم') continue;
    if (DEFAULT_TYPES.indexOf(currentType) === -1) continue;
    const m = surahAyah.match(/^(\d+):(\d+)$/);
    if (!m) continue;
    cases.push({
      surah: parseInt(m[1], 10), ayah: parseInt(m[2], 10), type: currentType,
      confidence: confidence, naskhWord: naskhWord, sugg1: sugg1
    });
  }
  return cases;
}

// Determine whether a case's implied word is the ayah's actual last word,
// by locating the reported Naskh mark-word inside the ayah's Indopak text
// and checking whether it matches the ayah's last Madinah word once base
// letters are compared with tashkeel/waqf-glyph noise stripped. This is
// the same heuristic used to build the interactive WAQF_REVIEW review tool.
// Determine whether a case's implied word is the ayah's actual last word.
// Uses the project's OWN normalizeArabic() (searchManager.js) — the same
// Uthmani<->Indopak letter-form normalizer already battle-tested against
// the full mushaf for search — rather than a reinvented diacritic strip,
// since a naive strip does not fold tatweel, dotless-yeh, hamza-seat, or
// the other Perso-Arabic Indopak letter variants documented there.
// searchManager.js's normalizeArabic() deliberately leaves ٮ (U+066E
// DOTLESS BEH) unmapped project-wide, since across the WHOLE mushaf it is
// genuinely ambiguous (sometimes a hamza-seat, sometimes an alef-maksura/
// yeh substitute — see the comment above normalizeArabicCore in
// searchManager.js). That ambiguity is real for a global search index, but
// NOT here: this check only ever compares one already-identified Naskh
// mark-word against one specific ayah's own last Madinah word, a single
// local pair — not a mushaf-wide lookup — so folding ٮ the same way ى is
// already folded (-> ي) is safe in this narrow context and resolves the
// one remaining false negative this tool would otherwise report (e.g.
// Surah Ash-Shams's وَضُحٰٮهَا vs. Uthmani وَضُحَىٰهَا). Kept local to this
// file rather than changing the shared, intentionally-conservative
// normalizeArabic() in searchManager.js.
function foldLocalAmbiguousLetters(s) {
  return s.replace(/\u066E/g, 'ي');
}

function stripDiacritics(s, normalizeArabic) {
  return normalizeArabic(foldLocalAmbiguousLetters(s));
}

function looksLikeLastWord(ayahs, c, normalizeArabic) {
  const info = ayahs[c.surah + ':' + c.ayah];
  if (!info || !info.uthWords.length) return false;
  const lastMadinah = stripDiacritics(info.uthWords[info.uthWords.length - 1], normalizeArabic);
  let raw = (c.naskhWord || '').replace(/\s*\+\[.*?\]\s*$/, '').trim();
  raw = stripDiacritics(raw.replace(/[\u200B\u200C\u200D\uFEFF]/g, '').trim(), normalizeArabic);
  if (raw && raw.length > 1 && raw === lastMadinah) return true;
  // empty-letters case: the mark trails the ayah with no attached base
  // letters at all — structurally this only happens at the ayah's own
  // end, since mid-ayah marks are always attached to their host word.
  const cleaned = (c.naskhWord || '').replace(/[\u200B\u200C\u200D\uFEFF\s]/g, '');
  const hasLetters = /[\u0621-\u063A\u0641-\u064A\u0671-\u06D3]/.test(cleaned);
  if (!hasLetters) return true;
  return false;
}

// Known, already-documented type-conflict exclusions this tool can verify
// directly without needing a resolved word number (see readerManager.js
// comments near each DEFAULT_*_WORDS block, and the general policy: "أي
// علامة ص/ق/ز معاها علامة لا أو صلي، شيلها فورًا ولا تعتمدها بالتلوين").
const KNOWN_CONFLICT_EXCLUSIONS = {
  '16:70:QIF': 'تعارض قف×لا موثَّق في DEFAULT_MARK_MANUAL_EXCLUSIONS[QIF] (16:70:4)',
  '59:9:TA_MUTLAQ': 'تعارض ط×قف على نفس الكلمة (24) — اعتُمد قف بقرار مباشر',
  '4:142:ZAY_JAWAZ': 'تعارض لا×ز — WAQF_REVIEW يثبت LA على نفس الآية؛ تُعتمد LA فقط، طبقًا للسياسة العامة (تأكيد بصري مباشر من صورة المصحف)',
  '10:16:ZAY_JAWAZ': 'تعارض صلي×ز — SILA_REVIEW يثبت صلي غير محسومة على نفس الآية؛ تُستبعد ز طبقًا للسياسة العامة "أي علامة ز معاها لا أو صلي تُستبعد فورًا" (تأكيد بصري مباشر من صورة المصحف)',
  '79:20:ZAY_JAWAZ': 'تعارض صلي×ز — SILA_REVIEW يثبت صلي غير محسومة على نفس الآية؛ تُستبعد ز طبقًا للسياسة العامة "أي علامة ز معاها لا أو صلي تُستبعد فورًا" (تأكيد بصري مباشر من صورة المصحف)'
};

const covPre = null; // placeholder for readability; not used directly
const cov = buildCoverage(rootDir);
const cases = parseHumanCases(rootDir);

const searchBox = loadJs(path.join(rootDir, 'searchManager.js'), 'searchManager.js');
const normalizeArabic = searchBox.window.SearchManager.normalizeArabic;

const stillNeedsCoverage = [];
cases.forEach(function (c) {
  if (!isCoveredByData(cov, c.surah, c.ayah, c.type)) stillNeedsCoverage.push(c);
});

const excludedByPolicy = [];
const genuinelyRemaining = [];
stillNeedsCoverage.forEach(function (c) {
  const key = c.surah + ':' + c.ayah + ':' + c.type;
  if (KNOWN_CONFLICT_EXCLUSIONS[key]) {
    excludedByPolicy.push({ c: c, reason: KNOWN_CONFLICT_EXCLUSIONS[key] });
    return;
  }
  if (LAST_WORD_EXPLICIT_TYPES.has(c.type) && looksLikeLastWord(cov.ayahs, c, normalizeArabic)) {
    excludedByPolicy.push({ c: c, reason: 'رأس آية — آخر كلمة في الآية، مستبعدة تلقائيًا لهذا النوع (طلب مباشر صريح)' });
    return;
  }
  genuinelyRemaining.push(c);
});

const totalHuman = cases.length;
const alreadyOrResolved = totalHuman - stillNeedsCoverage.length;

console.log('=== WAQF_REVIEW full-policy reconciliation ===');
console.log('Root:', rootDir);
console.log('');
console.log('إجمالي حالات "يحتاج مراجعة بشرية" (من WAQF_REVIEW_REPORT.md، الأنواع السبعة الملوَّنة فقط):', totalHuman);
console.log('  محسوم بالفعل (WAQF_POSITIONS أو DEFAULT_MARK_MANUAL_ADDITIONS):', alreadyOrResolved);
console.log('  Excluded by project policy (تعارض نوع، أو آخر كلمة بطلب مباشر):', excludedByPolicy.length);
console.log('  يحتاج Manual فعلًا:', genuinelyRemaining.length);
console.log('');

if (excludedByPolicy.length) {
  console.log('--- Excluded by project policy ---');
  excludedByPolicy.forEach(function (x) {
    console.log('  ' + x.c.surah + ':' + x.c.ayah + '  ' + x.c.type + '  —  ' + x.reason);
  });
  console.log('');
}

if (genuinelyRemaining.length) {
  console.log('--- يحتاج Manual فعلًا ---');
  genuinelyRemaining.forEach(function (c) {
    console.log('  ' + c.surah + ':' + c.ayah + '  ' + c.type + '  ثقة=' + c.confidence);
  });
  console.log('');
  console.log('FAIL: ' + genuinelyRemaining.length + ' حالة تحتاج مراجعة يدوية فعلية.');
  process.exit(1);
}

console.log('PASS: لا توجد حالة تحتاج مراجعة يدوية فعلية بعد تطبيق كل سياسات المشروع.');
process.exit(0);
