// ReaderTafsir: "تفسير الركوع" panel (button top-right of the reader,
// level with زر الاستماع). Supports two independent tafsirs:
//
//   1. المختصر في تفسير القرآن (Mukhtasar) — baseline 1.0.476
//      Source: spa5k/tafsir_api  ar-tafsir-al-mukhtasar
//      TTS: full CATT + Quran dictionary / phrases / Muqattaat / context
//           corrections / normalizeTanween pipeline from 1.0.476
//
//   2. أيسر التفاسير (Aysar) — from 1.0.480
//      Source: Quranpedia API book=54
//      TTS: Direct path only (normalizeTanweenForTts → Android TTS)
//           No CATT, no Quran dictionary, no phrase/Muqattaat layers.
//
// Selection is stored as state.selectedTafsir ('mukhtasar' | 'aysar'),
// default 'mukhtasar'. Cache keys are isolated by tafsir type so the two
// never cross-contaminate. TTS state is stopped and reset on switch.
//
// Loaded before app.js (see index.html). Call ReaderTafsir.init(deps)
// once; deps: els, state, PAGES, UI
// Exposed as window.ReaderTafsir.
(function(){
  'use strict';

  var els, state, PAGES, UI, ReaderManager;

  // --- Mukhtasar (baseline) ---
  var MUKHTASAR_BASE = 'https://raw.githubusercontent.com/spa5k/tafsir_api/main/tafsir/ar-tafsir-al-mukhtasar/';
  // --- Aysar (from 1.0.480) ---
  var AYSAR_API_BASE = 'https://api.quranpedia.net/v1/ayah/';
  var AYSAR_BOOK_ID = 54;

  // In-memory only — never persisted to disk.
  // Keys: 'mukhtasar:surah:ayah' or 'aysar:surah:ayah'
  var cache = {};
  var inFlight = {};
  var requestToken = 0;
  var isOffline = false;

  function getSelectedTafsir(){
    var t = (state && state.selectedTafsir) || 'mukhtasar';
    if(t !== 'mukhtasar' && t !== 'aysar') t = 'mukhtasar';
    return t;
  }

  function tafsirLabel(t){
    return t === 'aysar' ? 'أيسر التفاسير' : 'المختصر في تفسير القرآن';
  }

  function updateTafsirLabels(){
    var t = getSelectedTafsir();
    var label = tafsirLabel(t);
    if(els && els.tafsirPanelTitle) els.tafsirPanelTitle.textContent = label;
    if(els && els.btnTafsir){
      els.btnTafsir.setAttribute('aria-label', label);
      els.btnTafsir.setAttribute('title', label);
    }
  }

  function cacheKey(surah, ayah){
    return getSelectedTafsir() + ':' + surah + ':' + ayah;
  }

  // Strip Quranpedia HTML wrappers (Aysar only). Keep Arabic + tashkeel.
  function stripTafsirHtml(raw){
    if(!raw || typeof raw !== 'string') return '';
    var t = raw;
    t = t.replace(/<[^>]+>/g, '');
    t = t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    t = t.replace(/(^|﴾)\s*\(\s*[\d\u0660-\u0669]+\s*\)\s*[-–—]\s*/g, '$1 ');
    t = t.replace(/[ \t\r\n]+/g, ' ').trim();
    return t;
  }

  function extractAysarText(json){
    if(!json || !json.content || !json.content.length) return '';
    var parts = [];
    for(var i = 0; i < json.content.length; i++){
      var block = json.content[i];
      var raw = (block && block.text) ? block.text : '';
      if(raw) parts.push(raw);
    }
    if(!parts.length) return '';
    return stripTafsirHtml(parts.join(' '));
  }

  function fetchOne(surah, ayah){
    var key = cacheKey(surah, ayah);
    if(cache[key] !== undefined) return Promise.resolve(cache[key]);
    if(inFlight[key]) return inFlight[key];
    var t = getSelectedTafsir();
    var p;
    if(t === 'aysar'){
      var url = AYSAR_API_BASE + surah + '/' + ayah + '/book/' + AYSAR_BOOK_ID;
      p = fetch(url)
        .then(function(res){
          if(!res.ok) throw new Error('http ' + res.status);
          return res.json();
        })
        .then(function(json){
          var text = extractAysarText(json);
          cache[key] = text;
          delete inFlight[key];
          return text;
        })
        .catch(function(err){
          delete inFlight[key];
          throw err;
        });
    } else {
      p = fetch(MUKHTASAR_BASE + surah + '/' + ayah + '.json')
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
    }
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
    // Free CATT connection for neighbor warm-up again
    resumeCattWarm();
    hideTtsPipelineDebug();
  }

  // Startup watchdog: if onstart never fires after speak(), treat as silent
  // failure (e.g. some Android WebViews queue the utterance but never start).
  // Do NOT hard-gate on getVoices()/preferredVoice — many devices speak
  // Arabic correctly via utterance.lang='ar-SA' even when no ar-* voice is listed.
  var TTS_SILENT_FAIL_MSG = 'لا يتوفر صوت بالعربي';
  var TTS_STARTUP_WATCHDOG_MS = 3500;

  // Abort the active TTS session without relying on utterance callbacks.
  // Bumps generation so late onend/onerror cannot advance a new session.
  function abortTtsSession(message){
    ttsGeneration++;
    ttsQueue = [];
    ttsSpeaking = false;
    clearTtsHighlight();
    if(typeof speechSynthesis !== 'undefined'){
      try{ speechSynthesis.cancel(); }catch(e){}
    }
    updateTtsButton();
    resumeCattWarm();
    hideTtsPipelineDebug();
    if(message && UI && UI.showToast) UI.showToast(message);
  }


  // -----------------------------------------------------------------
  // Quran Tashkeel for TTS only (v1.0.413).
  //
  // Applies stem-level diacritics from QURAN_TASHKEEL_DICT (built offline
  // from the Uthmani text in data.js) to a *copy* of the tafsir string
  // immediately before SpeechSynthesisUtterance. Displayed text is never
  // touched. Ambiguous function words are excluded from the dictionary.
  // Any miss or error falls back to the original word/text.
  // -----------------------------------------------------------------
  // Same-Ayah Exact Match for TTS only (v1.0.418).
  //
  // When speaking tafsir for a known (surah, ayah), content words that
  // match the vocalized Quran ayah *exactly* after safe orthographic
  // normalization take the ayah's diacritics. Function words are never
  // taken from the ayah (ambiguous). No stem/root matching.
  // Falls through to Quran dictionary for non-matches.
  var TTS_FUNCTION_WORDS = {
    // v1.0.418: restored كان/بين/كل/بعض/غير/مع for Same-Ayah exact match (safe).
    // كنت stays excluded (كُنتَ vs كُنتُ same surface form).
    'من':1,'ما':1,'ان':1,'أن':1,'إن':1,'في':1,'على':1,'الي':1,'إلى':1,
    'عن':1,'لا':1,'لم':1,'لن':1,'هل':1,'هو':1,'هي':1,'هم':1,'هن':1,
    'نحن':1,'انت':1,'أنت':1,'انتم':1,'أنتم':1,'هذا':1,'هذه':1,'ذلك':1,
    'التي':1,'الذي':1,'الذين':1,'الى':1,'كنت':1,'قد':1,'ثم':1,
    'او':1,'أو':1,'ام':1,'أم':1,'اذا':1,'إذا':1,'لو':1,'كي':1,'حتي':1,'حتى':1,
    'سوى':1,'لدى':1,'منذ':1
  };
  var _ayahTashkeelCache = {}; // 's:a' -> { plain: vocalized }

  function _ttsPlainKey(w){
    return String(w)
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
      .replace(/[آأإٱ]/g, 'ا')
      .replace(/ء/g, '');
  }

  function _normalizeAyahToken(w){
    var v = String(w);
    v = v.replace(/\u0671/g, '\u0627');
    v = v.replace(/\u0640/g, '');
    v = v.replace(/\u0670/g, '');
    v = v.replace(/\u0657/g, '\u064B');
    v = v.replace(/\u06E1/g, '\u0652');
    v = v.replace(/[\u06D6-\u06ED]/g, '');
    return v;
  }

  function _getAyahWordMap(surah, ayah){
    var key = String(surah) + ':' + String(ayah);
    if(_ayahTashkeelCache[key]) return _ayahTashkeelCache[key];
    var map = {};
    try{
      var pages = (typeof window !== 'undefined') && window.JUZ_PAGES;
      if(!pages || !pages.length){ _ayahTashkeelCache[key] = map; return map; }
      for(var pi = 0; pi < pages.length; pi++){
        var ayahs = pages[pi].ayahs || [];
        for(var ai = 0; ai < ayahs.length; ai++){
          var a = ayahs[ai];
          if(a.surah === surah && a.ayah === ayah){
            var toks = String(a.text || '').match(/[\u0600-\u06FF]+/g) || [];
            for(var ti = 0; ti < toks.length; ti++){
              var tok = toks[ti];
              var pk = _ttsPlainKey(tok);
              if(!pk || TTS_FUNCTION_WORDS[pk]) continue;
              map[pk] = _normalizeAyahToken(tok);
            }
            _ayahTashkeelCache[key] = map;
            return map;
          }
        }
      }
    }catch(e){}
    _ayahTashkeelCache[key] = map;
    return map;
  }

  function applySameAyahTashkeel(text, surah, ayah){
    try{
      if(!text || typeof text !== 'string') return text;
      if(surah == null || ayah == null) return text;
      var map = _getAyahWordMap(surah, ayah);
      if(!map) return text;
      var AR_PUNCT = '،؛؟٪ـ';
      return text.replace(/[\u0600-\u06FF]+/g, function(run){
        var start = 0, end = run.length;
        while(start < end && AR_PUNCT.indexOf(run[start]) !== -1) start++;
        while(end > start && AR_PUNCT.indexOf(run[end - 1]) !== -1) end--;
        if(end <= start) return run;
        var core = run.slice(start, end);
        var pk = _ttsPlainKey(core);
        if(!pk || TTS_FUNCTION_WORDS[pk]) return run;
        var repl = map[pk];
        if(!repl) return run;
        return run.slice(0, start) + repl + run.slice(end);
      });
    }catch(e){
      return text;
    }
  }


  // -----------------------------------------------------------------
  // Static Quran phrase overrides for TTS only (v1.0.418).
  // Built offline from Cross-Ayah PoC (n>=4, exact, cross-only, denylist).
  // Whole-phrase replacement only — never word-level split of these entries.
  // "من قبل ومن بعد" intentionally omitted (denylist).
  var QURAN_PHRASE_TTS_OVERRIDES = {
    "ان الله على كل شيء": "إِنَّ اللَّهَ عَلَى كُلِّ شَيْءٍ",
    "على كل شيء قدير": "عَلَى كُلِّ شَيْءٍ قَدِيرٌ",
    "ان الله بكل شيء": "إِنَّ اللَّهَ بِكُلِّ شَيْءٍ",
    "ان الله كان عليما": "إِنَّ اللَّهَ كَانَ عَلِيمًا",
    "والله بكل شيء عليم": "وَاللَّهُ بِكُلِّ شَيْءٍ عَلِيمٌ",
    "ان الله كان بكم": "إِنَّ اللَّهَ كَانَ بِكُمْ",
    "كان الله بكل شيء": "كَانَ اللَّهُ بِكُلِّ شَيْءٍ",
    "ما كان الله ليذر": "مَا كَانَ اللَّهُ لِيَذَرَ",
    "والله على كل شيء": "وَاللَّهُ عَلَى كُلِّ شَيْءٍ",
    "على كل شيء وكيلا": "عَلَى كُلِّ شَيْءٍ وَكِيلًا",
    "ان الله لا يضيع": "إِنَّ اللَّهَ لَا يُضِيعُ",
    "والله بما تعملون خبير": "وَاللَّهُ بِمَا تَعْمَلُونَ خَبِيرٌ",
    "ان الله كان غفورا": "إِنَّ اللَّهَ كَانَ غَفُورًا",
    "والله بما تعملون بصير": "وَاللَّهُ بِمَا تَعْمَلُونَ بَصِيرٌ"
  };
  // Longest phrases first (object key order is insertion order in modern JS)
  var QURAN_PHRASE_TTS_KEYS = Object.keys(QURAN_PHRASE_TTS_OVERRIDES);

  function applyStaticQuranPhrases(text){
    try{
      if(!text || typeof text !== 'string') return text;
      if(!QURAN_PHRASE_TTS_KEYS || !QURAN_PHRASE_TTS_KEYS.length) return text;
      function plainKey(w){
        return String(w)
          .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
          .replace(/[آأإٱ]/g, 'ا');
      }
      // Match only consecutive Arabic words separated by whitespace (spaces,
      // tabs, newlines). Do NOT cross punctuation: ، ؛ : ؟ ! . ( ) [ ] etc.
      var out = text;
      for(var ki = 0; ki < QURAN_PHRASE_TTS_KEYS.length; ki++){
        var phrase = QURAN_PHRASE_TTS_KEYS[ki];
        var pwords = phrase.split(/\s+/);
        var n = pwords.length;
        if(n < 2) continue;
        // Build regex: word1 + whitespace + word2 + ... allowing optional
        // diacritics on each letter of each word.
        var parts = [];
        for(var wi = 0; wi < n; wi++){
          var pw = pwords[wi];
          var wordRe = '';
          for(var ci = 0; ci < pw.length; ci++){
            var ch = pw.charAt(ci);
            // alef variants
            if(ch === 'ا') wordRe += '[اآأإٱ]';
            else wordRe += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            wordRe += '[\\u064B-\\u065F\\u0670\\u06D6-\\u06ED\\u0640]*';
          }
          parts.push(wordRe);
        }
        var re = new RegExp(parts.join('[\\s\\u00A0]+'), 'g');
        var repl = QURAN_PHRASE_TTS_OVERRIDES[phrase];
        out = out.replace(re, repl);
      }
      return out;
    }catch(e){
      return text;
    }
  }

  function applyQuranTashkeel(text, surah, ayah){
    try{
      if(!text || typeof text !== 'string') return text;
      var dict = (typeof window !== 'undefined') && window.QURAN_TASHKEEL_DICT;
      if(!dict) return text;

      // The Quran dictionary is a protection/fallback layer, not a global
      // Arabic dictionary. Only allow it to fire for a word that belongs to
      // the current Quran ayah. This prevents collisions such as:
      // tafsir "يتكون" -> Quran dictionary key "يتكون" -> "يَتَّكُِٔون".
      var ayahMap = null;
      if(surah != null && ayah != null){
        ayahMap = _getAyahWordMap(surah, ayah);
      }

      var AR_PUNCT = '،؛؟٪ـ';
      return text.replace(/[\u0600-\u06FF]+/g, function(run){
        var start = 0, end = run.length;
        while(start < end && AR_PUNCT.indexOf(run[start]) !== -1) start++;
        while(end > start && AR_PUNCT.indexOf(run[end - 1]) !== -1) end--;
        if(end <= start) return run;

        var core = run.slice(start, end);
        var key = core
          .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
          .replace(/[آأإٱ]/g, 'ا');
        if(!key) return run;

        // If CATT or Same-Ayah already supplied vocalization, never destroy
        // it with a generic dictionary replacement.
        if(/[\u064B-\u065F\u0670]/.test(core)) return run;

        if(ayahMap && !ayahMap[key]) return run;

        var repl = dict[key];
        if(!repl) return run;
        return run.slice(0, start) + repl + run.slice(end);
      });
    }catch(e){
      return text;
    }
  }


  // -----------------------------------------------------------------
  // Surah muqatta'at (فواتح السور) for TTS only (v1.0.413).
  //
  // Expands disconnected letters to their spoken letter-names so Web
  // Speech does not read "الم" as a single word. Applied only when the
  // utterance is tied to a known (surah, ayah) that is itself a
  // muqatta'at ayah — never a global string replace, so ordinary words
  // in tafsir are untouched. Display text is never modified.
  // form may be a string or array of plain forms for the same ayah.
  var MUQATTAAT_BY_AYAH = {
    '2:1':  { form: 'الم', spoken: 'أَلِف لَامْ مِيمْ' },
    '3:1':  { form: 'الم', spoken: 'أَلِف لَامْ مِيمْ' },
    '7:1':  { form: 'المص', spoken: 'أَلِف لَامْ مِيمْ صَادْ' },
    '10:1': { form: 'الر', spoken: 'أَلِف لَامْ رَا' },
    '11:1': { form: 'الر', spoken: 'أَلِف لَامْ رَا' },
    '12:1': { form: 'الر', spoken: 'أَلِف لَامْ رَا' },
    '13:1': { form: 'المر', spoken: 'أَلِف لَامْ مِيمْ رَا' },
    '14:1': { form: 'الر', spoken: 'أَلِف لَامْ رَا' },
    '15:1': { form: 'الر', spoken: 'أَلِف لَامْ رَا' },
    '19:1': { form: 'كهيعص', spoken: 'كَافْ هَا يَا عَيْنْ صَادْ' },
    '20:1': { form: 'طه', spoken: 'طَا هَا' },
    '26:1': { form: 'طسم', spoken: 'طَا سِينْ مِيمْ' },
    '27:1': { form: 'طس', spoken: 'طَا سِينْ' },
    '28:1': { form: 'طسم', spoken: 'طَا سِينْ مِيمْ' },
    '29:1': { form: 'الم', spoken: 'أَلِف لَامْ مِيمْ' },
    '30:1': { form: 'الم', spoken: 'أَلِف لَامْ مِيمْ' },
    '31:1': { form: 'الم', spoken: 'أَلِف لَامْ مِيمْ' },
    '32:1': { form: 'الم', spoken: 'أَلِف لَامْ مِيمْ' },
    '36:1': { form: 'يس', spoken: 'يَا سِينْ' },
    '38:1': { form: 'ص', spoken: 'صَادْ' },
    '40:1': { form: 'حم', spoken: 'حَا مِيمْ' },
    '41:1': { form: 'حم', spoken: 'حَا مِيمْ' },
    // الشورى: الآية 1 حم، الآية 2 عسق — وقد يظهران معاً في نص التفسير
    '42:1': { form: ['حم', 'عسق'], spoken: { 'حم': 'حَا مِيمْ', 'عسق': 'عَيْنْ سِينْ قَافْ' } },
    '42:2': { form: ['عسق', 'حم'], spoken: { 'عسق': 'عَيْنْ سِينْ قَافْ', 'حم': 'حَا مِيمْ' } },
    '43:1': { form: 'حم', spoken: 'حَا مِيمْ' },
    '44:1': { form: 'حم', spoken: 'حَا مِيمْ' },
    '45:1': { form: 'حم', spoken: 'حَا مِيمْ' },
    '46:1': { form: 'حم', spoken: 'حَا مِيمْ' },
    '50:1': { form: 'ق', spoken: 'قَافْ' },
    '68:1': { form: 'ن', spoken: 'نُونْ' }
  };

  function expandMuqattaatForTts(text, surah, ayah){
    try{
      if(!text || typeof text !== 'string') return text;
      if(surah == null || ayah == null) return text;
      var entry = MUQATTAAT_BY_AYAH[String(surah) + ':' + String(ayah)];
      if(!entry) return text;
      var forms = entry.form;
      if(typeof forms === 'string') forms = [forms];
      var spokenMap = entry.spoken;
      // spoken may be a single string (one form) or map form->spoken
      function spokenFor(form){
        if(typeof spokenMap === 'string') return spokenMap;
        return spokenMap[form] || form;
      }
      return text.replace(/[\u0600-\u06FF]+/g, function(run){
        var plain = run.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '');
        var norm = plain.replace(/[آأإٱ]/g, 'ا');
        for(var i = 0; i < forms.length; i++){
          var form = forms[i];
          var formNorm = form.replace(/[آأإٱ]/g, 'ا');
          if(norm === formNorm || plain === form){
            return spokenFor(form);
          }
        }
        return run;
      });
    }catch(e){
      return text;
    }
  }


  // -----------------------------------------------------------------
  // TTS pronunciation fixes: قرآن، النبي، لغة (لُغَة). (v1.0.413)
  //
  // Tafsir often writes القرآن / قرآن with modern orthography (ا not ء)
  // and without damma; Web Speech then may read the qaf with fatha.
  // Force ضم القاف (قُرْآن) on whole-token matches only. Display unchanged.
  var QURAN_WORD_TTS_FIX = {
    // قرآن — ضم القاف
    'القرآن': 'القُرْآن',
    'قرآن': 'قُرْآن',
    'بقرآن': 'بِقُرْآن',
    'بالقرآن': 'بِالقُرْآن',
    'والقرآن': 'وَالقُرْآن',
    'للقرآن': 'لِلقُرْآن',
    'قرآنا': 'قُرْآنًا',
    'قرآني': 'قُرْآنِي',
    'القرءان': 'القُرْآن',
    'قرءان': 'قُرْآن',
    'بقرءان': 'بِقُرْآن',
    'بالقرءان': 'بِالقُرْآن',
    'والقرءان': 'وَالقُرْآن',
    // النبي — تشديد الياء دائماً
    'النبي': 'النَّبِيّ',
    'نبي': 'نَبِيّ',
    'نبيا': 'نَبِيًّا',
    'النبيين': 'النَّبِيِّينَ',
    'النبيون': 'النَّبِيُّونَ',
    'للنبي': 'لِلنَّبِيّ',
    'والنبي': 'وَالنَّبِيّ',
    'بالنبي': 'بِالنَّبِيّ',
    // لغة — لُغَة (غين مفتوحة دائماً). أهم من قاموس القرآن الذي قد
    // يخلطها بجذر "بلغ" (بَلِغَة). حركة التاء حسب سياق شائع في التفسير.
    'لغة': 'لُغَة',
    'بلغة': 'بِلُغَةِ',
    'ولغة': 'وَلُغَة',
    'للغة': 'لِلُغَةِ',
    'لغةً': 'لُغَةً',
    'لغته': 'لُغَتَه',
    'لغتهم': 'لُغَتَهُم',
    'بلغتهم': 'بِلُغَتِهِم',
    'العرب': 'الْعَرَب',
    // حين — فتح النون دائماً (ظرف)
    'حين': 'حِينَ',
    'وحين': 'وَحِينَ',
    'فحين': 'فَحِينَ',
    // كوكب — تشكيل قياسي بدون علامات مصحفية تقطع النطق
    'كوكب': 'كَوْكَب',
    'كوكبا': 'كَوْكَبًا',
    'كوكبًا': 'كَوْكَبًا',
    'الكواكب': 'الْكَوَاكِب'
  };


  // Normalize Quranic presentation marks that break Web Speech joining
  // (e.g. ٗ on كَوكَبٗا makes the engine split the word). TTS only.
  function normalizeTtsMarks(text){
    try{
      if(!text || typeof text !== 'string') return text;
      return text
        // Quranic tanween / vowel marks → standard Arabic
        .replace(/\u0657/g, '\u064B')  // ٗ → ً (fathatan)
        .replace(/\u0658/g, '\u064C')  // ٘ → ٌ approx
        .replace(/\u06E1/g, '\u0652')  // ۡ → ْ (sukun)
        .replace(/\u06EA/g, '')        // ۪ remove
        .replace(/\u06EB/g, '')
        .replace(/\u06EC/g, '')
        .replace(/\u06ED/g, '')
        .replace(/\u06D6/g, '')        // small high ligatures / stops
        .replace(/\u06D7/g, '')
        .replace(/\u06D8/g, '')
        .replace(/\u06D9/g, '')
        .replace(/\u06DA/g, '')
        .replace(/\u06DB/g, '')
        .replace(/\u06DC/g, '')
        .replace(/\u06DD/g, '')
        .replace(/\u06DE/g, '')
        .replace(/\u06DF/g, '')
        .replace(/\u06E0/g, '')
        .replace(/\u06E2/g, '')
        .replace(/\u06E3/g, '')
        .replace(/\u06E4/g, '')
        .replace(/\u06E5/g, '')
        .replace(/\u06E6/g, '')
        .replace(/\u06E7/g, '')
        .replace(/\u06E8/g, '')
        .replace(/\u06E9/g, '')
        .replace(/\u0670/g, '')        // dagger alef (letter usually present)
        .replace(/\u0640/g, '');       // tatweel
    }catch(e){
      return text;
    }
  }

  // ------------------------------------------------------------------
  // Contextual TTS corrections AFTER CATT / local dict layers.
  // Phrase- or (surah,ayah)-guarded — never a global map for ambiguous
  // roots like سحب (clouds سُحُب vs dragging سَحْب).
  // ------------------------------------------------------------------
  var TTS_CONTEXT_CORRECTIONS = [
    {
      id: 'suhub-clouds-water',
      // الذاريات 2 tafsir: clouds that carry abundant water
      surah: 51,
      ayah: 2,
      // Also match the distinctive phrase if meta is missing
      contextPlain: /السحب[\s\S]{0,48}تحمل[\s\S]{0,40}الماء|تحمل[\s\S]{0,40}الماء[\s\S]{0,24}الغزير/,
      replace: [
        [/وَبِالسَّحْبِ/g, 'وَبِالسُّحُبِ'],
        [/بِالسَّحْبِ/g, 'بِالسُّحُبِ'],
        [/السَّحْبِ/g, 'السُّحُبِ'],
        [/السَّحْب(?=[\s،.؛؟!)]|$)/g, 'السُّحُب'],
        [/وَبِالسحب/g, 'وَبِالسُّحُب'],
        [/وبالسحب/g, 'وَبِالسُّحُب'],
        [/بِالسحب/g, 'بِالسُّحُب'],
        [/بالسحب/g, 'بِالسُّحُب'],
        [/السحب(?=[\s،.؛؟!)]|$)/g, 'السُّحُب']
      ]
    },
    {
      // أقسم الله → past 3rd person (أَقْسَمَ اللَّهُ), not 1st person imperfect.
      // Phrase-guarded only — never a global map for bare أقسم.
      id: 'aqsama-allahu',
      contextPlain: /اقسم\s+الله/,
      replace: [
        [/أُقْسِمُ\s+اللَّه[َُِ]?/g, 'أَقْسَمَ اللَّهُ'],
        [/أُقْسِمُ\s+الله/g, 'أَقْسَمَ اللَّهُ'],
        [/أَقْسِمُ\s+اللَّه[َُِ]?/g, 'أَقْسَمَ اللَّهُ'],
        [/أَقْسِمُ\s+الله/g, 'أَقْسَمَ اللَّهُ'],
        [/أقسم\s+الله/g, 'أَقْسَمَ اللَّهُ'],
        [/أَقْسَمَ\s+الله/g, 'أَقْسَمَ اللَّهُ']
      ]
    },
    {
      // وأقسم بالخيل → وَأَقْسَمَ بِالْخَيْلِ (continuation of divine oath, not "I swear").
      // Phrase-guarded: requires أقسم + بالخيل. Bare أقسم unchanged.
      id: 'wa-aqsama-bilkhayl',
      contextPlain: /اقسم\s+بالخيل/,
      replace: [
        [/وَأُقْسِمُ\s+بِالْخَيْلِ/g, 'وَأَقْسَمَ بِالْخَيْلِ'],
        [/وَأُقْسِمُ\s+بالخيل/g, 'وَأَقْسَمَ بِالْخَيْلِ'],
        [/وأُقْسِمُ\s+بِالْخَيْلِ/g, 'وَأَقْسَمَ بِالْخَيْلِ'],
        [/وأُقْسِمُ\s+بالخيل/g, 'وَأَقْسَمَ بِالْخَيْلِ'],
        [/وَأَقْسِمُ\s+بِالْخَيْلِ/g, 'وَأَقْسَمَ بِالْخَيْلِ'],
        [/وَأَقْسِمُ\s+بالخيل/g, 'وَأَقْسَمَ بِالْخَيْلِ'],
        [/وأقسم\s+بالخيل/g, 'وَأَقْسَمَ بِالْخَيْلِ'],
        [/وَأَقْسَمَ\s+بالخيل/g, 'وَأَقْسَمَ بِالْخَيْلِ'],
        [/أُقْسِمُ\s+بِالْخَيْلِ/g, 'أَقْسَمَ بِالْخَيْلِ'],
        [/أُقْسِمُ\s+بالخيل/g, 'أَقْسَمَ بِالْخَيْلِ'],
        [/أقسم\s+بالخيل/g, 'أَقْسَمَ بِالْخَيْلِ']
      ]
    }
  ];

  function applyTtsContextCorrections(text, surah, ayah){
    try{
      if(!text || typeof text !== 'string') return text;
      if(!TTS_CONTEXT_CORRECTIONS || !TTS_CONTEXT_CORRECTIONS.length) return text;
      var plain = text
        .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
        .replace(/[آأإٱ]/g, 'ا');
      var out = text;
      for(var i = 0; i < TTS_CONTEXT_CORRECTIONS.length; i++){
        var rule = TTS_CONTEXT_CORRECTIONS[i];
        var ayahHit = (rule.surah != null && surah != null && ayah != null &&
          Number(rule.surah) === Number(surah) && Number(rule.ayah) === Number(ayah));
        var ctxHit = rule.contextPlain && rule.contextPlain.test(plain);
        if(!ayahHit && !ctxHit) continue;
        var reps = rule.replace || [];
        for(var r = 0; r < reps.length; r++){
          out = out.replace(reps[r][0], reps[r][1]);
        }
      }
      return out;
    }catch(e){
      return text;
    }
  }

  function fixQuranWordPronunciation(text){
    try{
      if(!text || typeof text !== 'string') return text;
      var AR_PUNCT = '،؛؟٪ـ';
      return text.replace(/[\u0600-\u06FF]+/g, function(run){
        // Peel Arabic punctuation so "كوكبًا،" still matches "كوكبا"
        var start = 0, end = run.length;
        while(start < end && AR_PUNCT.indexOf(run[start]) !== -1) start++;
        while(end > start && AR_PUNCT.indexOf(run[end - 1]) !== -1) end--;
        if(end <= start) return run;
        var core = run.slice(start, end);
        var prefix = run.slice(0, start);
        var suffix = run.slice(end);
        var plain = core.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '');
        var repl = null;
        if(QURAN_WORD_TTS_FIX[plain]) repl = QURAN_WORD_TTS_FIX[plain];
        else if(QURAN_WORD_TTS_FIX[core]) repl = QURAN_WORD_TTS_FIX[core];
        else {
          var norm = plain.replace(/ء/g, 'ا');
          if(norm !== plain && QURAN_WORD_TTS_FIX[norm]) repl = QURAN_WORD_TTS_FIX[norm];
        }
        if(!repl){
          var m = plain.match(/^([وفبكل]{0,2})(ال)?قر[ءا]ان$/);
          if(m){
            var pfx = m[1] || '';
            var hasAl = !!m[2];
            if(pfx === 'ب' && hasAl) repl = 'بِالقُرْآن';
            else if(pfx === 'و' && hasAl) repl = 'وَالقُرْآن';
            else if(pfx === 'ل' && hasAl) repl = 'لِلقُرْآن';
            else if(pfx === 'ف' && hasAl) repl = 'فَالقُرْآن';
            else if(pfx === 'ك' && hasAl) repl = 'كَالقُرْآن';
            else if(pfx === 'ب' && !hasAl) repl = 'بِقُرْآن';
            else if(pfx === 'و' && !hasAl) repl = 'وَقُرْآن';
            else if(pfx === 'ل' && !hasAl) repl = 'لِقُرْآن';
            else if(pfx === 'ف' && !hasAl) repl = 'فَقُرْآن';
            else if(hasAl) repl = 'القُرْآن';
            else repl = 'قُرْآن';
          }
        }
        if(!repl) return run;

        // Existing contextual/CATT vocalization has priority.
        if(/[\u064B-\u065F\u0670]/.test(core)){
          return run;
        }
        return prefix + repl + suffix;
      });
    }catch(e){
      return text;
    }
  }

  // Android TTS compatibility: combining tanween marks can cause
  // syllable-level segmentation. For speech only, convert tanween to the
  // corresponding short vowel while preserving the visible/source text.
  function normalizeTanweenForTts(text){
    return String(text || '').replace(/([^\u064B-\u065F\u0670])([ًٌٍ])/g,
      function(_, base, mark){
        if(mark === 'ً') return base + 'َ';
        if(mark === 'ٌ') return base + 'ُ';
        if(mark === 'ٍ') return base + 'ِ';
        return base + mark;
      });
  }

  // TTS-only: treat closing parentheses as a short speech boundary so the
  // following word is not joined to the parenthetical phrase.
  // Display/source text is never modified. Does not affect normal word spacing.
  // Supports ASCII () and Quranic ornate brackets ﴿ ﴾.
  function normalizeParensForTts(text){
    if(!text || typeof text !== 'string') return text;
    try{
      var out = text;
      // Closing ASCII paren → period boundary (short pause on Android TTS)
      out = out.replace(/\)\s*/g, '). ');
      // Closing ornate Arabic bracket ﴾ (U+FD3E) — Aysar uses ﴿...﴾ not (...)
      out = out.replace(/\uFD3E\s*/g, '\uFD3E. ');
      // Fullwidth closing paren ）
      out = out.replace(/\uFF09\s*/g, '\uFF09. ');
      // Collapse accidental double spaces introduced by the above
      out = out.replace(/ {2,}/g, ' ');
      return out;
    }catch(e){
      return text;
    }
  }

  // Mobile-visible TTS pipeline debug (diagnosis only — does not change speech).
  // Set TTS_PIPELINE_DEBUG = false to hide.
  var TTS_PIPELINE_DEBUG = false;

  function showTtsPipelineDebug(info){
    if(!TTS_PIPELINE_DEBUG) return;
    try{
      var box = document.getElementById('tts-pipeline-debug');
      if(!box){
        box = document.createElement('div');
        box.id = 'tts-pipeline-debug';
        box.setAttribute('dir', 'rtl');
        box.style.cssText = [
          'position:fixed', 'left:8px', 'right:8px', 'bottom:8px', 'z-index:99999',
          'max-height:42vh', 'overflow:auto', 'padding:10px 12px',
          'background:#1a1a1a', 'color:#f0f0f0', 'border:1px solid #666',
          'border-radius:10px', 'font-size:12px', 'line-height:1.55',
          'font-family:ui-monospace,monospace', 'box-shadow:0 4px 20px rgba(0,0,0,.45)'
        ].join(';');
        document.body.appendChild(box);
      }
      function esc(s){
        return String(s == null ? '—' : s)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }
      var ref = (info.surah != null && info.ayah != null)
        ? (info.surah + ':' + info.ayah) : '—';
      box.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
          '<strong style="color:#8f8">TTS Pipeline Debug</strong>' +
          '<span style="opacity:.8">' + esc(ref) + '</span>' +
          '<button type="button" id="tts-pipeline-debug-close" style="background:#333;color:#fff;border:0;border-radius:6px;padding:2px 8px;font-size:12px">إغلاق</button>' +
        '</div>' +
        '<div style="margin:4px 0"><span style="color:#9cf">SOURCE</span><br><span style="white-space:pre-wrap;word-break:break-word">' + esc(info.source) + '</span></div>' +
        '<div style="margin:4px 0"><span style="color:#fc9">CATT</span> <span style="opacity:.7">(' + esc(info.cattStatus) + ')</span><br><span style="white-space:pre-wrap;word-break:break-word">' + esc(info.catt) + '</span></div>' +
        '<div style="margin:4px 0"><span style="color:#9f9">FINAL TTS</span><br><span style="white-space:pre-wrap;word-break:break-word">' + esc(info.final) + '</span></div>';
      var btn = document.getElementById('tts-pipeline-debug-close');
      if(btn) btn.onclick = function(){ try{ box.parentNode.removeChild(box); }catch(e){} };
    }catch(e){}
  }

  function hideTtsPipelineDebug(){
    try{
      var box = document.getElementById('tts-pipeline-debug');
      if(box && box.parentNode) box.parentNode.removeChild(box);
    }catch(e){}
  }

  function speakText(text, meta, gen){
    if(!ttsApiAvailable || typeof speechSynthesis === 'undefined' || !text){
      return Promise.resolve();
    }
    if(!preferredVoice) preferredVoice = pickArabicVoice();
    if(gen !== ttsGeneration) return Promise.resolve();

    // Route by selected tafsir: Aysar uses Direct TTS (1.0.480), Mukhtasar uses full pipeline (1.0.476).
    if(getSelectedTafsir() === 'aysar'){
      return speakTextAysar(text, meta, gen);
    }
    return speakTextMukhtasar(text, meta, gen);
  }

  // -----------------------------------------------------------------
  // Aysar Direct TTS (from 1.0.480) — no CATT, no Quran layers.
  // Minimal speech-only fix for letter names as written in Aysar text
  // (e.g. "ألف. لام. ميم.") so Android TTS gets sukoon endings:
  // أَلِف لَامْ مِيمْ — display text is never modified.
  // This is NOT the Mukhtasar expandMuqattaatForTts pipeline.
  // -----------------------------------------------------------------
  function normalizeLetterNamesForTts(text){
    if(!text || typeof text !== 'string') return text;
    try{
      // Optional tashkeel/tatweel between base letters — Aysar API often ships
      // partial diacritics inside letter names (e.g. ألِف / لاَم / مِيم).
      var T = '[\\u064B-\\u065F\\u0670\\u0640]*';
      function nameRe(letters){
        // letters: array of base Arabic letters, e.g. ['أ','ل','ف']
        var parts = [];
        for(var i = 0; i < letters.length; i++){
          parts.push(letters[i].replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&') + T);
        }
        return parts.join('');
      }
      // Separator between letter-names: optional period / ornate dots / spaces
      var SEP = '[\\s.\\u06D4\\uFD3E\\uFD3F]*';
      // Optional surrounding ornate or ASCII parens around the whole group
      var WRAP_L = '[\\(\\uFD3F]?';
      var WRAP_R = '[\\)\\uFD3E]?';

      var pairs = [
        // ألف لام ميم صاد
        [new RegExp(WRAP_L + nameRe(['أ','ل','ف']) + SEP + nameRe(['ل','ا','م']) + SEP + nameRe(['م','ي','م']) + SEP + nameRe(['ص','ا','د']) + WRAP_R, 'g'), 'أَلِف لَامْ مِيمْ صَادْ'],
        // ألف لام ميم را
        [new RegExp(WRAP_L + nameRe(['أ','ل','ف']) + SEP + nameRe(['ل','ا','م']) + SEP + nameRe(['م','ي','م']) + SEP + nameRe(['ر','ا']) + WRAP_R, 'g'), 'أَلِف لَامْ مِيمْ رَا'],
        // ألف لام ميم
        [new RegExp(WRAP_L + nameRe(['أ','ل','ف']) + SEP + nameRe(['ل','ا','م']) + SEP + nameRe(['م','ي','م']) + WRAP_R, 'g'), 'أَلِف لَامْ مِيمْ'],
        // ألف لام را
        [new RegExp(WRAP_L + nameRe(['أ','ل','ف']) + SEP + nameRe(['ل','ا','م']) + SEP + nameRe(['ر','ا']) + WRAP_R, 'g'), 'أَلِف لَامْ رَا'],
        // كاف ها يا عين صاد
        [new RegExp(WRAP_L + nameRe(['ك','ا','ف']) + SEP + nameRe(['ه','ا']) + SEP + nameRe(['ي','ا']) + SEP + nameRe(['ع','ي','ن']) + SEP + nameRe(['ص','ا','د']) + WRAP_R, 'g'), 'كَافْ هَا يَا عَيْنْ صَادْ'],
        // طا سين ميم
        [new RegExp(WRAP_L + nameRe(['ط','ا']) + SEP + nameRe(['س','ي','ن']) + SEP + nameRe(['م','ي','م']) + WRAP_R, 'g'), 'طَا سِينْ مِيمْ'],
        // طا سين
        [new RegExp(WRAP_L + nameRe(['ط','ا']) + SEP + nameRe(['س','ي','ن']) + WRAP_R, 'g'), 'طَا سِينْ'],
        // طا ها
        [new RegExp(WRAP_L + nameRe(['ط','ا']) + SEP + nameRe(['ه','ا']) + WRAP_R, 'g'), 'طَا هَا'],
        // يا سين
        [new RegExp(WRAP_L + nameRe(['ي','ا']) + SEP + nameRe(['س','ي','ن']) + WRAP_R, 'g'), 'يَا سِينْ'],
        // حا ميم
        [new RegExp(WRAP_L + nameRe(['ح','ا']) + SEP + nameRe(['م','ي','م']) + WRAP_R, 'g'), 'حَا مِيمْ'],
        // عين سين قاف
        [new RegExp(WRAP_L + nameRe(['ع','ي','ن']) + SEP + nameRe(['س','ي','ن']) + SEP + nameRe(['ق','ا','ف']) + WRAP_R, 'g'), 'عَيْنْ سِينْ قَافْ'],
        // صاد / قاف / نون standalone letter names (with optional trailing period)
        [new RegExp(WRAP_L + nameRe(['ص','ا','د']) + '[.\\u06D4]?' + WRAP_R, 'g'), 'صَادْ'],
        [new RegExp(WRAP_L + nameRe(['ق','ا','ف']) + '[.\\u06D4]?' + WRAP_R, 'g'), 'قَافْ'],
        [new RegExp(WRAP_L + nameRe(['ن','و','ن']) + '[.\\u06D4]?' + WRAP_R, 'g'), 'نُونْ']
      ];

      var out = text;
      for(var i = 0; i < pairs.length; i++){
        out = out.replace(pairs[i][0], pairs[i][1]);
      }
      return out;
    }catch(e){
      return text;
    }
  }

  function speakTextAysar(text, meta, gen){
    if(gen !== ttsGeneration) return Promise.resolve();
    // Direct path only: letter-name pronunciation + tanween fix. No CATT / dict / Muqattaat pipeline.
    var speakable = normalizeLetterNamesForTts(text);
    speakable = normalizeTanweenForTts(speakable);
    speakable = normalizeParensForTts(speakable);
    return new Promise(function(resolve){
      if(gen !== ttsGeneration){ resolve(); return; }
      var u = new SpeechSynthesisUtterance(speakable);
      u.rate = 0.9;
      u.pitch = 1;
      u.volume = 1;
      if(preferredVoice){
        u.voice = preferredVoice;
        u.lang = preferredVoice.lang || 'ar-SA';
      }else{
        u.lang = 'ar-SA';
      }
      var settled = false;
      var started = false;
      var watchdogTimer = null;
      function settle(){
        if(settled) return;
        settled = true;
        if(watchdogTimer != null){ try{ clearTimeout(watchdogTimer); }catch(e){} watchdogTimer = null; }
        resolve();
      }
      function failSilentStart(){
        if(settled) return;
        settled = true;
        if(watchdogTimer != null){ try{ clearTimeout(watchdogTimer); }catch(e){} watchdogTimer = null; }
        if(gen === ttsGeneration){ abortTtsSession(TTS_SILENT_FAIL_MSG); }
        resolve();
      }
      u.onstart = function(){
        if(settled || gen !== ttsGeneration) return;
        started = true;
        if(watchdogTimer != null){ try{ clearTimeout(watchdogTimer); }catch(e){} watchdogTimer = null; }
      };
      u.onend = function(){ if(gen !== ttsGeneration){ settle(); return; } settle(); };
      u.onerror = function(){ if(gen !== ttsGeneration){ settle(); return; } settle(); };
      if(meta && meta.surah != null) setTtsHighlight(meta.surah, meta.ayah);
      watchdogTimer = setTimeout(function(){
        if(settled || started) return;
        if(gen !== ttsGeneration){ settle(); return; }
        failSilentStart();
      }, TTS_STARTUP_WATCHDOG_MS);
      try{ speechSynthesis.speak(u); }catch(e){ failSilentStart(); }
    });
  }

  // -----------------------------------------------------------------
  // Mukhtasar TTS (baseline 1.0.476) — full CATT + layers.
  // -----------------------------------------------------------------
  function speakTextMukhtasar(text, meta, gen){
    if(gen !== ttsGeneration) return Promise.resolve();

    // Smart Wait (v1.0.463+): give CATT a real chance before local fallback.
    // - Cache hit  → use immediately
    // - Not ready  → wait up to SMART_WAIT_MS for an in-flight / new result
    // - Still not  → local pipeline (CATT remains optional, never blocks forever)
    var SMART_WAIT_MS = 1800;

    function buildSpeakable(src){
      // TTS-only: contextual Quran layers. Display text remains unchanged.
      var speakable = src;
      if(meta && meta.surah != null && meta.ayah != null){
        speakable = applySameAyahTashkeel(speakable, meta.surah, meta.ayah);
      }
      speakable = applyQuranTashkeel(speakable, meta && meta.surah, meta && meta.ayah);
      speakable = applyStaticQuranPhrases(speakable);
      if(meta && meta.surah != null && meta.ayah != null){
        speakable = expandMuqattaatForTts(speakable, meta.surah, meta.ayah);
      }
      speakable = normalizeTtsMarks(speakable);

      // TTS-only: U+065E caused Android TTS segmentation in testing.
      speakable = speakable.replace(/\u065E/g, '\u064C');

      speakable = fixQuranWordPronunciation(speakable);

      // Contextual corrections (e.g. سُحُب vs سَحْب) after CATT + dict layers.
      speakable = applyTtsContextCorrections(
        speakable,
        meta && meta.surah,
        meta && meta.ayah
      );

      // FINAL Android TTS compatibility pass. Keep this as the last text
      // transformation so no later layer can reintroduce tanween.
      speakable = normalizeTanweenForTts(speakable);

      // Android TTS compatibility:
      // U+0656 (ARABIC SUBSCRIPT ALEF) is used in the Quranic/tafsir
      // text for the tanween-kasr style seen in "أَحَدٖ". Android Web
      // Speech segments this mark, while the equivalent standard kasra
      // U+0650 is spoken continuously. Convert it only in the TTS copy;
      // never alter the displayed/source text.
      speakable = speakable.replace(/\u0656/g, '\u0650');

      // Parenthesis boundary pause (TTS-only)
      speakable = normalizeParensForTts(speakable);
      return speakable;
    }

    function doSpeak(finalText, cattInfo){
      return new Promise(function(resolve){
        if(gen !== ttsGeneration){ resolve(); return; }

        var speakable = buildSpeakable(finalText);
        cattInfo = cattInfo || {};
        showTtsPipelineDebug({
          surah: meta && meta.surah,
          ayah: meta && meta.ayah,
          source: text,
          catt: cattInfo.cattText != null ? cattInfo.cattText : '—',
          cattStatus: cattInfo.status || 'none',
          final: speakable
        });
        var u = new SpeechSynthesisUtterance(speakable);
        u.rate = 0.9;
        u.pitch = 1;
        u.volume = 1;
        // Prefer a listed Arabic voice when available; otherwise lang=ar-SA only
        // (many Android WebViews speak Arabic without listing an ar-* voice).
        // Never attach a non-Arabic voice object.
        if(preferredVoice){
          u.voice = preferredVoice;
          u.lang = preferredVoice.lang || 'ar-SA';
        }else{
          u.lang = 'ar-SA';
        }

        // Idempotent settlement: only the first of onstart-timeout / onend /
        // onerror / speak-throw may finish this utterance Promise. Late
        // callbacks after abortTtsSession must not resolve a newer session's
        // chain or re-enter playQueue.
        var settled = false;
        var started = false;
        var watchdogTimer = null;

        function settle(){
          if(settled) return;
          settled = true;
          if(watchdogTimer != null){
            try{ clearTimeout(watchdogTimer); }catch(e){}
            watchdogTimer = null;
          }
          resolve();
        }

        function failSilentStart(){
          if(settled) return;
          settled = true;
          if(watchdogTimer != null){
            try{ clearTimeout(watchdogTimer); }catch(e){}
            watchdogTimer = null;
          }
          // Only the generation that started this utterance may abort UI state.
          // abortTtsSession bumps ttsGeneration so playQueue().then will not
          // advance to the next ayah, and late engine callbacks become no-ops.
          if(gen === ttsGeneration){
            abortTtsSession(TTS_SILENT_FAIL_MSG);
          }
          resolve();
        }

        u.onstart = function(){
          if(settled || gen !== ttsGeneration) return;
          started = true;
          if(watchdogTimer != null){
            try{ clearTimeout(watchdogTimer); }catch(e){}
            watchdogTimer = null;
          }
        };
        u.onend = function(){
          if(gen !== ttsGeneration){ settle(); return; }
          settle();
        };
        u.onerror = function(){
          if(gen !== ttsGeneration){ settle(); return; }
          settle();
        };

        if(meta && meta.surah != null) setTtsHighlight(meta.surah, meta.ayah);

        watchdogTimer = setTimeout(function(){
          if(settled || started) return;
          if(gen !== ttsGeneration){ settle(); return; }
          failSilentStart();
        }, TTS_STARTUP_WATCHDOG_MS);

        try{
          speechSynthesis.speak(u);
        }catch(e){
          failSilentStart();
        }
      });
    }

    // --- Smart Wait path ---
    try{
      if(typeof TTS_CATT_ONLINE !== 'undefined' && TTS_CATT_ONLINE){
        var cached = null;
        if(TTS_CATT_ONLINE.getCached){
          cached = TTS_CATT_ONLINE.getCached(text);
        }
        if(cached){
          return doSpeak(cached, {
            cattText: cached,
            status: cached === text ? 'cache-hit (same as source)' : 'cache-hit'
          });
        }

        // Not in cache: start/await CATT with a hard maximum wait.
        // getReadyOrWarm reuses any already-pending request for the same text.
        var readyPromise = (TTS_CATT_ONLINE.getReadyOrWarm
          ? TTS_CATT_ONLINE.getReadyOrWarm(text)
          : (TTS_CATT_ONLINE.warm ? TTS_CATT_ONLINE.warm(text) : Promise.resolve(text)));

        return Promise.race([
          readyPromise,
          new Promise(function(resolve){
            setTimeout(function(){ resolve(null); }, SMART_WAIT_MS);
          })
        ]).then(function(result){
          if(gen !== ttsGeneration) return;
          // null = timed out → local fallback
          // otherwise use whatever CATT returned (improved or original)
          if(result == null){
            return doSpeak(text, { cattText: '—', status: 'timeout / miss → local' });
          }
          var useText = (typeof result === 'string') ? result : text;
          var status = (useText === text) ? 'returned source (no change)' : 'applied';
          return doSpeak(useText, { cattText: useText, status: status });
        });
      }
    }catch(e){}

    // No CATT module available → local pipeline immediately
    return doSpeak(text, { cattText: '—', status: 'CATT unavailable' });
  }

  function playQueue(){
    var gen = ttsGeneration;
    if(!ttsQueue.length){
      // Only the active session may clear UI when the queue drains.
      if(gen !== ttsGeneration) return;
      ttsSpeaking = false;
      clearTtsHighlight();
      updateTtsButton();
      resumeCattWarm();
      return;
    }
    if(!ttsApiAvailable){
      stopTts();
      return;
    }
    // Best-effort: refresh preferred Arabic voice if the list has loaded.
    // Absence of a listed voice is NOT a hard stop — speak with lang=ar-SA.
    if(!preferredVoice) preferredVoice = pickArabicVoice();
    ttsSpeaking = true;
    pauseCattWarm(); // keep CATT free for current ayah Smart Wait
    updateTtsButton();
    var item = ttsQueue.shift();
    speakText(item.text, item, gen).then(function(){
      // Cancelled utterance from a previous session, user stopped, or
      // silent-start abort (generation bumped): do not advance the queue.
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

      // CATT page warm-up is started once the current tafsir page has
      // finished loading, not once per ayah.
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
  // ------------------------------------------------------------------
  // CATT warm-up priority:
  //   1) Warm connection (once)
  //   2) Current ruku (full)
  //   3) Next ruku
  //   4) Previous ruku
  // While the user is listening (ttsSpeaking), neighbor warm-up PAUSES
  // so the CATT connection stays free for the current ayah's Smart Wait.
  // ------------------------------------------------------------------
  var cattPageWarmChain = Promise.resolve();
  var cattPageWarmToken = 0;
  var cattWarmPaused = false;
  var cattResumeWaiters = [];

  function pauseCattWarm(){
    cattWarmPaused = true;
  }

  function resumeCattWarm(){
    if(!cattWarmPaused) return;
    cattWarmPaused = false;
    var waiters = cattResumeWaiters.slice();
    cattResumeWaiters = [];
    for(var i = 0; i < waiters.length; i++){
      try{ waiters[i](); }catch(e){}
    }
  }

  function waitIfCattPaused(){
    if(!cattWarmPaused) return Promise.resolve();
    return new Promise(function(resolve){
      cattResumeWaiters.push(resolve);
    });
  }

  function ensureCattConnection(){
    try{
      if(typeof TTS_CATT_ONLINE !== 'undefined' &&
         TTS_CATT_ONLINE && TTS_CATT_ONLINE.warmConnection){
        return TTS_CATT_ONLINE.warmConnection().catch(function(){ return null; });
      }
      if(typeof TTS_CATT_ONLINE !== 'undefined' &&
         TTS_CATT_ONLINE && TTS_CATT_ONLINE.initialize){
        return TTS_CATT_ONLINE.initialize().catch(function(){ return null; });
      }
    }catch(e){}
    return Promise.resolve(null);
  }

  function warmTafsirPage(pageIdx, opts){
    opts = opts || {};
    // All background warm-up yields while TTS is speaking so the CATT
    // connection stays free for the current ayah's Smart Wait.
    // Aysar uses Direct TTS — no CATT warm-up for it.
    var p = PAGES[pageIdx];
    if(!p || !p.ayahs) return Promise.resolve();

    if(getSelectedTafsir() === 'aysar'){
      // Still fetch texts into cache, but skip CATT entirely.
      var chainA = Promise.resolve();
      p.ayahs.forEach(function(a){
        chainA = chainA.then(function(){ return fetchOne(a.surah, a.ayah).catch(function(){}); });
      });
      return chainA.catch(function(){});
    }

    if(cattWarmPaused){
      return Promise.resolve();
    }

    // If every ayah in this page has already been prepared, do nothing.
    try{
      if(typeof TTS_CATT_ONLINE !== 'undefined' &&
         TTS_CATT_ONLINE && TTS_CATT_ONLINE.getPageCached){
        var readyPage = TTS_CATT_ONLINE.getPageCached(pageIdx);
        if(readyPage){
          var readyCount = Object.keys(readyPage).length;
          if(readyCount >= p.ayahs.length) return Promise.resolve();
        }
      }
    }catch(e){}

    return ensureCattConnection().then(function(){
      var chain = Promise.resolve();
      var pageMap = Object.create(null);

      p.ayahs.forEach(function(a){
        chain = chain.then(function(){
          // Neighbors yield while the user is listening.
          return waitIfCattPaused().then(function(){
            if(cattWarmPaused) return;
            return fetchOne(a.surah, a.ayah).then(function(text){
              pageMap[a.surah + ':' + a.ayah] = text;
              try{
                if(typeof TTS_CATT_ONLINE !== 'undefined' &&
                   TTS_CATT_ONLINE && TTS_CATT_ONLINE.warm){
                  return TTS_CATT_ONLINE.warm(text).then(function(prepared){
                    pageMap[a.surah + ':' + a.ayah] = prepared || text;
                  });
                }
              }catch(e){}
            });
          });
        });
      });

      return chain.then(function(){
        try{
          if(typeof TTS_CATT_ONLINE !== 'undefined' &&
             TTS_CATT_ONLINE && TTS_CATT_ONLINE.cachePage){
            TTS_CATT_ONLINE.cachePage(pageIdx, pageMap);
          }
        }catch(e){}
      });
    }).catch(function(){});
  }

  function prefetchNeighbors(pageIdx){
    // Order: current → next → previous.
    // ALL background CATT warm-up (including current) pauses while TTS
    // is speaking, so the connection stays free for the playing ayah.
    var token = ++cattPageWarmToken;
    cattPageWarmChain = cattPageWarmChain.then(function(){
      if(token !== cattPageWarmToken) return;
      return waitIfCattPaused();
    }).then(function(){
      if(token !== cattPageWarmToken) return;
      return warmTafsirPage(pageIdx);
    }).then(function(){
      if(token !== cattPageWarmToken) return;
      return waitIfCattPaused();
    }).then(function(){
      if(token !== cattPageWarmToken) return;
      return warmTafsirPage(pageIdx + 1);
    }).then(function(){
      if(token !== cattPageWarmToken) return;
      return waitIfCattPaused();
    }).then(function(){
      if(token !== cattPageWarmToken) return;
      return warmTafsirPage(pageIdx - 1);
    }).catch(function(){});
  }

  // Silent warm-up on every page render (app.js onAfterRender).
  // 1) Fetch current ruku tafsir texts
  // 2) Then run prioritized CATT warm: current → next → previous
  function prefetchCurrentRuku(){
    if(typeof navigator !== 'undefined' && navigator.onLine === false) return;
    var p = PAGES[state.page];
    if(!p || !p.ayahs || !p.ayahs.length) return;
    var pageIdx = state.page;
    var ayahs = p.ayahs;
    // Kick connection early — does not wait for fetchOne to finish
    ensureCattConnection();
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

  function onTafsirChanged(newVal){
    // Hard isolation on switch: stop any running TTS, clear queue/state,
    // update labels, and if panel is open re-load current ruku with new source.
    stopTts();
    updateTafsirLabels();
    if(els && els.tafsirPanel && !els.tafsirPanel.classList.contains('hidden')){
      loadCurrentRuku();
    }
    // Pre-warm for the newly selected tafsir
    try{ prefetchCurrentRuku(); }catch(e){}
  }

  function init(deps){
    els = deps.els;
    state = deps.state;
    PAGES = deps.PAGES;
    UI = deps.UI;
    ReaderManager = deps.ReaderManager;

    if(!els.btnTafsir || !els.tafsirPanel) return;

    updateTafsirLabels();

    // Header TTS button starts hidden; startVoicesProbe() reveals it only
    // after a real Arabic voice is confirmed on this device.
    if(els.btnTafsirTts) els.btnTafsirTts.classList.add('hidden');

    els.btnTafsir.addEventListener('click', function(){
      reprobeOnPanelOpen();
      // Warm CATT connection only for Mukhtasar
      if(getSelectedTafsir() === 'mukhtasar') ensureCattConnection();
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
    stopTts: stopTts,
    onTafsirChanged: onTafsirChanged,
    getSelectedTafsir: getSelectedTafsir
  };
})();
