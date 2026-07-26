// Minimal Node harness to load the browser-only readerManager.js and get
// at ReaderManager.renderAyahTextWithHighlight() for regression testing,
// without needing a real DOM. Not shipped to the app; test-only.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadReaderManager(rootDir, fontStyle){
  const src = fs.readFileSync(path.join(rootDir, 'readerManager.js'), 'utf8');
  const sandbox = {
    console: console,
    document: { addEventListener: function(){} },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'readerManager.js' });

  const state = { fontStyle: fontStyle || 'uthmani' };
  sandbox.window.ReaderManager.init({
    PAGES: [], JUZ_INFO: [], state: state, els: {},
    toArabicDigits: function(n){ return String(n); },
    REMINDER_COLORS: {},
    getWaqfMarks: function(){ return {}; },
    showReader: function(){}, onBeforePageChange: function(){},
    onPageChanged: function(){}, onAfterRender: function(){}
  });
  return sandbox.window.ReaderManager;
}

module.exports = { loadReaderManager };
