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
  ['2:133:24','DEFAULT_JEEM_WORDS'],
  ['13:39:5','DEFAULT_JEEM_WORDS'],
  ['48:23:7','DEFAULT_JEEM_WORDS'],
  ['67:9:12','DEFAULT_JEEM_WORDS'],
  ['78:40:4','DEFAULT_JEEM_WORDS'],
  ['4:141:13','DEFAULT_ZAY_JAWAZ_WORDS'],
  ['9:52:18','DEFAULT_ZAY_JAWAZ_WORDS'],
  ['35:13:11','DEFAULT_ZAY_JAWAZ_WORDS'],
  ['46:26:11','DEFAULT_ZAY_JAWAZ_WORDS'],
  ['39:23:7','DEFAULT_QAD_QILA_WORDS'],
  ['58:1:11','DEFAULT_QAD_QILA_WORDS']
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
