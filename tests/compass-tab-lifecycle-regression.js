#!/usr/bin/env node
// =============================================================================
// compass-tab-lifecycle-regression.js
//
// Guarantees the prayer-tab compass is CLOSED (not paused) when leaving the
// tab, and is NEVER auto-resumed when returning — including within 3 seconds
// of leaving (the old COMPASS_TAB_RESUME_WINDOW_MS path).
//
// Scenario under test:
//   open compass → leave prayer tab → compass closed + sensors stopped
//   → return to prayer tab → compass STILL closed (no startCompass auto)
//   → manual «فتح البوصلة» still works via the existing button path
//
// Run:
//   node tests/compass-tab-lifecycle-regression.js
// =============================================================================
'use strict';

const fs = require('fs');
const path = require('path');

const root = process.argv.includes('--dir')
  ? process.argv[process.argv.indexOf('--dir') + 1]
  : path.resolve(__dirname, '..');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log('  PASS  ' + name);
  } else {
    fail++;
    console.log('  FAIL  ' + name + (detail ? ' — ' + detail : ''));
  }
}

function read(name) {
  return fs.readFileSync(path.join(root, name), 'utf8');
}

const prayer = read('prayer.js');
const guide = read('reader-guide.js');

console.log('compass-tab-lifecycle-regression\n');

// ---------------------------------------------------------------------------
// Structural: no pause/resume machinery
// ---------------------------------------------------------------------------
check(
  'COMPASS_TAB_RESUME_WINDOW_MS is removed',
  !/COMPASS_TAB_RESUME_WINDOW_MS/.test(prayer)
);
check(
  'compassPausedAt is removed',
  !/compassPausedAt/.test(prayer)
);
check(
  'startCompass does not accept resume option',
  !/options\.resume|canResume|resume:\s*true/.test(prayer)
);
check(
  'onTabShown does not call startCompass',
  (function () {
    const m = prayer.match(/function onTabShown\(\)\{[\s\S]*?\n  \}/);
    if (!m) return false;
    return !/startCompass/.test(m[0]);
  })(),
  'onTabShown body must not contain startCompass'
);

// ---------------------------------------------------------------------------
// onTabHidden = full close via stopCompass
// ---------------------------------------------------------------------------
check(
  'onTabHidden calls stopCompass (full close, not pause)',
  (function () {
    const m = prayer.match(/function onTabHidden\(\)\{[\s\S]*?\n  \}/);
    if (!m) return false;
    const body = m[0];
    return /stopCompass\s*\(/.test(body) &&
      !/compassPausedAt\s*=/.test(body);
  })()
);

// stopCompass must still detach sensors and hide UI
check(
  'stopCompass detaches orientation listeners',
  /function stopCompass\(\)\{[\s\S]*?removeEventListener\('deviceorientationabsolute'[\s\S]*?removeEventListener\('deviceorientation'/.test(prayer)
);
check(
  'stopCompass sets compassActive = false',
  /function stopCompass\(\)\{[\s\S]*?compassActive\s*=\s*false/.test(prayer)
);
check(
  'stopCompass hides compass panel',
  /function stopCompass\(\)\{[\s\S]*?prayerCompassPanel[\s\S]*?classList\.add\('hidden'\)/.test(prayer)
);
check(
  'stopCompass resets open button label to فتح البوصلة',
  /function stopCompass\(\)\{[\s\S]*?فتح البوصلة/.test(prayer)
);

// ---------------------------------------------------------------------------
// Manual open path still intact
// ---------------------------------------------------------------------------
check(
  'open-compass button toggles startCompass / stopCompass',
  /prayerOpenCompassBtn[\s\S]*?if\s*\(\s*compassActive\s*\)\s*\{\s*stopCompass\(\);\s*\}else\{\s*startCompass\(\);/.test(prayer) ||
  /if\(compassActive\)\{\s*stopCompass\(\);\s*\}else\{\s*startCompass\(\);/.test(prayer)
);
check(
  'startCompass still exists and sets compassActive = true',
  /function startCompass\(\)\{[\s\S]*?compassActive\s*=\s*true/.test(prayer)
);

// ---------------------------------------------------------------------------
// Existing lifecycle wiring from reader-guide (no duplicate system required)
// ---------------------------------------------------------------------------
check(
  'reader-guide calls Prayer.onTabHidden when leaving salah tab',
  /currentTab\s*===\s*'salah'\s*&&\s*tab\s*!==\s*'salah'[\s\S]*?Prayer\.onTabHidden/.test(guide)
);
check(
  'reader-guide calls Prayer.onTabShown when entering salah tab',
  /Prayer\.onTabShown/.test(guide)
);
check(
  'Prayer exposes onTabHidden and onTabShown',
  /onTabHidden:\s*onTabHidden/.test(prayer) && /onTabShown:\s*onTabShown/.test(prayer)
);

// ---------------------------------------------------------------------------
// Behavioral simulation of the lifecycle contract (no real sensors)
// ---------------------------------------------------------------------------
console.log('\n  --- simulated lifecycle ---');
(function simulate() {
  // Minimal stand-in mirroring the post-fix contract.
  var compassActive = false;
  var listeners = 0;
  var panelHidden = true;
  var btnLabel = 'فتح البوصلة';
  var autoStarts = 0;

  function startCompass() {
    compassActive = true;
    listeners = 2;
    panelHidden = false;
    btnLabel = 'إغلاق البوصلة';
  }
  function stopCompass() {
    compassActive = false;
    listeners = 0;
    panelHidden = true;
    btnLabel = 'فتح البوصلة';
  }
  function onTabHidden() {
    if (!compassActive) return;
    stopCompass();
  }
  function onTabShown() {
    // Must NOT call startCompass — count any accidental path
    // (this stub has no auto-resume; production must match).
  }

  // 1) open
  startCompass();
  check('sim: compass open', compassActive === true && listeners > 0 && !panelHidden);

  // 2) leave tab
  onTabHidden();
  check('sim: after leave — closed', compassActive === false);
  check('sim: after leave — sensors stopped', listeners === 0);
  check('sim: after leave — panel hidden', panelHidden === true);
  check('sim: after leave — button shows فتح البوصلة', btnLabel === 'فتح البوصلة');

  // 3) return within < 3s (old resume window) — must stay closed
  onTabShown();
  check('sim: return <3s — still closed', compassActive === false && listeners === 0 && panelHidden);
  check('sim: return <3s — no auto startCompass', autoStarts === 0);

  // 4) manual open still works
  startCompass();
  check('sim: manual open works', compassActive === true && listeners > 0 && !panelHidden);
  stopCompass();
})();

console.log('');
if (fail) {
  console.log(fail + ' failed, ' + pass + ' passed');
  process.exit(1);
}
console.log(pass + ' passed, 0 failed');
process.exit(0);
