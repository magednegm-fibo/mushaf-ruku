#!/usr/bin/env node
/**
 * WAQF_REVIEW Audit Script (READ-ONLY)
 * =====================================
 * Purpose:
 *   Determine, for every entry in window.WAQF_REVIEW (waqf-positions.js),
 *   whether it has since been resolved via a manual addition
 *   (DEFAULT_MARK_MANUAL_ADDITIONS) or a manual exclusion
 *   (DEFAULT_MARK_MANUAL_EXCLUSIONS) inside readerManager.js — or whether
 *   it remains unresolved.
 *
 * Matching rule:
 *   WAQF_REVIEW entries are keyed by {surah, ayah, type} (ayah-level).
 *   DEFAULT_MARK_MANUAL_ADDITIONS / DEFAULT_MARK_MANUAL_EXCLUSIONS are
 *   keyed by "surah:ayah:word" (word-level), grouped by the same `type`.
 *   A review item is considered RESOLVED-BY-ADDITION if
 *   DEFAULT_MARK_MANUAL_ADDITIONS[type] contains ANY key starting with
 *   "surah:ayah:" — and RESOLVED-BY-EXCLUSION under the same rule against
 *   DEFAULT_MARK_MANUAL_EXCLUSIONS[type]. This mirrors how the app itself
 *   was verified to consume these tables (see the surrounding comments in
 *   readerManager.js — additions/exclusions are always the ayah-level
 *   review item resolved down to a specific word or dropped entirely).
 *   If a review item matches BOTH tables, it is reported as an
 *   inconsistency (should never legitimately happen) rather than silently
 *   picking one.
 *
 * Guarantees:
 *   - This script only READS project files. It never writes to
 *     waqf-positions.js, readerManager.js, or any other project file.
 *   - It performs no automatic cleanup — it only reports what a cleanup
 *     COULD safely do, for a human to decide on.
 *
 * Usage:
 *   node waqf_review_audit.js /path/to/project
 *   (defaults to ../extracted/project relative to this script if omitted)
 */

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractBalancedObject } = require('./extract_block');

const projectDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, '..'); // default: this script lives in <project>/tools/

const waqfPositionsPath = path.join(projectDir, 'waqf-positions.js');
const readerManagerPath = path.join(projectDir, 'readerManager.js');

for (const p of [waqfPositionsPath, readerManagerPath]) {
  if (!fs.existsSync(p)) {
    console.error(`ERROR: expected file not found: ${p}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------
// 1. Load WAQF_REVIEW via a sandboxed `window` shim (read-only execution
//    of waqf-positions.js — this file is pure data, no side effects).
// ---------------------------------------------------------------------
const waqfSrc = fs.readFileSync(waqfPositionsPath, 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(waqfSrc, sandbox, { filename: waqfPositionsPath });

const WAQF_REVIEW = sandbox.window.WAQF_REVIEW;
if (!Array.isArray(WAQF_REVIEW)) {
  console.error('ERROR: window.WAQF_REVIEW was not found or is not an array.');
  process.exit(1);
}

// ---------------------------------------------------------------------
// 2. Extract DEFAULT_MARK_MANUAL_ADDITIONS / _EXCLUSIONS from
//    readerManager.js WITHOUT executing the rest of that file (it's a
//    DOM-dependent app module). We only pull the two object literals by
//    balanced-brace text extraction, then evaluate just that literal.
// ---------------------------------------------------------------------
const readerSrc = fs.readFileSync(readerManagerPath, 'utf8');

function loadNamedObject(varName) {
  const literalText = extractBalancedObject(readerSrc, varName);
  // Evaluate the object literal in isolation — it is pure data (string
  // keys -> true), safe to eval without any app/DOM context.
  const value = vm.runInNewContext(`(${literalText})`, {}, { filename: readerManagerPath });
  return value;
}

const DEFAULT_MARK_MANUAL_ADDITIONS = loadNamedObject('DEFAULT_MARK_MANUAL_ADDITIONS');
const DEFAULT_MARK_MANUAL_EXCLUSIONS = loadNamedObject('DEFAULT_MARK_MANUAL_EXCLUSIONS');

// ---------------------------------------------------------------------
// 3. Classify every WAQF_REVIEW item.
// ---------------------------------------------------------------------
function hasAyahLevelMatch(table, type, surah, ayah) {
  const bucket = table[type];
  if (!bucket) return false;
  const prefix = `${surah}:${ayah}:`;
  return Object.keys(bucket).some((k) => k.startsWith(prefix));
}

const results = {
  resolvedByAddition: [],
  resolvedByExclusion: [],
  unresolved: [],
  inconsistent: [], // matched both tables — flagged for manual attention
};

for (const item of WAQF_REVIEW) {
  const { surah, ayah, type } = item;
  const addMatch = hasAyahLevelMatch(DEFAULT_MARK_MANUAL_ADDITIONS, type, surah, ayah);
  const exclMatch = hasAyahLevelMatch(DEFAULT_MARK_MANUAL_EXCLUSIONS, type, surah, ayah);

  if (addMatch && exclMatch) {
    results.inconsistent.push(item);
  } else if (addMatch) {
    results.resolvedByAddition.push(item);
  } else if (exclMatch) {
    results.resolvedByExclusion.push(item);
  } else {
    results.unresolved.push(item);
  }
}

// ---------------------------------------------------------------------
// 4. Report.
// ---------------------------------------------------------------------
const total = WAQF_REVIEW.length;
console.log('='.repeat(60));
console.log('WAQF_REVIEW Audit Report');
console.log('='.repeat(60));
console.log(`Total review items: ${total}`);
console.log(`Resolved by additions: ${results.resolvedByAddition.length}`);
console.log(`Resolved by exclusions: ${results.resolvedByExclusion.length}`);
console.log(`Still unresolved: ${results.unresolved.length}`);
if (results.inconsistent.length) {
  console.log(`⚠ Inconsistent (matched BOTH tables): ${results.inconsistent.length}`);
}
console.log('');

// Breakdown by waqf type, useful for triage.
function byType(list) {
  const m = {};
  for (const it of list) m[it.type] = (m[it.type] || 0) + 1;
  return m;
}
console.log('--- Breakdown by type ---');
console.log('Resolved by additions:', byType(results.resolvedByAddition));
console.log('Resolved by exclusions:', byType(results.resolvedByExclusion));
console.log('Still unresolved:', byType(results.unresolved));
if (results.inconsistent.length) {
  console.log('Inconsistent:', byType(results.inconsistent));
}
console.log('');

if (results.unresolved.length > 0) {
  console.log('--- Unresolved items (first 50 shown) ---');
  for (const it of results.unresolved.slice(0, 50)) {
    console.log(`  ${it.surah}:${it.ayah}  (${it.type})`);
  }
  if (results.unresolved.length > 50) {
    console.log(`  ... and ${results.unresolved.length - 50} more`);
  }
  console.log('');
}

if (results.inconsistent.length > 0) {
  console.log('--- Inconsistent items (need manual review) ---');
  for (const it of results.inconsistent) {
    console.log(`  ${it.surah}:${it.ayah}  (${it.type})`);
  }
  console.log('');
}

// ---------------------------------------------------------------------
// 5. Cleanup recommendation — ONLY if fully resolved. No file is touched.
// ---------------------------------------------------------------------
console.log('--- Cleanup recommendation ---');
if (results.unresolved.length === 0 && results.inconsistent.length === 0) {
  console.log('All WAQF_REVIEW items are resolved (by addition or exclusion).');
  console.log('Recommendation: keep WAQF_REVIEW in the source tree as a');
  console.log('historical/audit artifact, but stop shipping it in production');
  console.log('builds (exclude waqf-positions.js\'s WAQF_REVIEW array, or the');
  console.log('whole file if nothing else in it is used at runtime, from the');
  console.log('release bundle/ZIP). Do not emptied-but-still-shipped it — an');
  console.log('empty array shipped forever is dead weight with no audit value,');
  console.log('while removing it from releases and keeping it in source gives');
  console.log('both a smaller production bundle and a paper trail if a new');
  console.log('extraction gap is ever found later.');
} else {
  console.log('WAQF_REVIEW is NOT fully resolved — no cleanup action recommended');
  console.log('yet. Resolve the unresolved/inconsistent items above first.');
}

// Write a machine-readable copy of the full result set alongside stdout,
// for further inspection — this is a NEW file in the audit workspace,
// not a modification of any project file.
const outPath = path.join(__dirname, 'waqf_review_audit_result.json');
fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
console.log('');
console.log(`Full machine-readable results written to: ${outPath}`);

// ---------------------------------------------------------------------
// 6. Also emit a flat, per-item status file suitable for embedding into
//    WAQF_REVIEW.html's "حالة التدقيق" (audit status) tab — same
//    {s, a, t} shape as the raw WAQF_REVIEW array, plus a `status`
//    field. This is a NEW read-only artifact; it does not touch
//    waqf-positions.js or readerManager.js. To use it, paste this
//    file's contents into the empty
//      <script id="waqf-audit-data" type="application/json">[]</script>
//    tag near the top of WAQF_REVIEW.html — the same manual-embed
//    pattern the page already uses for #waqf-review-data.
// ---------------------------------------------------------------------
const STATUS_MAP = new Map();
for (const it of results.resolvedByAddition) STATUS_MAP.set(`${it.surah}:${it.ayah}:${it.type}`, 'addition');
for (const it of results.resolvedByExclusion) STATUS_MAP.set(`${it.surah}:${it.ayah}:${it.type}`, 'exclusion');
for (const it of results.inconsistent) STATUS_MAP.set(`${it.surah}:${it.ayah}:${it.type}`, 'inconsistent');
for (const it of results.unresolved) STATUS_MAP.set(`${it.surah}:${it.ayah}:${it.type}`, 'unresolved');

const embed = WAQF_REVIEW.map((it) => ({
  s: it.surah,
  a: it.ayah,
  t: it.type,
  status: STATUS_MAP.get(`${it.surah}:${it.ayah}:${it.type}`) || 'unresolved',
}));

const embedPath = path.join(__dirname, 'waqf_review_status_embed.json');
fs.writeFileSync(embedPath, JSON.stringify(embed), 'utf8');
console.log(`Embed-ready status file written to: ${embedPath}`);
console.log('Paste its contents into the #waqf-audit-data tag in WAQF_REVIEW.html.');
