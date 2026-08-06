// Navigation: every way of jumping to a specific ruku — the ruku index
// (فهرس), the surah index, the juz index, text search, the "go to ruku
// number" dialog, and the swipe/pinch touch gestures on the page itself
// (swipe to turn pages, pinch to zoom the font size).
// Loaded before app.js (see index.html). Call Navigation.init(deps) once;
// deps: els, state, PAGES, JUZ_INFO, UI, Dialogs, Home, Settings,
//       AudioManager, ReaderManager, saveState
// Exposed as window.Navigation.
(function(){
  'use strict';

  var els, state, PAGES, JUZ_INFO, UI, Dialogs, Home, Settings, AudioManager, ReaderManager, saveState;

  // ===================================================================
  // Ruku index (الفهرس)
  // ===================================================================
  var indexBuilt = false;
  // Pure row-computation for الفهرس, split out from buildIndex() so it's
  // testable without a DOM (see tests/navigation-regression.js "N6").
  // Returns an ordered array of row descriptors:
  //   {type:'header', juz}
  //   {type:'item', startIdx, endIdx, name, ayah, ruku}
  // In the full-mushaf scope (نطاق العرض = الكل), رأس كل جزء يبان، وتحت كل
  // جزء أول ركوع بس لكل سورة بيظهر كصف مستقل — أركان نفس السورة المتتالية
  // داخل نفس الجزء (زي أركان البقرة الـ١٦ في الأجزاء ١-٣) بتتجمع في نفس
  // صف الأول بدل تكرار اسم السورة ١٦ مرة. لسه كل ركوع قابل للوصول ولإبراز
  // current: كل صف بيسجّل startIdx/endIdx (نطاق أركانه)، مش مجرد ركوع
  // واحد، والدالة highlightAndScrollIndexToCurrent بتدوّر بالنطاق مش
  // بمطابقة رقم واحد بالظبط.
  // كلمات ترتيب الأرباع الثمانية (١-٨) — نفس أسلوب MANZIL_ORDINALS تحت،
  // بس لمصفوفة أطول (كل جزء ٨ أرباع بدل ٧ منازل في المصحف كله).
  var QUARTER_ORDINALS = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن'];
  // نطاق العرض = "الجزء الحالي": بدل سرد كل ركوع في الجزء (اللي كان ممكن
  // يكرر اسم السورة زي المشكلة اللي اتصلحت في نطاقي الكل والمنزل)، الجزء
  // بطبيعته بينقسم لثمانية أرباع تقليدية (رُبع الحزب) — مش بالضرورة على
  // حدود الركوعات، فكل ربع بيتحسب من نقطة بدايته الحقيقية (سورة:آية) في
  // window.RUB_STARTS (rub-info.js)، مش من أول ركوع فيه. بيرجع صف واحد
  // لكل ربع من الثمانية اللي جوه الجزء الحالي بس (الأرباع رقم
  // (juz-1)*8+1 لغاية juz*8، بترتيب عالمي ثابت — كل جزء ٨ أرباع متتالية
  // غير متداخلة، اتأكدنا من كده في rub-info.js).
  function computeJuzQuarterRows(PAGES, juzNum){
    if(!window.RUB_STARTS || !window.ReaderManager || typeof window.ReaderManager.findPageIndexForAyah !== 'function'){
      return [];
    }
    var lastPageIdxOfJuz = -1;
    for(var i = PAGES.length - 1; i >= 0; i--){
      if(PAGES[i].juz === juzNum){ lastPageIdxOfJuz = i; break; }
    }
    if(lastPageIdxOfJuz === -1) return [];

    var firstGlobalRub = (juzNum - 1) * 8; // 0-based index into RUB_STARTS
    var starts = [];
    for(var q = 0; q < 8; q++){
      var pair = window.RUB_STARTS[firstGlobalRub + q];
      if(!pair) continue;
      var pageIdx = window.ReaderManager.findPageIndexForAyah(pair[0], pair[1]);
      if(pageIdx === -1) continue;
      starts.push({ordinal: q + 1, surah: pair[0], ayah: pair[1], startIdx: pageIdx});
    }
    return starts.map(function(s, idx){
      var nextStartIdx = (idx + 1 < starts.length) ? starts[idx + 1].startIdx : null;
      var endIdx = (nextStartIdx !== null) ? Math.max(s.startIdx, nextStartIdx - 1) : lastPageIdxOfJuz;
      // اسم السورة بيتاخد من نفس الآية اللي الربع بيبدأ عندها بالظبط
      // (s.surah/s.ayah) — مش من أول آية في الركوع (PAGES[s.startIdx]
      // .ayahs[0])، لأن حدود الأرباع مش بالضرورة على حدود الركوعات: لو
      // الربع بدأ في نص ركوع بيخص سورة تانية عن اللي بدأ بيها الركوع نفسه
      // (نادر لكن ممكن)، لازم اسم السورة الصحيح ده هو اللي يتاخد.
      var surahName = null;
      var pageAyahs = PAGES[s.startIdx].ayahs;
      for(var k = 0; k < pageAyahs.length; k++){
        if(pageAyahs[k].surah === s.surah && pageAyahs[k].ayah === s.ayah){
          surahName = pageAyahs[k].surahName;
          break;
        }
      }
      return {
        type: 'quarter',
        ordinal: s.ordinal,
        startIdx: s.startIdx,
        endIdx: endIdx,
        surah: s.surah,
        surahName: surahName,
        ayah: s.ayah,
        ruku: PAGES[s.startIdx].ruku
      };
    });
  }
  // ---------------------------------------------------------------------
  // "الذهاب إلى منزل رقم" — عند نطاق العرض = المنزل، زر "الذهاب إلى ركوع
  // رقم" (btnGoto) يتحول لأداة الذهاب إلى منزل رقم (١-٧) بدل رقم ركوع،
  // نفس فكرة تحوّل عنوان الفهرس (indexPanelTitleFor فوق) حسب النطاق. أول
  // ركوع في المنزل N هو أول ركوع في أول سورة منه (MANZIL_STARTS[N-1]),
  // آية ١ — نفس منطق computeJuzQuarterRows اللي بيستخدم
  // ReaderManager.findPageIndexForAyah لتحويل (سورة، آية) لرقم صفحة.
  // Pure/DOM-free على قصد — قابلة للاختبار مباشرة (tests N-manzil-goto).
  function findPageIndexForManzil(PAGES, manzilNum){
    if(!window.MANZIL_STARTS || !window.ReaderManager || typeof window.ReaderManager.findPageIndexForAyah !== 'function'){
      return -1;
    }
    var starts = window.MANZIL_STARTS;
    if(!manzilNum || manzilNum < 1 || manzilNum > starts.length) return -1;
    return window.ReaderManager.findPageIndexForAyah(starts[manzilNum - 1], 1);
  }
  // رقم المنزل الحالي (١-based) بناءً على سورة الصفحة الحالية — يُستخدم
  // كقيمة افتراضية لما مربع الإدخال يفتح، بنفس منطق indexPanelTitleFor.
  function currentManzilNumber(PAGES, state){
    var curPage = PAGES[state.page];
    if(!curPage || !window.MANZIL_STARTS || !window.getManzilRange) return 1;
    var range = window.getManzilRange(curPage.ayahs[0].surah);
    var idx = window.MANZIL_STARTS.indexOf(range.start);
    return idx > -1 ? idx + 1 : 1;
  }
  // ---------------------------------------------------------------------
  // "الذهاب إلى جزء رقم" — نفس فكرة findPageIndexForManzil فوق، بس لما
  // نطاق العرض = الجزء: زر "الذهاب إلى ركوع رقم" (btnGoto) يتحول لأداة
  // الذهاب إلى جزء رقم (١-٣٠). أول ركوع في الجزء N هو أول صفحة PAGES ليها
  // p.juz === N (PAGES مرتبة بالفعل بترتيب المصحف)، فمفيش داعي لـ
  // findPageIndexForAyah زي المنزل. Pure/DOM-free على قصد.
  function findPageIndexForJuz(PAGES, juzNum){
    if(!juzNum || juzNum < 1 || juzNum > 30) return -1;
    for(var i = 0; i < PAGES.length; i++){
      if(PAGES[i].juz === juzNum) return i;
    }
    return -1;
  }
  // رقم الجزء الحالي (١-based) بناءً على صفحة القارئ الحالية — قيمة
  // افتراضية لمربع الإدخال، بنفس منطق currentManzilNumber فوق.
  function currentJuzNumber(PAGES, state){
    var curPage = PAGES[state.page];
    return (curPage && curPage.juz) ? curPage.juz : 1;
  }
  // ---------------------------------------------------------------------
  // "الانتقال إلى سورة" — عند نطاق العرض = السورة الحالية، زر "الذهاب إلى
  // ركوع رقم" (btnGoto) يتحول لأداة الانتقال إلى سورة، بس مربع الإدخال
  // هنا بيقبل رقم السورة (١-١١٤) *أو* اسمها، على عكس أدوات المنزل/الجزء
  // فوق اللي بتقبل رقم بس — فمش ممكن نستخدم نفس مسار gotoModal الرقمي
  // الافتراضي (submitGotoModal في dialogs.js)، فبنمرر opts.resolveInput
  // مخصص بدل كده (شوف الشرح في dialogs.js).
  // الاسم بيتقارن بعد normalizeArabic (نفس البايبلاين المستخدم في بحث
  // السور — SearchManager.normalizeArabic) على *كامل* اسم السورة، مش
  // مطابقة جزئية زي searchSurahs()، عشان مدخل زي "النساء" ميرجعش أكتر من
  // نتيجة أو يتلخبط مع اسم تاني بيحتويه كجزء. Pure/DOM-free على قصد.
  function resolveSurahGotoInput(rawInput){
    if(!window.UI) return null;
    var trimmed = (rawInput || '').trim();
    if(!trimmed) return null;
    var western = window.UI.fromArabicDigits(trimmed);
    if(/^\d+$/.test(western)){
      var n = parseInt(western, 10);
      return (n >= 1 && n <= 114) ? n : null;
    }
    // Name match needs SearchManager (surah order + normalizeArabic) —
    // only the name branch depends on it, so a numeric entry above still
    // resolves fine even if SearchManager somehow isn't loaded.
    if(!window.SearchManager) return null;
    var norm = window.SearchManager.normalizeArabic(trimmed);
    var order = window.SearchManager.getSurahOrder();
    for(var i = 0; i < order.length; i++){
      if(window.SearchManager.normalizeArabic(order[i].name) === norm) return order[i].surah;
    }
    return null;
  }

  function computeIndexRows(PAGES, JUZ_INFO, state){
    var scope = state.displayScope || 'all';
    var curPage = PAGES[state.page];
    // نطاق "الجزء الحالي" له عرض مختلف تمامًا (٨ أرباع بحدودهم الحقيقية،
    // مش قائمة ركوعات) — يتفرّع هنا قبل منطق الفلترة العادي بالأسفل.
    if(scope === 'juz' && JUZ_INFO.fullMushaf && curPage){
      return computeJuzQuarterRows(PAGES, curPage.juz);
    }
    var onlySurah = null, onlyJuz = null, manzilRange = null;
    if(curPage && scope === 'surah'){
      onlySurah = curPage.ayahs[0].surah;
    } else if(curPage && scope === 'juz' && JUZ_INFO.fullMushaf){
      onlyJuz = curPage.juz;
    } else if(curPage && scope === 'manzil'){
      manzilRange = window.getManzilRange(curPage.ayahs[0].surah);
    }
    // رأس الجزء (الجزء N) بيبان بس في النطاق الكامل — في أي نطاق مُقيَّد
    // القائمة أصلًا صغيرة ومحصورة، فرأس الجزء مايضيفش حاجة.
    var showJuzHeaders = JUZ_INFO.fullMushaf && scope === 'all';
    // تجميع أركان نفس السورة المتتالية في صف واحد: مطلوب في النطاق الكامل
    // (لكل جزء على حدة، عبر رأس الجزء) وكمان في نطاق المنزل — منزل واحد
    // ممكن يحتوي على سورة طويلة زي البقرة (تبدأ من الفاتحة للنساء في
    // المنزل الأول) بعشرات الأركان، فمن غير تجميع هيتكرر اسمها في كل صف.
    // مفيش رؤوس جزء هنا فمفيش حاجة تصفّر lastSurahInJuz، فالتجميع بيمتد
    // على طول قائمة المنزل كلها — وده صح لأن كل سورة في نطاق منزل واحد
    // بتظهر مرة واحدة متصلة أصلًا (المنازل بتتقسم على حدود السور).
    var collapseBySurah = showJuzHeaders || scope === 'manzil';
    var rows = [];
    var lastJuz = null;
    var lastSurahInJuz = null;
    var curItem = null;
    PAGES.forEach(function(p, i){
      if(onlySurah !== null && p.ayahs[0].surah !== onlySurah) return;
      if(onlyJuz !== null && p.juz !== onlyJuz) return;
      if(manzilRange !== null){
        var s = p.ayahs[0].surah;
        if(s < manzilRange.start || s > manzilRange.end) return;
      }
      var curSurah = p.ayahs[0].surah;
      if(showJuzHeaders && p.juz !== lastJuz){
        rows.push({type: 'header', juz: p.juz});
        lastJuz = p.juz;
        lastSurahInJuz = null;
        curItem = null;
      }
      if(collapseBySurah && curItem && curSurah === lastSurahInJuz){
        curItem.endIdx = i;
        return;
      }
      lastSurahInJuz = curSurah;
      curItem = {
        type: 'item',
        startIdx: i,
        endIdx: i,
        name: p.ayahs[0].surahName,
        ayah: p.ayahs[0].ayah,
        ruku: JUZ_INFO.fullMushaf ? p.ruku : p.rukuInJuz
      };
      rows.push(curItem);
    });
    return rows;
  }
  function buildIndex(){
    var rows = computeIndexRows(PAGES, JUZ_INFO, state);
    var html = rows.map(function(r){
      if(r.type === 'header'){
        return '<div class="juz-header">الجزء ' + UI.toArabicDigits(r.juz) + '</div>';
      }
      if(r.type === 'quarter'){
        return '<div class="index-item" data-idx="' + r.startIdx + '" data-idx-end="' + r.endIdx + '">' +
          '<div class="index-item-inner">' +
            '<span class="num">' + UI.toArabicDigits(r.ordinal) + '</span>' +
            '<div><div class="name">الربع ' + QUARTER_ORDINALS[r.ordinal - 1] + '</div>' +
            '<div class="meta">يبدأ من ' + (r.surahName ? (r.surahName + ' ') : '') + UI.toArabicDigits(r.ayah) + ' \u2022 الركوع ' + UI.toArabicDigits(r.ruku) + '</div></div>' +
          '</div>' +
        '</div>';
      }
      return '<div class="index-item" data-idx="' + r.startIdx + '" data-idx-end="' + r.endIdx + '">' +
        '<div class="index-item-inner">' +
          '<span class="num">' + UI.toArabicDigits(r.startIdx + 1) + '</span>' +
          '<div><div class="name">' + r.name + '</div>' +
          '<div class="meta">يبدأ من الآية ' + UI.toArabicDigits(r.ayah) + ' \u2022 الركوع ' + UI.toArabicDigits(r.ruku) + '</div></div>' +
        '</div>' +
      '</div>';
    }).join('');
    els.indexList.innerHTML = html || '<div class="empty-state">لا توجد نتائج</div>';
  }
  // Lazy caching for الفهرس: building all ٥٥٦ rows costs real work
  // (string concatenation + innerHTML parsing) that most sessions never
  // need, since not every reader opens the ruku index. Build it once,
  // the first time it's actually opened while نطاق العرض = الكل, and
  // reuse it after that — except when نطاق العرض is restricted to
  // surah/juz/manzil, where the (much cheaper, small) filtered list
  // depends on wherever the reader currently is, so it's always rebuilt
  // fresh and never cached.
  //
  // IMPORTANT: buildIndex() always overwrites the SAME shared
  // els.indexList element regardless of scope. So a restricted-scope
  // build (surah/juz/manzil) leaves els.indexList holding that filtered
  // HTML — if indexBuilt were still true from an earlier 'all'-scope
  // build, switching back to نطاق العرض الكل and reopening the index
  // would wrongly skip rebuilding and show that stale filtered list
  // (the exact bug this function fixes). So a restricted-scope build
  // must invalidate the cache flag, forcing the next 'all'-scope open to
  // rebuild the real full index at least once.
  //
  // Pure and DOM-free on purpose so it's directly regression-testable
  // (see tests/navigation-regression.js "N8") without needing to mock
  // els.indexList/innerHTML at all.
  function decideIndexRebuild(displayScope, indexBuilt){
    if(displayScope && displayScope !== 'all'){
      return {rebuild: true, nextIndexBuilt: false};
    }
    if(!indexBuilt){
      return {rebuild: true, nextIndexBuilt: true};
    }
    return {rebuild: false, nextIndexBuilt: indexBuilt};
  }
  // Highlights the ruku currently open and scrolls it into the middle of
  // the index list, so opening the index from deep inside the mushaf
  // doesn't dump the user back at الفاتحة every time.
  function highlightAndScrollIndexToCurrent(){
    var prev = els.indexList.querySelector('.index-item.current');
    if(prev) prev.classList.remove('current');
    // data-idx-end may cover more than one collapsed ruku (see
    // computeIndexRows), so match by range containment rather than an
    // exact data-idx equality check.
    var items = els.indexList.querySelectorAll('.index-item');
    var current = null;
    for(var k = 0; k < items.length; k++){
      var start = parseInt(items[k].getAttribute('data-idx'), 10);
      var endAttr = items[k].getAttribute('data-idx-end');
      var end = endAttr !== null ? parseInt(endAttr, 10) : start;
      if(state.page >= start && state.page <= end){
        current = items[k];
        break;
      }
    }
    if(current){
      current.classList.add('current');
      current.scrollIntoView({block: 'center'});
    }
  }

  // ===================================================================
  // Surah index / juz index / search — shared row renderer
  // ===================================================================
  // عدد أركان كل سورة: كل عنصر في PAGES يمثّل ركوعًا واحدًا كاملًا (شوف
  // README)، والركوع "بيتبع" السورة اللي بيبدأ فيها (p.ayahs[0].surah) —
  // مطابق لنفس الحقل المستخدم في بقية الفهرس، فمفيش تعريف تاني لنفس
  // الفكرة. محسوبة مرة واحدة بس أول ما تُطلب فعليًا (مش عند التحميل).
  var rukuCountBySurah = null;
  function getRukuCountBySurah(){
    if(rukuCountBySurah) return rukuCountBySurah;
    rukuCountBySurah = {};
    PAGES.forEach(function(p){
      var s = p.ayahs[0].surah;
      rukuCountBySurah[s] = (rukuCountBySurah[s] || 0) + 1;
    });
    return rukuCountBySurah;
  }
  // صياغة عربية صحيحة لعدد الأركان حسب قواعد العدد والمعدود:
  // ١ ركوع واحد، ٢ ركوعان، ٣-١٠ ركوعات (جمع مجرور)، ١١+ ركوعًا (مفرد
  // منصوب/تمييز).
  function rukuCountLabel(n){
    if(n === 1) return 'ركوع واحد';
    if(n === 2) return 'ركوعان';
    if(n >= 3 && n <= 10) return UI.toArabicDigits(n) + ' ركوعات';
    return UI.toArabicDigits(n) + ' ركوعًا';
  }
  // منازل القرآن السبعة (تقسيم "فاتحون" التقليدي لختم القرآن في سبعة
  // أيام). كل مفتاح هو رقم سورة بداية المنزل؛ النهاية معروفة سلفًا لكل
  // منزل (آخر سورة قبل بداية المنزل التالي)، فمُدرجة هنا كنص جاهز بدل
  // حسابها ديناميكيًا. العنوان بالزخرفة القرآنية ﴾ ﴿ وتشكيل كسر الزاي في
  // "المَنزِلُ" مطابقةً لما اتفقنا عليه سابقًا لكلمة "منازل".
  var MANZIL_INFO = {
    1:  {title: '﴿ المَنزِلُ الأَوَّل ﴾',   subtitle: 'يبدأ من سورة الفاتحة إلى سورة النساء'},
    5:  {title: '﴿ المَنزِلُ الثَّانِي ﴾',  subtitle: 'يبدأ من سورة المائدة إلى سورة التوبة'},
    10: {title: '﴿ المَنزِلُ الثَّالِث ﴾',  subtitle: 'يبدأ من سورة يونس إلى سورة النحل'},
    17: {title: '﴿ المَنزِلُ الرَّابِع ﴾',  subtitle: 'يبدأ من سورة الإسراء إلى سورة الفرقان'},
    26: {title: '﴿ المَنزِلُ الخَامِس ﴾',   subtitle: 'يبدأ من سورة الشعراء إلى سورة يس'},
    37: {title: '﴿ المَنزِلُ السَّادِس ﴾',  subtitle: 'يبدأ من سورة الصافات إلى سورة الحجرات'},
    50: {title: '﴿ المَنزِلُ السَّابِع ﴾',  subtitle: 'يبدأ من سورة ق إلى سورة الناس'}
  };
  // `showManzil` is only passed true for the full، unfiltered فهرس السور
  // list (see tileSurah handler) — filtered subsets rendered through this
  // same function (search results) never show manzil headers, since a
  // filtered list can skip right over a boundary surah and the header
  // would look orphaned/out of place.
  //
  // Just a standalone header block before the boundary surah's row — NOT
  // wrapping that manzil's surahs in their own card/border. Only the
  // header's own text + colors follow the reference screenshot; the
  // surah rows below it stay the plain .index-item rows exactly as
  // everywhere else in this list.
  function renderSurahList(list, container, showManzil, showAyahJump){
    if(!list.length){
      container.innerHTML = '<div class="empty-state">لا توجد نتائج</div>';
      return;
    }
    var html = list.map(function(s){
      var meta = window.SURAH_META && window.SURAH_META[s.surah] ? window.SURAH_META[s.surah] : {};
      var surahInfo = '';
      if(meta.type && meta.ayahs){
        var rukuCount = getRukuCountBySurah()[s.surah];
        surahInfo = meta.type + ' \u2022 ' + UI.toArabicDigits(meta.ayahs) + ' آية';
        if(rukuCount){
          surahInfo += ' \u2022 ' + rukuCountLabel(rukuCount);
        }
      }
      var displayName = (window.SURAH_NAMES_VOCALIZED && window.SURAH_NAMES_VOCALIZED[s.surah]) || s.name;
      var manzilHtml = '';
      if(showManzil && MANZIL_INFO[s.surah]){
        var info = MANZIL_INFO[s.surah];
        manzilHtml = '<div class="manzil-header">' +
          '<div class="manzil-title">' + info.title + '</div>' +
          '<div class="manzil-sub">' + info.subtitle + '</div>' +
        '</div>';
      }
      // "الانتقال إلى آية": a small icon at the end of the row (see CSS
      // comment on .index-item-goto-ayah). data-surah carries the surah
      // number for the click handler; the row's own data-page attribute
      // is deliberately untouched by this button (handled separately).
      var ayahJumpBtn = showAyahJump
        ? '<button type="button" class="index-item-goto-ayah" data-surah="' + s.surah + '" aria-label="الانتقال إلى آية في ' + displayName + '" title="الانتقال إلى آية">' +
            '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>' +
          '</button>'
        : '';
      return manzilHtml + '<div class="index-item" data-page="'+s.page+'">' +
        '<div class="index-item-inner">' +
          '<span class="num">' + UI.toArabicDigits(s.surah) + '</span>' +
          '<div style="flex:1">' +
            '<div class="name">' + displayName + '</div>' +
            (surahInfo ? '<div class="surah-info">' + surahInfo + '</div>' : '') +
          '</div>' +
          ayahJumpBtn +
        '</div>' +
      '</div>';
    }).join('');
    container.innerHTML = html;
  }
  // Renders the search-results state of the search panel: full ayah text
  // (not a snippet) with the matched word range highlighted via
  // ReaderManager.renderAyahTextWithHighlight, plus surah/ayah/ruku meta
  // and a divider between rows. Deliberately NOT reusing renderSurahList/
  // .index-item — those rows are for the "browse by surah name" index,
  // this is a distinct "full ayah with a highlighted hit" row, wired to
  // its own click handler (see handleSearchResultClick) rather than the
  // shared handleIndexContainerClick.
  function renderSearchResults(list, query, exact){
    if(!list.length){
      els.searchResults.innerHTML = '';
      return;
    }
    var html = list.map(function(e, i){
      // Prefer the reader's currently-active script; if that script's raw
      // text doesn't actually yield a resolvable word position for this
      // query (a normalization gap between the Uthmani and Indopak
      // datasets — see the "كافر" root case in normalizeArabic — known or
      // not yet discovered), fall back to rendering THIS ONE row in the
      // other script instead of guessing {start:0,end:0}. A correctly
      // highlighted ayah in the "other" script beats a wrong or missing
      // highlight in the "right" one.
      var primarySrc = state.fontStyle !== 'uthmani' ? e.textIndopak : e.text;
      var altSrc = state.fontStyle !== 'uthmani' ? e.text : e.textIndopak;
      var src = primarySrc;
      var range = SearchManager.findMatchWordRange(primarySrc, query, exact);
      if(!range && altSrc !== primarySrc){
        range = SearchManager.findMatchWordRange(altSrc, query, exact);
        if(range) src = altSrc;
      }
      if(!range) range = {start: 0, end: 0};
      var page = PAGES[e.page];
      var rukuLabel = page ? (JUZ_INFO.fullMushaf ? page.ruku : page.rukuInJuz) : null;
      var metaParts = [e.surahName, 'الآية ' + UI.toArabicDigits(e.ayah)];
      if(rukuLabel != null) metaParts.push('الركوع ' + UI.toArabicDigits(rukuLabel));
      return (i > 0 ? '<hr class="search-result-divider">' : '') +
        '<div class="search-result-item" data-page="' + e.page + '" data-surah="' + e.surah + '" data-ayah="' + e.ayah + '" data-w-start="' + range.start + '" data-w-end="' + range.end + '">' +
          '<div class="search-result-meta">' +
            '<span class="search-result-num">' + UI.toArabicDigits(i + 1) + '</span>' +
            '<span>' + metaParts.join(' \u2022 ') + '</span>' +
          '</div>' +
          '<div class="search-result-text">' + window.ReaderManager.renderAyahTextWithHighlight(src, range) + '</div>' +
        '</div>';
    }).join('');
    els.searchResults.innerHTML = html;
  }
  function handleSearchResultClick(e){
    var item = e.target.closest('.search-result-item');
    if(!item || !els.searchResults.contains(item)) return;
    ReaderManager.openAyah(
      parseInt(item.getAttribute('data-page'), 10),
      parseInt(item.getAttribute('data-surah'), 10),
      parseInt(item.getAttribute('data-ayah'), 10),
      parseInt(item.getAttribute('data-w-start'), 10),
      parseInt(item.getAttribute('data-w-end'), 10)
    );
    UI.closePanel(els.searchPanel);
  }
  // Shared by both places فهرس السور rows can appear with the ayah-jump
  // icon enabled (currently just the dedicated surahPanel list — see
  // showAyahJump in renderSurahList/tileSurah below). Looks up the
  // surah's real ayah count from SURAH_META for the dialog's validation
  // bound, opens the dialog, and on confirm calls
  // ReaderManager.openAyahByNumber then closes whichever panel the
  // dialog was opened from (only on success, so a somehow-invalid
  // surah/ayah combination — shouldn't happen given the validation
  // above — doesn't leave the person stranded on a page that never
  // changed).
  function openAyahJumpForSurah(surahNum, panelToClose){
    var meta = window.SURAH_META && window.SURAH_META[surahNum];
    var maxAyah = meta && meta.ayahs ? parseInt(meta.ayahs, 10) : 0;
    if(!maxAyah) return;
    var displayName = (window.SURAH_NAMES_VOCALIZED && window.SURAH_NAMES_VOCALIZED[surahNum]) || '';
    Dialogs.openAyahJumpModal(displayName, maxAyah, function(ayahNum){
      var ok = ReaderManager.openAyahByNumber(surahNum, ayahNum);
      if(ok && panelToClose) UI.closePanel(panelToClose);
    });
  }
  // Delegated once on els.surahList instead of re-attaching a listener to
  // every row on every render (this runs on every keystroke while
  // browsing/filtering the surah index) — see wiring in init(). Search
  // results have their own dedicated handler (handleSearchResultClick)
  // since their rows are a different shape (full ayah + highlight, not
  // an .index-item).
  function handleIndexContainerClick(e){
    var container = this;
    var gotoAyahBtn = e.target.closest('.index-item-goto-ayah');
    if(gotoAyahBtn && container.contains(gotoAyahBtn)){
      openAyahJumpForSurah(parseInt(gotoAyahBtn.getAttribute('data-surah'), 10), els.surahPanel);
      return;
    }
    var surahItem = e.target.closest('.index-item');
    if(surahItem && container.contains(surahItem)){
      Home.openReaderAt(parseInt(surahItem.getAttribute('data-page'), 10));
      UI.closePanel(els.surahPanel);
    }
  }

  // ===================================================================
  // Swipe (page turn) + pinch (font-size zoom)
  // ===================================================================
  function wireSwipeAndPinch(){
    // RTL page-turn convention used throughout this app: dragging the
    // finger to the right (dx > 0) advances forward (like turning a page
    // in an Arabic book), dragging left goes back. This must stay in
    // sync with ReaderManager's ArrowLeft/ArrowRight handling.
    //
    // Two-finger pinch zoom: reuses the exact same per-script-mode font
    // size (via Settings.currentFontSizeKey) used by the "+"/"−" buttons
    // in الإعدادات, so pinching and those buttons always agree, each
    // script mode keeps its own remembered size, and switching mode never
    // carries a pinched size over to the other script. Can be turned off
    // from الإعدادات (state.pinchZoomEnabled) for readers who trigger it
    // by accident while turning pages with two fingers.
    var FONT_MIN = 18, FONT_MAX = 44;

    Gestures.swipeAndPinch({
      root: els.pageFrame,
      isPinchEnabled: function(){ return state.pinchZoomEnabled !== false; },
      getPinchValue: function(){ return state[Settings.currentFontSizeKey()]; },
      pinchMin: FONT_MIN,
      pinchMax: FONT_MAX,
      onPinchChange: function(newSize){
        var key = Settings.currentFontSizeKey();
        if(newSize !== state[key]){
          state[key] = newSize;
          Settings.applyFontSize();
        }
      },
      onPinchEnd: function(){
        saveState();
        UI.showToast('حجم الخط: ' + UI.toArabicDigits(state[Settings.currentFontSizeKey()]));
      },
      onSwipe: function(dx){
        if(dx > 0) ReaderManager.goToRelativePage(1);
        else ReaderManager.goToRelativePage(-1);
      }
    });
  }

  // منازل القرآن السبعة، بالترتيب — نفس ترتيب window.MANZIL_STARTS
  // (constants.js)، فمفيش تكرار لأرقام السور هنا؛ العنصر رقم N هنا يقابل
  // المنزل رقم N+1 (١-based) في MANZIL_STARTS.
  var MANZIL_ORDINALS = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع'];
  // عنوان لوحة الفهرس (الفهرس panel) يعكس نطاق العرض الحالي:
  //  - "الكل"    → "فهرس المصحف"
  //  - "منزل"    → "فهرس المنزل الأول" / "الثاني" / ... حسب المنزل اللي
  //               الصفحة الحالية فيه (بيتحدد من رقم سورتها الأولى عبر
  //               window.getManzilRange/MANZIL_STARTS، نفس المصدر
  //               المستخدم في فلترة الفهرس نفسه).
  //  - "جزء"     → "فهرس الجزء ١٦" / "١٧" / ... برقم الجزء نفسه (مش
  //               ترتيب لفظي زي المنزل، لأن أرقام الأجزاء معروفة ومألوفة
  //               بالفعل — نفس المنطق المستخدم في رأس الجزء في نطاق الكل).
  //  - "سورة"    → "فهرس السورة ٥" / ... برقم السورة نفسه (مش اسمها —
  //               نفس أسلوب رقم الجزء فوق، رقم واحد ثابت ومألوف بدل
  //               حساب ترتيب لفظي زيه زي المنزل).
  //  - غير كده     → "الفهرس" العنوان الافتراضي القديم، بدون تغيير.
  // Pure/DOM-free على قصد — قابلة للاختبار مباشرة (tests N9) بدون DOM.
  // digitsFn (اختياري): بيحوّل رقم الجزء لأرقام هندية عربية زي باقي
  // نصوص الواجهة (UI.toArabicDigits) — لو متبعتش، بيرجع الرقم زي ما هو
  // عشان الدالة تفضل قابلة للاختبار بدون تحميل ui.js.
  function indexPanelTitleFor(scope, curSurah, curJuz, digitsFn){
    var digits = typeof digitsFn === 'function' ? digitsFn : function(n){ return String(n); };
    if(scope === 'manzil' && curSurah != null && window.MANZIL_STARTS && window.getManzilRange){
      var range = window.getManzilRange(curSurah);
      var ordinalIdx = window.MANZIL_STARTS.indexOf(range.start);
      if(ordinalIdx > -1 && MANZIL_ORDINALS[ordinalIdx]){
        return 'فهرس المنزل ' + MANZIL_ORDINALS[ordinalIdx];
      }
    }
    if(scope === 'juz' && curJuz != null){
      return 'فهرس الجزء ' + digits(curJuz);
    }
    if(scope === 'surah' && curSurah != null){
      return 'فهرس السورة ' + digits(curSurah);
    }
    if(scope === 'all') return 'فهرس المصحف';
    return 'الفهرس';
  }
  // نص/تلميح زر btnGoto (زر الانتقال أعلى الفهرس) — بيتغيّر لـ"الانتقال
  // إلى سورة" في نطاق العرض = السورة الحالية بس (الفرع اللي بيقبل اسم
  // مش رقم ركوع)، وبيفضل زي ما هو "الذهاب إلى ركوع رقم" في باقي
  // النطاقات — عنوان الـdialog نفسه (مش الزر) هو اللي بيتغيّر لمنزل/جزء
  // فوق في openGoto، والزر بيفضل بتاعه الافتراضي في الحالتين دول.
  function gotoButtonLabelFor(scope){
    return scope === 'surah' ? 'الانتقال إلى سورة' : 'الذهاب إلى ركوع رقم';
  }
  function updateGotoButtonLabel(){
    if(!els.btnGoto) return;
    var label = gotoButtonLabelFor(state.displayScope || 'all');
    els.btnGoto.setAttribute('aria-label', label);
    els.btnGoto.setAttribute('title', label);
  }

  function init(deps){
    els = deps.els;
    state = deps.state;
    PAGES = deps.PAGES;
    JUZ_INFO = deps.JUZ_INFO;
    UI = deps.UI;
    Dialogs = deps.Dialogs;
    Home = deps.Home;
    Settings = deps.Settings;
    AudioManager = deps.AudioManager;
    ReaderManager = deps.ReaderManager;
    saveState = deps.saveState;

    // ---- الفهرس (by ruku number) ----
    els.indexList.addEventListener('click', function(e){
      var el = e.target.closest('.index-item');
      if(!el || !els.indexList.contains(el)) return;
      ReaderManager.goToPage(parseInt(el.getAttribute('data-idx'), 10));
      UI.closePanel(els.indexPanel);
    });
    els.btnIndex.addEventListener('click', function(){
      var decision = decideIndexRebuild(state.displayScope, indexBuilt);
      if(decision.rebuild) buildIndex();
      indexBuilt = decision.nextIndexBuilt;
      if(els.indexPanelTitle){
        var curPage = PAGES[state.page];
        els.indexPanelTitle.textContent = indexPanelTitleFor(
          state.displayScope || 'all',
          curPage ? curPage.ayahs[0].surah : null,
          curPage ? curPage.juz : null,
          UI.toArabicDigits
        );
      }
      updateGotoButtonLabel();
      UI.openPanel(els.indexPanel);
      // Wait a frame so the panel is laid out/visible before scrolling.
      requestAnimationFrame(function(){ highlightAndScrollIndexToCurrent(); });
    });
    els.btnCloseIndex.addEventListener('click', function(){ UI.closePanel(els.indexPanel); });

    // ---- فهرس السور ----
    els.surahList.addEventListener('click', handleIndexContainerClick);
    els.tileSurah.addEventListener('click', function(){
      renderSurahList(SearchManager.getSurahOrder(), els.surahList, true, true);
      UI.openPanel(els.surahPanel);
    });
    els.btnCloseSurah.addEventListener('click', function(){ UI.closePanel(els.surahPanel); });

    // ---- فهرس الأجزاء ----
    els.tileJuz && els.tileJuz.addEventListener('click', function(){
      var juzJumpMap = {};
      var order = [];
      PAGES.forEach(function(p, i){
        if(JUZ_INFO.fullMushaf && !(p.juz in juzJumpMap)){
          juzJumpMap[p.juz] = i;
          order.push({juz: p.juz, page: i, name: p.ayahs[0].surahName});
        }
      });
      // نطاق كل جزء: من ركوع/سورة أول صفحة فيه، لحد ركوع/سورة آخر صفحة
      // قبل بداية الجزء اللي بعده مباشرة (أو آخر صفحة في المصحف كله لو
      // ده آخر جزء). p.ruku هو نفس رقم الركوع العالمي المعروض في الفهرس
      // الرئيسي (الفهرس)، فمفيش رقمين مختلفين للركوع في التطبيق.
      order.forEach(function(j, k){
        var endPageIdx = (k < order.length - 1) ? (order[k+1].page - 1) : (PAGES.length - 1);
        var startP = PAGES[j.page];
        var endP = PAGES[endPageIdx];
        j.startRuku = startP.ruku;
        j.endRuku = endP.ruku;
        j.endName = endP.ayahs[0].surahName;
      });
      var html = order.map(function(j){
        return '<div class="index-item" data-page="'+j.page+'">' +
          '<div class="index-item-inner">' +
            '<span class="num">' + UI.toArabicDigits(j.juz) + '</span>' +
            '<div style="flex:1"><div class="name">الجزء ' + UI.toArabicDigits(j.juz) + '</div>' +
            '<div class="meta">يبدأ من الركوع ' + UI.toArabicDigits(j.startRuku) + ' سورة ' + j.name +
              ' حتى الركوع ' + UI.toArabicDigits(j.endRuku) + ' سورة ' + j.endName + '</div></div>' +
          '</div>' +
        '</div>';
      }).join('');
      els.juzList.innerHTML = html || '<div class="empty-state">غير متاح</div>';
      UI.openPanel(els.juzPanel);
    });
    els.juzList.addEventListener('click', function(e){
      var el = e.target.closest('.index-item');
      if(!el || !els.juzList.contains(el)) return;
      Home.openReaderAt(parseInt(el.getAttribute('data-page'), 10));
      UI.closePanel(els.juzPanel);
    });
    els.btnCloseJuz.addEventListener('click', function(){ UI.closePanel(els.juzPanel); });

    // ---- نطاق العرض (فهرس الركوع + قيود التنقّل بالسحب) ----
    // يحلّ محل toggle "إظهار ركوعات الجزء الحالي فقط" القديم اللي كان في
    // صفحة فهرس الأجزاء — بقى اختيار واحد من 4 نطاقات هنا في الإعدادات
    // بدل مفتاح ثنائي في مكان تاني، وحطينا 'juz' كقيمة مكافئة له بمنطق
    // الترقية في storage-manager.js (juzOnlyMode -> displayScope:'juz').
    if(els.displayScopeSelect){
      els.displayScopeSelect.value = state.displayScope || 'all';
      updateGotoButtonLabel();
      els.displayScopeSelect.addEventListener('change', function(){
        state.displayScope = els.displayScopeSelect.value;
        saveState();
        // الفهرس (ركوعات) بيتبني من جديد أول ما يتفتح (شوف مُعالج
        // btnIndex فوق) — مفيش داعي نرسمه تاني هنا. لكن زرار السابق/
        // التالي محتاجين يتحدّثوا فورًا، عشان حدود النطاق (سورة/جزء/
        // منزل) اللي المفروض يحترموها بتتغيّر دلوقتي مش لما يحصل
        // renderPage() تاني.
        ReaderManager.updateNavButtons();
        updateGotoButtonLabel();
        var labels = {
          all: 'هيتم عرض جميع صفحات الركوع',
          surah: 'هيتم عرض ركوعات السورة الحالية فقط',
          juz: 'هيتم عرض ركوعات الجزء الحالي فقط',
          manzil: 'هيتم عرض ركوعات المَنزِل الحالي فقط'
        };
        UI.showToast(labels[state.displayScope] || labels.all);
      });
    }

    // ---- البحث ----
    // One panel, one visible layout — the input/بحث row never hides;
    // results render below it in place. Opening the panel (tileSearch)
    // always resets first, so a session never carries over from a
    // previous search. The panel's own close button (and the Android
    // hardware back button, via UI.registerOverlayPanels) always closes
    // the whole panel back to whatever's underneath (the home screen,
    // since tileSearch only lives there) regardless of whether results
    // are showing — never "back into the results".
    //
    // Single button, two modes: "بحث" runs the search; once a search has
    // run — found results or not — the SAME button switches to "مسح"
    // (the input itself gets locked read-only at that point) — pressing
    // it is the only way to search again, so a result the user is
    // mid-review of never gets silently replaced by an accidental
    // re-search. Mode is derived from searchInput.readOnly rather than
    // tracked separately, so the two can never drift out of sync.
    function updateSearchButtonMode(){
      var locked = els.searchInput.readOnly;
      els.btnRunSearch.innerHTML = locked
        ? '<svg class="search-run-icon" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6l-12 12"/></svg><span class="search-run-label">مسح</span>'
        : '<svg class="search-run-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg><span class="search-run-label">بحث</span>';
      els.btnRunSearch.classList.toggle('is-clear-mode', locked);
    }
    function resetSearchToInput(){
      els.searchInput.value = '';
      els.searchInput.readOnly = false;
      els.exactSearchToggle.checked = false;
      els.exactSearchToggle.disabled = false;
      els.searchValidationMsg.classList.add('hidden');
      els.searchResultsCount.classList.add('hidden');
      els.searchSurahResults.innerHTML = '';
      els.searchSurahSection.classList.add('hidden');
      els.searchResults.innerHTML = '';
      els.searchAyahSection.classList.add('hidden');
      updateSearchButtonMode();
    }
    // البحث الموحّد: مربع بحث واحد يبحث في اسم السورة ونص الآية معًا —
    // SearchManager.searchUnified() ترجّع المصدرين مع بعض؛ سور مطابقة أولًا
    // (بنفس بطاقة فهرس السور عبر renderSurahList، بدون تصميم جديد) ثم آيات
    // مطابقة (بنفس شكل نتائج البحث النصي القديم). كل قسم يظهر/يختفي حسب
    // وجود نتائج فيه فعليًا.
    function runSearch(){
      var q = els.searchInput.value.trim();
      if(q.length < 2){
        els.searchValidationMsg.classList.remove('hidden');
        els.searchInput.focus();
        return;
      }
      els.searchValidationMsg.classList.add('hidden');
      var exact = els.exactSearchToggle.checked;
      var result = SearchManager.searchUnified(q, exact);
      var surahs = result.surahs, ayahs = result.ayahs;
      var totalCount = surahs.length + ayahs.length;
      els.searchResultsCount.classList.remove('hidden');
      els.searchResultsCount.textContent = totalCount
        ? ('تم العثور على ' + UI.toArabicDigits(totalCount) + ' نتيجة')
        : 'لا توجد نتائج';

      if(surahs.length){
        renderSurahList(surahs, els.searchSurahResults);
        els.searchSurahSection.classList.remove('hidden');
      } else {
        els.searchSurahResults.innerHTML = '';
        els.searchSurahSection.classList.add('hidden');
      }

      if(ayahs.length){
        renderSearchResults(ayahs, q, exact);
        els.searchAyahSection.classList.remove('hidden');
      } else {
        els.searchResults.innerHTML = '';
        els.searchAyahSection.classList.add('hidden');
      }

      els.searchInput.readOnly = true;
      updateSearchButtonMode();
    }
    // Surah-name matches within the search panel navigate straight to the
    // surah — exactly like فهرس السور (reuses handleIndexContainerClick's
    // own logic shape) but closes els.searchPanel (not els.surahPanel)
    // since these rows live inside the search panel.
    function handleSearchSurahClick(e){
      var item = e.target.closest('.index-item');
      if(!item || !els.searchSurahResults.contains(item)) return;
      Home.openReaderAt(parseInt(item.getAttribute('data-page'), 10));
      UI.closePanel(els.searchPanel);
    }
    els.tileSearch.addEventListener('click', function(){
      resetSearchToInput();
      UI.openPanel(els.searchPanel);
      setTimeout(function(){ els.searchInput.focus(); }, 200);
    });
    els.btnCloseSearch.addEventListener('click', function(){ UI.closePanel(els.searchPanel); });
    els.btnRunSearch.addEventListener('click', function(){
      if(els.searchInput.readOnly){
        resetSearchToInput();
        els.searchInput.focus();
      } else {
        runSearch();
      }
    });
    els.searchInput.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); runSearch(); }
    });
    // Live-hide the validation message the moment the person types enough
    // — it shouldn't linger once the condition it's warning about is
    // already satisfied, per direct request.
    els.searchInput.addEventListener('input', function(){
      if(els.searchInput.value.trim().length >= 2){
        els.searchValidationMsg.classList.add('hidden');
      }
    });
    els.searchResults.addEventListener('click', handleSearchResultClick);
    els.searchSurahResults.addEventListener('click', handleSearchSurahClick);
    // Tapping the switch (or its label) moves browser focus to the
    // checkbox itself — standard behavior, but it was dismissing the
    // on-screen keyboard out from under the person mid-typing. Before a
    // search has run, hand focus straight back to the input so typing
    // continues uninterrupted. Once results are showing (input locked),
    // the person is flipping مطابقة to redo the SAME query differently —
    // re-run it immediately using the still-present (just disabled)
    // input value, instead of forcing مسح + retyping.
    els.exactSearchToggle.addEventListener('change', function(){
      if(els.searchInput.readOnly){
        runSearch();
      } else {
        els.searchInput.focus();
      }
    });

    // ---- الذهاب إلى ركوع رقم / الذهاب إلى منزل رقم ----
    // btnGoto نفسه عنصر داخل رأس لوحة "الفهرس" (indexPanel — انظر
    // index.html)، فمفيش طريقة توصله غير من جوه الفهرس المفتوح أصلاً.
    // لازم نقفل الفهرس بعد الانتقال دايمًا، وإلا هيفضل فاتح فوق القارئ
    // ويغطي الركوع الجديد اللي اتنقلنا له فعلًا تحته — ده اللي كان بيبان
    // كأن "الانتقال مابيحصلش" مع إن state.page كانت بتتغير صح من تحت.
    // في نطاق العرض = المنزل، نفس الزر يذهب لأول ركوع في منزل رقم N
    // (١-٧) بدل رقم ركوع مطلق، والفهرس (لو اتفتح تاني بنفس النطاق) يتبع
    // تلقائيًا لأن computeIndexRows بيحسب نطاق المنزل من سورة state.page
    // الحالية — تغييرها هنا كافٍ.
    function openGoto(){
      if(state.displayScope === 'manzil'){
        Dialogs.openGotoModal(currentManzilNumber(PAGES, state), window.MANZIL_STARTS.length, function(n){
          var idx = findPageIndexForManzil(PAGES, n);
          if(idx > -1){
            Home.openReaderAt(idx);
            UI.closePanel(els.indexPanel);
          }
        }, {
          title: 'الذهاب إلى منزل رقم',
          placeholder: 'اكتب رقم المنزل (١ - ' + UI.toArabicDigits(window.MANZIL_STARTS.length) + ')',
          errorPrefix: 'رقم غير صحيح، اكتب رقمًا من ١ إلى '
        });
        return;
      }
      // نطاق العرض = الجزء: نفس الزر يذهب لأول ركوع في جزء رقم N (١-٣٠)
      // بدل رقم ركوع مطلق. الفهرس (لو اتفتح تاني) بيتبع تلقائيًا لأن
      // computeIndexRows/indexPanelTitleFor بيحسبوا نطاق الجزء من
      // PAGES[state.page].juz — تغييرها هنا (عبر Home.openReaderAt) كافٍ،
      // بالظبط زي حالة المنزل فوق.
      if(state.displayScope === 'juz' && JUZ_INFO.fullMushaf){
        Dialogs.openGotoModal(currentJuzNumber(PAGES, state), 30, function(n){
          var idx = findPageIndexForJuz(PAGES, n);
          if(idx > -1){
            Home.openReaderAt(idx);
            UI.closePanel(els.indexPanel);
          }
        }, {
          title: 'الذهاب إلى جزء رقم',
          placeholder: 'اكتب رقم الجزء (١ - ٣٠)',
          errorPrefix: 'رقم غير صحيح، اكتب رقمًا من ١ إلى '
        });
        return;
      }
      // نطاق العرض = السورة الحالية: نفس الزر يذهب لأول ركوع في سورة رقم/
      // اسم N بدل رقم ركوع مطلق. على عكس فرعي المنزل/الجزء فوق، مربع
      // الإدخال هنا بيقبل اسم السورة كمان مش رقمها بس — عشان كده بنمرر
      // resolveInput مخصص (resolveSurahGotoInput فوق) بدل الاعتماد على
      // فحص الرقم الافتراضي في submitGotoModal. الفهرس (لو اتفتح تاني)
      // بيتبع تلقائيًا بنفس آلية فرعي المنزل/الجزء (عبر Home.openReaderAt
      // اللي بتغيّر PAGES[state.page]).
      if(state.displayScope === 'surah'){
        var curPageForSurah = PAGES[state.page];
        var curSurahNum = curPageForSurah ? curPageForSurah.ayahs[0].surah : 1;
        Dialogs.openGotoModal(curSurahNum, 114, function(n){
          var idx = SearchManager.getSurahStartPage(n);
          if(idx !== undefined && idx > -1){
            Home.openReaderAt(idx);
            UI.closePanel(els.indexPanel);
          }
        }, {
          title: 'الانتقال إلى سورة',
          placeholder: 'اكتب رقم السورة أو اسمها',
          errorMessage: 'رقم أو اسم السورة غير صحيح',
          resolveInput: resolveSurahGotoInput,
          inputMode: 'text'
        });
        return;
      }
      Dialogs.openGotoModal(state.page + 1, PAGES.length, function(n){
        Home.openReaderAt(n - 1);
        UI.closePanel(els.indexPanel);
      });
    }
    els.btnGoto && els.btnGoto.addEventListener('click', openGoto);
    els.pageIndicator && els.pageIndicator.addEventListener('click', openGoto);

    wireSwipeAndPinch();

    UI.registerOverlayPanels([els.indexPanel, els.surahPanel, els.juzPanel, els.searchPanel].filter(Boolean));

    if(!JUZ_INFO.fullMushaf && els.tileJuz){
      els.tileJuz.classList.add('hidden');
    }
    if(!JUZ_INFO.fullMushaf && els.displayScopeSelect){
      var juzOption = els.displayScopeSelect.querySelector('option[value="juz"]');
      if(juzOption) juzOption.disabled = true;
      if(state.displayScope === 'juz'){
        state.displayScope = 'all';
        els.displayScopeSelect.value = 'all';
        saveState();
      }
    }
  }

  window.Navigation = {
    init: init,
    computeIndexRows: computeIndexRows,
    decideIndexRebuild: decideIndexRebuild,
    indexPanelTitleFor: indexPanelTitleFor,
    findPageIndexForManzil: findPageIndexForManzil,
    currentManzilNumber: currentManzilNumber,
    findPageIndexForJuz: findPageIndexForJuz,
    currentJuzNumber: currentJuzNumber,
    resolveSurahGotoInput: resolveSurahGotoInput,
    gotoButtonLabelFor: gotoButtonLabelFor
  };
})();
