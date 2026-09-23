// Single source of truth for the app version.
// Bump via:  node tools/sync-version.js X.Y.Z
// That updates package.json, manifest.json, PROJECT_STATUS.md, README.md.
// Verify with:  node tests/version-sync-regression.js
//   (or: npm run version:check)
self.APP_VERSION = '1.0.746';
if (typeof window !== 'undefined') {
  window.APP_VERSION = self.APP_VERSION;
}
