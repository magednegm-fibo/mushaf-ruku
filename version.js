// Single source of truth for the app version.
// Bump this on every release. Also update:
//   - manifest.json → "version"
//   - package.json → "version"
//   - PROJECT_STATUS.md header
//   - README.md version notes
self.APP_VERSION = '1.0.676';
if (typeof window !== 'undefined') {
  window.APP_VERSION = self.APP_VERSION;
}
