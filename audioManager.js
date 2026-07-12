// AudioManager: every audio-related function in this app, in one place —
// streaming playback (ruku / whole surah / single ayah), the lazy Audio
// element, reciter selection, the "listen" button state, and the
// time-synced auto-scroll that follows playback for ayaat taller than the
// screen. Nothing outside this file touches an Audio element or
// listenState directly.
//
// Loaded before app.js (see index.html). Call AudioManager.init(deps)
// once, after `els` and `state` exist, to wire everything up; deps:
//   { PAGES, state, els, goTo, showToast, saveState }
// Exposed as window.AudioManager.
(function(){
  'use strict';

  var PAGES, state, els, goTo, showToast, saveState;

  // ---------------------------------------------------------------------
  // Streams ayah-by-ayah audio for the ruku currently on screen from
  // EveryAyah.com (Abdul Basit Abdul Samad / Muhammad Jibreel, Murattal).
  // Audio is never bundled or cached — purely live streaming, so it
  // naturally requires an internet connection and fails gracefully (via
  // the toast) if there isn't one, per the deliberate decision not to add
  // offline caching.
  // ---------------------------------------------------------------------
  var RECITER_FOLDERS = {
    abdulbasit: 'Abdul_Basit_Murattal_64kbps',
    jibreel: 'Muhammad_Jibreel_64kbps'
  };
  function currentReciterFolder(){
    return RECITER_FOLDERS[state.reciter] || RECITER_FOLDERS.abdulbasit;
  }

  // Lazy: no Audio element is created (and no network/decoder resources
  // reserved by the browser for it) until the reader actually presses
  // play for the first time — most sessions never touch listening at
  // all, so there's no reason to pay for it at startup.
  var audioPlayer = null;
  var audioPlayerCreated = false;
  function getAudioPlayer(){
    if(audioPlayerCreated) return audioPlayer;
    audioPlayerCreated = true;
    audioPlayer = (typeof Audio !== 'undefined') ? new Audio() : null;
    if(audioPlayer){
      audioPlayer.addEventListener('playing', function(){
        listenState.loading = false;
        updateListenButton();
      });
      audioPlayer.addEventListener('ended', function(){
        if(!listenState.playing) return;
        // "تكرار تلاوة الآية" (الإعدادات): replay the ayah that just
        // finished, in place, until it has played the configured number of
        // times — before doing anything else (advancing, turning pages, or
        // stopping for 'single' mode). This runs for every playback path
        // (ruku/single/surah/juz) since they all share this one 'ended'
        // listener on the lazily-created audio element.
        var repeatTarget = state.recitationRepeatCount || 1;
        listenState.repeatsPlayed = (listenState.repeatsPlayed || 0) + 1;
        if(listenState.repeatsPlayed < repeatTarget){
          audioPlayer.currentTime = 0;
          var repeatPromise = audioPlayer.play();
          if(repeatPromise && repeatPromise.catch) repeatPromise.catch(function(){});
          return;
        }
        listenState.repeatsPlayed = 0;
        // Long-pressing an ayah number plays just that one ayah — don't
        // continue into the next ayah of the ruku once it finishes.
        if(listenState.mode === 'single'){
          stopListening();
          return;
        }
        if(listenState.mode === 'surah' || listenState.mode === 'juz'){
          playSurahPlaylistAt(listenState.playlist, listenState.playlistIndex + 1, listenState.mode);
          return;
        }
        playAyahAt(listenState.page, listenState.ayahIndex + 1, 'ruku');
      });
      audioPlayer.addEventListener('error', function(){
        if(!listenState.playing && !listenState.loading) return;
        stopListening();
        showToast('تعذر تحميل الصوت \u2014 تحقق من الاتصال بالإنترنت');
      });
    }
    return audioPlayer;
  }
  var listenState = { playing:false, loading:false, page:null, ayahIndex:0, mode:'ruku', playlist:null, playlistIndex:0, repeatsPlayed:0 };

  function pad3(n){
    n = String(n);
    while(n.length < 3) n = '0' + n;
    return n;
  }
  function ayahAudioUrl(surah, ayah){
    return 'https://everyayah.com/data/' + currentReciterFolder() + '/' + pad3(surah) + pad3(ayah) + '.mp3';
  }
  // ---------------------------------------------------------------------
  // Auto screen wake lock during playback: independent of the
  // "إبقاء الشاشة مضاءة" setting in الإعدادات (Settings.js) — this one is
  // held automatically for as long as recitation is actively playing,
  // regardless of that toggle, and released the moment playback stops.
  //
  // Why this matters: on mobile, once the screen actually goes dark
  // (auto-sleep timeout, not just the browser tab losing focus), the
  // browser suspends the page's JS almost entirely to save battery. The
  // *currently playing* ayah keeps sounding because that's native media
  // playback already in progress, but nothing JS-driven can run — so the
  // 'ended' handler that loads the next ayah doesn't fire until the
  // screen turns back on, which is exactly the "plays the current ayah,
  // then pauses until unlock" behavior. Holding a wake lock while
  // recitation is playing prevents the screen from auto-dimming/locking
  // in the first place, so this JS-suspension state never triggers for
  // the common case (listening without touching the phone).
  //
  // Important limitation: the Wake Lock API can only prevent *automatic*
  // sleep — it cannot stop the screen from turning off if the person
  // manually presses the power button. In that case the same mobile-OS
  // JS suspension applies and is outside what any web page can control;
  // the practical workaround there is exempting the browser from battery
  // optimization in the phone's system settings.
  var WAKE_LOCK_SUPPORTED = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  var audioWakeLockSentinel = null;
  function releaseAudioWakeLock(){
    if(audioWakeLockSentinel){
      audioWakeLockSentinel.release().catch(function(){});
      audioWakeLockSentinel = null;
    }
  }
  function requestAudioWakeLock(){
    if(!WAKE_LOCK_SUPPORTED || audioWakeLockSentinel) return;
    navigator.wakeLock.request('screen').then(function(sentinel){
      audioWakeLockSentinel = sentinel;
      audioWakeLockSentinel.addEventListener('release', function(){ audioWakeLockSentinel = null; });
    }).catch(function(){
      // Can fail silently (low battery mode, backgrounded tab at the
      // moment of the request, unsupported browser, etc.) — playback
      // still proceeds normally, just without this protection.
    });
  }
  // The OS/browser releases the lock on its own whenever the page is
  // hidden — re-acquire it as soon as the reader comes back to the app
  // while recitation is still playing, without needing to touch anything.
  if(typeof document !== 'undefined'){
    document.addEventListener('visibilitychange', function(){
      if(document.visibilityState === 'visible' && listenState.playing) requestAudioWakeLock();
    });
  }

  // ---------------------------------------------------------------------
  // Media Session API: registers the current recitation with the browser
  // as "real" media playback (title/artist + play/pause/stop handlers).
  // Without this, Chrome/Android has no signal that background audio is
  // legitimate once the screen locks, and playback gets suspended along
  // with the rest of the page's JS/timers — it looks like "stops on lock,
  // picks back up on unlock" because the tab itself is frozen while
  // hidden. Registering a Media Session keeps the OS audio focus alive
  // and shows lock-screen/notification transport controls, which is the
  // standard, documented way (from the web app side) to let recitation
  // keep playing through a locked screen instead of just resuming once
  // the phone is unlocked again.
  function mediaSessionSupported(){
    return typeof navigator !== 'undefined' && 'mediaSession' in navigator && typeof MediaMetadata !== 'undefined';
  }
  function currentReciterName(){
    return (state.reciter === 'jibreel') ? 'محمد جبريل' : 'عبدالباسط عبدالصمد';
  }
  function updateMediaSessionMetadata(surahName, ayah){
    if(!mediaSessionSupported()) return;
    try{
      navigator.mediaSession.metadata = new MediaMetadata({
        title: (surahName ? 'سورة ' + surahName : 'تلاوة') + (ayah ? ' \u2014 آية ' + ayah : ''),
        artist: currentReciterName(),
        album: 'مصحف الركوع'
      });
    }catch(e){ /* non-fatal — playback continues without lock-screen metadata */ }
  }
  function setMediaSessionPlaybackState(s){
    if(!mediaSessionSupported()) return;
    try{ navigator.mediaSession.playbackState = s; }catch(e){}
  }
  // Looks up the (vocalized, display-ready) surah name for whatever ayah
  // is about to play — playlists (buildSurahPlaylist/buildJuzPlaylist)
  // only carry {surah, ayah}, not the name, so this is resolved from the
  // page data at playback time instead of duplicating the name into every
  // playlist entry.
  function surahNameFor(pageIdx, ayahIdx, surah){
    var p = PAGES[pageIdx];
    var a = p && p.ayahs && p.ayahs[ayahIdx];
    if(a && a.surahName) return a.surahName;
    return (window.SURAH_NAMES_VOCALIZED && window.SURAH_NAMES_VOCALIZED[surah]) || '';
  }
  // Wired once in init(): lets the lock-screen/notification media controls
  // (and hardware media keys) actually control playback, instead of only
  // the in-app listen button working.
  function setupMediaSessionHandlers(){
    if(!mediaSessionSupported()) return;
    try{
      navigator.mediaSession.setActionHandler('play', function(){
        var player = getAudioPlayer();
        if(player && player.src){
          var playPromise = player.play();
          if(playPromise && playPromise.catch) playPromise.catch(function(){});
          listenState.playing = true;
          setMediaSessionPlaybackState('playing');
          updateListenButton();
        }
      });
      navigator.mediaSession.setActionHandler('pause', function(){
        if(audioPlayerCreated && audioPlayer){
          audioPlayer.pause();
          listenState.playing = false;
          setMediaSessionPlaybackState('paused');
          updateListenButton();
        }
      });
      navigator.mediaSession.setActionHandler('stop', function(){
        stopListening();
      });
    }catch(e){ /* some actions may be unsupported on older browsers — ignore */ }
  }

  // ---- Time-synced scrolling for an ayah taller than the screen ----
  // A short ayah just gets one scroll (center it, done). A long ayah can
  // never fully fit on screen either way, so instead of a single jump we
  // track playback progress (currentTime/duration) and advance the scroll
  // position proportionally, so new lines keep coming into view roughly
  // in step with the recitation instead of the screen sitting frozen
  // until the ayah ends.
  //
  // Caveat: this assumes speech is recited at a fairly steady pace across
  // the ayah, so the sync is an approximation, not word-accurate timing
  // (EveryAyah doesn't provide per-word timestamps here) — but it keeps
  // the reading position roughly honest rather than static.
  var longAyahSync = null; // {topY, bottomY} while a long ayah is playing
  var lastSyncedScrollY = null;
  var lastSyncedZoom = null;
  // Set true for the duration of a long-press gesture (adding/removing a
  // reminder mark, or long-pressing an ayah number to play it solo) so the
  // sync loop below skips its scroll that tick instead of moving the page
  // out from under the reader's finger — a page scroll mid-touch reads to
  // the browser as the start of a swipe/scroll gesture, which silently
  // cancels the long-press before its own timer ever fires. app.js's
  // reminder-mark long-press gesture calls pauseScrollSync()/
  // resumeScrollSync() (below) to toggle this from outside this file.
  var scrollSyncPausedByTouch = false;
  function pauseScrollSync(){ scrollSyncPausedByTouch = true; }
  function resumeScrollSync(){ scrollSyncPausedByTouch = false; }

  // Detecting "did the reader intervene" by listening for a 'scroll' event
  // doesn't work here: our own sync fires so often that a naive suppress
  // window around each of our calls ends up permanently open, silently
  // swallowing the reader's manual scrolls and zooms right along with our
  // own. Instead, each tick compares the *actual* current scroll position
  // (and pinch-zoom level) against exactly what we set last tick — any
  // mismatch, whatever caused it (drag, fling, pinch-zoom, browser UI),
  // means someone/something else moved the view, so we back off for good
  // on this ayah rather than snapping back and fighting them.
  function currentZoomLevel(){
    return window.visualViewport ? window.visualViewport.scale : 1;
  }
  function userInterruptedSync(){
    if(lastSyncedScrollY === null) return false;
    if(Math.abs(window.scrollY - lastSyncedScrollY) > 3) return true;
    if(lastSyncedZoom !== null && Math.abs(currentZoomLevel() - lastSyncedZoom) > 0.02) return true;
    return false;
  }
  function setSyncedScroll(y){
    window.scrollTo(0, y);
    // Read the values back rather than assuming — scrollTo can get
    // clamped (e.g. near the bottom of the document), and we need next
    // tick's comparison to match reality, not our request.
    lastSyncedScrollY = window.scrollY;
    lastSyncedZoom = currentZoomLevel();
  }

  // A 60/sec requestAnimationFrame loop was smooth, but each tick forces a
  // synchronous layout read (window.scrollY) plus a scroll — real work,
  // repeated 60 times a second, for as long as any long ayah is playing.
  // That's needless CPU/battery drain for motion this slow and gradual;
  // an ayah takes several seconds to scroll through, so it doesn't need
  // screen-refresh-rate precision to look smooth. A self-rescheduling
  // timer at a fixed, much lower rate does the same visible job for a
  // fraction of the wake-ups — and unlike a raw setInterval, it can't
  // pile up overlapping ticks if one run happens to take a while.
  var LONG_AYAH_SYNC_INTERVAL_MS = 150; // ~6-7 updates/sec — smooth, far cheaper than 60/sec
  var longAyahTimerId = null;
  function longAyahSyncTick(){
    longAyahTimerId = null;
    if(!longAyahSync || !listenState.playing) return;
    if(scrollSyncPausedByTouch){
      // A long-press gesture is in progress — don't move the page out
      // from under the reader's finger. Keep rescheduling so syncing
      // picks back up on its own the moment the touch ends.
      longAyahTimerId = setTimeout(longAyahSyncTick, LONG_AYAH_SYNC_INTERVAL_MS);
      return;
    }
    if(userInterruptedSync()){
      longAyahSync = null;
      return;
    }
    var player = getAudioPlayer();
    var dur = player && player.duration;
    if(dur && isFinite(dur) && dur > 0){
      var progress = Math.max(0, Math.min(1, player.currentTime / dur));
      var targetY = longAyahSync.topY + progress * (longAyahSync.bottomY - longAyahSync.topY);
      setSyncedScroll(targetY);
    }
    longAyahTimerId = setTimeout(longAyahSyncTick, LONG_AYAH_SYNC_INTERVAL_MS);
  }
  function startLongAyahSyncLoop(){
    if(longAyahTimerId !== null) return; // already running
    longAyahSyncTick();
  }
  function stopLongAyahSyncLoop(){
    if(longAyahTimerId !== null){
      clearTimeout(longAyahTimerId);
      longAyahTimerId = null;
    }
  }
  // Called when the reader turns auto-scroll off from الإعدادات — kills
  // any sync in progress right away instead of waiting for the current
  // ayah to finish.
  function disableAutoScrollSync(){
    longAyahSync = null;
    stopLongAyahSyncLoop();
  }

  function clearAyahHighlight(){
    els.ayahFlow.querySelectorAll('.ayah-block.ayah-playing').forEach(function(el){
      el.classList.remove('ayah-playing');
    });
  }
  // Scrolls the reader just enough to bring a given element fully into
  // view — but only if it isn't already, so playback never yanks the
  // screen around while the reader is already looking at the right spot.
  //
  // The visibility check is against the actual browser viewport
  // (window.innerHeight), not .page-scroll's own bounding box. #app is
  // sized with min-height rather than a hard height, so .page-scroll
  // never actually clips its own overflow here — the whole page grows
  // and it's the window/body that ends up scrolling. That means
  // .page-scroll's rect reflects its full, unclipped content extent
  // rather than what's visible on screen, so checking against it would
  // almost never flag an ayah as "off-screen".
  function scrollIntoViewIfNeeded(el){
    if(!el || state.autoScrollEnabled === false) return;
    var elRect = el.getBoundingClientRect();
    var margin = 16;
    var isAbove = elRect.top < margin;
    var isBelow = elRect.bottom > window.innerHeight - margin;
    var tooTallForViewport = el.offsetHeight > (window.innerHeight - margin * 2);

    if(tooTallForViewport){
      // Set up the time-synced range now (regardless of whether we jump
      // immediately below), so the rAF loop has it ready.
      var absoluteTop = elRect.top + window.scrollY;
      var topY = Math.max(0, absoluteTop - margin);
      var bottomY = Math.max(topY, absoluteTop + el.offsetHeight - window.innerHeight + margin);
      longAyahSync = {topY: topY, bottomY: bottomY};
      if((isAbove || isBelow) && !scrollSyncPausedByTouch){
        setSyncedScroll(topY);
      } else {
        lastSyncedScrollY = window.scrollY;
        lastSyncedZoom = currentZoomLevel();
      }
      startLongAyahSyncLoop();
      return;
    }

    longAyahSync = null;
    stopLongAyahSyncLoop();
    if(!isAbove && !isBelow) return;
    // A reminder-mark long-press (or the single-ayah long-press on the
    // ayah number) is in progress — this one-time center-scroll fires at
    // the start of every ordinary (short) ayah, so without this guard it
    // would interrupt that gesture on almost any attempt made while
    // something is playing, not just during long-ayah sync.
    if(scrollSyncPausedByTouch) return;
    if(el.scrollIntoView){
      el.scrollIntoView({block: 'center', behavior: 'smooth'});
    }
  }

  function highlightAyah(surah, ayah){
    clearAyahHighlight();
    var block = els.ayahFlow.querySelector('.ayah-block[data-ayah-key="' + surah + ':' + ayah + '"]');
    if(block){
      block.classList.add('ayah-playing');
      scrollIntoViewIfNeeded(block);
    }
  }

  function updateListenButton(){
    if(!els.btnListen) return;
    els.btnListen.classList.toggle('active', listenState.playing || listenState.loading);
    if(els.listenIconLoading) els.listenIconLoading.classList.toggle('hidden', !listenState.loading);
    if(els.listenIconPlay) els.listenIconPlay.classList.toggle('hidden', listenState.loading || listenState.playing);
    if(els.listenIconPause) els.listenIconPause.classList.toggle('hidden', listenState.loading || !listenState.playing);
  }

  function stopListening(){
    // Only touch the audio element if one was actually ever created —
    // calling getAudioPlayer() here would force-create it on every
    // stopListening() call (e.g. on every page turn, via applyFontStyle),
    // defeating the whole point of lazy init.
    if(audioPlayerCreated && audioPlayer){
      audioPlayer.pause();
      audioPlayer.removeAttribute('src');
      audioPlayer.load();
    }
    longAyahSync = null;
    lastSyncedScrollY = null;
    lastSyncedZoom = null;
    stopLongAyahSyncLoop();
    listenState.playing = false;
    listenState.loading = false;
    listenState.repeatsPlayed = 0;
    clearAyahHighlight();
    updateListenButton();
    setMediaSessionPlaybackState('none');
    releaseAudioWakeLock();
  }

  function playAyahAt(pageIdx, ayahIdx, mode){
    var p = PAGES[pageIdx];
    if(!p || !p.ayahs[ayahIdx]){
      // Reached the end of the ruku's ayahs — playback is done.
      stopListening();
      return;
    }
    var player = getAudioPlayer();
    if(!player){
      showToast('التشغيل الصوتي غير مدعوم في هذا المتصفح');
      return;
    }
    var a = p.ayahs[ayahIdx];
    listenState.page = pageIdx;
    listenState.ayahIndex = ayahIdx;
    listenState.mode = mode || 'ruku';
    listenState.playing = true;
    listenState.loading = true;
    listenState.repeatsPlayed = 0;
    updateListenButton();
    requestAudioWakeLock();
    highlightAyah(a.surah, a.ayah);
    updateMediaSessionMetadata(a.surahName, a.ayah);
    setMediaSessionPlaybackState('playing');
    player.src = ayahAudioUrl(a.surah, a.ayah);
    var playPromise = player.play();
    if(playPromise && playPromise.catch){
      playPromise.catch(function(){
        stopListening();
        showToast('تعذر تشغيل الصوت \u2014 تحقق من الاتصال بالإنترنت');
      });
    }
  }

  // ---- Listen to a whole surah (تشغيل السورة كاملة من الفهرس) ----
  // Walks every ruku-page belonging to the surah (from SearchManager's
  // surah index) and flattens it into one ordered ayah-by-ayah playlist,
  // spanning as many pages as the surah actually occupies.
  function buildSurahPlaylist(surahNum){
    var startPage = window.SearchManager.getSurahStartPage(surahNum);
    var list = [];
    if(startPage === undefined) return list;
    for(var pi = startPage; pi < PAGES.length; pi++){
      var p = PAGES[pi];
      var foundAny = false;
      for(var ai = 0; ai < p.ayahs.length; ai++){
        var a = p.ayahs[ai];
        if(a.surah === surahNum){
          list.push({pageIdx: pi, ayahIdx: ai, surah: a.surah, ayah: a.ayah});
          foundAny = true;
        }
      }
      // Once we've started collecting the surah's ayahs and hit a page with
      // none of them left, the surah is over — every later page belongs to
      // the next surah instead.
      if(!foundAny && list.length > 0) break;
    }
    return list;
  }

  // Same idea as buildSurahPlaylist, but grouped by juz instead of surah:
  // walks every page belonging to the given juz (pages are laid out
  // juz-by-juz already, so a straight filter is enough — no need for the
  // "stop at first gap" trick buildSurahPlaylist uses) and flattens all of
  // their ayahs into one ordered playlist.
  function buildJuzPlaylist(juzNum){
    var list = [];
    for(var pi = 0; pi < PAGES.length; pi++){
      var p = PAGES[pi];
      if(p.juz !== juzNum) continue;
      for(var ai = 0; ai < p.ayahs.length; ai++){
        var a = p.ayahs[ai];
        list.push({pageIdx: pi, ayahIdx: ai, surah: a.surah, ayah: a.ayah});
      }
    }
    return list;
  }

  // Cuts a full surah/juz playlist down to start at a specific ayah — used
  // by the ayah-number long-press feature (بدء التلاوة من الآية) so
  // "حتى السورة"/"حتى الجزء" start reciting from the pressed ayah onward
  // instead of replaying the whole surah/juz from its first ayah.
  function slicePlaylistFrom(list, pageIdx, ayahIdx){
    for(var i = 0; i < list.length; i++){
      if(list[i].pageIdx === pageIdx && list[i].ayahIdx === ayahIdx) return list.slice(i);
    }
    return list;
  }

  function playSurahPlaylistAt(playlist, idx, mode){
    if(idx >= playlist.length){
      stopListening();
      return;
    }
    var player = getAudioPlayer();
    if(!player){
      showToast('التشغيل الصوتي غير مدعوم في هذا المتصفح');
      return;
    }
    var item = playlist[idx];
    listenState.playlist = playlist;
    listenState.playlistIndex = idx;
    listenState.mode = mode || 'surah';
    listenState.page = item.pageIdx;
    listenState.ayahIndex = item.ayahIdx;
    listenState.playing = true;
    listenState.loading = true;
    listenState.repeatsPlayed = 0;
    // Turn the page automatically as the recitation crosses into the next
    // ruku — but via {keepAudio:true}, so goTo doesn't stop the very
    // playback that's driving it.
    if(state.page !== item.pageIdx) goTo(item.pageIdx, {keepAudio:true});
    updateListenButton();
    requestAudioWakeLock();
    highlightAyah(item.surah, item.ayah);
    updateMediaSessionMetadata(surahNameFor(item.pageIdx, item.ayahIdx, item.surah), item.ayah);
    setMediaSessionPlaybackState('playing');
    player.src = ayahAudioUrl(item.surah, item.ayah);
    var playPromise = player.play();
    if(playPromise && playPromise.catch){
      playPromise.catch(function(){
        stopListening();
        showToast('تعذر تشغيل الصوت \u2014 تحقق من الاتصال بالإنترنت');
      });
    }
  }

  function playSurah(surahNum){
    var playlist = buildSurahPlaylist(surahNum);
    if(!playlist.length) return;
    stopListening();
    playSurahPlaylistAt(playlist, 0, 'surah');
  }

  function playJuz(juzNum){
    var playlist = buildJuzPlaylist(juzNum);
    if(!playlist.length) return;
    stopListening();
    playSurahPlaylistAt(playlist, 0, 'juz');
  }

  function toggleListen(){
    if(listenState.playing && listenState.page === state.page){
      stopListening();
    } else {
      stopListening();
      playAyahAt(state.page, 0, 'ruku');
    }
  }

  // Long-press on an ayah's number marker (the star-shaped ٱ marker at the
  // end of each ayah) plays just that single ayah, independent of the
  // "listen to the whole ruku" button. Reuses the same audio player/state
  // as the ruku playback, just in 'single' mode so it stops after one ayah
  // instead of chaining into the next.
  function setupAyahNumberLongPress(){
    var LONG_PRESS_MS = 550;
    var MOVE_TOLERANCE = 10;
    var timer = null;
    var startPos = null;
    var cancelled = false;
    var root = els.ayahFlow;
    if(!root) return;

    // Where recitation started by long-pressing an ayah number should
    // stop, per "بدء التلاوة من الآية (ضغط مطول)" in الإعدادات:
    //   'ayah' — just this one ayah (the original behavior)
    //   'ruku' — the rest of the ruku currently on screen (no page turn)
    //   'surah'/'juz' — the rest of the surah/juz, turning pages and
    //                   auto-scrolling automatically as it goes, same
    //                   mechanism as the play buttons in فهرس السور/الأجزاء
    function startLongPressPlayback(surah, ayah){
      var p = PAGES[state.page];
      if(!p) return;
      var idx = -1;
      for(var i = 0; i < p.ayahs.length; i++){
        if(p.ayahs[i].surah === surah && p.ayahs[i].ayah === ayah){ idx = i; break; }
      }
      if(idx === -1) return;
      stopListening();
      var scope = state.longPressScope || 'ayah';
      if(scope === 'ruku'){
        playAyahAt(state.page, idx, 'ruku');
        showToast('جارٍ التلاوة حتى نهاية الركوع');
      } else if(scope === 'surah'){
        var surahList = slicePlaylistFrom(buildSurahPlaylist(surah), state.page, idx);
        if(!surahList.length) return;
        playSurahPlaylistAt(surahList, 0, 'surah');
        showToast('جارٍ التلاوة حتى نهاية السورة');
      } else if(scope === 'juz'){
        var juzList = slicePlaylistFrom(buildJuzPlaylist(p.juz), state.page, idx);
        if(!juzList.length) return;
        playSurahPlaylistAt(juzList, 0, 'juz');
        showToast('جارٍ التلاوة حتى نهاية الجزء');
      } else {
        playAyahAt(state.page, idx, 'single');
        showToast('جارٍ تشغيل هذه الآية');
      }
    }

    function onStart(x, y, target){
      var numEl = target.closest ? target.closest('.ayah-num') : null;
      if(!numEl) return;
      cancelled = false;
      startPos = {x: x, y: y};
      scrollSyncPausedByTouch = true;
      clearTimeout(timer);
      timer = setTimeout(function(){
        if(cancelled) return;
        var surah = parseInt(numEl.getAttribute('data-surah'), 10);
        var ayah = parseInt(numEl.getAttribute('data-ayah'), 10);
        if(!isNaN(surah) && !isNaN(ayah)) startLongPressPlayback(surah, ayah);
      }, LONG_PRESS_MS);
    }
    function onMove(x, y){
      if(!startPos) return;
      if(Math.abs(x - startPos.x) > MOVE_TOLERANCE || Math.abs(y - startPos.y) > MOVE_TOLERANCE){
        cancelled = true;
        clearTimeout(timer);
        scrollSyncPausedByTouch = false;
      }
    }
    function onEnd(){
      clearTimeout(timer);
      startPos = null;
      scrollSyncPausedByTouch = false;
    }

    root.addEventListener('touchstart', function(e){
      if(e.touches.length > 1){
        cancelled = true;
        clearTimeout(timer);
        startPos = null;
        return;
      }
      var t = e.touches[0];
      onStart(t.clientX, t.clientY, e.target);
    }, {passive:true});
    root.addEventListener('touchmove', function(e){
      var t = e.touches[0];
      onMove(t.clientX, t.clientY);
    }, {passive:true});
    root.addEventListener('touchend', onEnd, {passive:true});
    root.addEventListener('mousedown', function(e){ onStart(e.clientX, e.clientY, e.target); });
    root.addEventListener('mousemove', function(e){ onMove(e.clientX, e.clientY); });
    root.addEventListener('mouseup', onEnd);
  }

  // Reciter choice (الاستماع): stored per-user like fontStyle, independent
  // of which script (uthmani/indopak) is currently displayed.
  function applyReciterChoice(){
    if(els.reciterSelect) els.reciterSelect.value = (state.reciter === 'jibreel') ? 'jibreel' : 'abdulbasit';
  }
  function setupReciterSelect(){
    if(!els.reciterSelect) return;
    els.reciterSelect.addEventListener('change', function(){
      var val = (els.reciterSelect.value === 'jibreel') ? 'jibreel' : 'abdulbasit';
      if(state.reciter === val) return;
      stopListening();
      state.reciter = val;
      saveState();
      showToast('القارئ: ' + (val === 'jibreel' ? 'محمد جبريل' : 'عبدالباسط عبدالصمد'));
    });
    applyReciterChoice();
  }

  // "بدء التلاوة من الآية (ضغط مطول)" (الإعدادات): stored independently of
  // the reciter and script mode, same pattern as setupReciterSelect above.
  var LONG_PRESS_SCOPES = ['ayah', 'ruku', 'surah', 'juz'];
  function applyLongPressScopeChoice(){
    if(els.longPressScopeSelect) els.longPressScopeSelect.value = LONG_PRESS_SCOPES.indexOf(state.longPressScope) !== -1 ? state.longPressScope : 'ayah';
  }
  function setupLongPressScopeSelect(){
    if(!els.longPressScopeSelect) return;
    els.longPressScopeSelect.addEventListener('change', function(){
      var val = els.longPressScopeSelect.value;
      if(LONG_PRESS_SCOPES.indexOf(val) === -1) val = 'ayah';
      state.longPressScope = val;
      saveState();
    });
    applyLongPressScopeChoice();
  }

  function setupAutoScrollToggle(){
    if(!els.autoScrollToggle) return;
    els.autoScrollToggle.checked = state.autoScrollEnabled !== false;
    els.autoScrollToggle.addEventListener('change', function(){
      state.autoScrollEnabled = els.autoScrollToggle.checked;
      saveState();
      if(!state.autoScrollEnabled) disableAutoScrollSync();
    });
  }

  // "تكرار تلاوة الآية" (الإعدادات): how many times each ayah plays back
  // to back before playback moves on to the next one. Applies regardless
  // of which button started playback (الاستماع للركوع، تشغيل السورة/الجزء
  // من الفهرس، أو بدء التلاوة بالضغط المطول على رقم الآية) since they all
  // funnel through the same 'ended' handler on the shared audio element
  // (see getAudioPlayer). Same storage/UI pattern as
  // setupLongPressScopeSelect above. Default is 1 (no repetition).
  var RECITATION_REPEAT_COUNTS = ['1', '2', '3'];
  function applyRecitationRepeatChoice(){
    if(!els.recitationRepeatSelect) return;
    var val = String(state.recitationRepeatCount || 1);
    els.recitationRepeatSelect.value = RECITATION_REPEAT_COUNTS.indexOf(val) !== -1 ? val : '1';
  }
  function setupRecitationRepeatSelect(){
    if(!els.recitationRepeatSelect) return;
    els.recitationRepeatSelect.addEventListener('change', function(){
      var val = els.recitationRepeatSelect.value;
      if(RECITATION_REPEAT_COUNTS.indexOf(val) === -1) val = '1';
      state.recitationRepeatCount = parseInt(val, 10);
      saveState();
    });
    applyRecitationRepeatChoice();
  }

  function init(deps){
    PAGES = deps.PAGES;
    state = deps.state;
    els = deps.els;
    goTo = deps.goTo;
    showToast = deps.showToast;
    saveState = deps.saveState;

    if(els.btnListen) els.btnListen.addEventListener('click', toggleListen);
    setupAyahNumberLongPress();
    setupReciterSelect();
    setupAutoScrollToggle();
    setupLongPressScopeSelect();
    setupRecitationRepeatSelect();
    setupMediaSessionHandlers();
  }

  window.AudioManager = {
    init: init,
    stopListening: stopListening,
    playSurah: playSurah,
    playJuz: playJuz,
    pauseScrollSync: pauseScrollSync,
    resumeScrollSync: resumeScrollSync
  };
})();
