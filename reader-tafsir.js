// ReaderTafsir: "تفسير الركوع" panel (button top-right of the reader,
// level with زر الاستماع), fetches المختصر في تفسير القرآن الكريم (Tafsir
// Center for Quranic Studies) for every ayah on the current ruku page and
// renders them in order, separated by a divider between each ayah's
// tafsir.
//
// The current ruku's tafsir is also silently warmed into `cache` as soon
// as the reader shows a page — see prefetchCurrentRuku(), called from
// onAfterRender in app.js — so that by the time the user actually taps
// the button the network round-trip has usually already happened while
// they were reading, and the panel just renders from cache. Nothing is
// shown on screen for this warm-up; it only ever touches `cache`.
//
// Deliberately online-only, per direct request: nothing is bundled into
// the app or written to data.js — each ayah's tafsir text is fetched from
// a public, CORS-enabled mirror of the "ar-tafsir-al-mukhtasar" edition
// (https://github.com/spa5k/tafsir_api) only at the moment the panel is
// opened. Results are kept in an in-memory cache for the lifetime of the
// page load only (so flipping back to a ruku already opened this session
// doesn't re-fetch), never written to localStorage/IndexedDB — closing
// the app clears it, consistent with "مش عايز أي تحميلات".
//
// Loaded before app.js (see index.html). Call ReaderTafsir.init(deps)
// once; deps: els, state, PAGES, UI
// Exposed as window.ReaderTafsir.
(function(){
  'use strict';

  var els, state, PAGES, UI, ReaderManager;

  var TAFSIR_BASE = 'https://raw.githubusercontent.com/spa5k/tafsir_api/main/tafsir/ar-tafsir-al-mukhtasar/';
  // In-memory only — see the comment above for why this is intentionally
  // never persisted to disk.
  var cache = {}; // 'surah:ayah' -> tafsir text
  var inFlight = {}; // 'surah:ayah' -> Promise, while a fetch hasn't settled yet —
                      // stops a swipe and a background prefetch that land on
                      // the same still-loading ayah from firing two requests.
  var requestToken = 0; // guards against a slow fetch for a page the
                         // reader has already navigated away from landing
                         // on top of a newer page's results
  var isOffline = false; // true while the panel is showing the "تعذّر
                          // التحميل" retry state — see wireSwipe(), which
                          // uses this to stop swipes from moving the
                          // reader page behind the panel while there's no
                          // connection to load a new ruku's tafsir with.

  function cacheKey(surah, ayah){ return surah + ':' + ayah; }

  function fetchOne(surah, ayah){
    var key = cacheKey(surah, ayah);
    if(cache[key] !== undefined) return Promise.resolve(cache[key]);
    if(inFlight[key]) return inFlight[key];
    var p = fetch(TAFSIR_BASE + surah + '/' + ayah + '.json')
      .then(function(res){
        if(!res.ok) throw new Error('http ' + res.status);
        return res.json();
      })
      .then(function(json){
        var text = (json && json.text) ? json.text : '';
        cache[key] = text;
        delete inFlight[key];
        return text;
      })
      .catch(function(err){
        delete inFlight[key];
        throw err;
      });
    inFlight[key] = p;
    return p;
  }

  function entryId(surah, ayah){ return 'tafsir-entry-' + surah + '-' + ayah; }

  // -----------------------------------------------------------------
  // Arabic TTS (Web Speech API).
  //
  // Visibility: show Play controls whenever speechSynthesis exists.
  // Many Android/iOS WebViews speak Arabic correctly via utterance.lang
  // = 'ar-SA' even when getVoices() never lists an ar-* entry (this is
  // why 1.0.389 worked on devices that later hid the button under a
  // strict getVoices()-only gate).
  //
  // Speaking: prefer a listed Arabic voice when one exists; otherwise
  // set lang='ar-SA' only and do NOT assign a non-Arabic voice object.
  // -----------------------------------------------------------------
  var ttsSpeaking = false;
  var ttsQueue = [];       // remaining texts when reading the whole ruku
  var ttsCurrentKey = null; // 'surah:ayah' currently being spoken (for highlight)
  var preferredVoice = null;
  // true when the Web Speech API itself exists (buttons may be shown).
  var ttsApiAvailable = (typeof speechSynthesis !== 'undefined');
  // Bumped on every stop/restart so a cancelled utterance's late onend/onerror
  // cannot clear the highlight or advance a newer playback session.
  var ttsGeneration = 0;

  function isArabicVoice(v){
    if(!v) return false;
    var lang = (v.lang || '').trim();
    if(/^ar([-_]|$)/i.test(lang)) return true;
    var name = (v.name || '');
    if(/arabic|عربي|عربى/i.test(name)) return true;
    return false;
  }

  // Prefer a male Arabic voice for tafsir playback. SpeechSynthesisVoice.gender
  // is NOT universally available, so name heuristics are the primary signal;
  // gender is only a bonus when the engine exposes it.
  var MALE_AR_NAME_RE = /\b(maged|majid|majed|naayf|nayef|hamed|hamid|omar|umar|abdullah|fahad|khaled|khalid|saleh|salih|rami|tariq|tarek|tarik|ali|youssef|yousef|yusuf|hassan|hussein|mohammad|mohammed|muhammad|ahmed|ahmad|nasser|saul|talel)\b/i;
  var FEMALE_AR_NAME_RE = /\b(zira|salma|laila|layla|hoda|huda|amina|amira|sara|sarah|nora|norah|fatima|aisha|maryam|helen|hela|omani)\b|female|woman/i;

  function scoreArabicVoice(v){
    if(!isArabicVoice(v)) return -1;
    var score = 0;
    var name = (v.name || '');
    var lang = (v.lang || '');
    // Locale preference
    if(/^ar[-_]SA/i.test(lang)) score += 30;
    else if(/^ar([-_]|$)/i.test(lang)) score += 20;
    // Explicit gender when present (optional field — never required)
    try{
      var g = (v.gender || '').toString().toLowerCase();
      if(g === 'male') score += 50;
      else if(g === 'female') score -= 50;
    }catch(e){}
    // Name heuristics (works on Microsoft / Apple / Google voice labels)
    if(MALE_AR_NAME_RE.test(name)) score += 40;
    if(FEMALE_AR_NAME_RE.test(name)) score -= 40;
    if(/\bmale\b/i.test(name)) score += 25;
    // Prefer local/offline voices when tagged
    if(v.localService === true) score += 5;
    return score;
  }

  function pickArabicVoice(){
    if(typeof speechSynthesis === 'undefined') return null;
    var voices = speechSynthesis.getVoices() || [];
    if(!voices.length) return null;
    var best = null;
    var bestScore = -1;
    for(var i = 0; i < voices.length; i++){
      var v = voices[i];
      var s = scoreArabicVoice(v);
      if(s < 0) continue;
      // Skip clearly female voices when any non-female Arabic alternative exists;
      // still allow them only if they are the sole Arabic option (handled below).
      if(s > bestScore){
        bestScore = s;
        best = v;
      }
    }
    // If the only Arabic voices scored as female (bestScore still low / negative
    // gender), prefer the highest-scoring Arabic voice rather than silence —
    // visibility/playback already gates on speechSynthesis; voice pick is best-effort.
    if(best) return best;
    // Last resort: first Arabic voice regardless of score edge cases
    for(var j = 0; j < voices.length; j++){
      if(isArabicVoice(voices[j])) return voices[j];
    }
    return null;
  }

  var AYAH_TTS_BTN_HTML =
    '<button type="button" class="tafsir-ayah-tts" data-surah="__S__" data-ayah="__A__" ' +
      'aria-label="استمع لتفسير هذه الآية" title="استمع">' +
      '<svg viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4V5z"/>' +
      '<path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>' +
      '<path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>' +
    '</button>';

  function ayahTtsBtnHtml(surah, ayah){
    return AYAH_TTS_BTN_HTML
      .replace('__S__', String(surah))
      .replace('__A__', String(ayah));
  }

  // Show / hide the header Play button and inject/strip per-ayah buttons.
  function applyTtsAvailability(){
    if(els && els.btnTafsirTts){
      if(ttsApiAvailable){
        els.btnTafsirTts.classList.remove('hidden');
      } else {
        els.btnTafsirTts.classList.add('hidden');
        if(ttsSpeaking) stopTts();
      }
    }
    if(!els || !els.tafsirList) return;
    var items = els.tafsirList.querySelectorAll('.tafsir-item');
    for(var i = 0; i < items.length; i++){
      var item = items[i];
      var head = item.querySelector('.tafsir-ayah-head');
      if(!head) continue;
      var existing = head.querySelector('.tafsir-ayah-tts');
      if(ttsApiAvailable){
        if(existing) continue;
        var id = item.id || '';
        var m = id.match(/^tafsir-entry-(\d+)-(\d+)$/);
        if(!m) continue;
        head.insertAdjacentHTML('beforeend', ayahTtsBtnHtml(m[1], m[2]));
      } else if(existing){
        existing.parentNode.removeChild(existing);
      }
    }
    updateTtsButton();
  }

  // Best-effort: refresh preferredVoice when the engine publishes voices.
  // Never hides the buttons just because the list is empty or non-Arabic
  // — utterance.lang='ar-SA' still works on those devices.
  function refreshArabicVoiceFromSystem(){
    if(typeof speechSynthesis === 'undefined'){
      preferredVoice = null;
      ttsApiAvailable = false;
      applyTtsAvailability();
      return;
    }
    ttsApiAvailable = true;
    preferredVoice = pickArabicVoice();
    applyTtsAvailability();
  }

  function startVoicesProbe(){
    if(typeof speechSynthesis === 'undefined'){
      preferredVoice = null;
      ttsApiAvailable = false;
      applyTtsAvailability();
      return;
    }
    ttsApiAvailable = true;
    // Show controls immediately — do not wait for getVoices().
    applyTtsAvailability();
    refreshArabicVoiceFromSystem();
    try{
      speechSynthesis.addEventListener('voiceschanged', function(){
        refreshArabicVoiceFromSystem();
      });
    }catch(e){}
    try{
      speechSynthesis.onvoiceschanged = function(){
        refreshArabicVoiceFromSystem();
      };
    }catch(e){}
    var polls = [100, 400, 1000, 3000];
    for(var i = 0; i < polls.length; i++){
      (function(ms){
        setTimeout(function(){ refreshArabicVoiceFromSystem(); }, ms);
      })(polls[i]);
    }
  }

  function reprobeOnPanelOpen(){
    if(typeof speechSynthesis === 'undefined') return;
    refreshArabicVoiceFromSystem();
  }

  function updateTtsButton(){
    if(!els || !els.btnTafsirTts) return;
    var playing = ttsSpeaking;
    if(els.tafsirTtsIconPlay) els.tafsirTtsIconPlay.classList.toggle('hidden', playing);
    if(els.tafsirTtsIconStop) els.tafsirTtsIconStop.classList.toggle('hidden', !playing);
    els.btnTafsirTts.classList.toggle('active', playing);
    els.btnTafsirTts.setAttribute('aria-label', playing ? 'إيقاف القراءة' : 'استمع للتفسير');
    els.btnTafsirTts.setAttribute('title', playing ? 'إيقاف القراءة' : 'استمع للتفسير');
  }

  function clearTtsHighlight(){
    if(!els || !els.tafsirList) return;
    var prev = els.tafsirList.querySelectorAll('.tafsir-item.tts-speaking');
    for(var i = 0; i < prev.length; i++) prev[i].classList.remove('tts-speaking');
    ttsCurrentKey = null;
  }

  function setTtsHighlight(surah, ayah){
    clearTtsHighlight();
    if(surah == null) return;
    var el = document.getElementById(entryId(surah, ayah));
    if(el){
      el.classList.add('tts-speaking');
      ttsCurrentKey = cacheKey(surah, ayah);
      try{ el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }catch(e){}
    }
  }

  function stopTts(){
    ttsGeneration++; // invalidate in-flight utterance callbacks
    ttsQueue = [];
    ttsSpeaking = false;
    clearTtsHighlight();
    if(typeof speechSynthesis !== 'undefined'){
      try{ speechSynthesis.cancel(); }catch(e){}
    }
    updateTtsButton();
  }

  function speakText(text, meta, gen){
    if(!ttsApiAvailable || typeof speechSynthesis === 'undefined' || !text){
      return Promise.resolve();
    }
    // Refresh voice pick right before speaking (list may have filled in).
    if(!preferredVoice) preferredVoice = pickArabicVoice();
    return new Promise(function(resolve){
      // Stale session (user already switched/stopped) — do nothing.
      if(gen !== ttsGeneration){ resolve(); return; }
      var u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95;
      u.pitch = 1;
      u.volume = 1;
      if(preferredVoice){
        u.voice = preferredVoice;
        u.lang = preferredVoice.lang || 'ar-SA';
      } else {
        // No listed Arabic voice — ask the engine for Arabic via lang only.
        // Do NOT assign a non-Arabic voice object.
        u.lang = 'ar-SA';
      }
      if(meta && meta.surah != null) setTtsHighlight(meta.surah, meta.ayah);
      u.onend = function(){ resolve(); };
      u.onerror = function(){ resolve(); };
      try{
        speechSynthesis.speak(u);
      }catch(e){
        resolve();
      }
    });
  }

  function playQueue(){
    var gen = ttsGeneration;
    if(!ttsQueue.length){
      // Only the active session may clear UI when the queue drains.
      if(gen !== ttsGeneration) return;
      ttsSpeaking = false;
      clearTtsHighlight();
      updateTtsButton();
      return;
    }
    if(!ttsApiAvailable){
      stopTts();
      return;
    }
    ttsSpeaking = true;
    updateTtsButton();
    var item = ttsQueue.shift();
    speakText(item.text, item, gen).then(function(){
      // Cancelled utterance from a previous session, or user stopped: ignore.
      if(gen !== ttsGeneration || !ttsSpeaking) return;
      playQueue();
    });
  }

  function startTtsForRuku(){
    if(!ttsApiAvailable) return;
    if(ttsSpeaking){
      stopTts();
      return;
    }
    var items = [];
    if(els.tafsirList){
      var nodes = els.tafsirList.querySelectorAll('.tafsir-item');
      for(var i = 0; i < nodes.length; i++){
        var node = nodes[i];
        var p = node.querySelector('.tafsir-text');
        if(!p || !p.textContent || p.classList.contains('tafsir-text-pending')) continue;
        var id = node.id || '';
        var m = id.match(/^tafsir-entry-(\d+)-(\d+)$/);
        items.push({
          text: p.textContent.trim(),
          surah: m ? parseInt(m[1], 10) : null,
          ayah: m ? parseInt(m[2], 10) : null
        });
      }
    }
    if(!items.length){
      if(UI && UI.showToast) UI.showToast('لا يوجد تفسير جاهز للقراءة بعد');
      return;
    }
    ttsQueue = items;
    playQueue();
  }

  function speakSingleAyah(surah, ayah){
    if(!ttsApiAvailable) return;
    var key = cacheKey(surah, ayah);
    if(ttsSpeaking && ttsCurrentKey === key){
      stopTts();
      return;
    }
    stopTts();
    var text = cache[key];
    if(!text){
      var el = document.getElementById(entryId(surah, ayah));
      var p = el && el.querySelector('.tafsir-text');
      text = p ? p.textContent.trim() : '';
    }
    if(!text){
      if(UI && UI.showToast) UI.showToast('تفسير هذه الآية غير جاهز بعد');
      return;
    }
    ttsQueue = [{ text: text, surah: surah, ayah: ayah }];
    playQueue();
  }

  function wirePerAyahTtsButtons(){
    if(!els.tafsirList) return;
    els.tafsirList.addEventListener('click', function(ev){
      var btn = ev.target.closest && ev.target.closest('.tafsir-ayah-tts');
      if(!btn) return;
      ev.preventDefault();
      ev.stopPropagation();
      var surah = parseInt(btn.getAttribute('data-surah'), 10);
      var ayah = parseInt(btn.getAttribute('data-ayah'), 10);
      if(!surah || !ayah) return;
      speakSingleAyah(surah, ayah);
    });
  }

  function renderSkeleton(ayahs){
    stopTts(); // navigating / reloading the list cancels any ongoing speech
    isOffline = false;
    var html = ayahs.map(function(a, i){
      // Per-ayah Play when Web Speech API exists on this device.
      var ttsBtn = ttsApiAvailable ? ayahTtsBtnHtml(a.surah, a.ayah) : '';
      var head = '<div class="tafsir-ayah-head">' +
          '<span class="tafsir-ayah-label">' +
            (a.surahName ? 'سورة ' + UI.escapeHtml(a.surahName) + ' — ' : '') +
            'الآية ' + UI.toArabicDigits(a.ayah) +
          '</span>' +
          ttsBtn +
        '</div>';
      var divider = i > 0 ? '<hr class="tafsir-divider">' : '';
      return divider + '<div class="tafsir-item" id="' + entryId(a.surah, a.ayah) + '">' + head +
        '<p class="tafsir-text tafsir-text-pending">…</p>' +
      '</div>';
    }).join('');
    els.tafsirList.innerHTML = html;
  }

  // Swaps one ayah's placeholder text for its real tafsir (or an error
  // line) the moment that ayah's own fetch resolves — instead of holding
  // the whole ruku back behind Promise.all, the first ayah (usually the
  // fastest response) appears almost immediately and the rest fill in as
  // they arrive, which is what actually improves *perceived* first-load
  // speed; the network round-trips themselves are already parallel.
  function fillEntry(a, text, isError){
    var el = document.getElementById(entryId(a.surah, a.ayah));
    if(!el) return; // panel closed/reopened elsewhere in the meantime
    var p = el.querySelector('.tafsir-text, .tafsir-error-text');
    if(!p) return;
    if(isError){
      p.className = 'tafsir-error-text';
      p.textContent = 'تعذّر تحميل تفسير هذه الآية.';
    } else {
      p.className = 'tafsir-text';
      p.textContent = text;
    }
  }

  function renderOffline(){
    stopTts();
    isOffline = true;
    els.tafsirList.innerHTML = '<div class="tafsir-loading">' +
      'تعذّر تحميل التفسير. تأكّد من اتصالك بالإنترنت ثم أعد المحاولة.' +
      '<button class="reset-btn" id="btnRetryTafsir" style="margin-top:14px;">إعادة المحاولة</button>' +
    '</div>';
    var retryBtn = document.getElementById('btnRetryTafsir');
    if(retryBtn) retryBtn.addEventListener('click', function(){
      // Disable immediately on tap: fetches over a dead connection tend
      // to reject almost instantly, so without this a few impatient
      // repeated taps could each trigger their own full
      // renderSkeleton()→renderOffline() cycle back-to-back, replacing
      // the panel's content several times in a flash — felt like the
      // screen "shaking". Harmless since renderSkeleton()/renderOffline()
      // always replace this button with a fresh, enabled one anyway.
      retryBtn.disabled = true;
      loadCurrentRuku();
    });
  }

  // Silently warms the cache for the ruku's immediate neighbors (the two
  // rukus a swipe could land on) once the current one has finished
  // loading — nothing is rendered, this only populates `cache` so that
  // when the reader actually swipes, loadCurrentRuku() for the new page
  // finds every ayah already cached and renders instantly instead of
  // waiting on a fresh round-trip. Deliberately kicked off only *after*
  // the visible ruku's own requests have all settled, so it never
  // competes with them for the browser's limited per-origin connections.
  // Next is requested before previous — a reader is far more likely to
  // keep moving forward than to backtrack, so the forward ruku should be
  // first in line for the browser's (also limited) per-origin connection
  // pool, not tied with or behind the backward one.
  function prefetchNeighbors(pageIdx){
    [pageIdx + 1, pageIdx - 1].forEach(function(idx){
      var p = PAGES[idx];
      if(!p || !p.ayahs) return;
      p.ayahs.forEach(function(a){
        fetchOne(a.surah, a.ayah).catch(function(){}); // best-effort, silent
      });
    });
  }

  // Silent warm-up: called every time the reader shows a page (see
  // onAfterRender in app.js) — NOT only when the tafsir panel is opened.
  // Priority order is current ruku, then next ruku, then previous ruku
  // (see prefetchNeighbors above): this function's own fetchOne() calls
  // for the current ruku fire immediately, and only once every one of
  // them has settled does it call prefetchNeighbors — so the current
  // ruku never has to share the connection pool with the neighbor
  // warm-up, and forward always wins over backward once it does.
  // fetchOne()'s own cache/inFlight guards make this free to call
  // repeatedly (same-page re-renders from a settings change, etc.) —
  // already-cached or already-in-flight ayaat are skipped instantly, and
  // never duplicated as a second in-flight request. By the time the user
  // actually taps زر التفسير, loadCurrentRuku() below finds everything
  // already cached and renders instantly instead of waiting on a
  // round-trip.
  // Deliberately does nothing when offline — no point queuing requests
  // that will just reject, and it keeps `isOffline`/the panel's own
  // offline state untouched since this never renders anything.
  function prefetchCurrentRuku(){
    if(typeof navigator !== 'undefined' && navigator.onLine === false) return;
    var p = PAGES[state.page];
    if(!p || !p.ayahs || !p.ayahs.length) return;
    var pageIdx = state.page;
    var ayahs = p.ayahs;
    var settled = 0;
    ayahs.forEach(function(a){
      fetchOne(a.surah, a.ayah).catch(function(){}).then(function(){
        settled++;
        if(settled === ayahs.length) prefetchNeighbors(pageIdx);
      });
    });
  }

  function loadCurrentRuku(){
    var p = PAGES[state.page];
    if(!p || !p.ayahs || !p.ayahs.length){ renderOffline(); return; }
    // When the device is known to be offline, skip straight to the
    // offline message instead of first rendering the full per-ayah
    // skeleton (which can be tall — one row per ayah) only to collapse
    // it back down to the short offline message a moment later once
    // every fetch rejects. That tall→short swap, happening within a
    // fraction of a second, is what read as the screen "shaking"; going
    // straight to the (already short) offline state avoids it, since the
    // content height barely changes between one retry and the next.
    if(typeof navigator !== 'undefined' && navigator.onLine === false){
      renderOffline();
      return;
    }
    var myToken = ++requestToken;
    var ayahs = p.ayahs;
    renderSkeleton(ayahs);

    var results = []; // tracks success/failure to detect a fully-offline ruku
    ayahs.forEach(function(a){
      fetchOne(a.surah, a.ayah).then(function(text){
        if(myToken !== requestToken) return; // navigated away while loading
        results.push(true);
        fillEntry(a, text, false);
      }).catch(function(){
        if(myToken !== requestToken) return;
        results.push(false);
        fillEntry(a, null, true);
      }).then(function(){
        if(myToken !== requestToken) return;
        if(results.length !== ayahs.length) return; // more still in flight
        // If every single one failed, swap the whole panel to the
        // offline/retry state instead of leaving a wall of per-ayah error
        // lines; otherwise this ruku is done — warm its neighbors.
        if(results.every(function(ok){ return !ok; })){
          renderOffline();
        } else {
          prefetchNeighbors(state.page);
        }
      });
    });
  }

  // Shared by the swipe gesture and the prev/next buttons at the bottom
  // of the tafsir list: moves the (hidden, behind-the-panel) reader page
  // by `delta` rukus via ReaderManager.goToRelativePage — so state.page
  // stays in sync and closing the panel lands on the right ruku with no
  // extra bookkeeping — then reloads this panel's content for the new
  // page and scrolls the list back to the top.
  function navigateRuku(delta){
    // Nothing to gain from turning the (hidden) reader page here if
    // there's no connection to load the next/previous ruku's tafsir with
    // anyway — leave the reader page exactly where it is instead of
    // silently drifting behind a panel stuck on "تعذّر التحميل".
    if(isOffline){
      UI.showToast('لا يوجد اتصال بالإنترنت');
      return;
    }
    var before = state.page;
    ReaderManager.goToRelativePage(delta);
    if(state.page === before){
      UI.showToast(delta > 0 ? 'هذا آخر ركوع' : 'هذا أول ركوع');
      return;
    }
    stopTts();
    loadCurrentRuku();
    var body = els.tafsirPanel.querySelector('.panel-body');
    if(body) body.scrollTop = 0;
  }

  // Swipe left/right inside the tafsir panel moves to the next/previous
  // ruku's tafsir — same RTL convention used for turning pages in the
  // reader itself (see wireSwipeAndPinch in navigation.js): dragging the
  // finger right (dx > 0) advances forward, left goes back. Uses the
  // shared Gestures.swipe helper (gestures.js), which also handles
  // preventDefault-ing a confirmed horizontal drag so it can't leak to
  // whatever's behind this fixed panel, and cleans up correctly on
  // touchcancel.
  function wireSwipe(){
    if(!els.tafsirPanel || !ReaderManager) return;
    Gestures.swipe({
      root: els.tafsirPanel,
      onSwipe: function(dx){
        navigateRuku(dx > 0 ? 1 : -1);
      }
    });
  }

  // Prev/next buttons at the end of the tafsir list (below the last
  // ayah's text, so reached by scrolling down) — same ±1 convention as
  // els.btnPrev/btnNext in the reader itself (see readerManager.js) and
  // the swipe gesture above: "next" = +1.
  function wireNavButtons(){
    if(els.btnTafsirPrev) els.btnTafsirPrev.addEventListener('click', function(){
      navigateRuku(-1);
    });
    if(els.btnTafsirNext) els.btnTafsirNext.addEventListener('click', function(){
      navigateRuku(1);
    });
  }

  function init(deps){
    els = deps.els;
    state = deps.state;
    PAGES = deps.PAGES;
    UI = deps.UI;
    ReaderManager = deps.ReaderManager;

    if(!els.btnTafsir || !els.tafsirPanel) return;

    // Header TTS button starts hidden; startVoicesProbe() reveals it only
    // after a real Arabic voice is confirmed on this device.
    if(els.btnTafsirTts) els.btnTafsirTts.classList.add('hidden');

    els.btnTafsir.addEventListener('click', function(){
      reprobeOnPanelOpen();
      UI.openPanel(els.tafsirPanel);
      loadCurrentRuku();
    });
    els.btnCloseTafsir && els.btnCloseTafsir.addEventListener('click', function(){
      stopTts();
      UI.closePanel(els.tafsirPanel);
    });
    if(els.btnTafsirTts){
      els.btnTafsirTts.addEventListener('click', function(){
        startTtsForRuku();
      });
    }
    wireSwipe();
    wireNavButtons();
    wirePerAyahTtsButtons();
    startVoicesProbe();

    // Stop speech if the panel is closed by any other path (backdrop,
    // escape, overlay manager, etc.).
    if(typeof MutationObserver !== 'undefined' && els.tafsirPanel){
      var mo = new MutationObserver(function(){
        if(els.tafsirPanel.classList.contains('hidden')) stopTts();
      });
      mo.observe(els.tafsirPanel, { attributes: true, attributeFilter: ['class'] });
    }

    UI.registerOverlayPanels([els.tafsirPanel].filter(Boolean));
    updateTtsButton();
  }

  window.ReaderTafsir = {
    init: init,
    prefetchCurrentRuku: prefetchCurrentRuku,
    stopTts: stopTts
  };
})();
