// RadioPlayer: مشغّل «الإذاعة» داخل تاب الإذاعة في «دليل القارئ».
//
// مستقل تمامًا عن نظام تشغيل الآيات في AudioManager: لا يقرأ ولا يعدّل
// أي متغيّر أو دالة من audioManager.js، وله عنصر <audio> خاص به يُنشأ
// هنا (radioPlayer) بدل استخدام عنصر تشغيل الآيات. هذا العزل مقصود حتى
// لا يتأثر الـprefetch أو الـplayback handoff الحالي بأي شكل.
//
// الحالة الخاصة بهذا المشغّل فقط:
//   radioPlayer  — عنصر <audio> الخاص بالإذاعة
//   radioStream  — رابط البث الحالي
//   radioStation — معرّف المحطة الحالية
//   radioState   — idle | connecting | playing
//
// لا autoplay أبدًا: التشغيل يبدأ فقط بعد ضغط المستخدم على زر التشغيل
// (Android/Chrome يمنعان autoplay للصوت بلا تفاعل مستخدم على أي حال).
//
// Loaded before app.js (see index.html). Call RadioPlayer.init(deps)
// once; deps: els
// Exposed as window.RadioPlayer.
(function(){
  'use strict';

  var els;

  var STATIONS = [
    { id: 'quran_cairo', name: 'القرآن الكريم من القاهرة', url: 'https://stream.radiojar.com/8s5u5tpdtwzuv' },
    { id: 'sharawy_tafsir', name: 'تفسير الشيخ الشعراوي', url: 'https://serverkw.quran-uni.com:8202/;*.mp3' },
    { id: 'mustafa_ismail', name: 'مصطفى إسماعيل', url: 'https://qurango.net/radio/mustafa_ismail' }
  ];

  var radioPlayer = null;   // <audio> الخاص بالإذاعة فقط
  var radioStream = null;   // رابط البث الحالي
  var radioStation = STATIONS[0].id;
  // idle | connecting | playing — يمنع race condition عند إلغاء الاتصال أثناء play() المعلّق
  var radioState = 'idle';
  // رقم تسلسلي لكل محاولة تشغيل؛ أي playing/error متأخر من محاولة قديمة يُتجاهل
  var playGeneration = 0;
  // true عندما تكون هذه الوحدة هي مالكة navigator.mediaSession handlers
  // (Android Media Notification / lock screen). يُعاد false عند الإيقاف
  // الكامل حتى يستعيد AudioManager الملكية عند تشغيل التلاوة.
  var mediaSessionOwner = false;

  function stationById(id){
    for(var i = 0; i < STATIONS.length; i++){
      if(STATIONS[i].id === id) return STATIONS[i];
    }
    return STATIONS[0];
  }

  function mediaSessionSupported(){
    return typeof navigator !== 'undefined' && 'mediaSession' in navigator && typeof MediaMetadata !== 'undefined';
  }

  function clearMediaSessionHandlers(){
    if(!mediaSessionSupported()) return;
    try{
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('stop', null);
    }catch(e){ /* older browsers may reject null — ignore */ }
  }

  // تحرير Media Session بالكامل بعد إيقاف الإذاعة (لا تبقى مسيطرة).
  function releaseMediaSession(){
    if(!mediaSessionSupported()) return;
    try{ navigator.mediaSession.playbackState = 'none'; }catch(e){}
    if(mediaSessionOwner){
      clearMediaSessionHandlers();
      mediaSessionOwner = false;
    }
  }

  // تسجيل RadioPlayer كمالك وحيد لـ Media Session أثناء بث الإذاعة.
  // يستبدل أي handlers سابقة (مثل AudioManager) حتى يعمل Pause من
  // Android notification على الإذاعة وليس على عنصر تلاوة الآيات.
  function claimMediaSession(playbackState){
    if(!mediaSessionSupported()) return;
    try{
      var station = stationById(radioStation);
      navigator.mediaSession.metadata = new MediaMetadata({
        title: station.name,
        artist: 'الإذاعة القرآنية',
        album: 'مصحف الركوع'
      });
      navigator.mediaSession.playbackState = playbackState || 'playing';
      navigator.mediaSession.setActionHandler('play', function(){
        if(radioState === 'playing' || radioState === 'connecting') return;
        startRadioPlayback();
      });
      navigator.mediaSession.setActionHandler('pause', function(){
        if(radioState === 'idle') return;
        // Pause فقط — لا hardStop (لا إزالة src) حتى تبقى
        // Android Media Notification ظاهرة مع زر Play.
        softPause();
      });
      navigator.mediaSession.setActionHandler('stop', function(){
        playGeneration++;
        hardStop();
      });
      mediaSessionOwner = true;
    }catch(e){ /* non-fatal — البث يستمر بدون إشعار النظام */ }
  }

  function setStatus(kind, text){
    if(!els.radioStatusText || !els.radioStatusDot) return;
    els.radioStatusText.textContent = text;
    els.radioStatusDot.classList.toggle('live', kind === 'live');
    els.radioStatusDot.classList.toggle('error', kind === 'error');
  }

  function setPlayingUI(playing){
    if(els.radioIconPlay) els.radioIconPlay.classList.toggle('hidden', playing);
    if(els.radioIconPause) els.radioIconPause.classList.toggle('hidden', !playing);
    if(els.radioPlayPauseLabel) els.radioPlayPauseLabel.textContent = playing ? 'إيقاف' : 'تشغيل';
    if(els.radioPlayPauseBtn) els.radioPlayPauseBtn.setAttribute('aria-label', playing ? 'إيقاف الإذاعة' : 'تشغيل الإذاعة');
  }

  // يهيّئ محطة جديدة دون تشغيلها — يوقف الحالية، يبدّل الرابط، يجهّز
  // الجديدة، وينتظر ضغط المستخدم على تشغيل (كما هو مطلوب بالضبط).
  function prepareStation(stationId, opts){
    var station = stationById(stationId);
    radioStation = station.id;
    radioStream = station.url;

    playGeneration++; // ألغِ أي محاولة اتصال سابقة
    if(radioPlayer){
      radioPlayer.pause();
      radioPlayer.src = radioStream;
      radioPlayer.load();
    }
    radioState = 'idle';
    setPlayingUI(false);
    // تبديل المحطة يوقف البث — حرّر Media Session إن كانت مملوكة
    releaseMediaSession();
    if(!opts || !opts.silent){
      setStatus('idle', 'اضغط تشغيل للبدء');
    }
  }

  function ensurePlayer(){
    if(radioPlayer) return radioPlayer;
    radioPlayer = new Audio();
    radioPlayer.preload = 'none';

    radioPlayer.addEventListener('waiting', function(){
      if(radioState === 'playing' || radioState === 'connecting'){
        setStatus('connecting', 'جاري الاتصال…');
      }
    });
    radioPlayer.addEventListener('playing', function(){
      // تجاهل أي playing متأخر من محاولة أُلغيت (إيقاف أثناء connecting)
      if(radioState !== 'connecting' && radioState !== 'playing') return;
      radioState = 'playing';
      setPlayingUI(true);
      setStatus('live', '● بث مباشر');
      claimMediaSession('playing');
    });
    radioPlayer.addEventListener('pause', function(){
      // يُطلق أيضًا عند pause() الصريح أثناء تبديل المحطة أو الإيقاف،
      // لكننا نضبط الحالة في stop/toggle صراحةً؛ نتجاهل pause أثناء connecting
      // حتى لا يُعاد الزر إلى «تشغيل» قبل أن يكتمل الإلغاء.
      if(radioState === 'connecting') return;
      if(radioState === 'playing'){
        radioState = 'idle';
        setPlayingUI(false);
      }
    });
    radioPlayer.addEventListener('error', function(){
      // تجاهل أخطاء محاولة أُلغيت (مثل إزالة src أثناء connecting)
      if(radioState !== 'connecting' && radioState !== 'playing') return;
      radioState = 'idle';
      setPlayingUI(false);
      setStatus('error', 'تعذّر الاتصال بالبث، حاول مرة أخرى');
      releaseMediaSession();
    });
    return radioPlayer;
  }

  // Pause من Android Media Notification: يوقف الصوت دون فصل الـsrc ودون
  // تحرير Media Session — حتى تبقى الـNotification ظاهرة وزر Play يعمل.
  // لا يستدعي removeAttribute('src') / load() / releaseMediaSession().
  function softPause(){
    playGeneration++; // ألغِ أي playing متأخر من محاولة سابقة
    if(radioPlayer){
      radioPlayer.pause();
    }
    radioState = 'idle';
    setPlayingUI(false);
    setStatus('idle', 'متوقف مؤقتًا');
    if(mediaSessionSupported()){
      try{ navigator.mediaSession.playbackState = 'paused'; }catch(e){}
    }
    // أبقِ metadata + handlers + mediaSessionOwner كما هي
  }

  // Stop حقيقي: فصل الاتصال بالكامل + تحرير Media Session.
  // يُستخدم من زر التطبيق، stop() للـmutual exclusion، وتغيير المحطة.
  function hardStop(){
    if(radioPlayer){
      radioPlayer.pause();
      radioPlayer.removeAttribute('src');
      radioPlayer.load();
    }
    radioState = 'idle';
    setPlayingUI(false);
    setStatus('idle', 'اضغط تشغيل للبدء');
    releaseMediaSession();
  }

  // يبدأ البث (بعد mutual exclusion). يُستدعى من زر التطبيق ومن
  // Media Session play بعد Pause من الإشعار.
  // عند الاستئناف بعد softPause يُعاد تعيين src + load للاتصال من
  // اللحظة الحيّة بدل buffer قديم.
  function startRadioPlayback(){
    ensurePlayer();
    if(!radioStream){
      prepareStation(radioStation, { silent: true });
    }
    // Mutual exclusion: only one audio source may play. Stop Quran
    // recitation before radio playback starts. No call back to
    // RadioPlayer from here — avoids recursion with stopListening().
    if(window.AudioManager && typeof AudioManager.stopListening === 'function'){
      AudioManager.stopListening();
    }
    var gen = ++playGeneration;
    radioState = 'connecting';
    // فورًا: جاري الاتصال… + زر إيقاف + أيقونة الإيقاف
    setPlayingUI(true);
    setStatus('connecting', 'جاري الاتصال…');
    // املأ الإشعار أثناء الاتصال حتى يظهر Pause فورًا على Android
    claimMediaSession('playing');
    // إعادة src يضمن live edge بعد softPause (لا buffer قديم)
    radioPlayer.src = radioStream;
    radioPlayer.load();
    var playResult = radioPlayer.play();
    if(playResult && typeof playResult.catch === 'function'){
      playResult.catch(function(){
        // تجاهل رفض play() إن أُلغيت المحاولة (إيقاف أثناء connecting)
        if(gen !== playGeneration || radioState !== 'connecting') return;
        radioState = 'idle';
        setPlayingUI(false);
        setStatus('error', 'تعذّر الاتصال بالبث، حاول مرة أخرى');
        releaseMediaSession();
      });
    }
  }

  function togglePlayPause(){
    ensurePlayer();
    if(!radioStream){
      prepareStation(radioStation, { silent: true });
    }
    if(radioState === 'playing' || radioState === 'connecting'){
      // إيقاف حقيقي أو إلغاء محاولة الاتصال: بث حيّ بلا seek، فـ pause()
      // وحدها تُبقي الـbuffer؛ إزالة src + load تفتح اتصالًا جديدًا لاحقًا
      // من اللحظة الحيّة. playGeneration يمنع أي playing متأخر من إعادة
      // الحالة إلى بث مباشر.
      playGeneration++;
      hardStop();
      return;
    }
    startRadioPlayback();
  }

  // يوقف الإذاعة برمجيًا (Mutual Exclusion مع تلاوة القرآن في
  // AudioManager) — لا يستدعي AudioManager بأي شكل، تجنبًا لأي recursion
  // بين الطرفين. لا تأثير له إن كانت الإذاعة متوقفة أصلًا.
  // يحرّر Media Session حتى يستعيد AudioManager الملكية عند تشغيل التلاوة.
  function stop(){
    if(!radioPlayer || radioState === 'idle'){
      // حتى لو كانت متوقفة، حرّر الملكية إن بقيت من Pause عبر الإشعار
      if(mediaSessionOwner) releaseMediaSession();
      return;
    }
    playGeneration++;
    hardStop();
  }

  function onStationChange(){
    if(!els.radioStationSelect) return;
    prepareStation(els.radioStationSelect.value);
  }

  function init(deps){
    els = deps.els;
    if(!els.radioPlayPauseBtn || !els.radioStationSelect) return;

    ensurePlayer();
    prepareStation(els.radioStationSelect.value || radioStation, { silent: true });
    setStatus('idle', 'اضغط تشغيل للبدء');

    els.radioPlayPauseBtn.addEventListener('click', togglePlayPause);
    els.radioStationSelect.addEventListener('change', onStationChange);
  }

  window.RadioPlayer = {
    init: init,
    stop: stop
  };
})();
