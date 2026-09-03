#!/usr/bin/env node
// =============================================================================
// prayer-reliability-regression.js — 1.0.635
//
// Pure-logic mirror of the compass-reliability engine restored/fixed in
// prayer.js (evaluateMagFieldEvidence, evaluateCompassReliability, and the
// MAG_BAD_ENTER/MAG_GOOD_EXIT hysteresis around magInterferenceLatched).
// 1.0.635: fixes double-sqrt on headingVariance (already a circular SD).
//
// Mirrors only — does not eval prayer.js itself (prayer.js expects a DOM
// `els` object built by init()/wire(), same reason tests/prayer-regression.js
// already mirrors computeQiblaBearing/headingFromOrientation/selectSource
// instead of loading the real file). The WMM geomagnetic-intensity model
// (computeExpectedIntensity_uT) is NOT reimplemented here — it has no
// reliability-decision logic of its own (it is a lookup/spherical-harmonic
// calculation already covered by wmmDeclination's own math), so this file
// takes "expected |B|" as a direct test input instead, exactly the way the
// real evaluateMagFieldEvidence() consumes computeExpectedIntensity_uT()'s
// return value.
//
// Run: node tests/prayer-reliability-regression.js
// =============================================================================
'use strict';

let pass = 0, fail = 0;
function assert(cond, msg){
  if(cond){ pass++; console.log('  PASS  ' + msg); }
  else { fail++; console.log('  FAIL  ' + msg); }
}

// ---- constants (must match prayer.js exactly — see thresholds table in the
// PR description; unchanged from 1.0.577 where already tuned) ----
var MAG_WMM_RATIO_HIGH = 1.55;
var MAG_WMM_RATIO_LOW = 0.55;
var MAG_WMM_DELTA_MIN = 18;
var MAG_STD_LIMIT = 12;
var MAG_JUMP_LIMIT = 22;
var MAG_ABS_INSANE_LOW = 3;
var MAG_ABS_INSANE_HIGH = 250;
var MAG_BAD_ENTER = 5;
var MAG_GOOD_EXIT = 6;

// ---- exact copies from prayer.js (no DOM/WMM dependency) ----
function dtr(d){ return d * Math.PI / 180; }
function rtd(r){ return r * 180 / Math.PI; }
function angleDiff(a, b){ return ((b - a + 540) % 360) - 180; }

function headingVariance(samples){
  if(samples.length < 3) return 999;
  var sx = 0, sy = 0;
  samples.forEach(function(a){
    sx += Math.cos(dtr(a));
    sy += Math.sin(dtr(a));
  });
  var mean = rtd(Math.atan2(sy, sx));
  var sum = 0;
  samples.forEach(function(a){
    var d = angleDiff(mean, a);
    sum += d * d;
  });
  return Math.sqrt(sum / samples.length);
}

function magMags(samples){
  var out = [];
  for(var i = 0; i < samples.length; i++) out.push(samples[i].mag);
  return out;
}

function magStd(values){
  if(!values || values.length < 3) return 0;
  var sum = 0, i;
  for(i = 0; i < values.length; i++) sum += values[i];
  var mean = sum / values.length;
  var acc = 0;
  for(i = 0; i < values.length; i++){
    var d = values[i] - mean;
    acc += d * d;
  }
  return Math.sqrt(acc / values.length);
}

function magFieldMedian(values){
  if(!values || !values.length) return null;
  var arr = values.slice().sort(function(a, b){ return a - b; });
  var mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

// ---- mirror of evaluateMagFieldEvidence(), with WMM-expected intensity
// injected via `expected` instead of computed from lat/lng (see file header) ----
function evaluateMagFieldEvidence(opts){
  // opts: { lastMag: {mag,t}, now, magVectorSamples: [{mag}], expected: number|null }
  var lastMag = opts.lastMag;
  var now = opts.now;
  if(lastMag == null || (now - lastMag.t) > 1500) return null;
  var b = lastMag.mag;
  if(!isFinite(b)) return null;

  if(b < MAG_ABS_INSANE_LOW || b > MAG_ABS_INSANE_HIGH) return 'HARD';

  var expected = opts.expected;
  if(expected != null && expected > 5){
    var delta = Math.abs(b - expected);
    if(delta >= MAG_WMM_DELTA_MIN){
      if(b > expected * MAG_WMM_RATIO_HIGH || b < expected * MAG_WMM_RATIO_LOW){
        return 'HARD';
      }
    }
  }

  var mags = magMags(opts.magVectorSamples || []);
  if(mags.length >= 4 && magStd(mags) > MAG_STD_LIMIT) return 'SOFT';
  if(mags.length >= 6){
    var med = magFieldMedian(mags.slice(0, mags.length - 2));
    if(med != null && Math.abs(b - med) > MAG_JUMP_LIMIT) return 'SOFT';
  }
  return null;
}

// ---- mirror of evaluateCompassReliability() ----
// 1.0.635: headingVariance() already returns circular *standard deviation*
// (sqrt(sum(angleDiff^2)/n)). Do NOT apply a second Math.sqrt — that made
// headingTooNoisy unreachable (post-sqrt max ≈13.4 < threshold 16).
function evaluateCompassReliability(headingSamplesLen, accuracy, variance, magEvidence){
  if(headingSamplesLen < 4) return 'UNKNOWN';

  var headingStd = Math.max(0, Number(variance) || 0);
  var accuracyBad = Number.isFinite(accuracy) && accuracy > 30;
  var headingTooNoisy = headingStd > 16;

  if(magEvidence === 'HARD') return 'MAGNETIC_INTERFERENCE';
  if(accuracyBad || headingTooNoisy) return 'UNRELIABLE';
  if(magEvidence === 'SOFT') return 'SUSPECT';
  return 'RELIABLE';
}

// ---- mirror of the fixed hysteresis block in onOrientation() ----
function makeHysteresis(){
  return { latched: false, bad: 0, good: 0 };
}
function stepHysteresis(state, verdict){
  if(verdict === 'MAGNETIC_INTERFERENCE'){
    state.bad++; state.good = 0;
    if(state.bad >= MAG_BAD_ENTER) state.latched = true;
  }else if(verdict === 'RELIABLE'){
    state.good++; state.bad = 0;
    if(state.good >= MAG_GOOD_EXIT) state.latched = false;
  }else{
    state.bad = 0; state.good = 0;
  }
  return state;
}

var samples4 = [10, 11, 9, 10]; // >=4 samples, low variance, unlocks past UNKNOWN

console.log('=== Test A: normal field + normal heading -> RELIABLE ===');
(function(){
  var variance = headingVariance(samples4);
  var mag = evaluateMagFieldEvidence({
    lastMag: { mag: 48, t: 1000 }, now: 1000,
    magVectorSamples: [{mag:47},{mag:48},{mag:49},{mag:48}],
    expected: 48
  });
  assert(mag === null, 'no magnetic evidence for a normal field close to WMM');
  var verdict = evaluateCompassReliability(samples4.length, 12, variance, mag);
  assert(verdict === 'RELIABLE', 'verdict RELIABLE, got ' + verdict);
})();

console.log('=== Test B: noisy heading + normal field -> UNRELIABLE ===');
(function(){
  // 1.0.635: headingVariance already returns circular std-dev; evaluateCompassReliability
  // uses it directly (no second sqrt). High heading STD alone now correctly
  // reaches UNRELIABLE. Poor accuracy remains an independent path.
  var noisySamples = [10, 60, 340, 90, 200];
  var variance = headingVariance(noisySamples);
  assert(variance > 16, 'noisy samples produce circular STD > 16 (got ' + variance.toFixed(2) + ')');
  var mag = evaluateMagFieldEvidence({
    lastMag: { mag: 48, t: 1000 }, now: 1000,
    magVectorSamples: [{mag:47},{mag:48},{mag:49},{mag:48}],
    expected: 48
  });
  assert(mag === null, 'no magnetic evidence — problem is heading/accuracy only');

  var verdictBadAccuracy = evaluateCompassReliability(noisySamples.length, 35, variance, mag);
  assert(verdictBadAccuracy === 'UNRELIABLE', 'poor accuracy (35) -> UNRELIABLE, got ' + verdictBadAccuracy);

  var verdictHighStd = evaluateCompassReliability(noisySamples.length, 12, variance, mag);
  assert(verdictHighStd === 'UNRELIABLE',
    'high heading STD alone (accuracy=12, no mag) -> UNRELIABLE after double-sqrt fix, got ' + verdictHighStd);
})();

console.log('=== Test B2 (1.0.635): heading STD threshold boundary cases ===');
(function(){
  // Case 1: STD = 5 -> headingTooNoisy = false
  var v1 = evaluateCompassReliability(4, 12, 5, null);
  assert(v1 === 'RELIABLE', 'STD=5 -> RELIABLE (not too noisy), got ' + v1);

  // Case 2: STD = 15.9 -> headingTooNoisy = false
  var v2 = evaluateCompassReliability(4, 12, 15.9, null);
  assert(v2 === 'RELIABLE', 'STD=15.9 -> RELIABLE (just under 16), got ' + v2);

  // Case 3: STD = 16.1 -> headingTooNoisy = true
  var v3 = evaluateCompassReliability(4, 12, 16.1, null);
  assert(v3 === 'UNRELIABLE', 'STD=16.1 -> UNRELIABLE (just over 16), got ' + v3);
})();

console.log('=== Test B3 (1.0.635): mathematical validation — no extra sqrt on headingVariance ===');
(function(){
  // headingVariance returns sqrt(sum(d^2)/n). Feeding a known STD value through
  // evaluateCompassReliability must treat it as degrees of SD, not as variance
  // that still needs a sqrt. If a second sqrt were present, STD=25 would become
  // ~5 and stay RELIABLE; after the fix it must be UNRELIABLE.
  var knownStd = 25;
  var verdict = evaluateCompassReliability(4, 10, knownStd, null);
  assert(verdict === 'UNRELIABLE',
    'known circular STD=25 must be UNRELIABLE (proves no extra sqrt), got ' + verdict);

  // And a value that would only fail after a spurious sqrt must stay RELIABLE:
  // if code did Math.sqrt(9)=3, still fine; if it treated 9 as SD it is fine too.
  // Stronger check: value whose sqrt is still under 16 but value itself is over.
  var overThresholdUnderSqrt = 20; // sqrt(20)≈4.47 < 16, but 20 > 16
  var vOver = evaluateCompassReliability(4, 10, overThresholdUnderSqrt, null);
  assert(vOver === 'UNRELIABLE',
    'STD=20 (>16) must be UNRELIABLE; if extra sqrt existed it would be ~4.5 and RELIABLE — got ' + vOver);
})();

console.log('=== Test C: stable-but-magnetically-wrong heading -> MAGNETIC_INTERFERENCE (core hypothesis) ===');
(function(){
  // heading = 130°, very low variance (near-identical repeated samples)
  var stableSamples = [130, 130.5, 129.7, 130.2, 130.1];
  var variance = headingVariance(stableSamples);
  assert(variance < 2, 'heading variance is very low / stable (' + variance.toFixed(2) + ')');
  // measured |B| abnormal vs a normal expected WMM intensity
  var mag = evaluateMagFieldEvidence({
    lastMag: { mag: 95, t: 1000 }, now: 1000, // far above expected
    magVectorSamples: [{mag:90},{mag:92},{mag:94},{mag:95}],
    expected: 48 // normal geomagnetic intensity at this location
  });
  assert(mag === 'HARD', 'measured |B|=95 vs expected=48 is flagged HARD, got ' + mag);
  var verdict = evaluateCompassReliability(stableSamples.length, 8 /* good accuracy */, variance, mag);
  assert(verdict === 'MAGNETIC_INTERFERENCE',
    'stable heading + abnormal |B| must NOT be RELIABLE — got ' + verdict);
  assert(verdict !== 'RELIABLE', 'explicitly confirms the pre-1.0.634 bug is fixed');
})();

console.log('=== Test D: sudden magnetic jump, normal heading -> SUSPECT ===');
(function(){
  var variance = headingVariance(samples4);
  // recent stable baseline around 45, then a sudden jump to 75 (delta 30 > MAG_JUMP_LIMIT=22)
  var mag = evaluateMagFieldEvidence({
    lastMag: { mag: 75, t: 1000 }, now: 1000,
    magVectorSamples: [{mag:45},{mag:46},{mag:44},{mag:45},{mag:46},{mag:75}],
    expected: null // no location fix yet — jump/STD path must still work
  });
  assert(mag === 'SOFT', 'sudden jump vs median flagged SOFT, got ' + mag);
  var verdict = evaluateCompassReliability(samples4.length, 12, variance, mag);
  assert(verdict === 'SUSPECT', 'verdict SUSPECT (soft evidence only), got ' + verdict);
})();

console.log('=== Test E: hysteresis — 1 good sample must not clear a latch; 6 consecutive good must ===');
(function(){
  var h = makeHysteresis();
  for(var i = 0; i < 5; i++) stepHysteresis(h, 'MAGNETIC_INTERFERENCE');
  assert(h.latched === true, '5 consecutive bad -> latched');

  stepHysteresis(h, 'RELIABLE');
  assert(h.latched === true, '1 good sample alone must NOT clear the latch (bug fix under test)');

  for(var j = 0; j < 4; j++) stepHysteresis(h, 'RELIABLE'); // total 5 consecutive good so far
  assert(h.latched === true, 'still latched at 5 consecutive good (< MAG_GOOD_EXIT=6)');

  stepHysteresis(h, 'RELIABLE'); // 6th consecutive good
  assert(h.latched === false, '6 consecutive good -> latch clears');
})();

console.log('=== Test E2: SUSPECT/UNRELIABLE never move the interference latch ===');
(function(){
  var h = makeHysteresis();
  for(var i = 0; i < 5; i++) stepHysteresis(h, 'MAGNETIC_INTERFERENCE');
  assert(h.latched === true, 'latched after 5 bad');
  stepHysteresis(h, 'SUSPECT');
  stepHysteresis(h, 'UNRELIABLE');
  assert(h.latched === true, 'SUSPECT/UNRELIABLE do not clear an existing interference latch');
  assert(h.good === 0 && h.bad === 0, 'SUSPECT/UNRELIABLE reset both streaks without deciding either way');
})();

console.log('=== Test F: no GPS/WMM (expected == null) -> falls back to STD/jump/accuracy/variance ===');
(function(){
  var variance = headingVariance(samples4);
  var mag = evaluateMagFieldEvidence({
    lastMag: { mag: 48, t: 1000 }, now: 1000,
    magVectorSamples: [{mag:47},{mag:48},{mag:49},{mag:48}],
    expected: null // no location fix
  });
  assert(mag === null, 'no crash without WMM/location; falls through to STD/jump (none tripped here)');
  var verdict = evaluateCompassReliability(samples4.length, 12, variance, mag);
  assert(verdict === 'RELIABLE', 'system keeps working via accuracy+variance fallback, got ' + verdict);
})();

console.log('=== Test F2: no GPS/WMM but a real jump is still caught (STD/jump fallback path) ===');
(function(){
  var variance = headingVariance(samples4);
  var mag = evaluateMagFieldEvidence({
    lastMag: { mag: 75, t: 1000 }, now: 1000,
    magVectorSamples: [{mag:45},{mag:46},{mag:44},{mag:45},{mag:46},{mag:75}],
    expected: null
  });
  assert(mag === 'SOFT', 'jump detection still works with no location fix, got ' + mag);
})();

console.log('=== Test G: no Magnetometer API (no fresh sample) -> null evidence, no crash ===');
(function(){
  var variance = headingVariance(samples4);
  var mag = evaluateMagFieldEvidence({
    lastMag: null, now: 1000,
    magVectorSamples: [],
    expected: 48
  });
  assert(mag === null, 'lastMag null (no Magnetometer API / no reading yet) -> null, not a crash');
  var verdict = evaluateCompassReliability(samples4.length, 12, variance, mag);
  assert(verdict === 'RELIABLE', 'compass keeps working via accuracy+variance only, got ' + verdict);
})();

console.log('=== Test G2: stale magnetometer reading (>1500ms old) is ignored, not treated as evidence ===');
(function(){
  var mag = evaluateMagFieldEvidence({
    lastMag: { mag: 95, t: 1000 }, now: 3000, // 2000ms old
    magVectorSamples: [{mag:90},{mag:92},{mag:94},{mag:95}],
    expected: 48
  });
  assert(mag === null, 'stale reading (>1500ms) does not count as evidence, got ' + mag);
})();

console.log('=== Test H: WMM small/normal deviation must NOT be flagged (avoid false positives) ===');
(function(){
  // within ratio band AND below MAG_WMM_DELTA_MIN -> must not trip
  var mag = evaluateMagFieldEvidence({
    lastMag: { mag: 54, t: 1000 }, now: 1000, // delta=6uT, well under MAG_WMM_DELTA_MIN=18
    magVectorSamples: [{mag:53},{mag:54},{mag:55},{mag:54}],
    expected: 48
  });
  assert(mag === null, 'small normal local variation (delta=6uT) is not flagged, got ' + mag);
})();

console.log('');
console.log('Reliability engine: ' + pass + ' passed, ' + fail + ' failed.');
if(fail > 0){
  process.exitCode = 1;
}
