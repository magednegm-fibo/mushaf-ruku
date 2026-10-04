/**
 * Qibla + heading + source-selection regression — 1.0.526
 */
'use strict';

function assert(cond, msg){
  if(!cond) throw new Error('FAIL: ' + msg);
  console.log('OK:', msg);
}

function dtr(d){ return d * Math.PI / 180; }
function rtd(r){ return r * 180 / Math.PI; }
function normalizeDeg(a){ return ((a % 360) + 360) % 360; }
function angleDiff(a, b){ return ((b - a + 540) % 360) - 180; }

function computeQiblaBearing(lat, lng){
  var KAABA_LAT = 21.4225, KAABA_LNG = 39.8262;
  if(Math.abs(lat - KAABA_LAT) < 1e-6 && Math.abs(lng - KAABA_LNG) < 1e-6) return 0;
  var phi1 = dtr(lat), phi2 = dtr(KAABA_LAT);
  var dL = dtr(KAABA_LNG - lng);
  var y = Math.sin(dL) * Math.cos(phi2);
  var x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dL);
  return normalizeDeg(rtd(Math.atan2(y, x)));
}

function headingFromOrientation(alpha, beta, gamma){
  if(alpha == null || isNaN(alpha)) return null;
  if(beta == null || isNaN(beta)) beta = 0;
  var cosB = Math.cos(dtr(beta));
  if(Math.abs(cosB) < 0.08) return null;
  var east = -cosB * Math.sin(dtr(alpha));
  var north = Math.cos(dtr(alpha)) * cosB;
  return normalizeDeg(rtd(Math.atan2(east, north)));
}

/** Mirrors prayer.js source-lock rules (no DOM). */
function selectSource(state, ev){
  var hasWebkit = typeof ev.webkitCompassHeading === 'number' && !isNaN(ev.webkitCompassHeading);
  var isAbsoluteEvent = (ev.type === 'deviceorientationabsolute');
  var isOrientationAbsolute = (ev.type === 'deviceorientation' && ev.absolute === true &&
                               typeof ev.alpha === 'number');
  var isRelativeOnly = (ev.type === 'deviceorientation' && ev.absolute !== true && !hasWebkit);
  if(isRelativeOnly) return { action: 'reject-relative' };

  var candidate = null;
  if(isAbsoluteEvent && typeof ev.alpha === 'number') candidate = 'absolute-event';
  else if(hasWebkit) candidate = 'webkit';
  else if(isOrientationAbsolute) candidate = 'orientation-absolute';
  else return { action: 'ignore' };

  if(state.locked != null && candidate !== state.locked){
    return { action: 'reject-other-source', locked: state.locked, candidate: candidate };
  }
  if(state.locked == null){
    if(candidate !== 'absolute-event' && state.absoluteListenerAttached && !state.absoluteGaveUp){
      return { action: 'wait-absolute' };
    }
    state.locked = candidate;
    state.samples = [];
    state.smoothed = null;
    return { action: 'lock', source: candidate };
  }
  return { action: 'accept', source: state.locked };
}

console.log('=== Qibla ===');
[
  ['Cairo', 30.0444, 31.2357, 136.14],
  ['Alexandria', 31.2001, 29.9187, 135.44],
  ['Aswan', 24.0889, 32.8998, 111.29],
  ['Madinah', 24.4672, 39.6111, 176.24],
  ['London', 51.5074, -0.1278, 118.99],
  ['New York', 40.7128, -74.0060, 58.48],
  ['Tokyo', 35.6762, 139.6503, 293.00]
].forEach(function(c){
  var b = computeQiblaBearing(c[1], c[2]);
  assert(Math.abs(b - c[3]) < 0.15, c[0] + ' ' + b.toFixed(2));
});
assert(computeQiblaBearing(21.4225, 39.8262) === 0, 'Kaaba → 0');

console.log('=== Heading (unchanged) ===');
assert(Math.abs(headingFromOrientation(90, 0, 0) - 270) < 0.01, 'West');
assert(Math.abs(headingFromOrientation(0, 0, 0) - 0) < 0.01, 'North');
assert(Math.abs(headingFromOrientation(270, 0, 0) - 90) < 0.01, 'East');
assert(Math.abs(headingFromOrientation(180, 0, 0) - 180) < 0.01, 'South');
[15,30,45,60].forEach(function(b){
  assert(Math.abs(headingFromOrientation(90, b, 0) - 270) < 0.01, 'pitch ' + b);
});
assert(headingFromOrientation(0, 90, 0) == null, 'near-vertical null');
assert(Math.abs(angleDiff(359, 1) - 2) < 1e-9, 'wrap');

console.log('=== Source selection ===');
// absolute only
var s = { locked: null, absoluteListenerAttached: true, absoluteGaveUp: false, samples: [1] };
var r = selectSource(s, { type: 'deviceorientationabsolute', alpha: 10, absolute: true });
assert(r.action === 'lock' && r.source === 'absolute-event', 'lock absolute-event');
assert(s.samples.length === 0, 'samples cleared on lock');

// relative rejected
s = { locked: null, absoluteListenerAttached: false, absoluteGaveUp: false, samples: [] };
r = selectSource(s, { type: 'deviceorientation', absolute: false, alpha: 10 });
assert(r.action === 'reject-relative', 'relative rejected');

// absolute + relative while locked absolute → reject other
s = { locked: 'absolute-event', absoluteListenerAttached: true, absoluteGaveUp: false, samples: [1,2] };
r = selectSource(s, { type: 'deviceorientation', absolute: true, alpha: 20 });
assert(r.action === 'reject-other-source', 'absolute+relative → absolute only');
assert(s.samples.length === 2, 'samples not mixed/cleared on reject');

// absolute event + orientation absolute while probing absolute → wait
s = { locked: null, absoluteListenerAttached: true, absoluteGaveUp: false, samples: [] };
r = selectSource(s, { type: 'deviceorientation', absolute: true, alpha: 20 });
assert(r.action === 'wait-absolute', 'wait for absolute during probe');

// after give-up, orientation-absolute may lock
s = { locked: null, absoluteListenerAttached: true, absoluteGaveUp: true, samples: [9] };
r = selectSource(s, { type: 'deviceorientation', absolute: true, alpha: 20 });
assert(r.action === 'lock' && r.source === 'orientation-absolute', 'fallback orientation-absolute');
assert(s.samples.length === 0, 'samples cleared on source change lock');

// webkit only (no absolute API)
s = { locked: null, absoluteListenerAttached: false, absoluteGaveUp: false, samples: [] };
r = selectSource(s, { type: 'deviceorientation', absolute: false, webkitCompassHeading: 42 });
assert(r.action === 'lock' && r.source === 'webkit', 'webkit only');

// webkit while absolute probing → wait
s = { locked: null, absoluteListenerAttached: true, absoluteGaveUp: false, samples: [] };
r = selectSource(s, { type: 'deviceorientation', absolute: false, webkitCompassHeading: 42 });
assert(r.action === 'wait-absolute', 'webkit waits during absolute probe');

// once locked absolute, webkit rejected
s = { locked: 'absolute-event', absoluteListenerAttached: true, absoluteGaveUp: false, samples: [3] };
r = selectSource(s, { type: 'deviceorientation', absolute: false, webkitCompassHeading: 42 });
assert(r.action === 'reject-other-source', 'locked absolute ignores webkit');

console.log('\nAll 1.0.526 checks passed.');

// ---------------------------------------------------------------------------
// Notifications: permission sync + settings migration (1.0.530+)
// Pure logic mirrors of prayer.js (no DOM / no real Notification API required)
// ---------------------------------------------------------------------------

function normalizeSettingsMirror(o){
  var d = {
    notificationsEnabled: false,
    manualCityId: 'cairo',
    preferGps: true
  };
  if(!o || typeof o !== 'object') return d;
  if(typeof o.notificationsEnabled === 'boolean') d.notificationsEnabled = o.notificationsEnabled;
  // adhanMode intentionally ignored
  // legacy per-prayer `prayers.{fajr,dhuhr,asr,maghrib,isha}` intentionally ignored —
  // a single notificationsEnabled flag now controls all five prayers
  if(o.manualCityId) d.manualCityId = o.manualCityId;
  if(typeof o.preferGps === 'boolean') d.preferGps = o.preferGps;
  return d;
}

/** Mirrors prayer.js's scheduleNotificationsIfNeeded() gate: unified decision only. */
function shouldScheduleAnyPrayer(settings, permissionOrNull){
  if(!settings.notificationsEnabled) return false;
  if(permissionOrNull !== 'granted') return false;
  return true;
}

/**
 * Policy: given current stored enabled flag and Notification.permission value
 * (or null if API missing), return corrected enabled + whether forced off.
 * Does NOT request permission.
 */
function permissionSyncPolicy(storedEnabled, permissionOrNull){
  if(permissionOrNull === null || permissionOrNull === undefined){
    // Notification API missing
    return { enabled: false, forcedOff: !!storedEnabled, schedule: false };
  }
  if(permissionOrNull === 'denied'){
    return { enabled: false, forcedOff: !!storedEnabled, schedule: false };
  }
  // 'default' | 'granted' — do not force off; scheduling only if enabled && granted
  return {
    enabled: !!storedEnabled,
    forcedOff: false,
    schedule: !!storedEnabled && permissionOrNull === 'granted'
  };
}

console.log('=== Notifications permission policy ===');
// 1. API missing → OFF
(function(){
  var r = permissionSyncPolicy(true, null);
  assert(r.enabled === false && r.schedule === false, 'API missing → OFF, no schedule');
})();
// 2. default + stored false → no schedule, no force
(function(){
  var r = permissionSyncPolicy(false, 'default');
  assert(r.enabled === false && r.forcedOff === false && r.schedule === false,
    'default + OFF → stay OFF, no request implied');
})();
// 3. granted + stored true → can schedule
(function(){
  var r = permissionSyncPolicy(true, 'granted');
  assert(r.enabled === true && r.schedule === true, 'granted + ON → schedule allowed');
})();
// 4. denied + stored enabled=true → force OFF, no schedule
(function(){
  var r = permissionSyncPolicy(true, 'denied');
  assert(r.enabled === false && r.forcedOff === true && r.schedule === false,
    'denied + stored ON → force OFF, no schedule');
})();
// 5. denied + already OFF
(function(){
  var r = permissionSyncPolicy(false, 'denied');
  assert(r.enabled === false && r.schedule === false, 'denied + OFF → stay OFF');
})();

console.log('=== Settings migration (adhanMode + legacy per-prayer) ===');
(function(){
  var legacy = {
    notificationsEnabled: true,
    adhanMode: 'adhan',
    prayers: { fajr: true, dhuhr: false, asr: true, maghrib: true, isha: false },
    manualCityId: 'alexandria',
    preferGps: false
  };
  var n = normalizeSettingsMirror(legacy);
  assert(n.notificationsEnabled === true, 'migration keeps notificationsEnabled');
  assert(n.manualCityId === 'alexandria', 'migration keeps city');
  assert(!Object.prototype.hasOwnProperty.call(n, 'adhanMode'), 'adhanMode not in normalized settings');
  assert(!Object.prototype.hasOwnProperty.call(n, 'prayers'), 'legacy per-prayer object not in normalized settings');
})();
(function(){
  var n = normalizeSettingsMirror({ adhanMode: 'alert' });
  assert(!Object.prototype.hasOwnProperty.call(n, 'adhanMode'), 'adhanMode-only legacy → dropped');
  assert(n.notificationsEnabled === false, 'default remains OFF');
})();

console.log('=== Unified scheduler gate (no per-prayer source of truth) ===');
var ADHAN_PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
(function(){
  // ON + granted → every one of the five prayers schedules, regardless of any
  // stray legacy `prayers.*` flags that might still exist on a migrated object.
  var settings = normalizeSettingsMirror({
    notificationsEnabled: true,
    prayers: { fajr: false, dhuhr: false, asr: false, maghrib: false, isha: false }
  });
  var scheduled = shouldScheduleAnyPrayer(settings, 'granted');
  assert(scheduled === true, 'ON schedules all prayers even if legacy prayers.* were false');
  ADHAN_PRAYERS.forEach(function(k){
    assert(!Object.prototype.hasOwnProperty.call(settings, 'prayers'), 'no prayers.' + k + ' survives normalization');
  });
})();
(function(){
  // OFF → nothing scheduled, no per-prayer exceptions possible.
  var settings = normalizeSettingsMirror({ notificationsEnabled: false });
  assert(shouldScheduleAnyPrayer(settings, 'granted') === false, 'OFF schedules nothing');
})();

console.log('All notification/permission/migration checks passed.');

console.log('=== Display time 12h format ===');
function formatDisplayTime(hm24){
  if(hm24 == null || hm24 === '') return '—';
  var parts = String(hm24).split(':');
  if(parts.length < 2) return String(hm24);
  var h = parseInt(parts[0], 10);
  var mi = parseInt(parts[1], 10);
  if(isNaN(h) || isNaN(mi)) return String(hm24);
  var ap = h >= 12 ? 'PM' : 'AM';
  var h12 = h % 12;
  if(h12 === 0) h12 = 12;
  return (h12 < 10 ? '0' : '') + h12 + ':' + (mi < 10 ? '0' : '') + mi + ' ' + ap;
}
[
  ['00:00', '12:00 AM'],
  ['00:15', '12:15 AM'],
  ['04:58', '04:58 AM'],
  ['06:29', '06:29 AM'],
  ['11:59', '11:59 AM'],
  ['12:00', '12:00 PM'],
  ['12:57', '12:57 PM'],
  ['13:01', '01:01 PM'],
  ['16:32', '04:32 PM'],
  ['19:24', '07:24 PM'],
  ['20:45', '08:45 PM'],
  ['23:59', '11:59 PM']
].forEach(function(c){
  assert(formatDisplayTime(c[0]) === c[1], c[0] + ' → ' + formatDisplayTime(c[0]) + ' (expect ' + c[1] + ')');
});
console.log('All 12h display format checks passed.');

// ---------------------------------------------------------------------------
// Countdown text (highlighted-row "باقي ..." string) — 1.0.555
// Mirrors formatCountdownText() in prayer.js (current time → next prayer
// time, never a decrementing stored counter).
// ---------------------------------------------------------------------------
console.log('=== Countdown text ===');
(function(){
  function arabicCountWord(n, forms){
    if(n === 1) return forms.one;
    if(n === 2) return forms.two;
    if(n >= 3 && n <= 10) return n + ' ' + forms.few;
    return n + ' ' + forms.many;
  }
  var HOUR_FORMS = { one: 'ساعة', two: 'ساعتين', few: 'ساعات', many: 'ساعة' };
  var MINUTE_FORMS = { one: 'دقيقة', two: 'دقيقتين', few: 'دقائق', many: 'دقيقة' };
  var PRAYER_ARRIVED_TEXT = 'حان وقت الصلاة';
  function formatCountdownText(minutesUntil){
    if(minutesUntil == null || !isFinite(minutesUntil)) return '';
    var totalSeconds = Math.round(minutesUntil * 60);
    if(totalSeconds <= 0) return PRAYER_ARRIVED_TEXT;
    var totalMinutes = Math.floor(totalSeconds / 60);
    var hours = Math.floor(totalMinutes / 60);
    var minutes = totalMinutes % 60;
    if(hours === 0 && minutes === 0) return 'باقي أقل من دقيقة';
    var segments = [];
    if(hours > 0) segments.push(arabicCountWord(hours, HOUR_FORMS));
    if(minutes > 0) segments.push(arabicCountWord(minutes, MINUTE_FORMS));
    return 'باقي ' + segments.join(' و ');
  }

  assert(formatCountdownText(198) === 'باقي 3 ساعات و 18 دقيقة', 'hours+minutes (few)');
  assert(formatCountdownText(60) === 'باقي ساعة', 'exactly 1 hour → دون رقم');
  assert(formatCountdownText(121) === 'باقي ساعتين و دقيقة', 'dual hour + dual-form minute word');
  assert(formatCountdownText(1) === 'باقي دقيقة', '1 minute → دون رقم');
  assert(formatCountdownText(0.4) === 'باقي أقل من دقيقة', 'sub-minute → أقل من دقيقة');
  assert(formatCountdownText(0) === PRAYER_ARRIVED_TEXT, 'arrival at exactly 0');
  assert(formatCountdownText(-5) === PRAYER_ARRIVED_TEXT, 'past due still shows arrival text');
  assert(formatCountdownText(665) === 'باقي 11 ساعة و 5 دقائق', '11+ hours uses singular-form word');
})();
console.log('All countdown text checks passed.');
