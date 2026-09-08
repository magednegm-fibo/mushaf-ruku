'use strict';
var fs=require('fs'), path=require('path'), vm=require('vm');
var root=path.join(__dirname,'..');
var ctx={console:console,window:{},self:{}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root,'sila-positions.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(root,'waqf-positions.js'),'utf8'),ctx);
var rm=fs.readFileSync(path.join(root,'readerManager.js'),'utf8');
var start=rm.indexOf('var DEFAULT_MARK_TYPES');
var end=rm.indexOf("var DEFAULT_QAD_QILA_WORDS = buildDefaultWordMap");
var block=rm.slice(start,end)+`
var DEFAULT_QAD_QILA_WORDS = buildDefaultWordMap('QAD_QILA');
var DEFAULT_JEEM_WORDS = buildDefaultWordMap('JEEM');
var DEFAULT_ZAY_JAWAZ_WORDS = buildDefaultWordMap('ZAY_JAWAZ');
var DEFAULT_SAD_RUKHSA_WORDS = buildDefaultWordMap('SAD_RUKHSA');
`;
vm.runInContext(block,ctx);
var all=[
  ['22:36:9','DEFAULT_QAD_QILA_WORDS'],
  ['23:18:8','DEFAULT_QAD_QILA_WORDS'],
  ['23:72:6','DEFAULT_QAD_QILA_WORDS'],
  ['24:22:15','DEFAULT_SAD_RUKHSA_WORDS'],
  ['24:33:21','DEFAULT_QAD_QILA_WORDS'],
  ['25:65:7','DEFAULT_QAD_QILA_WORDS'],
  ['28:19:18','DEFAULT_QAD_QILA_WORDS'],
  ['33:19:2','DEFAULT_JEEM_WORDS'],
  ['33:23:15','DEFAULT_ZAY_JAWAZ_WORDS'],
  ['35:3:19','DEFAULT_ZAY_JAWAZ_WORDS'],
  ['35:8:15','DEFAULT_ZAY_JAWAZ_WORDS'],
  ['38:5:4','DEFAULT_JEEM_WORDS'],
  ['38:6:8','DEFAULT_JEEM_WORDS'],
  ['38:65:4','DEFAULT_QAD_QILA_WORDS'],
  ['40:64:17','DEFAULT_JEEM_WORDS'],
  ['42:31:5','DEFAULT_JEEM_WORDS'],
  ['47:26:12','DEFAULT_JEEM_WORDS'],
  ['50:16:8','DEFAULT_JEEM_WORDS']
];
var pass=0,fail=0;
all.forEach(function(row){
  var k=row[0], mapName=row[1];
  var p=k.split(':');
  var idx=Number(p[2])-1;
  var arr=(ctx[mapName][p[0]+':'+p[1]]||[]);
  if(arr.indexOf(idx)!==-1){pass++; console.log('  ✓',k);}
  else {fail++; console.log('  ✗',k,'got',arr);}
});
console.log('---',pass,'passed,',fail,'failed ---');
process.exit(fail?1:0);
