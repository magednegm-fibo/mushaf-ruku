'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var root = path.join(__dirname, '..');
var passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✓ ' + msg); }
  else { failed++; console.error('  ✗ ' + msg); }
}
var ctx = { console: console, window: {}, self: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'sila-positions.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'waqf-positions.js'), 'utf8'), ctx);
var rm = fs.readFileSync(path.join(root, 'readerManager.js'), 'utf8');
var exclMatch = rm.match(/var DEFAULT_MARK_MANUAL_EXCLUSIONS = \{[\s\S]*?\n  \};/);
if (!exclMatch) throw new Error('EXCLUSIONS missing');
vm.runInContext(exclMatch[0], ctx);
var ovMatch = rm.match(/var DEFAULT_MARK_LA_SILA_OVERRIDES = \{[\s\S]*?\n  \};/);
if (!ovMatch) throw new Error('OVERRIDES missing');
vm.runInContext(ovMatch[0], ctx);
vm.runInContext(`
  var DEFAULT_MARK_LA_SILA_BLOCK = (function(){
    var block = Object.create(null);
    var positions = window.WAQF_POSITIONS || [];
    for(var i=0;i<positions.length;i++){
      if(positions[i].type==='LA')
        block[positions[i].surah+':'+positions[i].ayah+':'+positions[i].word]='LA';
    }
    var sila = window.SILA_POSITIONS || [];
    for(var j=0;j<sila.length;j++){
      var sk=sila[j].surah+':'+sila[j].ayah+':'+sila[j].word;
      if(!block[sk]) block[sk]='SILA';
    }
    return block;
  })();
  function buildDefaultWordMap(waqfType){
    var map={};
    var positions=window.WAQF_POSITIONS||[];
    for(var i=0;i<positions.length;i++){
      var p=positions[i];
      if(p.type!==waqfType) continue;
      var wordKey=p.surah+':'+p.ayah+':'+p.word;
      if(DEFAULT_MARK_LA_SILA_BLOCK[wordKey] &&
         !(DEFAULT_MARK_LA_SILA_OVERRIDES[wordKey]&&DEFAULT_MARK_LA_SILA_OVERRIDES[wordKey][waqfType])) continue;
      if(DEFAULT_MARK_MANUAL_EXCLUSIONS[waqfType]&&DEFAULT_MARK_MANUAL_EXCLUSIONS[waqfType][wordKey]) continue;
      var ayahKey=p.surah+':'+p.ayah;
      if(!map[ayahKey]) map[ayahKey]=[];
      if(map[ayahKey].indexOf(p.word)===-1) map[ayahKey].push(p.word);
    }
    return map;
  }
`, ctx);

var EXPECTED = {
  '33:19:2': 'JEEM',
  '33:23:15': 'ZAY_JAWAZ',
  '38:5:4': 'JEEM',
  '38:65:4': 'QAD_QILA',
  '42:31:5': 'JEEM'
};
// also prior batch still present
var PRIOR = {
  '3:30:9': 'JEEM',
  '29:60:9': 'ZAY_JAWAZ',
  '2:236:13': 'JEEM',
  '3:167:3': 'JEEM',
  '3:193:10': 'QAD_QILA'
};

console.log('=== 1.0.667 four-reciters clear-waqf overrides ===\n');
console.log('1) New OVERRIDES:');
Object.keys(EXPECTED).forEach(function(key){
  var t = EXPECTED[key];
  var ov = ctx.DEFAULT_MARK_LA_SILA_OVERRIDES[key];
  assert(ov && ov[t] === true, key + ' → ' + t);
});
console.log('\n2) Not in MANUAL_EXCLUSIONS:');
Object.keys(EXPECTED).forEach(function(key){
  var t = EXPECTED[key];
  var excl = ctx.DEFAULT_MARK_MANUAL_EXCLUSIONS[t];
  assert(!excl || !excl[key], key + ' removed from exclusions');
});
console.log('\n3) buildDefaultWordMap includes them:');
Object.keys(EXPECTED).forEach(function(key){
  var t = EXPECTED[key];
  var parts = key.split(':');
  var map = ctx.buildDefaultWordMap(t);
  var words = map[parts[0]+':'+parts[1]] || [];
  assert(words.indexOf(Number(parts[2])) !== -1, key + ' in map(' + t + ')');
});
console.log('\n4) Prior overrides intact:');
Object.keys(PRIOR).forEach(function(key){
  var t = PRIOR[key];
  assert(ctx.DEFAULT_MARK_LA_SILA_OVERRIDES[key] && ctx.DEFAULT_MARK_LA_SILA_OVERRIDES[key][t] === true, key + ' still ' + t);
});
console.log('\n--- ' + passed + ' passed, ' + failed + ' failed ---');
process.exit(failed ? 1 : 0);
