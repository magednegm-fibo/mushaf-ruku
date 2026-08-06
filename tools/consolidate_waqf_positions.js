#!/usr/bin/env node
/**
 * WAQF_POSITIONS Consolidation Script (READ-ONLY on all existing files)
 * =======================================================================
 * Purpose:
 *   Make WAQF_POSITIONS the single authoritative source for every
 *   position DEFAULT_MARK_MANUAL_ADDITIONS (in readerManager.js) has
 *   approved, WITHOUT deleting anything from WAQF_REVIEW and WITHOUT
 *   touching any existing file. This is consolidation, not cleanup.
 *
 * What it does:
 *   1. Reads DEFAULT_MARK_MANUAL_ADDITIONS (word-level: "surah:ayah:word").
 *   2. For every entry, checks whether an identical
 *      {surah, ayah, word, type} record already exists in
 *      WAQF_POSITIONS.
 *        - If yes  -> counted as "already existing", not duplicated.
 *        - If no   -> the record is added to a NEW copy of the array.
 *   3. Checks each entry against DEFAULT_MARK_MANUAL_EXCLUSIONS for the
 *      same exact (surah:ayah:word) key under the same type. If the
 *      same word+type was ALSO manually excluded, that is a genuine
 *      data conflict — the script does NOT add it, and flags it in the
 *      report for a human decision instead of guessing.
 *   4. Writes a brand-new file, waqf-positions.consolidated.js, with
 *      only the WAQF_POSITIONS array updated. WAQF_REVIEW and every
 *      comment in the original file are carried over byte-for-byte
 *      unchanged. The original waqf-positions.js is never opened for
 *      writing.
 *   5. Prints and saves a report: added / already-existing / conflicts.
 *
 * Usage:
 *   node consolidate_waqf_positions.js /path/to/project [outDir]
 */

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractBalancedLiteral } = require('./extract_literal');

const projectDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, '..'); // default: this script lives in <project>/tools/
const outDir = process.argv[3] ? path.resolve(process.argv[3]) : __dirname;

const waqfPositionsPath = path.join(projectDir, 'waqf-positions.js');
const readerManagerPath = path.join(projectDir, 'readerManager.js');

for (const p of [waqfPositionsPath, readerManagerPath]) {
  if (!fs.existsSync(p)) {
    console.error(`ERROR: expected file not found: ${p}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------
// 1. Load WAQF_POSITIONS (read-only) via a sandboxed window shim.
// ---------------------------------------------------------------------
const waqfSrcOriginal = fs.readFileSync(waqfPositionsPath, 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(waqfSrcOriginal, sandbox, { filename: waqfPositionsPath });

const WAQF_POSITIONS = sandbox.window.WAQF_POSITIONS;
if (!Array.isArray(WAQF_POSITIONS)) {
  console.error('ERROR: window.WAQF_POSITIONS was not found or is not an array.');
  process.exit(1);
}

// ---------------------------------------------------------------------
// 2. Load DEFAULT_MARK_MANUAL_ADDITIONS / _EXCLUSIONS from
//    readerManager.js WITHOUT executing the rest of that file — same
//    isolated-literal-extraction approach as the audit script.
// ---------------------------------------------------------------------
const readerSrc = fs.readFileSync(readerManagerPath, 'utf8');

function loadNamedObject(varName) {
  const anchor = `var ${varName} = `;
  const { text } = extractBalancedLiteral(readerSrc, anchor);
  return vm.runInNewContext(`(${text})`, {}, { filename: readerManagerPath });
}

const DEFAULT_MARK_MANUAL_ADDITIONS = loadNamedObject('DEFAULT_MARK_MANUAL_ADDITIONS');
const DEFAULT_MARK_MANUAL_EXCLUSIONS = loadNamedObject('DEFAULT_MARK_MANUAL_EXCLUSIONS');

// ---------------------------------------------------------------------
// 3. Build a lookup of existing WAQF_POSITIONS records for fast
//    exact-match checks: "surah:ayah:word:type" -> true.
// ---------------------------------------------------------------------
const existingKey = (surah, ayah, word, type) => `${surah}:${ayah}:${word}:${type}`;
const existingSet = new Set(
  WAQF_POSITIONS.map((p) => existingKey(p.surah, p.ayah, p.word, p.type))
);

// ---------------------------------------------------------------------
// 4. Walk DEFAULT_MARK_MANUAL_ADDITIONS and classify every entry.
// ---------------------------------------------------------------------
const added = [];
const alreadyExisting = [];
const conflicts = [];

for (const type of Object.keys(DEFAULT_MARK_MANUAL_ADDITIONS)) {
  const bucket = DEFAULT_MARK_MANUAL_ADDITIONS[type];
  for (const key of Object.keys(bucket)) {
    const parts = key.split(':');
    if (parts.length !== 3) {
      // Defensive: shouldn't happen given the codebase's own key format,
      // but never silently guess — surface it as a conflict for review.
      conflicts.push({ type, key, reason: `Unexpected key shape (expected surah:ayah:word): "${key}"` });
      continue;
    }
    const [surah, ayah, word] = parts.map(Number);

    // Same exact word+type also manually excluded? That's a real
    // contradiction in the data — do not resolve it automatically.
    const exclusionBucket = DEFAULT_MARK_MANUAL_EXCLUSIONS[type];
    if (exclusionBucket && exclusionBucket[key]) {
      conflicts.push({
        type, surah, ayah, word,
        reason: `"${key}" appears in BOTH DEFAULT_MARK_MANUAL_ADDITIONS['${type}'] and DEFAULT_MARK_MANUAL_EXCLUSIONS['${type}']`
      });
      continue;
    }

    const ek = existingKey(surah, ayah, word, type);
    if (existingSet.has(ek)) {
      alreadyExisting.push({ surah, ayah, word, type });
    } else {
      added.push({ surah, ayah, word, type });
      existingSet.add(ek); // guard against duplicate additions within this same run
    }
  }
}

// ---------------------------------------------------------------------
// 5. Build the consolidated array: original (untouched) + newly added,
//    sorted by surah/ayah/word for readability. Nothing is removed.
// ---------------------------------------------------------------------
const consolidated = WAQF_POSITIONS.concat(added).slice().sort((a, b) => {
  if (a.surah !== b.surah) return a.surah - b.surah;
  if (a.ayah !== b.ayah) return a.ayah - b.ayah;
  return a.word - b.word;
});

// ---------------------------------------------------------------------
// 6. Write a NEW file — the original waqf-positions.js is never opened
//    for writing. Only the WAQF_POSITIONS literal is replaced; every
//    comment and WAQF_REVIEW are carried over byte-for-byte.
// ---------------------------------------------------------------------
const anchor = 'window.WAQF_POSITIONS = ';
const { startIndex, endIndex } = extractBalancedLiteral(waqfSrcOriginal, anchor);
const newArrayText = JSON.stringify(consolidated);
const newFileText =
  waqfSrcOriginal.slice(0, startIndex) +
  newArrayText +
  waqfSrcOriginal.slice(endIndex);

const outPath = path.join(outDir, 'waqf-positions.consolidated.js');
fs.writeFileSync(outPath, newFileText, 'utf8');

// ---------------------------------------------------------------------
// 7. Report.
// ---------------------------------------------------------------------
console.log('='.repeat(60));
console.log('WAQF_POSITIONS Consolidation Report');
console.log('='.repeat(60));
console.log(`Added to WAQF_POSITIONS:      ${added.length}`);
console.log(`Already existing (skipped):   ${alreadyExisting.length}`);
console.log(`Conflicts (needs a decision): ${conflicts.length}`);
console.log('');
console.log(`Original WAQF_POSITIONS size: ${WAQF_POSITIONS.length}`);
console.log(`New WAQF_POSITIONS size:      ${consolidated.length}`);
console.log('');

function byType(list) {
  const m = {};
  for (const it of list) m[it.type] = (m[it.type] || 0) + 1;
  return m;
}
console.log('--- Added, by type ---');
console.log(byType(added));
console.log('--- Already existing, by type ---');
console.log(byType(alreadyExisting));

if (conflicts.length > 0) {
  console.log('');
  console.log('--- Conflicts (NOT added — needs a human decision) ---');
  for (const c of conflicts) {
    if (c.surah !== undefined) {
      console.log(`  ${c.surah}:${c.ayah}:${c.word}  (${c.type})  — ${c.reason}`);
    } else {
      console.log(`  ${c.key}  (${c.type})  — ${c.reason}`);
    }
  }
} else {
  console.log('');
  console.log('No conflicts found.');
}

console.log('');
console.log(`New file written to: ${outPath}`);
console.log('The original waqf-positions.js was NOT modified.');
console.log('WAQF_REVIEW was left completely untouched in the new file.');

const reportPath = path.join(outDir, 'waqf_positions_consolidation_report.json');
fs.writeFileSync(reportPath, JSON.stringify({
  addedCount: added.length,
  alreadyExistingCount: alreadyExisting.length,
  conflictsCount: conflicts.length,
  originalSize: WAQF_POSITIONS.length,
  newSize: consolidated.length,
  added, alreadyExisting, conflicts
}, null, 2), 'utf8');
console.log(`Full machine-readable report written to: ${reportPath}`);
