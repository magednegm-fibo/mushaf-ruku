(function(){
  'use strict';

  var PAGES = window.JUZ_PAGES || window.JUZ_AMMA_PAGES || [];
  var JUZ_INFO = window.JUZ_INFO || {name: 'جزء عمّ', shortName: 'جزء عمّ', rukuCount: PAGES.length, ayahCount: 0};
  var STORAGE_KEY = 'juzamma_v1';
  var FAV_KEY = 'quranRuku_favorites_v1';

  var state = loadState();
  var favorites = loadFavorites();
  var pendingFavPage = null;

  var els = {
    pageScroll: document.getElementById('pageScroll'),
    surahCartouche: document.getElementById('surahCartouche'),
    ayahFlow: document.getElementById('ayahFlow'),
    rukuLabel: document.getElementById('rukuLabel'),
    pageIndicator: document.getElementById('pageIndicator'),
    pageSubtitle: document.getElementById('pageSubtitle'),
    btnPrev: document.getElementById('btnPrev'),
    btnNext: document.getElementById('btnNext'),
    btnIndex: document.getElementById('btnIndex'),
    btnCloseIndex: document.getElementById('btnCloseIndex'),
    indexPanel: document.getElementById('indexPanel'),
    indexList: document.getElementById('indexList'),
    btnSettings: document.getElementById('btnSettings'),
    btnCloseSettings: document.getElementById('btnCloseSettings'),
    settingsPanel: document.getElementById('settingsPanel'),
    fontMinus: document.getElementById('fontMinus'),
    fontPlus: document.getElementById('fontPlus'),
    fontSizeLabel: document.getElementById('fontSizeLabel'),
    nightToggle: document.getElementById('nightToggle'),

    homeScreen: document.getElementById('homeScreen'),
    readerScreen: document.getElementById('readerScreen'),
    btnHome: document.getElementById('btnHome'),
    btnContinue: document.getElementById('btnContinue'),
    homeProgressFill: document.getElementById('homeProgressFill'),
    homeProgressPercent: document.getElementById('homeProgressPercent'),
    homeProgressText: document.getElementById('homeProgressText'),
    stripFill: document.getElementById('stripFill'),
    settingsProgress: document.getElementById('settingsProgress'),
    btnResetProgress: document.getElementById('btnResetProgress'),

    tileSurah: document.getElementById('tileSurah'),
    tileJuz: document.getElementById('tileJuz'),
    tileSearch: document.getElementById('tileSearch'),
    tileFavorites: document.getElementById('tileFavorites'),
    tileSettings: document.getElementById('tileSettings'),

    surahPanel: document.getElementById('surahPanel'),
    surahList: document.getElementById('surahList'),
    btnCloseSurah: document.getElementById('btnCloseSurah'),

    juzPanel: document.getElementById('juzPanel'),
    juzList: document.getElementById('juzList'),
    btnCloseJuz: document.getElementById('btnCloseJuz'),

    searchPanel: document.getElementById('searchPanel'),
    searchInput: document.getElementById('searchInput'),
    searchResults: document.getElementById('searchResults'),
    btnCloseSearch: document.getElementById('btnCloseSearch'),

    favoritesPanel: document.getElementById('favoritesPanel'),
    favoritesList: document.getElementById('favoritesList'),
    btnCloseFavorites: document.getElementById('btnCloseFavorites'),

    btnFavorite: document.getElementById('btnFavorite'),
    favModal: document.getElementById('favModal'),
    favNameInput: document.getElementById('favNameInput'),
    favModalCancel: document.getElementById('favModalCancel'),
    favModalSave: document.getElementById('favModalSave')
  };

  var ARABIC_DIGITS = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
  function toArabicDigits(n){
    return String(n).split('').map(function(c){
      return /[0-9]/.test(c) ? ARABIC_DIGITS[+c] : c;
    }).join('');
  }

  function loadState(){
    try{
      var raw = localStorage.getItem(STORAGE_KEY);
      if(raw) return Object.assign({page:0, fontSize:28, night:false, furthest:0, fontStyle:'amiri'}, JSON.parse(raw));
    }catch(e){}
    return {page:0, fontSize:28, night:false, furthest:0, fontStyle:'amiri'};
  }
  function saveState(){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){}
  }

  function loadFavorites(){
    try{
      var raw = localStorage.getItem(FAV_KEY);
      if(raw) return JSON.parse(raw);
    }catch(e){}
    return [];
  }
  function saveFavorites(){
    try{ localStorage.setItem(FAV_KEY, JSON.stringify(favorites)); }catch(e){}
  }

  function ayahMarker(surah, ayah){
    var num = toArabicDigits(ayah);
    return '<span class="ayah-num" aria-hidden="false">' +
      '<svg viewBox="0 0 40 40"><path d="M20 2 L23 10 L31 6 L27 14 L36 15 L28 20 L36 25 L27 26 L31 34 L23 30 L20 38 L17 30 L9 34 L13 26 L4 25 L12 20 L4 15 L13 14 L9 6 L17 10 Z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>' +
      '<span>' + num + '</span></span>';
  }

  function progressRatio(){
    var reached = Math.max(state.furthest || 0, state.page || 0) + 1;
    return Math.min(1, reached / PAGES.length);
  }
  function updateProgressUI(){
    var ratio = progressRatio();
    var pct = Math.round(ratio * 100);
    var reachedCount = Math.max(state.furthest || 0, state.page || 0) + 1;
    if(els.homeProgressFill) els.homeProgressFill.style.width = pct + '%';
    if(els.homeProgressPercent) els.homeProgressPercent.textContent = toArabicDigits(pct) + '٪';
    if(els.homeProgressText) els.homeProgressText.textContent = 'قرأ ' + toArabicDigits(reachedCount) + ' من ' + toArabicDigits(PAGES.length) + ' ركوعًا';
    if(els.stripFill) els.stripFill.style.width = (((state.page||0)+1)/PAGES.length*100) + '%';
    if(els.settingsProgress) els.settingsProgress.textContent = toArabicDigits(pct) + '٪';
  }

  function isFavorited(pageIdx){
    return favorites.some(function(f){ return f.page === pageIdx; });
  }
  function updateFavButton(){
    if(!els.btnFavorite) return;
    els.btnFavorite.classList.toggle('active', isFavorited(state.page));
  }

  function render(){
    var idx = state.page;
    var p = PAGES[idx];
    if(!p) return;

    if(idx > (state.furthest || 0)) state.furthest = idx;

    var names = p.surahNames.join(' \u2014 ');
    els.surahCartouche.innerHTML = '<span>سورة</span><b>' + names + '</b>';

    var html = '';
    var lastSurah = null;
    p.ayahs.forEach(function(a){
      if(lastSurah !== null && a.surah !== lastSurah){
        html += '<br><br>';
      }
      if(a.juzStart){
        html += '<span class="juz-marker">بداية الجزء ' + toArabicDigits(a.juzStart) + '</span>';
      }
      html += a.text + ' ' + ayahMarker(a.surah, a.ayah) + ' ';
      lastSurah = a.surah;
    });
    els.ayahFlow.innerHTML = html;

    var rukuMarkSpan = document.querySelector('#rukuEnd .ruku-mark span');
    if(JUZ_INFO.fullMushaf){
      els.rukuLabel.textContent = 'نهاية الركوع رقم ' + toArabicDigits(p.ruku) + ' من ' + toArabicDigits(PAGES.length) + ' \u2022 الجزء ' + toArabicDigits(p.juz);
      document.getElementById('rukuEnd').classList.remove('incomplete');
      if(rukuMarkSpan) rukuMarkSpan.textContent = 'ع';
    } else {
      els.rukuLabel.textContent = 'نهاية الركوع رقم ' + toArabicDigits(p.rukuInJuz) + ' من ' + (window.JUZ_INFO ? window.JUZ_INFO.name : 'الجزء');
      if(p.rukuComplete === false){
        document.getElementById('rukuEnd').classList.add('incomplete');
        if(rukuMarkSpan) rukuMarkSpan.textContent = '⋯';
        els.rukuLabel.textContent = 'ينتهي ' + (window.JUZ_INFO ? window.JUZ_INFO.name : 'الجزء') + ' هنا \u2014 وتكتمل بقية هذا الركوع في الجزء التالي';
      } else {
        document.getElementById('rukuEnd').classList.remove('incomplete');
        if(rukuMarkSpan) rukuMarkSpan.textContent = 'ع';
      }
    }
    els.pageIndicator.textContent = toArabicDigits(idx+1) + ' / ' + toArabicDigits(PAGES.length);
    els.pageSubtitle.textContent = names + ' \u2022 صفحة ' + toArabicDigits(idx+1);

    els.btnPrev.disabled = idx <= 0;
    els.btnNext.disabled = idx >= PAGES.length - 1;

    els.pageScroll.scrollTop = 0;
    updateFavButton();
    updateProgressUI();
    saveState();
  }

  function goTo(i){
    if(i < 0 || i >= PAGES.length) return;
    state.page = i;
    render();
  }

  function showReader(){
    els.homeScreen.classList.add('hidden');
    els.readerScreen.classList.remove('hidden');
  }
  function showHome(){
    updateProgressUI();
    els.readerScreen.classList.add('hidden');
    els.homeScreen.classList.remove('hidden');
  }
  function openReaderAt(i){
    showReader();
    goTo(i);
  }

  els.btnPrev.addEventListener('click', function(){ goTo(state.page - 1); });
  els.btnNext.addEventListener('click', function(){ goTo(state.page + 1); });
  els.btnHome.addEventListener('click', showHome);
  els.btnContinue.addEventListener('click', function(){ openReaderAt(state.page || 0); });

  (function swipe(){
    var startX = null, startY = null;
    var frame = document.querySelector('.page-frame');
    frame.addEventListener('touchstart', function(e){
      var t = e.touches[0];
      startX = t.clientX; startY = t.clientY;
    }, {passive:true});
    frame.addEventListener('touchend', function(e){
      if(startX === null) return;
      var t = e.changedTouches[0];
      var dx = t.clientX - startX;
      var dy = t.clientY - startY;
      if(Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5){
        if(dx < 0) goTo(state.page + 1);
        else goTo(state.page - 1);
      }
      startX = null; startY = null;
    }, {passive:true});
  })();

  document.addEventListener('keydown', function(e){
    if(els.readerScreen.classList.contains('hidden')) return;
    if(e.key === 'ArrowLeft') goTo(state.page + 1);
    if(e.key === 'ArrowRight') goTo(state.page - 1);
  });

  function buildIndex(){
    var html = '';
    var lastJuz = null;
    PAGES.forEach(function(p, i){
      var firstName = p.ayahs[0].surahName;
      var firstAyah = p.ayahs[0].ayah;
      if(JUZ_INFO.fullMushaf && p.juz !== lastJuz){
        html += '<div class="juz-header">الجزء ' + toArabicDigits(p.juz) + '</div>';
        lastJuz = p.juz;
      }
      var rukuLabelNum = JUZ_INFO.fullMushaf ? p.ruku : p.rukuInJuz;
      html += '<div class="index-item" data-idx="'+i+'">' +
        '<div class="index-item-inner">' +
          '<span class="num">' + toArabicDigits(i+1) + '</span>' +
          '<div><div class="name">' + firstName + '</div>' +
          '<div class="meta">يبدأ من الآية ' + toArabicDigits(firstAyah) + ' \u2022 الركوع ' + toArabicDigits(rukuLabelNum) + '</div></div>' +
        '</div>' +
      '</div>';
    });
    els.indexList.innerHTML = html;
    els.indexList.querySelectorAll('.index-item').forEach(function(el){
      el.addEventListener('click', function(){
        goTo(parseInt(el.getAttribute('data-idx'), 10));
        closePanel(els.indexPanel);
      });
    });
  }

  function openPanel(p){ p.classList.remove('hidden'); }
  function closePanel(p){ p.classList.add('hidden'); }

  els.btnIndex.addEventListener('click', function(){ openPanel(els.indexPanel); });
  els.btnCloseIndex.addEventListener('click', function(){ closePanel(els.indexPanel); });
  els.btnSettings.addEventListener('click', function(){ openPanel(els.settingsPanel); });
  els.btnCloseSettings.addEventListener('click', function(){ closePanel(els.settingsPanel); });
  els.tileSettings.addEventListener('click', function(){ openPanel(els.settingsPanel); });

  function applyFontSize(){
    document.documentElement.style.setProperty('--ayah-size', state.fontSize + 'px');
    els.fontSizeLabel.textContent = state.fontSize;
  }
  els.fontMinus.addEventListener('click', function(){
    state.fontSize = Math.max(18, state.fontSize - 2);
    applyFontSize(); saveState();
  });
  els.fontPlus.addEventListener('click', function(){
    state.fontSize = Math.min(44, state.fontSize + 2);
    applyFontSize(); saveState();
  });

  function applyFontStyle(){
    var family = state.fontStyle === 'uthmani'
      ? "'Uthmanic Hafs', 'Amiri Quran', 'Noto Naskh Arabic', serif"
      : "'Amiri Quran', 'Noto Naskh Arabic', serif";
    document.documentElement.style.setProperty('--font-quran', family);
    document.body.classList.toggle('uthmani-font', state.fontStyle === 'uthmani');
    var btnAmiri = document.getElementById('btnFontAmiri');
    var btnUthmani = document.getElementById('btnFontUthmani');
    if(btnAmiri) btnAmiri.classList.toggle('active', state.fontStyle !== 'uthmani');
    if(btnUthmani) btnUthmani.classList.toggle('active', state.fontStyle === 'uthmani');
  }
  var btnFontAmiri = document.getElementById('btnFontAmiri');
  var btnFontUthmani = document.getElementById('btnFontUthmani');
  if(btnFontAmiri) btnFontAmiri.addEventListener('click', function(){
    state.fontStyle = 'amiri'; applyFontStyle(); saveState();
  });
  if(btnFontUthmani) btnFontUthmani.addEventListener('click', function(){
    state.fontStyle = 'uthmani'; applyFontStyle(); saveState();
  });

  function applyNight(){
    document.body.classList.toggle('night', !!state.night);
    els.nightToggle.checked = !!state.night;
  }
  els.nightToggle.addEventListener('change', function(){
    state.night = els.nightToggle.checked;
    applyNight(); saveState();
  });

  els.btnResetProgress.addEventListener('click', function(){
    state.furthest = state.page || 0;
    updateProgressUI();
    saveState();
  });

  var surahJumpMap = {};
  var surahOrder = [];
  (function buildSurahMap(){
    PAGES.forEach(function(p, i){
      p.ayahs.forEach(function(a){
        if(a.ayah === 1 && !(a.surah in surahJumpMap)){
          surahJumpMap[a.surah] = i;
          surahOrder.push({surah: a.surah, name: a.surahName, page: i});
        }
      });
    });
    surahOrder.sort(function(a,b){ return a.surah - b.surah; });
  })();

  function renderSurahList(list, container){
    if(!list.length){
      container.innerHTML = '<div class="empty-state">لا توجد نتائج</div>';
      return;
    }
    var html = list.map(function(s){
      return '<div class="index-item" data-page="'+s.page+'">' +
        '<div class="index-item-inner">' +
          '<span class="num">' + toArabicDigits(s.surah) + '</span>' +
          '<div class="name">' + s.name + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
    container.innerHTML = html;
    container.querySelectorAll('.index-item').forEach(function(el){
      el.addEventListener('click', function(){
        openReaderAt(parseInt(el.getAttribute('data-page'), 10));
        closePanel(els.surahPanel);
        closePanel(els.searchPanel);
      });
    });
  }

  els.tileSurah.addEventListener('click', function(){
    renderSurahList(surahOrder, els.surahList);
    openPanel(els.surahPanel);
  });
  els.btnCloseSurah.addEventListener('click', function(){ closePanel(els.surahPanel); });

  els.tileJuz && els.tileJuz.addEventListener('click', function(){
    var juzJumpMap = {};
    var order = [];
    PAGES.forEach(function(p, i){
      if(JUZ_INFO.fullMushaf && !(p.juz in juzJumpMap)){
        juzJumpMap[p.juz] = i;
        order.push({juz: p.juz, page: i, name: p.ayahs[0].surahName});
      }
    });
    var html = order.map(function(j){
      return '<div class="index-item" data-page="'+j.page+'">' +
        '<div class="index-item-inner">' +
          '<span class="num">' + toArabicDigits(j.juz) + '</span>' +
          '<div><div class="name">الجزء ' + toArabicDigits(j.juz) + '</div>' +
          '<div class="meta">يبدأ من سورة ' + j.name + '</div></div>' +
        '</div>' +
      '</div>';
    }).join('');
    els.juzList.innerHTML = html || '<div class="empty-state">غير متاح</div>';
    els.juzList.querySelectorAll('.index-item').forEach(function(el){
      el.addEventListener('click', function(){
        openReaderAt(parseInt(el.getAttribute('data-page'), 10));
        closePanel(els.juzPanel);
      });
    });
    openPanel(els.juzPanel);
  });
  els.btnCloseJuz.addEventListener('click', function(){ closePanel(els.juzPanel); });

  els.tileSearch.addEventListener('click', function(){
    els.searchInput.value = '';
    renderSurahList(surahOrder, els.searchResults);
    openPanel(els.searchPanel);
    setTimeout(function(){ els.searchInput.focus(); }, 200);
  });
  els.btnCloseSearch.addEventListener('click', function(){ closePanel(els.searchPanel); });
  els.searchInput.addEventListener('input', function(){
    var q = els.searchInput.value.trim();
    if(!q){ renderSurahList(surahOrder, els.searchResults); return; }
    var filtered = surahOrder.filter(function(s){ return s.name.indexOf(q) !== -1; });
    renderSurahList(filtered, els.searchResults);
  });

  function renderFavorites(){
    if(!favorites.length){
      els.favoritesList.innerHTML = '<div class="empty-state">لا توجد عناصر في المفضلة بعد.<br>اضغط على النجمة أثناء القراءة لإضافة ركوع.</div>';
      return;
    }
    var sorted = favorites.slice().sort(function(a,b){ return b.ts - a.ts; });
    els.favoritesList.innerHTML = sorted.map(function(f){
      var p = PAGES[f.page];
      var surahName = p ? p.ayahs[0].surahName : '';
      var ayahNum = p ? p.ayahs[0].ayah : '';
      return '<div class="fav-item" data-page="'+f.page+'">' +
        '<div class="fav-info">' +
          '<div class="fav-title">' + (f.label || surahName) + '</div>' +
          '<div class="fav-sub">' + surahName + ' \u2022 آية ' + toArabicDigits(ayahNum) + '</div>' +
        '</div>' +
        '<button class="fav-remove" data-remove="'+f.page+'">' +
          '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6l-12 12"/></svg>' +
        '</button>' +
      '</div>';
    }).join('');
    els.favoritesList.querySelectorAll('.fav-info').forEach(function(el){
      el.addEventListener('click', function(){
        var page = parseInt(el.parentElement.getAttribute('data-page'), 10);
        openReaderAt(page);
        closePanel(els.favoritesPanel);
      });
    });
    els.favoritesList.querySelectorAll('.fav-remove').forEach(function(el){
      el.addEventListener('click', function(e){
        e.stopPropagation();
        var page = parseInt(el.getAttribute('data-remove'), 10);
        favorites = favorites.filter(function(f){ return f.page !== page; });
        saveFavorites();
        renderFavorites();
        updateFavButton();
      });
    });
  }

  els.tileFavorites.addEventListener('click', function(){
    renderFavorites();
    openPanel(els.favoritesPanel);
  });
  els.btnCloseFavorites.addEventListener('click', function(){ closePanel(els.favoritesPanel); });

  els.btnFavorite.addEventListener('click', function(){
    if(isFavorited(state.page)){
      favorites = favorites.filter(function(f){ return f.page !== state.page; });
      saveFavorites();
      updateFavButton();
      return;
    }
    pendingFavPage = state.page;
    els.favNameInput.value = '';
    els.favModal.classList.remove('hidden');
    setTimeout(function(){ els.favNameInput.focus(); }, 150);
  });

  function saveFavoriteFromModal(){
    if(pendingFavPage === null) return;
    var label = els.favNameInput.value.trim();
    favorites.push({page: pendingFavPage, label: label, ts: Date.now()});
    saveFavorites();
    updateFavButton();
    els.favModal.classList.add('hidden');
    pendingFavPage = null;
  }
  els.favModalSave.addEventListener('click', saveFavoriteFromModal);
  els.favNameInput.addEventListener('keydown', function(e){
    if(e.key === 'Enter') saveFavoriteFromModal();
  });
  els.favModalCancel.addEventListener('click', function(){
    els.favModal.classList.add('hidden');
    pendingFavPage = null;
  });

  document.getElementById('eyebrowText') && (document.getElementById('eyebrowText').textContent = JUZ_INFO.shortName);
  document.title = JUZ_INFO.fullMushaf ? JUZ_INFO.name : (JUZ_INFO.name + ' — بالركوعات');
  var rukuCountEl = document.getElementById('rukuCount');
  var ayahCountEl = document.getElementById('ayahCount');
  var aboutTextEl = document.getElementById('aboutText');
  if (rukuCountEl) rukuCountEl.textContent = toArabicDigits(PAGES.length) + ' ركوعًا';
  if (ayahCountEl) ayahCountEl.textContent = toArabicDigits(JUZ_INFO.ayahCount) + ' آية';
  if (aboutTextEl) aboutTextEl.textContent = JUZ_INFO.fullMushaf
    ? 'كل صفحة في هذا التطبيق تمثّل ركوعًا واحدًا كاملًا كما تحدّده علامات الركوع (ع) في المصحف الشريف، من الفاتحة إلى الناس (٥٥٦ ركوعًا). بداية كل جزء من الأجزاء الثلاثين مُشار إليها داخل النص. النص من مصحف حفص عن عاصم برواية Tanzil / QPC.'
    : 'كل صفحة في هذا التطبيق تمثّل ركوعًا واحدًا كاملًا كما تحدّده علامات الركوع (ع) في المصحف الشريف، ضمن ' + JUZ_INFO.name + '. النص من مصحف حفص عن عاصم برواية Tanzil / QPC.';

  if(!JUZ_INFO.fullMushaf && els.tileJuz){
    els.tileJuz.classList.add('hidden');
  }

  applyFontSize();
  applyFontStyle();
  applyNight();
  buildIndex();
  updateProgressUI();

  if('serviceWorker' in navigator){
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('sw.js').catch(function(){});
    });
  }
})();
