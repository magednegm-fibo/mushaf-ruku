#!/usr/bin/env node
// =====================================================================
// History Push/Back Race Regression Suite — مصحف الركوع
// =====================================================================
// Runs standalone via `node tests/history-regression.js` — no build
// step, no dependencies. Loads the ACTUAL shipped ui.js in a small
// hand-rolled browser shim (fake window/document/history) and exercises
// its real public API (UI.openPanel/closePanel/pushHistoryState/
// backIfTag/flushPendingOps).
//
// Bug this certifies: history.back() is asynchronous — its popstate can
// land one or more event-loop turns later (confirmed Chromium/spec
// behavior). history.pushState() is synchronous. Before the fix, calling
// UI.openPanel() (or another UI.closePanel()) while an earlier
// UI.closePanel()'s back() was still in flight let that pushState run
// against a session-history index the pending back() didn't know about,
// so the back() then popped one layer too many when it finally resolved
// — reported symptom: "الذهاب إلى منزل رقم" navigates fine, but opening
// الفهرس right afterwards exits straight to the home screen. The fix
// queues any push/back that arrives while one is already in flight and
// replays it only once the in-flight one's popstate has actually fired.
//
// The fake `history` below deliberately models back() as asynchronous
// (arms a "pending" flag; the test resolves it explicitly, standing in
// for the real popstate event) and pushState() as synchronous, mirroring
// real browser semantics — the same "resolve the pending step yourself"
// technique tests/audio-regression.js uses for the analogous async-race
// bug in playback.
//
// PROJECT RULE: run against files extracted from the final packaged ZIP
// before any release that touches ui.js/home.js/dialogs.js's history
// handling — not just the working-copy files (same rule already
// enforced by search-regression.js / audio-regression.js).
//
// Usage:
//   node tests/history-regression.js
//   node tests/history-regression.js --dir /path/to/unzipped-release
//
// Exit code 0 = all pass. Exit code 1 = at least one failure.
// =====================================================================

var fs = require('fs');
var path = require('path');

var dirArgIdx = process.argv.indexOf('--dir');
var PROJECT_DIR = dirArgIdx !== -1 && process.argv[dirArgIdx + 1]
  ? process.argv[dirArgIdx + 1]
  : path.join(__dirname, '..');

// ---------------------------------------------------------------------
// Tiny built-in test runner — same pattern as search-regression.js /
// audio-regression.js.
// ---------------------------------------------------------------------
var results = { pass: 0, fail: 0 };
var failures = [];
function check(label, condFn){
  var ok;
  var detail = '';
  try{
    var r = condFn();
    ok = (r === true);
    if(!ok && typeof r === 'string') detail = r;
  } catch(e){
    ok = false;
    detail = 'threw: ' + e.message;
  }
  if(ok){
    results.pass++;
  } else {
    results.fail++;
    failures.push(label + (detail ? ' — ' + detail : ''));
  }
}

// ---------------------------------------------------------------------
// Fake panel element — just enough for ui.js's classList/style usage.
// Deliberately NOT given the 'modal-overlay' class so openPanel/
// closePanel skip syncModalToViewport (and its document.querySelectorAll
// call) entirely — this suite is about the history queue, not viewport
// sync.
// ---------------------------------------------------------------------
function fakePanel(){
  var classes = {hidden: true};
  return {
    style: {},
    classList: {
      contains: function(c){ return !!classes[c]; },
      add: function(c){ classes[c] = true; },
      remove: function(c){ classes[c] = false; }
    }
  };
}

// ---------------------------------------------------------------------
// Fake history: pushState is synchronous (mutates the index and entry
// list immediately, truncating any forward entries — real semantics).
// back() is asynchronous: it only arms a "pending" flag; the test calls
// resolvePendingBack() to simulate the popstate finally landing, at
// which point the traversal is resolved against whatever the index is
// AT THAT MOMENT — exactly the real-world race this fix closes.
// ---------------------------------------------------------------------
function makeFakeHistory(){
  var entries = [{tag: 'home'}];
  var index = 0;
  var backPending = false;
  var popstateListeners = [];
  return {
    get state(){ return entries[index]; },
    pushState: function(state){
      entries = entries.slice(0, index + 1);
      entries.push(state);
      index++;
    },
    replaceState: function(state){
      entries[index] = state;
    },
    back: function(){ backPending = true; },
    isBackPending: function(){ return backPending; },
    resolvePendingBack: function(){
      if(!backPending) return;
      backPending = false;
      if(index > 0) index--;
      var st = entries[index];
      popstateListeners.slice().forEach(function(l){ l({state: st}); });
    },
    _addPopstateListener: function(l){ popstateListeners.push(l); },
    _tagStack: function(){ return entries.slice(0, index + 1).map(function(e){ return e && e.tag; }); }
  };
}

function loadUI(){
  var window = {};
  global.window = window;
  var fakeHistory = makeFakeHistory();
  global.history = fakeHistory;
  global.document = { querySelectorAll: function(){ return []; } };
  global.setTimeout = function(){}; // syncModalToViewport's deferred call — unused (no modal-overlay class here)
  window.addEventListener = function(type, fn){
    if(type === 'popstate') fakeHistory._addPopstateListener(fn);
  };

  var full = path.join(PROJECT_DIR, 'ui.js');
  if(!fs.existsSync(full)) throw new Error('Missing required file: ' + full);
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(full, 'utf8'));

  if(!window.UI) throw new Error('ui.js loaded but did not expose window.UI.');
  window.UI.init({els: {}});
  return {UI: window.UI, history: fakeHistory};
}

// ---------------------------------------------------------------------
// Fake screen element — homeScreen/readerScreen only need classList
// add/remove/contains for Home.showReader()/showHome().
// ---------------------------------------------------------------------
function fakeScreen(startHidden){
  var hidden = startHidden;
  return {
    classList: {
      contains: function(c){ return c === 'hidden' ? hidden : false; },
      add: function(c){ if(c === 'hidden') hidden = true; },
      remove: function(c){ if(c === 'hidden') hidden = false; }
    }
  };
}

// ---------------------------------------------------------------------
// Loads ui.js AND home.js together in the SAME fake window (home.js
// reads window.UI and the bare `history` global directly, exactly like
// the real app), for the panel-to-reader transition tests (H5/H6) below.
// ---------------------------------------------------------------------
function loadUIAndHome(){
  var loaded = loadUI();
  var window = global.window;

  var els = {
    homeScreen: fakeScreen(false),
    readerScreen: fakeScreen(true),
    btnHome: {addEventListener: function(){}},
    btnContinue: {addEventListener: function(){}}
  };
  var goToPageCalls = [];
  var ReaderManager = { goToPage: function(i){ goToPageCalls.push(i); } };
  var AudioManager = { stopListening: function(){} };
  var ReaderBookmark = { getBookmarkInfo: function(){ return null; } };
  var PAGES = { length: 556 };
  var state = {};

  var full = path.join(PROJECT_DIR, 'home.js');
  if(!fs.existsSync(full)) throw new Error('Missing required file: ' + full);
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(full, 'utf8'));
  if(!window.Home) throw new Error('home.js loaded but did not expose window.Home.');

  window.Home.init({
    els: els, state: state, PAGES: PAGES, JUZ_INFO: {},
    UI: loaded.UI, AudioManager: AudioManager,
    ReaderManager: ReaderManager, ReaderBookmark: ReaderBookmark
  });

  return {
    UI: loaded.UI, history: loaded.history, Home: window.Home,
    els: els, goToPageCalls: goToPageCalls
  };
}

function run(){
  // =====================================================================
  // H1. The core race: closePanel() (queues a back()) immediately
  // followed by openPanel() on a DIFFERENT panel, before that back()
  // resolves. Must not let the second pushState run ahead of the
  // pending back — and once the back's popstate lands (simulated here by
  // resolvePendingBack, standing in for app.js's master popstate
  // listener calling UI.flushPendingOps() afterwards), the queued
  // openPanel must run and the final tag stack must show exactly the
  // panel that was actually left open, not extra/missing layers.
  // =====================================================================
  (function(){
    var loaded = loadUI();
    var UI = loaded.UI;
    var history = loaded.history;

    var panelA = fakePanel(); // stands in for gotoModal
    var panelB = fakePanel(); // stands in for indexPanel

    UI.openPanel(panelA);
    check('H1 opening panel A pushes one entry (tag stack: home, panel)', function(){
      var stack = history._tagStack();
      return (stack.length === 2 && stack[1] === 'panel') || ('got ' + JSON.stringify(stack));
    });

    // Simulate submitGotoModal(): close panel A (queues a back()), then
    // — in the SAME synchronous tick, before that back() resolves —
    // open panel B (this is exactly Home.openReaderAt() being called
    // right after UI.closePanel(gotoModal) in Dialogs.submitGotoModal).
    UI.closePanel(panelA);
    check('H1 closePanel(A) hides it immediately', function(){
      return panelA.classList.contains('hidden') || 'panel A still shows as open';
    });
    check('H1 closePanel(A) arms a pending back()', function(){
      return history.isBackPending() || 'no back() was queued';
    });

    UI.openPanel(panelB);
    check('H1 openPanel(B) while a back() is still pending must NOT push yet (queued instead)', function(){
      var stack = history._tagStack();
      // Still just [home, panel] — B's pushState must not have run yet.
      return (stack.length === 2) || ('pushState ran early — stack is ' + JSON.stringify(stack));
    });
    check('H1 panel B must still read as hidden until its queued open actually runs', function(){
      return panelB.classList.contains('hidden') || 'panel B was shown before its history push actually ran';
    });

    // Now the pending back() finally resolves (the real popstate landing).
    history.resolvePendingBack();
    // app.js's master popstate listener calls UI.flushPendingOps() AFTER
    // its own closeTopmostOverlay()/Home.maybeGoHomeOnPopstate() handling
    // for this event — simulate that ordering here too.
    UI.flushPendingOps();

    check('H1 after the back() resolves and the queue flushes, panel B is now open', function(){
      return !panelB.classList.contains('hidden') || 'panel B never opened';
    });
    check('H1 final tag stack is exactly [home, panel] — one clean layer, not over/under-popped', function(){
      var stack = history._tagStack();
      return (stack.length === 2 && stack[1] === 'panel') || ('got ' + JSON.stringify(stack));
    });
  })();

  // =====================================================================
  // H2. Without any race (back() resolves before the next action), the
  // sequence must behave exactly as before: open, close, open again —
  // ordinary use must be unaffected by the new queue.
  // =====================================================================
  (function(){
    var loaded = loadUI();
    var UI = loaded.UI;
    var history = loaded.history;
    var panel = fakePanel();

    UI.openPanel(panel);
    UI.closePanel(panel);
    history.resolvePendingBack();
    UI.flushPendingOps();
    check('H2 panel is hidden and history back to [home] after a clean open/close', function(){
      var stack = history._tagStack();
      return (panel.classList.contains('hidden') && stack.length === 1 && stack[0] === 'home')
        || ('hidden=' + panel.classList.contains('hidden') + ' stack=' + JSON.stringify(stack));
    });

    UI.openPanel(panel);
    check('H2 re-opening the same panel afterwards works normally', function(){
      var stack = history._tagStack();
      return (!panel.classList.contains('hidden') && stack.length === 2 && stack[1] === 'panel')
        || ('hidden=' + panel.classList.contains('hidden') + ' stack=' + JSON.stringify(stack));
    });
  })();

  // =====================================================================
  // H3. Three-deep race: close A, immediately close B (a second panel
  // already open), immediately open C, all before A's back() resolves.
  // Each queued op must wait its turn and only run once the history
  // index is actually correct for it — no operation should ever fire
  // against a stale/incorrect index.
  // =====================================================================
  (function(){
    var loaded = loadUI();
    var UI = loaded.UI;
    var history = loaded.history;
    var A = fakePanel(), B = fakePanel(), C = fakePanel();

    UI.openPanel(A);
    history.resolvePendingBack(); // no-op, nothing pending yet
    UI.openPanel(B); // B stacks on top of A (both open — mirrors nested modal-over-panel cases)

    UI.closePanel(B); // queues a back() for B
    UI.closePanel(A); // A is still "open" per its own classList, but its back() must wait behind B's
    UI.openPanel(C);  // must also wait

    check('H3 nothing after the first queued back() has mutated history yet', function(){
      var stack = history._tagStack();
      // Only A and B's pushes ever landed: [home, panel(A), panel(B)].
      return (stack.length === 3) || ('got ' + JSON.stringify(stack));
    });

    // Resolve B's back() — this should flush only as far as the next
    // op that itself re-arms backInFlight (A's queued close).
    history.resolvePendingBack();
    UI.flushPendingOps();
    check('H3 after B\'s back() resolves, A\'s queued close is now the one pending', function(){
      return history.isBackPending() || 'A\'s close never ran / never armed a back()';
    });
    check('H3 panel C has still not opened (still queued behind A\'s close)', function(){
      return C.classList.contains('hidden') || 'C opened before A finished closing';
    });

    // Resolve A's back() — now C's queued open should finally run.
    history.resolvePendingBack();
    UI.flushPendingOps();
    check('H3 panel C is now open after both queued closes resolved in order', function(){
      return !C.classList.contains('hidden') || 'C never opened';
    });
    check('H3 final tag stack is exactly [home, panel] for C — no drift from the 3-deep queue', function(){
      var stack = history._tagStack();
      return (stack.length === 2 && stack[1] === 'panel') || ('got ' + JSON.stringify(stack));
    });
  })();

  // =====================================================================
  // H4. pushHistoryState/backIfTag (used directly by home.js/dialogs.js
  // for the reader-screen enter/exit and the "modal stacked over another
  // panel" back-out helpers) go through the same queue as
  // openPanel/closePanel and can't race against them either.
  // =====================================================================
  (function(){
    var loaded = loadUI();
    var UI = loaded.UI;
    var history = loaded.history;
    var panel = fakePanel();

    UI.pushHistoryState('reader');
    UI.closePanel(panel); // panel never opened, so no back() should be armed (nothing to pop)
    check('H4 closePanel on an already-hidden panel is a no-op (nothing queued)', function(){
      return !history.isBackPending() || 'a back() was armed for a panel that was never open';
    });

    UI.openPanel(panel);
    UI.backIfTag('panel', function(){ /* fallback, should not run */ });
    check('H4 backIfTag arms a back() when the current tag matches', function(){
      return history.isBackPending() || 'backIfTag did not queue a back()';
    });

    // Race: open another panel before backIfTag's back() resolves.
    var other = fakePanel();
    UI.openPanel(other);
    check('H4 openPanel while backIfTag\'s back() is pending is queued, not applied early', function(){
      return other.classList.contains('hidden') || 'other panel opened before the pending back resolved';
    });

    history.resolvePendingBack();
    UI.flushPendingOps();
    check('H4 after resolving, the queued openPanel(other) finally runs', function(){
      return !other.classList.contains('hidden') || 'other panel never opened';
    });
  })();
  // =====================================================================
  // H5. فهرس السور (or أي panel opened over the home screen): selecting
  // a row calls Home.openReaderAt(page) immediately followed by
  // UI.closePanel(panel) — the exact order every real call site uses.
  // Before the fix, openReaderAt's pushState landed on top of the
  // panel's still-current entry, so closePanel's own pop check (only
  // pop if I'm still the current top) silently missed it, leaving an
  // orphaned 'panel' entry under 'reader'. Must now end up with a clean
  // two-entry stack [home, reader] — no orphan.
  // =====================================================================
  (function(){
    var loaded = loadUIAndHome();
    var UI = loaded.UI, history = loaded.history, Home = loaded.Home, els = loaded.els;

    var surahPanel = fakePanel();
    UI.openPanel(surahPanel); // مثل فتح فهرس السور من الشاشة الرئيسية
    check('H5 opening the panel over home pushes [home, panel]', function(){
      var stack = history._tagStack();
      return (stack.length === 2 && stack[1] === 'panel') || ('got ' + JSON.stringify(stack));
    });

    // Selecting a row: real call order is openReaderAt() then closePanel().
    Home.openReaderAt(42);
    UI.closePanel(surahPanel);

    check('H5 reader screen is now showing and the surah page was navigated to', function(){
      return (!els.readerScreen.classList.contains('hidden') && loaded.goToPageCalls.indexOf(42) !== -1)
        || 'reader never shown or goToPage(42) never called';
    });
    check('H5 the panel is hidden', function(){
      return surahPanel.classList.contains('hidden') || 'surahPanel still shows as open';
    });
    check('H5 no orphaned "panel" entry left behind — stack is exactly [home, reader]', function(){
      var stack = history._tagStack();
      return (stack.length === 2 && stack[1] === 'reader') || ('got ' + JSON.stringify(stack) + ' — an orphaned panel layer would show up here as [home, panel, reader]');
    });

    // Reproduces the actual reported symptom: pressing "الرئيسية"
    // afterwards must land cleanly on the home screen in exactly ONE
    // step (popping the single 'reader' entry) — with the pre-fix
    // orphaned-panel bug, this same press would instead pop from
    // 'reader' down to the orphaned (already-hidden) panel entry, find
    // no open overlay, and immediately exit to home — which happens to
    // look "correct" on its own, but the real bug was reachable via any
    // OTHER back-eligible event landing on that orphaned entry while
    // still expecting to be one full layer higher. The stack-shape
    // assertion above is what actually catches the defect; this just
    // confirms normal home-button behavior isn't broken by the fix.
    UI.backIfTag('reader', function(){});
    history.resolvePendingBack();
    UI.flushPendingOps();
    check('H5 after going back once from the reader, the stack is exactly [home]', function(){
      var stack = history._tagStack();
      return (stack.length === 1 && stack[0] === 'home') || ('got ' + JSON.stringify(stack));
    });
  })();

  // =====================================================================
  // H6. Direct home-screen entry (بطاقة "استكمال القراءة"/"علامة
  // القراءة", no panel involved) must still behave exactly as before:
  // a plain push, not a replace — there's no panel entry to replace.
  // =====================================================================
  (function(){
    var loaded = loadUIAndHome();
    var UI = loaded.UI, history = loaded.history, Home = loaded.Home;

    Home.openReaderAt(0);
    check('H6 direct home->reader entry (no panel) pushes [home, reader]', function(){
      var stack = history._tagStack();
      return (stack.length === 2 && stack[1] === 'reader') || ('got ' + JSON.stringify(stack));
    });
  })();
  // =====================================================================
  // H7. THE ACTUAL CONFIRMED ON-DEVICE BUG (v1.0.7 diagnostic log):
  // btnGoto ("الذهاب إلى منزل رقم") lives INSIDE الفهرس's own header
  // (index.html), so it always opens gotoModal NESTED on top of an
  // already-open indexPanel — H1-H6 above never modeled this nesting.
  // Closing gotoModal hides it synchronously and queues a back(); when
  // that popstate lands, the master listener used to call
  // closeTopmostOverlay() unconditionally, which found indexPanel STILL
  // open underneath and closed it too — collateral damage, since that
  // popstate only ever meant to confirm gotoModal's own already-done
  // close. Re-opening indexPanel afterwards and closing it normally then
  // landed on the wrong (orphaned) history entry and exited to home.
  // This replicates app.js's REAL master popstate listener (including
  // the isSelfInitiatedBackPending() fix) instead of manually driving
  // flushPendingOps like H1-H6 do, since the bug lived specifically in
  // that listener's interaction with closeTopmostOverlay().
  // =====================================================================
  (function(){
    var loaded = loadUIAndHome();
    var UI = loaded.UI, history = loaded.history, Home = loaded.Home, els = loaded.els;

    var showHomeCalls = 0;
    var origShowHome = Home.showHome;
    Home.showHome = function(){ showHomeCalls++; return origShowHome.apply(this, arguments); };

    var indexPanel = fakePanel(); indexPanel.id = 'indexPanel';
    var gotoModal = fakePanel(); gotoModal.id = 'gotoModal';
    UI.registerOverlayModals([gotoModal]);
    UI.registerOverlayPanels([indexPanel]);

    // app.js's real master popstate listener, replicated exactly.
    window.addEventListener('popstate', function(e){
      if(UI.isSelfInitiatedBackPending()){ UI.flushPendingOps(); return; }
      if(UI.closeTopmostOverlay()){ UI.flushPendingOps(); return; }
      Home.maybeGoHomeOnPopstate(e.state && e.state.tag);
      UI.flushPendingOps();
    });

    history.pushState({tag: 'reader'}); // already deep in the reader
    els.homeScreen.classList.add('hidden');
    els.readerScreen.classList.remove('hidden');

    UI.openPanel(indexPanel); // فتح الفهرس
    UI.openPanel(gotoModal);  // btnGoto INSIDE الفهرس's own header — nests on top
    check('H7 gotoModal nests over indexPanel: stack is [home, reader, panel, panel]', function(){
      var stack = history._tagStack();
      return (stack.length === 4) || ('got ' + JSON.stringify(stack));
    });

    // submitGotoModal(): close gotoModal, navigate, and — per the fix
    // above (btnGoto lives INSIDE الفهرس's own header, so selecting a
    // منزل must also close الفهرس or the navigation happens invisibly
    // underneath it) — close indexPanel too. closePanel(indexPanel) is
    // called while gotoModal's own back() is still in flight, so it
    // must be QUEUED (not applied early) and only actually run once that
    // back() resolves.
    UI.closePanel(gotoModal);
    Home.openReaderAt(171);
    UI.closePanel(indexPanel); // closes indexPanel too (queued — see below)
    check('H7 indexPanel close is queued (not yet applied) while gotoModal\'s own back() is still pending', function(){
      return !indexPanel.classList.contains('hidden') || 'indexPanel closed too early, before gotoModal\'s back() resolved';
    });

    history.resolvePendingBack(); // gotoModal's back() finally resolves
    check('H7 indexPanel\'s queued close now runs, closing it correctly', function(){
      return indexPanel.classList.contains('hidden') || 'indexPanel never closed after choosing a منزل — navigation happened invisibly underneath it';
    });
    check('H7 no premature trip to the home screen yet', function(){
      return showHomeCalls === 0 || ('showHome() was called ' + showHomeCalls + ' time(s) too early');
    });

    // indexPanel's own close queued a SECOND back() (for its own history
    // entry) — resolve that too.
    history.resolvePendingBack();

    check('H7 final result: reader is showing, home was never shown', function(){
      return (showHomeCalls === 0 && !els.readerScreen.classList.contains('hidden'))
        || ('showHomeCalls=' + showHomeCalls + ' readerHidden=' + els.readerScreen.classList.contains('hidden'));
    });
    check('H7 final tag stack is exactly [home, reader] — clean, no orphaned panel entry', function(){
      var stack = history._tagStack();
      return (stack.length === 2 && stack[1] === 'reader') || ('got ' + JSON.stringify(stack));
    });
  })();
}

run();

// =====================================================================
// Report
// =====================================================================
console.log('');
console.log('=== History Push/Back Race Regression Suite — ' + PROJECT_DIR + ' ===');
console.log('PASS: ' + results.pass + '   FAIL: ' + results.fail);
if(failures.length){
  console.log('');
  console.log('Failures:');
  failures.forEach(function(f){ console.log('  ✗ ' + f); });
  console.log('');
  process.exitCode = 1;
} else {
  console.log('All checks passed.');
  console.log('');
}
