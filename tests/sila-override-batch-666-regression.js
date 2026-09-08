'use strict';
/**
 * Regression: 1.0.666 SILA overrides batch.
 * Ensures the 12 positions (صلي in Naskh + non-صلي Madinah mark)
 * are colored via DEFAULT_MARK_LA_SILA_OVERRIDES and NOT blocked by
 * DEFAULT_MARK_MANUAL_EXCLUSIONS / DEFAULT_MARK_LA_SILA_BLOCK.
 */
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  ✓ ' + msg);
  } else {
    failed++;
    console.error('  ✗ ' + msg);
  }
}

// Load data
var ctx = { console: console, window: {}, self: {} };
vm.createContext(ctx);

vm.runInContext(fs.readFileSync(path.join(root, 'sila-positions.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'waqf-positions.js'), 'utf8'), ctx);

// Extract and eval only the needed policy blocks from readerManager.js
var rm = fs.readFileSync(path.join(root, 'readerManager.js'), 'utf8');

// Pull DEFAULT_MARK_MANUAL_EXCLUSIONS
var exclMatch = rm.match(/var DEFAULT_MARK_MANUAL_EXCLUSIONS = \{[\s\S]*?\n  \};/);
if (!exclMatch) throw new Error('DEFAULT_MARK_MANUAL_EXCLUSIONS not found');
vm.runInContext(exclMatch[0], ctx);

// Pull DEFAULT_MARK_LA_SILA_BLOCK factory + OVERRIDES + buildDefaultWordMap
// Simpler: extract OVERRIDES object literally
var ovMatch = rm.match(/var DEFAULT_MARK_LA_SILA_OVERRIDES = \{[\s\S]*?\n  \};/);
if (!ovMatch) throw new Error('DEFAULT_MARK_LA_SILA_OVERRIDES not found');
vm.runInContext(ovMatch[0], ctx);

// Build LA_SILA_BLOCK the same way
vm.runInContext(`
  var DEFAULT_MARK_LA_SILA_BLOCK = (function(){
    var block = Object.create(null);
    var positions = (typeof window !== 'undefined' && window.WAQF_POSITIONS) || [];
    for(var i = 0; i < positions.length; i++){
      if(positions[i].type === 'LA'){
        block[positions[i].surah + ':' + positions[i].ayah + ':' + positions[i].word] = 'LA';
      }
    }
    var sila = (typeof window !== 'undefined' && window.SILA_POSITIONS) || [];
    for(var j = 0; j < sila.length; j++){
      var sk = sila[j].surah + ':' + sila[j].ayah + ':' + sila[j].word;
      if(!block[sk]) block[sk] = 'SILA';
    }
    return block;
  })();
`, ctx);

// Minimal buildDefaultWordMap replica
vm.runInContext(`
  function buildDefaultWordMap(waqfType){
    var map = {};
    var positions = (typeof window !== 'undefined' && window.WAQF_POSITIONS) || [];
    for(var i = 0; i < positions.length; i++){
      var p = positions[i];
      if(p.type !== waqfType) continue;
      var wordKey = p.surah + ':' + p.ayah + ':' + p.word;
      if(DEFAULT_MARK_LA_SILA_BLOCK[wordKey] &&
         !(DEFAULT_MARK_LA_SILA_OVERRIDES[wordKey] && DEFAULT_MARK_LA_SILA_OVERRIDES[wordKey][waqfType])){
        continue;
      }
      if(DEFAULT_MARK_MANUAL_EXCLUSIONS[waqfType] && DEFAULT_MARK_MANUAL_EXCLUSIONS[waqfType][wordKey]){
        continue;
      }
      var ayahKey = p.surah + ':' + p.ayah;
      if(!map[ayahKey]) map[ayahKey] = [];
      if(map[ayahKey].indexOf(p.word) === -1) map[ayahKey].push(p.word);
    }
    return map;
  }
`, ctx);

var EXPECTED = {
  '2:236:13': 'JEEM',
  '3:167:3': 'JEEM',
  '3:193:10': 'QAD_QILA',
  '8:69:5': 'ZAY_JAWAZ',
  '10:109:8': 'JEEM',
  '13:35:16': 'QAD_QILA',
  '14:40:6': 'QAD_QILA',
  '18:18:4': 'QAD_QILA',
  '18:64:5': 'QAD_QILA',
  '21:45:4': 'ZAY_JAWAZ',
  '33:44:4': 'JEEM',
  '60:1:32': 'QAD_QILA'
};

console.log('=== 1.0.666 SILA override batch regression ===\n');

// 1. All in OVERRIDES with correct type
console.log('1) DEFAULT_MARK_LA_SILA_OVERRIDES entries:');
Object.keys(EXPECTED).forEach(function(key){
  var t = EXPECTED[key];
  var ov = ctx.DEFAULT_MARK_LA_SILA_OVERRIDES[key];
  assert(ov && ov[t] === true, key + ' → OVERRIDE ' + t);
});

// 2. None remain in MANUAL_EXCLUSIONS for their type
console.log('\n2) Removed from DEFAULT_MARK_MANUAL_EXCLUSIONS:');
Object.keys(EXPECTED).forEach(function(key){
  var t = EXPECTED[key];
  var excl = ctx.DEFAULT_MARK_MANUAL_EXCLUSIONS[t];
  assert(!excl || !excl[key], key + ' not in MANUAL_EXCLUSIONS[' + t + ']');
});

// 3. They ARE in SILA block (so override is actually needed)
console.log('\n3) Still present in LA_SILA_BLOCK (override needed):');
Object.keys(EXPECTED).forEach(function(key){
  assert(!!ctx.DEFAULT_MARK_LA_SILA_BLOCK[key], key + ' in LA_SILA_BLOCK');
});

// 4. buildDefaultWordMap includes them
console.log('\n4) buildDefaultWordMap includes the word:');
Object.keys(EXPECTED).forEach(function(key){
  var t = EXPECTED[key];
  var parts = key.split(':');
  var ayahKey = parts[0] + ':' + parts[1];
  var word = Number(parts[2]);
  var map = ctx.buildDefaultWordMap(t);
  var words = map[ayahKey] || [];
  assert(words.indexOf(word) !== -1, key + ' in buildDefaultWordMap(' + t + ')');
});

// 5. Prior overrides still intact
console.log('\n5) Prior overrides intact:');
assert(ctx.DEFAULT_MARK_LA_SILA_OVERRIDES['3:30:9'] &&
       ctx.DEFAULT_MARK_LA_SILA_OVERRIDES['3:30:9'].JEEM === true, '3:30:9 JEEM still present');
assert(ctx.DEFAULT_MARK_LA_SILA_OVERRIDES['29:60:9'] &&
       ctx.DEFAULT_MARK_LA_SILA_OVERRIDES['29:60:9'].ZAY_JAWAZ === true, '29:60:9 ZAY_JAWAZ still present');

console.log('\n--- Results: ' + passed + ' passed, ' + failed + ' failed ---');
process.exit(failed ? 1 : 0);
