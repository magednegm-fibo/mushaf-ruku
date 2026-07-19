// Single source of truth for the app's version number.
//
// Loaded first on the page (index.html) AND imported by the Service
// Worker (sw.js, via importScripts) so both contexts read the exact same
// value — no more the app saying "0.9.1" while sw.js says "v82".
//
// `self` refers to `window` on the page and to the worker's global scope
// inside sw.js, so this one assignment works in both places unchanged.
//
// >>> Bump ONLY this value on every release. <<<
// Everything else (Settings, About text, Service Worker cache name) reads
// from here. manifest.json can't execute JS, so its "version" field must
// still be updated by hand to match — app.js checks that at startup and
// logs a console warning if it ever drifts out of sync.
self.APP_VERSION = '0.9.121';
