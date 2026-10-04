'use strict';
/**
 * ACTIVE spot-check: sample keys still present in MADINAH_SAJAWANDI.
 * Full count/render comparison lives in madinah-sajawandi-final-regression.js.
 */
var path = require('path');
var root = path.join(__dirname, '..');
var rows = require(path.join(root, 'madinah-sajawandi.js'));
var map = Object.create(null);
rows.forEach(function(r){ map[r.s+':'+r.a+':'+r.w] = r.m; });

var passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✓ ' + msg); }
  else { failed++; console.error('  ✗ ' + msg); }
}

// Former LA/SILA override samples (must still be colored in final table)
var samples = {
  '2:236:13': 'ج',
  '3:167:3': 'ج',
  '3:193:10': 'ق',
  '10:109:8': 'ج',
  '33:44:4': 'ج',
  '3:30:9': 'ج',
  '29:60:9': 'ز',
  // Al-Qari'ah
  '101:2:2': 'ج',
  '101:3:4': 'ط',
  '101:5:4': 'ط',
  '101:7:4': 'ط',
  '101:9:2': 'ط',
  '101:10:4': 'ط',
  // Dual-class CSS winners
  '4:171:28': 'ج',
  '7:187:15': 'م',
  '12:96:9': 'ج'
};

console.log('madinah-sajawandi regression');
Object.keys(samples).forEach(function(k){
  assert(map[k] === samples[k], k + ' → ' + samples[k] + (map[k] ? ' (got '+map[k]+')' : ' MISSING'));
});

assert(rows.length === 5622, 'total 5622 (got ' + rows.length + ')');

if (failed) { console.error('FAILED', failed); process.exit(1); }
console.log('OK', passed, 'assertions');
