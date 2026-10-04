#!/usr/bin/env node
// =============================================================================
// wmm-noaa-regression.js — 1.0.637
//
// Executes the ACTUAL wmmDeclination() exported by prayer.js and compares it
// with NOAA/NCEI's official WMM2025 published test values.
//
// IMPORTANT: Do not copy/reimplement wmmDeclination() here. The test loads
// prayer.js itself in a small browser-like VM and calls window.Prayer directly.
// This prevents the regression test from silently testing a stale duplicate.
//
// Run from the release root:
//   node tests/wmm-noaa-regression.js
//
// Or against an unpacked release directory:
//   node tests/wmm-noaa-regression.js --dir /path/to/unzipped-release
// =============================================================================
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(cond, msg){
  if(!cond) throw new Error('FAIL: ' + msg);
  console.log('  PASS  ' + msg);
}

function parseDirArg(){
  const i = process.argv.indexOf('--dir');
  if(i < 0) return path.resolve(__dirname, '..');
  if(!process.argv[i + 1]) throw new Error('--dir requires a path');
  return path.resolve(process.argv[i + 1]);
}

function makeBrowserContext(){
  // prayer.js only needs a small browser surface during module evaluation.
  // Keep this stub intentionally small so new load-time dependencies fail
  // loudly instead of being accidentally hidden by the test harness.
  const noop = function(){};
  const dummyClassList = {
    add: noop, remove: noop, toggle: noop, contains: function(){ return false; }
  };
  const dummyElement = {
    style: {},
    classList: dummyClassList,
    setAttribute: noop,
    getAttribute: function(){ return null; },
    querySelector: function(){ return null; },
    addEventListener: noop,
    removeEventListener: noop,
    appendChild: noop,
    textContent: '',
    checked: false,
    value: ''
  };
  const document = {
    getElementById: function(){ return dummyElement; },
    createElement: function(){ return dummyElement; },
    addEventListener: noop,
    removeEventListener: noop,
    visibilityState: 'visible'
  };
  const window = {};
  const localStorage = {
    getItem: function(){ return null; },
    setItem: noop,
    removeItem: noop
  };

  const context = {
    window,
    self: window,
    document,
    localStorage,
    console,
    Intl,
    Date,
    Math,
    JSON,
    Number,
    String,
    Object,
    Array,
    RegExp,
    Error,
    TypeError,
    parseFloat,
    parseInt,
    isFinite,
    isNaN,
    setTimeout: noop,
    clearTimeout: noop
  };

  vm.createContext(context);
  return { context, window };
}

function loadPrayer(prayerPath){
  const source = fs.readFileSync(prayerPath, 'utf8');
  const browser = makeBrowserContext();
  vm.runInContext(source, browser.context, { filename: prayerPath });
  if(!browser.window.Prayer){
    throw new Error('FAIL: prayer.js did not expose window.Prayer');
  }
  if(typeof browser.window.Prayer.wmmDeclination !== 'function'){
    throw new Error('FAIL: window.Prayer.wmmDeclination is not a function');
  }
  return browser.window.Prayer;
}

// NOAA publishes D and F rounded to the displayed precision. These limits
// are therefore above display-rounding noise while remaining strict enough
// to catch coefficient, epoch, coordinate, altitude, or harmonic regressions.
const DECLINATION_TOL_DEG = 0.01;
const TOTAL_FIELD_TOL_NT = 0.10;

// [date, heightKm, latDeg, lonDeg, NOAA_D_deg, NOAA_F_nT]
const NOAA_WMM2025 = [
  [2025.0,   0,  80,   0,   1.28, 55178.5],
  [2025.0,   0,   0, 120,  -0.16, 41064.3],
  [2025.0,   0, -80, 240,  68.78, 54698.2],
  [2025.0, 100,  80,   0,   0.85, 52964.9],
  [2025.0, 100,   0, 120,  -0.15, 39032.1],
  [2025.0, 100, -80, 240,  68.21, 52035.0],
  [2027.5,   0,  80,   0,   2.59, 55253.9],
  [2027.5,   0,   0, 120,  -0.24, 41036.9],
  [2027.5,   0, -80, 240,  68.49, 54474.2],
  [2027.5, 100,  80,   0,   2.16, 53034.3],
  [2027.5, 100,   0, 120,  -0.23, 39007.4],
  [2027.5, 100, -80, 240,  67.93, 51825.7]
];

const root = parseDirArg();
const prayerPath = path.join(root, 'prayer.js');
if(!fs.existsSync(prayerPath)) throw new Error('prayer.js not found: ' + prayerPath);

console.log('=== WMM2025 / NOAA actual-code regression ===');
console.log('Release root:', root);
console.log('Loading actual:', prayerPath);

const Prayer = loadPrayer(prayerPath);
let maxDeclinationError = 0;
let maxFieldError = 0;

NOAA_WMM2025.forEach(function(row, index){
  const date = row[0];
  const heightKm = row[1];
  const lat = row[2];
  const lon = row[3];
  const expectedD = row[4];
  const expectedF = row[5];

  const actual = Prayer.wmmDeclination(lat, lon, date, heightKm);
  assert(actual && typeof actual === 'object',
    'case ' + (index + 1) + ' returns WMM field object');
  assert(Number.isFinite(actual.decl) && Number.isFinite(actual.F_nT),
    'case ' + (index + 1) + ' returns finite D/F');

  const dError = Math.abs(actual.decl - expectedD);
  const fError = Math.abs(actual.F_nT - expectedF);
  maxDeclinationError = Math.max(maxDeclinationError, dError);
  maxFieldError = Math.max(maxFieldError, fError);

  assert(dError <= DECLINATION_TOL_DEG,
    'case ' + (index + 1) + ' D: expected ' + expectedD.toFixed(2) +
    '°, got ' + actual.decl.toFixed(6) + '° (err ' + dError.toFixed(6) + '°)');
  assert(fError <= TOTAL_FIELD_TOL_NT,
    'case ' + (index + 1) + ' F: expected ' + expectedF.toFixed(1) +
    ' nT, got ' + actual.F_nT.toFixed(6) + ' nT (err ' + fError.toFixed(6) + ' nT)');
});

console.log('\n=== Summary ===');
console.log('NOAA cases:', NOAA_WMM2025.length);
console.log('Max |D error|:', maxDeclinationError.toFixed(6) + '°');
console.log('Max |F error|:', maxFieldError.toFixed(6) + ' nT');
console.log('Tolerance D:', DECLINATION_TOL_DEG.toFixed(2) + '°');
console.log('Tolerance F:', TOTAL_FIELD_TOL_NT.toFixed(2) + ' nT');
console.log('\nAll WMM2025 NOAA actual-code checks passed.');
