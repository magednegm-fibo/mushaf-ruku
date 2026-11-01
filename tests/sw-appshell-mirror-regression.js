'use strict';
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

test('runtime navigation mirrors only the app shell, never inner HTML documents', () => {
  assert.match(sw, /function isAppShellUrl\(url\)/);
  assert.match(sw, /target\.pathname === scopePath \|\| target\.pathname === scopePath \+ 'index\.html'/);
  assert.match(sw, /if\(!response \|\| !response\.ok \|\| !isAppShellUrl\(sourceUrl \|\| assetUrl\('index\.html'\)\)\) return Promise\.resolve\(\);/);
  assert.match(sw, /if\(isAppShellUrl\(e\.request\.url\)\) return mirrorAppShell\(cache, clone, e\.request\.url\);/);
});

test('Tajweed document remains independently precached', () => {
  assert.match(sw, /'\.\/ahkam-altajweed\.html'/);
  assert.match(sw, /function isTajweedDocument\(request\)/);
});
