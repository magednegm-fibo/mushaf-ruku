// Shared touch-gesture primitives: long-press, horizontal swipe, and
// swipe+pinch. Every place in the app that listens for touchstart/
// touchmove/touchend used to also have to remember touchcancel (Android
// can send touchcancel instead of touchend -- e.g. the system takes the
// gesture over, or a call/notification interrupts it). That fix now lives
// here ONCE, so every caller gets correct cleanup automatically instead of
// each file re-implementing (and each needing the same fix separately).
//
// Loaded before any module that uses it (see index.html) and before
// app.js. Exposed as window.Gestures. No init(deps) -- this module is
// stateless and only takes per-call options, so it doesn't need wiring
// into the app's dependency-injection chain.
(function(){
  'use strict';

  // ===================================================================
  // Long press -- used for: playing a single ayah (audioManager.js) and
  // opening the reminder-mark colour/delete popup (reader-reminders.js).
  // ===================================================================
  //
  // options:
  //   root               element to listen on (required)
  //   resolveTarget(el)  given the raw event target, return the element
  //                      the press is "on", or a falsy value to ignore
  //                      this press entirely (e.g. wrong element, or a
  //                      gate like a settings toggle). Optional -- if
  //                      omitted, the raw target is used.
  //   longPressMs        default 550
  //   moveTolerance      default 10 (px of finger drift before cancelling)
  //   onPressStart(target, x, y)  fires as soon as resolveTarget accepts
  //   onFire(target, x, y)        fires once the long-press completes
  //   onPressEnd(target)          fires on every way a press ends:
  //                                touchend/mouseup, touchcancel, a second
  //                                finger landing, or moving past
  //                                moveTolerance. Always fires exactly
  //                                once per onPressStart, so it's the
  //                                right place to undo whatever
  //                                onPressStart did (e.g. resume a paused
  //                                auto-scroll).
  //   suppressContextMenu   default false -- some Android WebViews show a
  //                          native long-press menu even with
  //                          user-select:none; set true to block it.
  //   mouseSupport           default true -- also wires mousedown/move/up
  //                          equivalents, for testing on desktop.
  function longPress(options){
    var root = options.root;
    if(!root) return;
    var LONG_PRESS_MS = options.longPressMs || 550;
    var MOVE_TOLERANCE = options.moveTolerance || 10;
    var timer = null;
    var startPos = null;
    var cancelled = false;
    var activeTarget = null;

    function firePressEnd(){
      if(activeTarget && options.onPressEnd) options.onPressEnd(activeTarget);
      activeTarget = null;
    }

    function onStart(x, y, rawTarget){
      var resolved = options.resolveTarget ? options.resolveTarget(rawTarget) : rawTarget;
      if(!resolved) return;
      cancelled = false;
      startPos = {x: x, y: y};
      activeTarget = resolved;
      if(options.onPressStart) options.onPressStart(resolved, x, y);
      clearTimeout(timer);
      timer = setTimeout(function(){
        if(cancelled) return;
        if(options.onFire) options.onFire(resolved, x, y);
      }, LONG_PRESS_MS);
    }
    function onMove(x, y){
      if(!startPos) return;
      if(Math.abs(x - startPos.x) > MOVE_TOLERANCE || Math.abs(y - startPos.y) > MOVE_TOLERANCE){
        cancelled = true;
        clearTimeout(timer);
        startPos = null;
        firePressEnd();
      }
    }
    function onEnd(){
      clearTimeout(timer);
      startPos = null;
      firePressEnd();
    }

    root.addEventListener('touchstart', function(e){
      if(e.touches.length > 1){
        // A second finger just landed -- this is the start of a
        // pinch-zoom gesture elsewhere on the page, not a long-press.
        // Cancel any pending long-press right away.
        cancelled = true;
        clearTimeout(timer);
        startPos = null;
        firePressEnd();
        return;
      }
      var t = e.touches[0];
      onStart(t.clientX, t.clientY, e.target);
    }, {passive:true});
    root.addEventListener('touchmove', function(e){
      var t = e.touches[0];
      if(!t) return;
      onMove(t.clientX, t.clientY);
    }, {passive:true});
    root.addEventListener('touchend', onEnd, {passive:true});
    root.addEventListener('touchcancel', onEnd, {passive:true});

    if(options.suppressContextMenu){
      root.addEventListener('contextmenu', function(e){ e.preventDefault(); });
    }

    if(options.mouseSupport !== false){
      root.addEventListener('mousedown', function(e){ onStart(e.clientX, e.clientY, e.target); });
      root.addEventListener('mousemove', function(e){ onMove(e.clientX, e.clientY); });
      root.addEventListener('mouseup', onEnd);
    }
  }

  // ===================================================================
  // Horizontal swipe -- used for: switching tafsir ruku (reader-tafsir.js)
  // and switching دليل القارئ tabs (reader-guide.js). Both panels are
  // fixed, vertically-scrollable sheets, so a confirmed horizontal drag
  // needs preventDefault on its touchmove or the browser's own touch
  // handling can leak the drag to whatever sits behind the panel.
  // ===================================================================
  //
  // options:
  //   root               element to listen on (required)
  //   threshold          default 60 (px of horizontal travel to count as
  //                      a swipe, not just a tap/jitter)
  //   ratioLock          default 1.5 -- dx must exceed dy * ratioLock,
  //                      both to confirm "this drag is horizontal" (and
  //                      start calling preventDefault) and to accept the
  //                      final gesture as a swipe rather than a vertical
  //                      scroll
  //   onSwipe(dx, dy)    fires once, on touchend, only if the gesture
  //                      cleared both threshold and ratioLock
  function swipe(options){
    var root = options.root;
    if(!root) return;
    var threshold = options.threshold || 60;
    var ratioLock = options.ratioLock || 1.5;
    var startX = null, startY = null;
    var horizontal = false; // becomes true once a drag is confirmed horizontal

    function onMove(e){
      if(startX === null || e.touches.length !== 1) return;
      var t = e.touches[0];
      var dx = t.clientX - startX;
      var dy = t.clientY - startY;
      if(!horizontal){
        if(Math.abs(dx) < 10) return; // too small yet to tell intent
        if(Math.abs(dx) <= Math.abs(dy) * ratioLock) return; // reads as a vertical scroll -- leave it alone
        horizontal = true;
      }
      e.preventDefault();
    }

    root.addEventListener('touchstart', function(e){
      if(e.touches.length !== 1){ startX = null; return; }
      var t = e.touches[0];
      startX = t.clientX; startY = t.clientY;
      horizontal = false;
      root.addEventListener('touchmove', onMove, {passive:false});
    }, {passive:true});

    root.addEventListener('touchend', function(e){
      root.removeEventListener('touchmove', onMove, {passive:false});
      if(startX === null) return;
      var t = e.changedTouches[0];
      var dx = t.clientX - startX;
      var dy = t.clientY - startY;
      startX = null; startY = null;
      if(Math.abs(dx) <= threshold || Math.abs(dx) <= Math.abs(dy) * ratioLock) return;
      if(options.onSwipe) options.onSwipe(dx, dy);
    }, {passive:true});

    root.addEventListener('touchcancel', function(){
      root.removeEventListener('touchmove', onMove, {passive:false});
      startX = null; startY = null;
    }, {passive:true});
  }

  // ===================================================================
  // Swipe + pinch -- used for: turning pages by swiping and zooming the
  // ayah font size with a two-finger pinch, both on the mushaf page
  // itself (navigation.js). Combined into one gesture because they share
  // the same touchstart (one finger vs. two decides which gesture this
  // is) and must stay mutually exclusive.
  // ===================================================================
  //
  // options:
  //   root                     element to listen on (required)
  //   isPinchEnabled()         optional gate checked on a 2-finger
  //                            touchstart; pinch is skipped if it
  //                            returns false
  //   getPinchValue()          returns the value pinching should scale
  //                            (e.g. the current font size)
  //   pinchMin, pinchMax       clamp range for the scaled value
  //   onPinchChange(newValue)  fires on every pinch touchmove with the
  //                            clamped, rounded new value
  //   onPinchEnd()             fires once when the pinch finishes
  //                            (finger lifted, or the gesture is
  //                            cancelled) -- the right place to persist
  //                            state and show a confirmation toast
  //   swipeThreshold           default 60
  //   ratioLock                default 1.5
  //   onSwipe(dx, dy)          fires once on touchend for a completed
  //                            one-finger swipe that isn't a pinch
  function swipeAndPinch(options){
    var frame = options.root;
    if(!frame) return;
    var swipeThreshold = options.swipeThreshold || 60;
    var ratioLock = options.ratioLock || 1.5;
    var startX = null, startY = null;
    var pinching = false;
    var pinchStartDist = null;
    var pinchStartValue = null;

    function touchDistance(t1, t2){
      var dx = t1.clientX - t2.clientX;
      var dy = t1.clientY - t2.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function onPinchMove(e){
      if(!pinching || e.touches.length !== 2) return;
      e.preventDefault(); // stop the browser from also trying its own zoom
      var dist = touchDistance(e.touches[0], e.touches[1]);
      var ratio = dist / pinchStartDist;
      var newValue = Math.round(pinchStartValue * ratio);
      if(typeof options.pinchMin === 'number') newValue = Math.max(options.pinchMin, newValue);
      if(typeof options.pinchMax === 'number') newValue = Math.min(options.pinchMax, newValue);
      if(options.onPinchChange) options.onPinchChange(newValue);
    }

    function endPinch(){
      pinching = false;
      pinchStartDist = null;
      frame.removeEventListener('touchmove', onPinchMove, {passive:false});
      if(options.onPinchEnd) options.onPinchEnd();
    }

    frame.addEventListener('touchstart', function(e){
      // Any time a second finger lands, this can no longer be a one-finger
      // swipe -- reset the anchor unconditionally, not only inside the
      // pinch-enabled branch below. Without this, when pinch-zoom is
      // turned off (isPinchEnabled() false) a lingering second finger left
      // `startX/startY` set from the first finger's touchstart, and the
      // eventual touchend computed dx/dy against `e.changedTouches[0]`
      // (whichever finger happened to lift) mixed coordinates from two
      // different fingers -- occasionally clearing the swipe threshold by
      // accident and turning the page when the reader never intended to
      // swipe at all.
      if(e.touches.length !== 1){ startX = null; startY = null; }
      if(e.touches.length === 2 && (!options.isPinchEnabled || options.isPinchEnabled())){
        pinching = true;
        pinchStartDist = touchDistance(e.touches[0], e.touches[1]);
        pinchStartValue = options.getPinchValue ? options.getPinchValue() : 0;
        // Only registered for the brief duration of an actual pinch, so
        // ordinary one-finger scrolling never has a non-passive touchmove
        // listener in its way (that alone is enough to make Chrome/Android
        // hand scrolling off to the main thread and feel noticeably heavier).
        frame.addEventListener('touchmove', onPinchMove, {passive:false});
      } else if(e.touches.length === 1 && !pinching){
        var t = e.touches[0];
        startX = t.clientX; startY = t.clientY;
      }
    }, {passive:true});

    frame.addEventListener('touchend', function(e){
      if(pinching){
        if(e.touches.length < 2) endPinch();
        return; // releasing a pinch is never a page-turn swipe
      }
      if(startX === null) return;
      var t = e.changedTouches[0];
      var dx = t.clientX - startX;
      var dy = t.clientY - startY;
      startX = null; startY = null;
      if(Math.abs(dx) > swipeThreshold && Math.abs(dx) > Math.abs(dy) * ratioLock){
        if(options.onSwipe) options.onSwipe(dx, dy);
      }
    }, {passive:true});

    // Android can send touchcancel instead of touchend (e.g. the system
    // takes the gesture over, or a call/notification interrupts it). Clean
    // up exactly like touchend does, but never commit a page-turn from a
    // cancelled gesture -- a pinch in progress still gets its value saved
    // (it was already applied live during touchmove), same as a normal
    // pinch release.
    frame.addEventListener('touchcancel', function(){
      if(pinching) endPinch();
      startX = null; startY = null;
    }, {passive:true});
  }

  // ===================================================================
  // Native text-selection guard -- .ayah-flow already sets CSS
  // user-select:none, which stops the *visible* selection highlight, but
  // some Android WebViews (Google app installed) still run their own
  // selection-initiation step on a long-press regardless of that CSS,
  // purely to feed the system "Smart Text Selection" / dictionary
  // look-up bottom sheet. That sheet is not the same UI as the
  // right-click/long-press `contextmenu` event (already blocked via
  // suppressContextMenu above) -- it fires off `selectstart`, so CSS and
  // contextmenu-prevention alone don't stop it. Blocking `selectstart`
  // itself is the standard cross-browser way to stop selection at its
  // source. Scoped to .ayah-flow only, so it never touches text
  // selection anywhere else in the app (tafsir panel, دليل القارئ, etc.)
  // where normal copy/selection should keep working.
  document.addEventListener('selectstart', function(e){
    if(e.target && e.target.closest && e.target.closest('.ayah-flow')){
      e.preventDefault();
    }
  });

  window.Gestures = {
    longPress: longPress,
    swipe: swipe,
    swipeAndPinch: swipeAndPinch
  };
})();
