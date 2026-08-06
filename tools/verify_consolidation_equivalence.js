#!/usr/bin/env node
/**
 * Consolidation Equivalence Verification (READ-ONLY)
 * =====================================================
 * Purpose:
 *   Prove — by running the ACTUAL coloring-resolution function from
 *   readerManager.js (buildDefaultWordMap), not a reimplementation —
 *   that:
 *
 *     Scenario A (current/baseline):
 *       WAQF_POSITIONS = original waqf-positions.js
 *       DEFAULT_MARK_MANUAL_ADDITIONS = real (active)
 *
 *   produces IDENTICAL per-word coloring output to:
 *
 *     Scenario B (proposed):
 *       WAQF_POSITIONS = waqf-positions.consolidated.js
 *       DEFAULT_MARK_MANUAL_ADDITIONS = {} (disabled)
 *
 *   across all 7 colorable mark types (TA_MUTLAQ, SAD_RUKHSA,
 *   WAQF_LAZIM, ZAY_JAWAZ, QAD_QILA, QIF, JEEM).
 *
 * How:
 *   The exact source text of buildDefaultWordMap() and its direct
 *   dependencies (DEFAULT_MARK_TYPES, DEFAULT_MARK_CONFLICT_RESOLUTIONS,
 *   the DEFAULT_MARK_CONFLICT_KEYS IIFE, DEFAULT_MARK_MANUAL_EXCLUSIONS)
 *   is extracted verbatim from readerManager.js and executed in an
 *   isolated sandbox per scenario — this is literal re-execution of the
 *   app's own resolution code, not a hand-written approximation of it.
 *   readerManager.js itself is never modified or fully executed (no DOM
 *   dependency needed for this slice of logic).
 *
 * Output:
 *   - Console summary (identical / not identical).
 *   - If different: full report of every (surah:ayah, type) pair whose
 *     resolved word-index set differs, with the exact words added or
 *     missing on each side.
 *   - waqf_consolidation_equivalence_report.json with full detail either way.
 *
 * Usage:
 *   node verify_consolidation_equivalence.js /path/to/project /path/to/consolidated.js [outDir]
 */

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractBalancedLiteral } = require('./extract_literal');

const projectDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, '..'); // default: this script lives in <project>/tools/
const consolidatedPath = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(__dirname, 'waqf-positions.consolidated.js');
const outDir = process.argv[4] ? path.resolve(process.argv[4]) : __dirname;

const waqfPositionsPath = path.join(projectDir, 'waqf-positions.js');
const readerManagerPath = path.join(projectDir, 'readerManager.js');

for (const p of [waqfPositionsPath, readerManagerPath, consolidatedPath]) {
  if (!fs.existsSync(p)) {
    console.error(`ERROR: expected file not found: ${p}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------
// 1. Load both WAQF_POSITIONS variants (read-only).
// ---------------------------------------------------------------------
function loadWaqfPositions(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: filePath });
  if (!Array.isArray(sandbox.window.WAQF_POSITIONS)) {
    throw new Error(`window.WAQF_POSITIONS missing/invalid in ${filePath}`);
  }
  return sandbox.window.WAQF_POSITIONS;
}

const ORIGINAL_WAQF_POSITIONS = loadWaqfPositions(waqfPositionsPath);
const CONSOLIDATED_WAQF_POSITIONS = loadWaqfPositions(consolidatedPath);

// ---------------------------------------------------------------------
// 2. Extract the exact resolution logic from readerManager.js, verbatim.
// ---------------------------------------------------------------------
const readerSrc = fs.readFileSync(readerManagerPath, 'utf8');

function extractLiteralText(varName) {
  return extractBalancedLiteral(readerSrc, `var ${varName} = `).text;
}

const DEFAULT_MARK_TYPES_SRC = extractLiteralText('DEFAULT_MARK_TYPES');
const DEFAULT_MARK_CONFLICT_RESOLUTIONS_SRC = extractLiteralText('DEFAULT_MARK_CONFLICT_RESOLUTIONS');
const DEFAULT_MARK_MANUAL_EXCLUSIONS_SRC = extractLiteralText('DEFAULT_MARK_MANUAL_EXCLUSIONS');
const DEFAULT_MARK_MANUAL_ADDITIONS_SRC = extractLiteralText('DEFAULT_MARK_MANUAL_ADDITIONS');

// The IIFE assigned to DEFAULT_MARK_CONFLICT_KEYS: "(function(){...})".
// extractBalancedLiteral stops at the matching ')' that closes the
// outer wrapping parens (before the trailing invocation "()"), so we
// append "()" ourselves to actually invoke it in the sandbox.
const DEFAULT_MARK_CONFLICT_KEYS_IIFE_SRC =
  extractBalancedLiteral(readerSrc, 'var DEFAULT_MARK_CONFLICT_KEYS = ').text + '()';

// buildDefaultWordMap's function body: anchor right before its opening
// brace, then re-attach the "function buildDefaultWordMap(waqfType)"
// header so the extracted text is a complete, standalone function.
const BUILD_MAP_HEADER = 'function buildDefaultWordMap(waqfType)';
const buildMapBody = extractBalancedLiteral(readerSrc, BUILD_MAP_HEADER).text;
const BUILD_DEFAULT_WORD_MAP_SRC = BUILD_MAP_HEADER + buildMapBody;

const COLORABLE_TYPES = ['TA_MUTLAQ', 'SAD_RUKHSA', 'WAQF_LAZIM', 'ZAY_JAWAZ', 'QAD_QILA', 'QIF', 'JEEM'];

// ---------------------------------------------------------------------
// 3. Run one scenario: build a fresh sandbox, wire up window.WAQF_POSITIONS
//    and DEFAULT_MARK_MANUAL_ADDITIONS as given, then execute the REAL
//    extracted code (conflict-keys IIFE + buildDefaultWordMap) verbatim.
// ---------------------------------------------------------------------
function runScenario(waqfPositions, manualAdditionsOverride) {
  const sandbox = {
    window: { WAQF_POSITIONS: waqfPositions },
    console: console
  };
  vm.createContext(sandbox);

  vm.runInContext(`var DEFAULT_MARK_TYPES = ${DEFAULT_MARK_TYPES_SRC};`, sandbox);
  vm.runInContext(`var DEFAULT_MARK_CONFLICT_RESOLUTIONS = ${DEFAULT_MARK_CONFLICT_RESOLUTIONS_SRC};`, sandbox);
  vm.runInContext(`var DEFAULT_MARK_MANUAL_EXCLUSIONS = ${DEFAULT_MARK_MANUAL_EXCLUSIONS_SRC};`, sandbox);
  vm.runInContext(`var DEFAULT_MARK_CONFLICT_KEYS = ${DEFAULT_MARK_CONFLICT_KEYS_IIFE_SRC};`, sandbox);

  const manualAdditionsSrc = manualAdditionsOverride === null
    ? DEFAULT_MARK_MANUAL_ADDITIONS_SRC // real/active
    : JSON.stringify(manualAdditionsOverride); // {} disabled
  vm.runInContext(`var DEFAULT_MARK_MANUAL_ADDITIONS = ${manualAdditionsSrc};`, sandbox);

  vm.runInContext(`var buildDefaultWordMap = ${BUILD_DEFAULT_WORD_MAP_SRC};`, sandbox);

  const result = {};
  for (const type of COLORABLE_TYPES) {
    const map = vm.runInContext(`buildDefaultWordMap('${type}')`, sandbox);
    // Normalize: sort each ayah's word-index array for stable comparison.
    const normalized = {};
    for (const ayahKey of Object.keys(map)) {
      normalized[ayahKey] = map[ayahKey].slice().sort((a, b) => a - b);
    }
    result[type] = normalized;
  }
  return result;
}

console.log('Running Scenario A (baseline: original WAQF_POSITIONS + real DEFAULT_MARK_MANUAL_ADDITIONS)...');
const scenarioA = runScenario(ORIGINAL_WAQF_POSITIONS, null);

console.log('Running Scenario B (proposed: consolidated WAQF_POSITIONS + DEFAULT_MARK_MANUAL_ADDITIONS disabled)...');
const scenarioB = runScenario(CONSOLIDATED_WAQF_POSITIONS, {});

// ---------------------------------------------------------------------
// 4. Diff every type, every ayah key seen on either side.
// ---------------------------------------------------------------------
const differences = [];
let totalAyahKeysCompared = 0;

for (const type of COLORABLE_TYPES) {
  const mapA = scenarioA[type];
  const mapB = scenarioB[type];
  const allAyahKeys = new Set([...Object.keys(mapA), ...Object.keys(mapB)]);
  for (const ayahKey of allAyahKeys) {
    totalAyahKeysCompared++;
    const wordsA = mapA[ayahKey] || [];
    const wordsB = mapB[ayahKey] || [];
    const sameLength = wordsA.length === wordsB.length;
    const sameContent = sameLength && wordsA.every((w, i) => w === wordsB[i]);
    if (!sameContent) {
      const setA = new Set(wordsA);
      const setB = new Set(wordsB);
      const onlyInA = wordsA.filter((w) => !setB.has(w)).map((w) => w + 1); // back to 1-based word numbers
      const onlyInB = wordsB.filter((w) => !setA.has(w)).map((w) => w + 1);
      differences.push({ type, ayahKey, onlyInBaseline: onlyInA, onlyInProposed: onlyInB });
    }
  }
}

// ---------------------------------------------------------------------
// 5. Report.
// ---------------------------------------------------------------------
console.log('');
console.log('='.repeat(60));
console.log('Consolidation Equivalence Report');
console.log('='.repeat(60));
console.log(`Colorable types checked: ${COLORABLE_TYPES.join(', ')}`);
console.log(`Ayah-key/type combinations compared: ${totalAyahKeysCompared}`);
console.log('');

if (differences.length === 0) {
  console.log('RESULT: IDENTICAL — 100% match.');
  console.log('Every colorable word position produced by the proposed setup');
  console.log('(consolidated WAQF_POSITIONS, DEFAULT_MARK_MANUAL_ADDITIONS disabled)');
  console.log('exactly matches the current baseline output.');
} else {
  console.log(`RESULT: NOT IDENTICAL — ${differences.length} ayah/type combination(s) differ.`);
  console.log('');
  console.log('--- Differences (still depending on DEFAULT_MARK_MANUAL_ADDITIONS) ---');
  for (const d of differences) {
    console.log(`  ${d.ayahKey}  (${d.type})`);
    if (d.onlyInBaseline.length) console.log(`      missing in proposed — words: ${d.onlyInBaseline.join(', ')}`);
    if (d.onlyInProposed.length) console.log(`      extra in proposed   — words: ${d.onlyInProposed.join(', ')}`);
  }
}

const reportPath = path.join(outDir, 'waqf_consolidation_equivalence_report.json');
fs.writeFileSync(reportPath, JSON.stringify({
  identical: differences.length === 0,
  colorableTypesChecked: COLORABLE_TYPES,
  ayahTypeCombinationsCompared: totalAyahKeysCompared,
  differencesCount: differences.length,
  differences
}, null, 2), 'utf8');
console.log('');
console.log(`Full machine-readable report written to: ${reportPath}`);
