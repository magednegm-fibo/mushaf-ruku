'use strict';
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

test('new worker installs into a versioned cache and only skips waiting after install work', () => {
  assert.match(sw, /const CACHE = 'juzamma-v' \+ self\.APP_VERSION/);
  assert.match(sw, /self\.addEventListener\('install'/);
  assert.match(sw, /return self\.skipWaiting\(\)/);
  assert.ok(sw.indexOf('return self.skipWaiting()') > sw.indexOf('var coreOk = CORE_ASSETS.every'));
});

test('activation removes obsolete app caches and claims controlled clients', () => {
  assert.match(sw, /keys\.filter\(function\(k\)\{ return k !== CACHE; \}\)/);
  assert.match(sw, /return self\.clients\.claim\(\)/);
});

test('failed core precache rejects installation without activating the incomplete worker', () => {
  assert.match(sw, /if\(!coreOk\)\{\s*return Promise\.reject\(new Error\('sw-install-core-incomplete'\)\)/);
  assert.match(sw, /\.catch\(function\(\)\{\s*\/\* keep previous SW \+ cache \*\//);
});

test('app shell cache mirroring remains restricted to the actual shell URL', () => {
  assert.match(sw, /function isAppShellUrl\(url\)/);
  assert.match(sw, /if\(!response \|\| !response\.ok \|\| !isAppShellUrl\(sourceUrl \|\| assetUrl\('index\.html'\)\)\) return Promise\.resolve\(\);/);
});
