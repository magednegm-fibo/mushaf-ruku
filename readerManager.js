// ReaderManager: responsible ONLY for rendering the current page, changing
// which page is shown, highlighting (waqf marks baked into the rendered
// HTML, and search-hit flashes), and scrolling (to the top of a new page,
// and to a matched word/ayah). Nothing else — no favorites, no bookmarks,
// no progress tracking, no audio, no settings. Those stay in app.js, which
// hooks into this file's lifecycle via the callbacks passed to init().
//
// Loaded before app.js (see index.html). Call ReaderManager.init(deps)
// once; deps:
//   PAGES, JUZ_INFO, state, els, toArabicDigits, REMINDER_COLORS,
//   getWaqfMarks()        — live getter (waqfMarks is reassigned on
//                            script-mode switch, so a one-time reference
//                            would go stale)
//   showReader()          — shows the reader screen (screen routing stays
//                            app.js's job; ReaderManager just calls it
//                            when a search hit needs to open the reader)
//   onBeforePageChange(opts) — called at the start of goToPage(), e.g. to
//                            stop any playing audio
//   onPageChanged(i)      — called after state.page changes (real
//                            navigation only, not a same-page re-render),
//                            e.g. to update resume-position bookkeeping
//   onAfterRender()       — called at the end of every renderPage(), e.g.
//                            to refresh favorite/bookmark buttons, the
//                            progress UI, and persist state
// Exposed as window.ReaderManager.
(function(){
  'use strict';

  var PAGES, JUZ_INFO, state, els, toArabicDigits, REMINDER_COLORS, getWaqfMarks;
  var showReaderFn, onBeforePageChange, onPageChanged, onAfterRender;

  // -----------------------------------------------------------------
  // Ayah-number marker (the star-shaped ٱ badge with the ayah number)
  //
  // طلب مباشر: استبدال الشكل الوردي الناعم بـ16 فصًا (منحنيات Q كثيرة
  // ولطيفة) بنجمة ثمانية الرؤوس واضحة الأطراف، حسب صورة مرجعية أرسلها
  // المستخدم. نصف القطر الخارجي بقي بلا تغيير (٦ إلى ٣٤ ضمن viewBox
  // 40×40، أي نفس أقصى امتداد للشكل القديم) حتى لا يتأثر قطر رأس
  // الآية ولا حجم الدائرة خلف الرقم. نصف قطر الأطراف الداخلة
  // (الأخاديد بين الرؤوس) = 8.6، وهو تقدير أولي يحتاج تأكيدًا بصريًا
  // على الجهاز — إن بدت الرؤوس حادة جدًا أو عريضة جدًا مقارنة بالصورة
  // المرجعية، يمكن تعديل هذه القيمة وحدها دون تغيير نصف القطر الخارجي.
  // -----------------------------------------------------------------
  // طلب مباشر: الآيات المدرجة في MADINAH_CIRCLE_HEADS (madinah-circle-heads.js)
  // تُرسَم بدائرة بدل النجمة الثمانية.
  // أقصى امتداد هندسي لرؤوس مسار النجمة = 14 من المركز (20,20)، لكن
  // بروز الرؤوس + stroke-width للنجمة يجعلها تبدو أكبر بصريًا. رُفع نصف
  // قطر الدائرة إلى 15 لتحقيق توازن بصري مع الامتداد الخارجي للنجمة
  // (وليس مساواة القطر الرياضي فقط) — طلب مباشر 1.0.286؛ ضُبط إلى 15 في 1.0.287.
  // موضع الرقم غير متأثر (نفس <span> خارج الـsvg).
  // دائرة رقم الآية تُرسَم الآن بـ CSS border على
  // .ayah-num-circle::before بدل SVG <circle> stroke — لتجنب تأثر
  // سماكة الـstroke بتحديثات Chrome/Android. السمك 1.8px؛ القطر ~75%
  // من الحاوية (مكافئ r=15 في viewBox 40×40).
  var AYAH_NUM_STAR_PATH =
    '<path d="M 20.00 6.00 L 23.29 12.05 L 29.90 10.10 L 27.95 16.71 L 34.00 20.00 L 27.95 23.29 L 29.90 29.90 L 23.29 27.95 L 20.00 34.00 L 16.71 27.95 L 10.10 29.90 L 12.05 23.29 L 6.00 20.00 L 12.05 16.71 L 10.10 10.10 L 16.71 12.05 Z" ' +
    'class="ayah-num-outer" fill="none" stroke="currentColor" stroke-linejoin="round"/>';

  function isMadinahCircleHead(surah, ayah){
    var set = (typeof window !== 'undefined' && window.MADINAH_CIRCLE_HEADS) || null;
    return !!(set && set.has(surah + ':' + ayah));
  }

  function ayahMarkerShapeSvg(surah, ayah){
    var isCircleHead = isMadinahCircleHead(surah, ayah);
    // الدائرة: لا محتوى SVG — الحلقة تُرسَم بـ CSS ::before على .ayah-num-circle
    return isCircleHead ? '' : AYAH_NUM_STAR_PATH;
  }

  function ayahMarker(surah, ayah){
    var num = toArabicDigits(ayah);
    var digitClass = ayah >= 100 ? ' three-digit' : '';
    var isCircle = isMadinahCircleHead(surah, ayah);
    var circleClass = isCircle ? ' ayah-num-circle' : '';
    return '<span class="ayah-num' + digitClass + circleClass + '" aria-hidden="false" data-surah="' + surah + '" data-ayah="' + ayah + '">' +
      '<svg viewBox="0 0 40 40">' +
      ayahMarkerShapeSvg(surah, ayah) +
      '</svg>' +
      '<span>' + num + '</span></span>';
  }

  // تُستدعى لإعادة مزامنة شكل رأس الآية (دائرة/نجمة) مع MADINAH_CIRCLE_HEADS
  // بعد أي رسم مبكر أو تحديث للصفحة الحالية دون إعادة رسم كاملة.
  function refreshAyahMarkerShapes(){
    if(!els.ayahFlow) return;
    var nums = els.ayahFlow.querySelectorAll('.ayah-num[data-surah][data-ayah]');
    for(var i=0; i<nums.length; i++){
      var el = nums[i];
      var svg = el.querySelector('svg');
      if(!svg) continue;
      var s = parseInt(el.getAttribute('data-surah'), 10);
      var a = parseInt(el.getAttribute('data-ayah'), 10);
      var shouldBeCircle = isMadinahCircleHead(s, a);
      // الدائرة: SVG فارغ + فئة CSS (::before يرسم الحلقة). النجمة: مسار النجمة بدون الفئة.
      var hasStarNow = !!svg.querySelector('.ayah-num-outer');
      if(shouldBeCircle){
        if(hasStarNow) svg.innerHTML = '';
        el.classList.add('ayah-num-circle');
      } else {
        if(!hasStarNow) svg.innerHTML = AYAH_NUM_STAR_PATH;
        el.classList.remove('ayah-num-circle');
      }
    }
  }

  // U+06ED (ARABIC SMALL LOW MEEM) is NOT decorative — it is the classical
  // Uthmani-script mark for "إقلاب" (iqlab): when a kasra tanween is
  // followed by a ب, the Madinah mushaf draws the tanween as a single kasra
  // plus this small low meem instead of the usual doubled kasra, to cue the
  // reader that it is pronounced as a meem sound. Deleting it (an earlier,
  // mistaken fix) silently turns a tanween into a plain kasra and erases a
  // real tajweed rule from the text — never do that again.
  //
  // The actual bug is narrower: the bundled "Uthmanic Hafs" webfont's glyph
  // for U+06ED is broken (a mis-built composite that falls back to a solid
  // black dot) instead of drawing the correct tiny meem. The fix is to
  // render our own small meem in its place — using the ordinary, correctly
  // drawn Arabic letter meem at a reduced size — not to remove the mark.
  var IQLAB_MEEM_REGEX = /\u06ED/g;
  var IQLAB_MEEM_HTML = '<span class="iqlab-mark" aria-hidden="true">\u200cم</span>';

  // علامة السجدة (۩ / U+06E9): بلا هذا التغليف، الرمز يُطبَع بحجم الآية
  // العادي مباشرة — يعني نفس مقاس أي حرف عادي، بينما رسمه في هذا الخط
  // (شكل قبة/مئذنة صغيرة زخرفية) له صندوق ارتفاع أكبر بكثير من حرف
  // عادي، فيظهر كبيرًا بشكل ملحوظ ويتسبب أحيانًا في تداخل بصري مع ما
  // يليه مباشرة (مثال مُبلَّغ: نهاية سورة العلق، حيث الآية نفسها آخر
  // آية في الركوع فيتراكب الرمز مع علامة انتهاء الركوع تحتها). wrapWaqfSigns
  // فوق يترك ۩ كنص عادي غير مغلَّف (ضمن نطاق isWaqfMarkAttachable، لأنه
  // بين 06D6–06ED وليس من WAQF_COMBINING)، فيبقى متاحًا هنا كحرف عادي
  // في الـHTML الناتج لتغليفه بأمان بنفس نمط IQLAB_MEEM_REGEX أعلاه —
  // انظر .sajdah-mark في style.css لتصغير الحجم الفعلي.
  var SAJDAH_MARK_REGEX = /\u06E9/g;
  var SAJDAH_MARK_HTML = '<span class="sajdah-mark">\u06E9</span>';

  // IMPORTANT: the tatweel and the mark(s) riding on it MUST stay inside
  // the same span. Splitting the tatweel into its own element and leaving
  // its combining mark(s) outside broke the font's GPOS mark-to-base
  // anchoring for that mark — with no base glyph left in its own text
  // run to anchor to, the mark fell back to an unanchored default
  // position, which is what pushed the dagger alef's height/position off
  // in an earlier version. Wrapping the tatweel *and* everything that
  // combines onto it together keeps that internal shaping intact; the
  // margin below only nudges the whole little cluster as one unit
  // relative to its neighbours, not anything inside it.
  //
  // How much trailing space looks right turns out to depend on the base
  // letter immediately after the cluster, not on what's riding on the
  // tatweel itself:
  // - Followed by a letter that doesn't connect to what comes after it
  //   (ا د ذ ر ز و ة — e.g. the ra in فَٱدَّـٰرَٰٔتُمۡ): a visible gap
  //   there reads as normal, since Arabic script already breaks visually
  //   at those letters anyway.
  // - Followed by anything that keeps connecting (e.g. the beh in
  //   وَٱلصَّـٰبِـِٔينَ, or the bare hamza in إِسۡرَـٰٓءِيلَ /
  //   لِلۡمَلَـٰٓئِكَةِ, which despite being non-joining itself reads as
  //   part of the same little seat-cluster rather than a fresh letter):
  //   that same gap instead looks like the word broke apart, so this
  //   case gets a much smaller one.
  var TATWEEL_BIG_GAP_AFTER = {0x0627:1, 0x062F:1, 0x0630:1, 0x0631:1, 0x0632:1, 0x0648:1, 0x0629:1};
  var TATWEEL_SEAT_REGEX = /\u0640\u0670[\u0653\u0654\u0655]?(?=([\s\S])|$)/g;
  // iPhone / iPad / iPadOS only: mid-word .tatweel-seat spans break Arabic
  // letter joining on WebKit even without transform (confirmed on-device for
  // أُوْلَـٰٓئِكَ, يَـٰٓأَيُّهَا, …). Use identity there so the word stays
  // one shaping run. Android and desktop keep the v1.0.420 span + CSS
  // (scaleX + margin) unchanged. Detection avoids Android UAs.
  var IS_IOS_IPADOS = (function(){
    try{
      if(typeof navigator === 'undefined') return false;
      var ua = navigator.userAgent || '';
      if(/Android/i.test(ua)) return false;
      if(/iPhone|iPod/i.test(ua)) return true;
      if(/iPad/i.test(ua)) return true;
      // iPadOS 13+ may report as Macintosh with touch
      if(navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1) return true;
      return false;
    }catch(e){
      return false;
    }
  })();
  function tatweelSeatHtml(match, nextChar){
    if(IS_IOS_IPADOS) return match;
    var nextCp = nextChar ? nextChar.codePointAt(0) : null;
    var bigGap = !!(nextCp && TATWEEL_BIG_GAP_AFTER[nextCp]);
    var cls = bigGap ? 'tatweel-seat' : 'tatweel-seat tatweel-seat-tight';
    return '<span class="' + cls + '">' + match + '</span>';
  }

  function cleanAyahText(text){
    // رأس غير الكوفيين (U+E021): في مصحف المدينة فقط نخفيه ونستبدله
    // بنجمتنا الملوّنة (.non-kufi-mark). في مصحف النسخ نبقي الرمز الأصلي
    var src = String(text);
    if(state.fontStyle === 'uthmani') src = src.replace(/\uE021/g, '');
    var out = wrapWaqfSigns(src)
      .replace(IQLAB_MEEM_REGEX, IQLAB_MEEM_HTML)
      .replace(SAJDAH_MARK_REGEX, SAJDAH_MARK_HTML)
      .replace(TATWEEL_SEAT_REGEX, tatweelSeatHtml)
      .replace(NAKH_SHIN_JOIN_REGEX, NAKH_SHIN_JOIN_HTML)
      .replace(KALLA_MADDA_REGEX, KALLA_MADDA_HTML)
      .replace(KALLA_MADDA_WAQF_REGEX, kallaMaddaWaqfHtml)
      .replace(LAM_ALEF_MADDA_REGEX, lamAlefMaddaHtml);
    return out;
  }

  // Reported (screenshot, Uthmani/مصحف المدينة mode): كَلَّآ (83:18 and
  // every other madda-bearing occurrence of "kalla") renders with the
  // combining madda (U+0653) appearing to sit over the لام instead of
  // over the tail of the ligature's أَلِف. An earlier attempt in a prior
  // session added "liga" to font-feature-settings on the theory that the
  // mandatory ك+ل+ا ligature substitution itself wasn't firing — the
  // person confirmed on-device that this did NOT fix the bug, and it was
  // reverted (see style.css history).
  //
  // Direct inspection of this font's compiled GSUB/GPOS tables (fontTools,
  // not assumed) shows the substitution IS firing correctly: ك+ل+ا (in
  // that exact three-letter shape, harakat ignored) ligates into one
  // single font glyph ("kla5", GDEF class Ligature) via a
  // font-specific 3-component ligature -- this is a real, deliberate
  // glyph in the font for this exact word, not a generic ل+ا ligature.
  // The font DOES define a MarkLigPos anchor for U+0653 on this glyph's
  // 3rd component (the أَلِف), at a plausible position near its top-left
  // -- so the font's own data isn't visibly broken either. That points
  // the remaining suspicion at the mobile text shaper's handling of
  // MarkLigPos on a 3-component ligature (uncommon; most GPOS testing
  // in the wild only covers 2-component cases), which is outside what
  // any CSS feature flag can influence.
  //
  // Since neither the ligature-substitution step nor the font's anchor
  // data is the fault, the fix follows the same pattern already used
  // elsewhere in this file for the iqlab meem and the waqf-lazim mark:
  // stop relying on the mark's native rendering for this one exact
  // sequence and draw a substitute in its place. The three base letters
  // (ك ل ا) are left completely untouched so the real "kla5" ligature
  // still forms and still displays connected -- only the trailing madda
  // is suppressed from native rendering and redrawn as an absolutely
  // positioned overlay instead.
  //
  // UNCONFIRMED ON DEVICE -- top/left below are a STARTING ESTIMATE ONLY,
  // aimed at the alif's anchor position reported in the font's own
  // LigatureAttach data (component 2, roughly upper-left of the
  // ligature). Open 83:18 (or any of the other 6 occurrences: 74:54,
  // 75:26, 80:11, 83:7, 83:15, 96:6) on the real device after this
  // build and nudge the position in style.css (.kalla-madda-glyph)
  // until the mark sits directly above the tail-end of the ligature
  // (the أَلِف side, away from the كاف), then report back with the
  // confirmed values. All 16 madda-LESS occurrences of "kalla" (كَلَّا,
  // ending in a plain alif with no U+0653) are untouched by this regex
  // and are not reported as broken, so they're left exactly as-is.
  // SCOPE NOTE: a full-corpus check found 13 total occurrences of this
  // exact "kalla" shape, but 6 of them (23:100, 26:62, 70:15, 70:39,
  // 74:16, 89:21) are immediately followed by a waqf mark with no space
  // in between. Since wrapWaqfSigns() runs BEFORE this regex in
  // cleanAyahText and already wraps that trailing run into its own
  // <span>, the plain 7-codepoint sequence this regex looks for no
  // longer appears contiguously in those 6 cases, so they are NOT
  // touched by this fix yet -- confirmed by testing the regex against
  // the real data.js content, not assumed. They likely have the same
  // underlying bug and need a follow-up once this simpler batch is
  // confirmed working on-device.
  var KALLA_MADDA_REGEX = /\u0643\u064E\u0644\u0651\u064E\u0627\u0653/g;
  var KALLA_MADDA_HTML =
    '<span class="kalla-cluster">' +
      '\u0643\u064E\u0644\u0651\u064E\u0627' +
      '<span class="kalla-madda-glyph" aria-hidden="true">\u0653</span>' +
    '</span>';

  // Follow-up fix for كَلَّآ + waqf mark (23:100, 26:62, 70:15, 70:39,
  // 74:16, 89:21). After the v1.0.420 word-level buffering change,
  // wrapWaqfSigns() puts the WHOLE word inside one .waqf-sign span:
  //   <span class="waqf-sign">كَلَّآۘ</span>
  // (Previously it split as كَ<span>لَّآۘ</span>, which is what the
  // old regex matched.) The plain KALLA_MADDA_REGEX cannot see inside
  // the span tags, so this companion regex rewrites the whole-word
  // form: suppress the native madda and draw .kalla-madda-glyph instead,
  // while keeping the surrounding .waqf-sign so mark sizing/positioning
  // stays identical to every other waqf mark.
  var KALLA_MADDA_WAQF_REGEX =
    /(<span class="waqf-sign">)\u0643\u064E\u0644\u0651\u064E\u0627\u0653([^<]*)(<\/span>)/g;
  function kallaMaddaWaqfHtml(match, waqfSignOpen, markChars, waqfSignClose){
    return '<span class="kalla-cluster">' +
      waqfSignOpen +
      '\u0643\u064E\u0644\u0651\u064E\u0627' +
      '<span class="kalla-madda-glyph" aria-hidden="true">\u0653</span>' +
      markChars + waqfSignClose +
    '</span>';
  }

  // Reported directly (screenshots, on-device, Uthmani mode): the SAME
  // "maddah sits over the لام instead of the tail of the الف" glitch
  // fixed above for كَلَّآ also happens for إِلَّآ and أَلَآ — i.e. it
  // is NOT specific to the ك+ل+ا "kla5" 3-component ligature. Checked
  // directly in this font's compiled GSUB tables (fontTools) before
  // writing this: لام+ألف forms its OWN separate 2-component ligature
  // regardless of what precedes it -- "la001" when لام is word-initial
  // (start of a standalone لَآ), "la002" when it's word-medial (any
  // other preceding letter, e.g. إِلَّآ/أَلَآ) -- distinct font glyphs
  // from "kla5", so this needed its own fix rather than just widening
  // KALLA_MADDA_REGEX's match.
  //
  // A full scan of every لَا/لَّا+maddah occurrence in data.js (391
  // total, across 30 distinct words: إِلَّآ ×100, وَلَآ ×53, لَآ ×48,
  // هَـٰٓؤُلَآءِ ×38, ءَالَآءِ ×32, أَلَآ ×23, and 24 rarer shapes) found
  // this is NOT always مد منفصل the way كَلَّآ always is: some of these
  // words (هَـٰٓؤُلَآءِ، ءَالَآءِ، أُوْلَآءِ، لَآئِمٖ) have a hamzah
  // glued on RIGHT AFTER the maddah within the SAME word (لَآءِ) --
  // that's مد متصل, not منفصل. This fix ALWAYS suppress+redraws the
  // maddah to fix the glyph position (a rendering bug, unrelated to
  // which madd rule applies). No colour class is applied — colouring of
  // specific khilaf words is handled separately by the curated tables
  // further below (SAKTA_HIGHLIGHT_WORDS etc.).
  //
  // UNCONFIRMED ON DEVICE for this broader word set specifically --
  // reuses كَلَّآ's already-3-rounds-tuned offset as a starting estimate
  // (kla5 is a different glyph outline from la001/la002, so this may
  // still need its own separate nudge; report back after checking 2:9
  // and 2:12, the two words confirmed broken so far).
  // Reported directly (screenshot, on-device, Uthmani mode): the الفاء
  // in فَلَآ (81:15, التكوير) rendered visibly DISCONNECTED from the
  // لا that follows it once the fix above started skipping the cluster
  // for any letter that joins forward -- that skip fixed the connection
  // but brought back the ORIGINAL glitch this whole block exists for
  // (the maddah sitting over the لام instead of the tail of the الف),
  // confirmed on-device as still present in فَلَآ after that change.
  // Root cause of the connection break was never "wrapping" itself --
  // it's specifically that .lam-alef-madda-cluster is display:inline-block
  // (a fresh shaping/formatting context that nothing outside it can
  // cursively join into). The كَلَّآ fix above never hit this because it
  // wraps ALL THREE base letters (ك ل ا) of that self-contained word
  // together, so every join that needs to happen (ك-ل and ل-ا) happens
  // fully INSIDE the same inline-block, with nothing outside needing to
  // reach in. The same trick works here: when exactly one ordinary
  // forward-joining letter sits immediately before لا+madda AND that
  // letter is itself the very first letter of the word (nothing further
  // back to worry about -- cleanAyahText runs one word at a time, so a
  // match at the very start of `str` really is the start of the word),
  // absorb that one letter into the SAME cluster instead of leaving it
  // outside. That covers the reported فَلَآ (ف is word-initial here) and
  // the same shape for any other single-prefix-letter word. Multi-letter
  // joining runs before the لا (rarer, unconfirmed in this mushaf) are
  // deliberately NOT absorbed -- the regex only takes one prefix letter,
  // so anything with a longer joining run in front still falls through
  // to the safe fallback below (skip wrapping, keep the native join,
  // accept the uncorrected maddah position for that rarer shape only).
  var LAM_ALEF_NON_JOINING_BEFORE = {0x0627:1, 0x0622:1, 0x0623:1, 0x0625:1, 0x0671:1, 0x062F:1, 0x0630:1, 0x0631:1, 0x0632:1, 0x0648:1, 0x0629:1, 0x0621:1, 0x0624:1, 0x0626:1};
  // Ordinary Arabic base letters that DO join forward (i.e. everything
  // except the non-connector set above) -- used only to opt a single
  // word-initial prefix letter into the cluster, per the fix above.
  var LAM_ALEF_PREFIX_LETTER_CLASS = '\u0628\u062A\u062B\u062C\u062D\u062E\u0633\u0634\u0635\u0636\u0637\u0638\u0639\u063A\u0641\u0642\u0643\u0644\u0645\u0646\u0647\u064A';
  var LAM_ALEF_MADDA_REGEX = new RegExp(
    '(^[' + LAM_ALEF_PREFIX_LETTER_CLASS + '][\\u064B-\\u065F]*)?' +
    '\\u0644(\\u0651)?\\u064E\\u0627(\\u0653)', 'g'
  );
  function lamAlefMaddaHtml(match, prefix, shadda, madda, offset, str){
    var core = (prefix || '') + '\u0644' + (shadda || '') + '\u064E\u0627';
    if(!prefix){
      // No word-initial prefix letter was absorbed by the regex -- fall
      // back to checking whatever actually precedes this match in the
      // string (same check as before): safe to wrap only at true word
      // start or after a letter that never joins forward anyway.
      var before = str.slice(0, offset)
        .replace(/<[^>]+>/g, '')
        .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]+$/, '');
      if(before.length){
        var precedingCp = before.charCodeAt(before.length - 1);
        if(!LAM_ALEF_NON_JOINING_BEFORE[precedingCp]) return match;
      }
    }
    // Glyph-position fix only (maddah sits over لام instead of the
    // alif tail) — no colour class is applied here.
    var glyphClass = 'lam-alef-madda-glyph';
    return '<span class="lam-alef-madda-cluster">' + core +
      '<span class="' + glyphClass + '" aria-hidden="true">' + madda + '</span>' +
    '</span>';
  }

  // ملاحظة عامة على الجداول الخمسة التالية (SAKTA_HIGHLIGHT_WORDS،
  // MUQATTAAT_MAD_WORDS، SEEN_AS_SAD_WORDS، MAD_FARQ_WORDS،
  // TAJWEED_NOTE_WORDS): كانت التعليقات الأصلية تصف هذا التلوين بأنه
  // "تطبيق مباشر لطلب المستخدم" دون تفسير جامع. أكّد المستخدم لاحقًا أن
  // السبب الحقيقي وراء تلوين كل هذه المواضع بلون --khilaf-highlight نفسه
  // هو الإشارة إلى مواضع الخلاف بين طريقَي رواية حفص عن عاصم: طريق
  // الروضة (المعدِّل) وطريق الشاطبية — وليس تمييزًا اعتباطيًا لكل كلمة
  // على حدة كما كانت التعليقات القديمة تُوحي.
  //
  // تأكيد نهائي مباشر من المستخدم (2026-08-01): هذه الكلمات الـ29
  // تحديدًا (عبر الجداول الخمسة مجتمعة) هي المواضع التي يقرأ فيها طريق
  // الشاطبية بمدّ المنفصل، بينما يقرأ فيها طريق روضة الحفاظ بقصر
  // المنفصل. هذا هو السبب الدقيق والوحيد لتوحيد لونها جميعًا بلون
  // --khilaf-highlight، ولتسمية إعداد إظهارها في الواجهة "قصر المنفصل" —
  // وليس مجرد اسم قديم متخلِّف عن ميزة محذوفة (كما افترض تحليل سابق
  // خاطئ). المرجع الرسمي الكامل: docs/khilaf-munfasil-words.md — يجب
  // الرجوع إليه أولاً لأي سؤال مستقبلي عن سبب أو نطاق هذا التلوين، قبل
  // إعادة تحليل الكود من الصفر.
  //
  // السكتات الأربع الواجبة عند حفص عن عاصم: أربعة مواضع ثابتة بالنص (لا
  // خامس لها) يسكت فيها القارئ سكتة لطيفة بلا تنفس بين كلمتين، لمنع توهّم
  // معنى غير مقصود لو وُصل الكلام بلا سكت (مثال: "من راق" بلا سكت على
  // النون تُدغَم فتُسمَع "مرَّاق"). كل موضع منها مُعلَّم أصلًا في رسم
  // المصحف بعلامة السكتة (۟ۜ U+06DC) على الكلمة الأولى — نفس العلامة التي
  // يعالجها WAQF_SAKTA_LIFT_HTML أعلاه — وهذا فقط يضيف على كلمتَي كل
  // موضع نفس لون المد المنفصل (متغيّر --khilaf-highlight نفسه، وليس نسخة
  // منفصلة منه، حتى يبقى مطابقًا تمامًا له لو تغيّر لاحقًا) — راجع
  // الملاحظة العامة أعلى هذا الجدول لسبب هذا التلوين (خلاف الروضة/
  // الشاطبية بمدّ/قصر المنفصل تحديدًا، وليس خلافًا عامًا فقط). مفعّل في
  // الرسمين معًا (العثماني والإندوباك) — راجع تعليق
  // renderAyahWords أدناه لتفاصيل التحقق من تطابق فهرسة الكلمات بين
  // الخطين. المفاتيح "سورة:آية" والقيم أرقام فهرس الكلمة (0-based) كما
  // تُنتجها tokenizeAyahWords بالضبط (نفس الفهرس يشير لنفس الكلمة في
  // الخطين لكل المواضع أدناه):
  //   75:27  ["وَقِيلَ","مَنۡۜ","رَاقٖ"]                → 1، 2
  //   83:14  ["كَلَّاۖ","بَلۡۜ","رَانَ",...]              → 1، 2
  //   36:52  [...,"مِن","مَّرۡقَدِنَاۜۗ","هَٰذَا",...]     → 5، 6
  //   18:1   [...,"لَّهُۥ","عِوَجَاۜ"] (آخر كلمة بالآية)   → 10
  //   18:2   ["قَيِّمٗا",...] (أول كلمة بالآية التالية)     → 0
  // آخر موضعين (18:1/18:2) يقعان في آيتين مختلفتين — كل كلمة تُلوَّن على
  // حدة في آيتها، فتظهران متجاورتين ملوّنتين بنفس اللون في صفحة القراءة
  // رغم انتمائهما لعنصرين منفصلين في الـDOM.
  var SAKTA_HIGHLIGHT_WORDS = {
    '75:27': [1, 2],
    '83:14': [1, 2],
    '36:52': [5, 6],
    '18:1': [10],
    '18:2': [0]
  };


  // فواتح السور (الحروف المقطَّعة): طلب مباشر من المستخدم لتلوين حرفين
  // من فواتح السور بنفس لون المد المنفصل بالضبط — "كٓهيعٓصٓ" (مريم 19:1)
  // و"عٓسٓقٓ" (الشورى 42:2). كل حرف من هذه الحروف يُنطق باسمه (كاف، هاء،
  // ياء، عين، صاد، سين، قاف...)، وبعض هذه الأسماء ينتهي بحرف مد (نحو
  // "كاااف")، وهذا هو ما ترسمه المدّة (U+0653) الظاهرة فعلًا في a.text
  // فوق ك ع ص س ق هنا تحديدًا (لا فوق ه/ي، اللذين مدّهما طبيعي بلا علامة
  // في الرسم) — هذا مد مختلف عن المد المنفصل (مد لازم حرفي، لا مد
  // منفصل)، لكن التلوين هنا فقط تطبيق للون --khilaf-highlight نفسه — راجع
  // الملاحظة العامة أعلى جدول SAKTA_HIGHLIGHT_WORDS لسبب هذا التلوين
  // (خلاف الروضة/الشاطبية)، وليس ادّعاءً بأن هذا مد منفصل فعلًا. يُلوَّن هنا
  // الكلمة (الحرف المقطَّع) كاملة كوحدة واحدة، بنفس أسلوب SAKTA_HIGHLIGHT_WORDS
  // أعلاه، لا حرفًا واحدًا بمفرده -- كل من الآيتين كلمة/حرف مقطَّع واحد
  // يشكّل الآية كلها (فهرس الكلمة 0 في الحالتين). مفعّل في الرسمين معًا
  // (العثماني والإندوباك، راجع تعليق renderAyahWords أدناه)، ومقصور على
  // هاتين الآيتين حصرًا كما طُلب -- لم يُطبَّق
  // على بقية فواتح السور الأخرى (الم، طه، يس، ص، حم، ق، ن، ...) لعدم
  // ورود طلب بذلك.
  //
  // UPDATE (طلب مباشر لاحق): أُضيف "ن" (القلم 68:1) و"يس" (يس 36:1)
  // بنفس المبرر والأسلوب أعلاه بالضبط -- المدّة (U+0653) ظاهرة فعليًا في
  // a.text فوق النون في "نٓۚ" (تليها علامة وقف جائز ۚ، ضمن نفس الكلمة/
  // الفهرس 0)، وفوق السين في "يسٓ" (الكلمة/الآية كاملة بحرفين، فهرس 0)،
  // لنفس سبب مد اسم الحرف. لم يُطبَّق على بقية الحروف المفردة الأخرى
  // (ص وحدها، ق وحدها، ن مكرر في مواضع أخرى إن وُجدت) لعدم ورود طلب بها.
  var MUQATTAAT_MAD_WORDS = {
    '19:1': [0],
    '42:2': [0],
    '68:1': [0],
    '36:1': [0]
  };

  // كلمات السين المرسومة صادًا: أربع كلمات مشهورة في المصحف رُسمت فيها
  // السين الأصلية بحرف الصاد (لغة قريش) بدل السين (لغة تميم)، وثلاث منها
  // تحمل فوق الصاد سينًا صغيرة (نفس الرمز U+06DC المستخدم أيضًا للسكتة
  // في مكان آخر من هذا الملف — رمز واحد بمعنيين مختلفين حسب موضعه)
  // للدلالة على جواز القراءة بالوجهين (بالصاد والسين معًا)، بينما
  // "بمصيطر" (الغاشية 22) لا سين صغيرة فوقها لأن حفصًا يقرؤها بالصاد
  // وجهًا واحدًا فقط. هذا ليس مدًّا من أي نوع (لا مد منفصل ولا غيره) —
  // التلوين هنا فقط تطبيق للون --khilaf-highlight نفسه؛ راجع الملاحظة العامة
  // أعلى جدول SAKTA_HIGHLIGHT_WORDS لسبب هذا التلوين (خلاف الروضة/
  // الشاطبية)، وليس ادّعاءً بأنها مد. تُلوَّن الكلمة كاملة كوحدة واحدة، بنفس أسلوب الجداول أعلاه.
  // مفعّل في الرسمين معًا (العثماني والإندوباك)، ومقصور على هذه المواضع
  // الأربعة تحديدًا:
  //   52:37  ["أَمۡ","عِندَهُمۡ",...,"ٱلۡمُصَۜيۡطِرُونَ"]   → 6
  //   88:22  ["لَّسۡتَ","عَلَيۡهِم","بِمُصَيۡطِرٍ"]           → 2
  //   2:245  [...,"يَقۡبِضُ","وَيَبۡصُۜطُ",...]              → 13
  //          (مصحف النسخ: هذا الفهرس (13) لا يُستخدم هناك -- مستثنى من
  //          هذا التفعيل تحديدًا كما سبق، لكن وَيَبۡصُۜطُ نفسها لا تزال
  //          تُلوَّن في مصحف النسخ عبر آلية بديلة منفصلة -- راجع
  //          فوق renderAyahWords أدناه. يعمل الفهرس العادي (13) بشكل
  //          طبيعي في العثماني كما هو).
  //   7:69   [...,"ٱلۡخَلۡقِ","بَصۜۡطَةٗۖ",...]               → 21
  var SEEN_AS_SAD_WORDS = {
    '52:37': [6],
    '88:22': [2],
    '2:245': [13],
    '7:69': [21]
  };

  // مد الفرق: ثلاث كلمات فقط في القرآن (ست مواضع) تجمع همزة الاستفهام
  // مع همزة الوصل بعدها فتُبدَل همزة الوصل ألفًا ثابتة مع مدّة، للتفريق
  // بين الاستفهام والخبر لو حُذفت (مثال: "ءالله" استفهام إنكاري، لو
  // حُذفت الهمزة الثانية ونُطقت "الله" لصار خبرًا لا استفهامًا). هذا مد
  // لازم (الفرق) وليس مد منفصل. التلوين هنا تطبيق للون --khilaf-highlight
  // (خلاف الروضة/الشاطبية) — راجع الملاحظة العامة أعلى جدول
  // SAKTA_HIGHLIGHT_WORDS — وليس ادّعاءً بأنها مد منفصل. تُلوَّن الكلمة
  // كاملة كوحدة واحدة. مفعّل في الرسمين معًا (العثماني والإندوباك).
  // المواضع الستة كاملة (لا خامس/سابع لها):
  //   10:51  ["...","ءَامَنتُم","بِهِۦٓۚ","ءَآلۡـَٰٔنَ",...]  → 6
  //   10:91  ["ءَآلۡـَٰٔنَ",...]                              → 0
  //   6:143  [...,"قُلۡ","ءَآلذَّكَرَيۡنِ",...]                → 9
  //   6:144  [...,"قُلۡ","ءَآلذَّكَرَيۡنِ",...]                → 7
  //   10:59  [...,"قُلۡ","ءَآللَّهُ",...]                     → 13
  //   27:59  [...,"ٱصۡطَفَىٰٓۗ","ءَآللَّهُ",...]                → 8
  var MAD_FARQ_WORDS = {
    '10:51': [6],
    '10:91': [0],
    '6:143': [9],
    '6:144': [7],
    '10:59': [13],
    '27:59': [8]
  };

  // دفعة كلمات متنوعة طلبها المستخدم مباشرة، كل واحدة منها ظاهرة
  // رسمية/نطقية مختلفة، لكن كلها تُلوَّن بنفس لون --khilaf-highlight بالضبط؛
  // راجع الملاحظة العامة أعلى جدول SAKTA_HIGHLIGHT_WORDS لسبب هذا
  // التلوين (خلاف الروضة/الشاطبية) — وليست كلها مد منفصل فعليًا:
  //   12:11  تَأۡمَ۬نَّا — علامة الإشمام (U+06EC) فوق النون: إشارة لضم
  //          الشفتين بلا صوت عند سكون الميم (أصلها تَأۡمَنُونَنَا) دلالة
  //          على الحركة الأصلية المحذوفة بالإدغام. كلمة واحدة → فهرس 5.
  //   26:63  فِرۡقٖ — كما طلب المستخدم بالحرف، بلا أي علامة خاصة مرتبطة
  //          بها في بيانات هذا المصحف؛ التلوين هنا تنفيذ مباشر للطلب
  //          فقط، بلا أي تفسير تجويدي إضافي → فهرس 10.
  //   27:36  ءَاتَىٰنِۦَ — ياء الإضافة الساكنة محذوفة رسمًا ومستبدلة بياء
  //          صغيرة فوق الحرف (U+06E6) فوق كسرة النون، تذكيرًا بالياء
  //          الأصلية الساقطة نطقًا في بعض القراءات/الوقف. كلمة واحدة →
  //          فهرس 7 (وليس "ءَاتَىٰكُمۚ" الأخرى في نفس الآية، فهي فعل
  //          عادي بلا ياء إضافة محذوفة).
  //   76:4   سَلَٰسِلَاْ — ألف مبدلة من التنوين لكلمة أعجمية ممنوعة من
  //          الصرف جزئيًا (يجوز فيها الوجهان: تنوين أو ألف بلا تنوين)،
  //          مكتوبة بسكون فوق الألف (U+0652) للدلالة على أنها لا تُلفَظ
  //          مدًّا كاملًا وقفًا ووصلًا. كلمة واحدة → فهرس 3.
  //   30:54  ضَعۡفٖ / ضَعۡفٖ / ضَعۡفٗا — كما طلب المستخدم بالحرف، بلا أي
  //          علامة خاصة مرتبطة بها في بيانات هذا المصحف (نفس حال "فرق"
  //          أعلاه) — تلوين مباشر للطلب فقط، بلا تفسير تجويدي إضافي.
  //          المواضع الثلاثة كلها في نفس الآية → فهرس 4، 9، 16. (مصحف
  //          النسخ فقط: مستثنى من التفعيل أدناه تحديدًا -- راجع تعليق
  //          renderAyahWords؛ يعمل بشكل طبيعي في العثماني.)
  // ملاحظة: كانت هذه القائمة تشمل أيضًا 7:176 (يلهث ذلك) و11:42 (اركب
  // معنا) و77:20 (نخلقكم) — أُزيلت الثلاثة بناءً على طلب مباشر لاحق من
  // المستخدم بإلغاء التلوين عنها تحديدًا، دون المساس ببقية الجدول.
  // مفعّل في الرسمين معًا (العثماني والإندوباك، عدا 30:54 في النسخ كما
  // سبق)، بنفس أسلوب الجداول أعلاه.
  var TAJWEED_NOTE_WORDS = {
    '12:11': [5],
    '26:63': [10],
    '27:36': [7],
    '76:4': [3],
    '30:54': [4, 9, 16]
  };

  // =========================================================================
  // تلوين السجاوندي — مصحف المدينة فقط
  // Source of Truth: window.MADINAH_SAJAWANDI (madinah-sajawandi.js)
  // =========================================================================
  var MADINAH_MARK_TO_CLS = {
    'ط': 'has-default-waqf',
    'ج': 'has-default-jeem',
    'ص': 'has-default-sad-rukhsa',
    'ز': 'has-default-zay-jawaz',
    'ق': 'has-default-qad-qila',
    'قف': 'has-default-qif',
    'م': 'has-default-waqf-lazim'
  };
  function buildMadinahSajawandiByAyah() {
    var byAyah = Object.create(null); // "s:a" -> { 1-basedWord: mark }
    var list = (typeof window !== 'undefined' && window.MADINAH_SAJAWANDI) || [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (!r || r.s == null || r.a == null || r.w == null || !r.m) continue;
      var key = r.s + ':' + r.a;
      if (!byAyah[key]) byAyah[key] = Object.create(null);
      byAyah[key][r.w] = r.m;
    }
    return byAyah;
  }
  var MADINAH_SAJAWANDI_BY_AYAH = buildMadinahSajawandiByAyah();



  // خ in نَخۡشٰٓى (5:52) sits too low relative to the ش that follows it
  // -- described directly by the user as "the kha is dropping down, not
  // connecting with the sheen" -- so this is a vertical baseline/
  // positioning mismatch, not a broken cursive join (a zero-width-joiner
  // fix was tried first on that assumption and confirmed NOT to work,
  // reverted here). A full-dataset sweep confirms 5:52 is the ONLY place
  // in the whole mushaf where a sukun-marked consonant sits immediately
  // before a shin carrying both a dagger-alif and a madda together
  // (ۡ + شٰٓ) -- the same sukun+shin pair renders fine 213 other times
  // (e.g. 2:150, 4:9, 5:3) and the same shin+dagger-alif+madda renders
  // fine alone at 11:87 (نَشٰٓؤُا, confirmed correct on-device by the
  // user) -- so this is an isolated font glyph-positioning bug unique to
  // this one word, not a systemic pattern needing a general rule.
  // Lifting the نَخۡ cluster (per the user's own on-device diagnosis)
  // to bring its baseline back up to the ش that follows should close
  // the visual gap. Deliberately NOT display:inline-block here (unlike
  // the other *-lift classes in style.css) -- those only ever wrap a
  // single combining MARK, which never participates in Arabic cursive
  // joining, so isolating it in its own inline-block box is harmless.
  // نَخۡ contains two BASE letters (ن and خ) that must keep shaping as
  // part of the same cursive run as the ش right after them; an
  // inline-block here would force a hard shaping boundary exactly where
  // the join is already broken and risk making the disconnect worse or
  // permanent instead of fixing it. Plain inline + position:relative
  // keeps it in the same text run as its neighbour while still allowing
  // a vertical offset. -0.1em is a STARTING ESTIMATE ONLY, not yet
  // confirmed against the live rendered page -- open 5:42/5:52 on a
  // real device after this build and nudge the value in style.css
  // (.nakh-shin-lift) up/down until نَخۡ sits flush against شٰٓ with a
  // proper cursive connection and no visible drop or gap, then report
  // back with the confirmed number.
  var NAKH_SHIN_JOIN_REGEX = /\u0646\u064E\u062E\u06E1(?=\u0634\u0670\u0653)/g;
  var NAKH_SHIN_JOIN_HTML = '<span class="nakh-shin-lift">\u0646\u064E\u062E\u06E1</span>';

  // This Indo-Pak-style font annotates pauses (waqf) using more signs than
  // the six classical Sajawandi marks in Unicode's 06D6–06DB block. We
  // verified — by inspecting the actual font's GDEF table, not by
  // guessing — that every waqf-related codepoint used in this text falls
  // into exactly two categories:
  //
  // 1) True OpenType combining marks (GDEF class "Mark", GPOS-anchored to
  //    a base letter via mark-to-base/mark-to-mark): the six classical
  //    signs ۖۗۘۙۚۛ (U+06D6–U+06DB), the saktah/pause sign ۜ (U+06DC),
  //    ط "waqf mutlaq" at U+0615 (outside the classical block, easy to
  //    miss), and three more from this font's Private Use Area
  //    (U+E004, U+E021, U+E022). Because these are true combining marks,
  //    each one must stay bundled with its base letter (+ any harakat
  //    between them) in the same wrapping span, or the font has nothing
  //    to anchor it to and positioning breaks — same class of issue as
  //    the word-level mark/mkmk chaining documented above.
  // 2) Standalone glyphs (GDEF class "Base", own advance width, like a
  //    punctuation character) in the same font's Private Use Area
  //    (U+E01A, U+E01B, U+E01C, U+E01E, U+E01F) for the remaining waqf
  //    letters this font draws. These don't attach to a base letter, so
  //    they're safe to wrap on their own.
  //
  // IMPORTANT — this is a manual character scanner, deliberately NOT a
  // regex. An earlier version used a single complex regex (nested
  // alternation + negative lookahead + \p{M}/\p{Co} unicode-property
  // classes) and it silently corrupted output — including on ayaat with
  // no waqf marks near the corruption site — after being called tens of
  // thousands of times in the real app's render loop (every word of
  // every page). That's consistent with a V8 Irregexp JIT bug on this
  // specific pattern shape, not a logic error: the exact same pattern,
  // freshly constructed, on the exact same input, gave different results
  // depending on how many prior calls had run. It reproduced in plain
  // Node, so it isn't specific to one browser. A manual scan has no such
  // risk surface. Verified stable over 3.5M calls across every ayah in
  // this mushaf, run 50 times each, with zero corruption.
  var WAQF_COMBINING = {0x0615:1,0x06D6:1,0x06D7:1,0x06D8:1,0x06D9:1,0x06DA:1,0x06DB:1,0x06DC:1,0xE004:1,0xE021:1,0xE022:1};
  var WAQF_STANDALONE = {0xE01A:1,0xE01B:1,0xE01C:1,0xE01E:1,0xE01F:1};
  // The four ALEF forms (plus wasla) that a preceding LAM mandatorily
  // ligatures with into a single "لا"-shaped glyph — see LAM_ALEF_PARTNERS
  // usage in wrapWaqfSigns below.
  var LAM_ALEF_PARTNERS = {0x0627:1, 0x0622:1, 0x0623:1, 0x0625:1, 0x0671:1};
  function isWaqfMarkAttachable(cp){
    // Ordinary combining diacritics (harakat, madda, etc.) and other,
    // non-waqf Quranic annotation marks (e.g. the iqlab meem U+06ED,
    // handled separately below) plus zero-width/format characters and
    // other PUA marks this font uses for fine positioning. All of these
    // stay glued to whatever base letter/cluster precedes them.
    if(cp>=0x0300 && cp<=0x036F) return true;
    if(cp>=0x064B && cp<=0x065F) return true;
    if(cp===0x0670) return true;
    if(cp>=0x06D6 && cp<=0x06ED && !WAQF_COMBINING[cp]) return true;
    if(cp>=0xE000 && cp<=0xF8FF && !WAQF_COMBINING[cp] && !WAQF_STANDALONE[cp]) return true;
    if(cp>=0x200B && cp<=0x200F) return true;
    return false;
  }
  // CORRECTED (was wrong): U+06D8 is NOT an undersized/broken glyph that
  // needs replacing. Measured directly from the font's outline data: its
  // ink is genuinely small and sits high with no descender (glyph bbox
  // height ~0.19em vs ~0.76em for a full meem letter) — that's the
  // authentic, deliberately compact design of the classical waqf-lazim
  // mark, confirmed against a real Madinah-mushaf page image. The earlier
  // fix mistook "small" for "broken" and replaced it with a scaled-down
  // plain letter meem — which made it visually indistinguishable from the
  // iqlab meem mark (U+06ED, handled separately above), since both ended
  // up drawn as the same full letterform at a reduced size. Letting the
  // font's own U+06D8 glyph render (see wrapWaqfSigns below, which keeps
  // it in the same span as its base letter for correct GPOS mark
  // anchoring) is the correct, minimal fix.

  // U+06DA (jeem, "jaiz") and U+06D6 (the sila ligature) only ever collide
  // when they land in the SAME combining run above one letter (e.g. 2:1
  // "رَيْبَ", where jaiz + sila + mu'anaqah all stack on the same ba').
  // Verified directly against this font's compiled GPOS table (dumped via
  // fontTools, not assumed): these two marks are NOT mark-to-mark anchored
  // to each other at all — they're both members of one shared 8-glyph
  // coverage set (U+0615, 06D6–06DB, 06E8) that a contextual lookup nudges
  // as a single group, and absent that context each glyph falls back to
  // its own raw, unrelated design position. For this pair those raw
  // positions happen to coincide, so they render on top of each other
  // instead of stacking. The mu'anaqah dots (06DB) land at a genuinely
  // different position and are unaffected, so this fix touches only the
  // sila mark, and only when jeem is also present in the run.
  var WAQF_SILA_LIFT_HTML = '<span class="waqf-sila-lift" aria-hidden="true">\u06D6</span>';
  // The saktah mark (U+06DC) has the same "no mark-to-mark, shared raw
  // fallback position" issue described above for jeem+sila -- confirmed
  // on-device at 18:1 (الكهف, sakta + waqf-mutlaq U+0615) and 36:52 (يس,
  // sakta + waqf-lazim U+06D8): the sakta glyph rendered BELOW the other
  // mark instead of stacked above it, regardless of which order the two
  // characters appear in the source text (input order made no visible
  // difference -- this font simply has no mkmk lookup between this pair,
  // same as jeem+sila). Lifting the sakta glyph itself, only when it
  // co-occurs with U+0615 or U+06D8 in the same run, restores the correct
  // reading order (base letter -> other mark -> sakta on top), matching
  // the printed mushaf. -0.35em is a STARTING ESTIMATE ONLY, mirrored
  // from the sila-lift value -- open 18:1 and 36:52 on a real device and
  // nudge the number in devtools until the sakta clears the other mark
  // with a small visible gap, then update it here.
  var WAQF_SAKTA_LIFT_HTML = '<span class="waqf-sakta-lift" aria-hidden="true">\u06DC</span>';
  // Companion fix for the same 18:1/36:52 collision: lifting the sakta
  // alone still left it touching/overlapping the waqf-mutlaq or
  // waqf-lazim mark underneath (confirmed on-device) -- the two glyphs
  // need to separate from both sides, not just push the sakta up. Nudges
  // the OTHER mark down slightly instead of moving it, same
  // starting-estimate caveat as WAQF_SAKTA_LIFT_HTML above: open 18:1/
  // 36:52 on a real device and adjust independently if needed.
  var WAQF_MARK_LOWER_HTML = function(ch){
    return '<span class="waqf-mark-lower" aria-hidden="true">' + ch + '</span>';
  };
  // The waqf-mutlaq mark (U+0615, 18:1 only) needed a small rightward
  // nudge on top of the vertical lower -- confirmed on-device it was
  // colliding horizontally with the alif of عِوَجًا, while the waqf-lazim
  // case at 36:52 was already correctly positioned and must stay
  // untouched. Separate class from .waqf-mark-lower so this horizontal
  // fix never affects the waqf-lazim mark.
  var WAQF_MARK_LOWER_MUTLAQ_HTML = '<span class="waqf-mark-lower-mutlaq" aria-hidden="true">\u0615</span>';
  // Ruku-end mark (U+E022, this font's PUA glyph for "ع") collides with
  // the bowl of a preceding bare ن (noon, no harakah between them) --
  // confirmed on-device at 59:17, where the mark did not appear at all,
  // while the exact same mark rendered correctly after every other
  // letter tested (e.g. 33:40's bare ا, 4:33, 6:20). Only a bare-ن case
  // is affected; a harakah between them (as in 6:20's نَ) already keeps
  // them visually clear, so this only rewrites the narrow ن+U+E022
  // sequence. -0.3em is a STARTING ESTIMATE ONLY, not yet confirmed
  // against the live rendered page -- open an affected ruku end on a
  // real device and nudge the value in devtools until the mark clears
  // the noon's bowl with a small visible gap, then update the number.
  var WAQF_RUKU_MARK_NOON_LIFT_HTML = '<span class="waqf-ruku-mark-noon-lift" aria-hidden="true">\uE022</span>';
  function wrapWaqfSigns(text){
    // Word-level buffering (v1.0.420): keep the entire current word in
    // `buffer` until a word boundary or a waqf mark. Previously the
    // function flushed on every new base letter, so a trailing combining
    // waqf mark produced e.g. رَّبِّهِ<span class="waqf-sign">مۡۖ</span>
    // — the final letter sat in a separate DOM node from the rest of the
    // word. WebKit/iOS treats that span boundary as a shaping-run break
    // and the Arabic join between ه and م collapses (confirmed on-device
    // for 2:5 رَّبِّهِمۡۖ and 2:7 سَمۡعِهِمۡۖ, with and without the
    // hide-waqf-marks toggle). Putting the whole word + mark inside one
    // .waqf-sign span keeps a single shaping run; display text and
    // show/hide of Sajawandi colouring are unchanged.
    var out = '', buffer = '';
    for(var i=0; i<text.length; i++){
      var ch = text[i], cp = text.codePointAt(i);
      if(WAQF_COMBINING[cp]){
        // Stacked waqf marks (e.g. jaiz immediately followed by muanaqah)
        // all belong in the same span as the word they sit on.
        var runCps = [cp];
        var run = ch;
        while(i+1 < text.length && WAQF_COMBINING[text.codePointAt(i+1)]){
          i++;
          runCps.push(text.codePointAt(i));
          run += text[i];
        }
        // Jeem+sila collision fix (see comment above WAQF_SILA_LIFT_HTML):
        // only rewrite the raw sila character, only when jeem is also in
        // this exact run, so every other mark combination is untouched.
        if(runCps.indexOf(0x06DA) !== -1 && runCps.indexOf(0x06D6) !== -1){
          run = run.replace('\u06D6', WAQF_SILA_LIFT_HTML);
        }
        // Sakta+waqf-mutlaq or sakta+waqf-lazim collision fix (see comment
        // above WAQF_SAKTA_LIFT_HTML) -- only rewrite the raw sakta
        // character, only when one of those two marks is also in this
        // exact run, so every other mark combination (including sakta on
        // its own, as at 75:27 and 83:14) is untouched.
        if(runCps.indexOf(0x06DC) !== -1 && (runCps.indexOf(0x0615) !== -1 || runCps.indexOf(0x06D8) !== -1)){
          run = run.replace('\u06DC', WAQF_SAKTA_LIFT_HTML);
          if(runCps.indexOf(0x0615) !== -1){
            run = run.replace('\u0615', WAQF_MARK_LOWER_MUTLAQ_HTML);
          }
          if(runCps.indexOf(0x06D8) !== -1){
            run = run.replace('\u06D8', WAQF_MARK_LOWER_HTML('\u06D8'));
          }
        }
        // Ruku-end mark colliding with a bare ن right before it (see
        // comment above WAQF_RUKU_MARK_NOON_LIFT_HTML): only when the
        // mark run is the ruku-end mark alone and the base letter
        // immediately before it (last char of the cleaned buffer, i.e.
        // after stripping the zero-width format chars handled below) is
        // exactly ن with nothing else (no harakah) in between.
        if(runCps.length === 1 && runCps[0] === 0xE022){
          var cleanedForNoonCheck = buffer.replace(/[\u200B-\u200F]/g, '');
          if(cleanedForNoonCheck.length && cleanedForNoonCheck.charCodeAt(cleanedForNoonCheck.length - 1) === 0x0646){
            run = WAQF_RUKU_MARK_NOON_LIFT_HTML;
          }
        }
        // Drop zero-width format chars (U+200B–U+200F) that sit between
        // OpenType shaper treats them as cluster breaks, so GPOS
        // mark-to-base never fires. Stripped at display time only.
        var cleanBuffer = buffer.replace(/[\u200B-\u200F]/g, '');
        out += '<span class="waqf-sign">' + cleanBuffer + run + '</span>';
        buffer = '';
        continue;
      }
      if(WAQF_STANDALONE[cp]){
        out += buffer; buffer = '';
        out += '<span class="waqf-sign">' + ch + '</span>';
        continue;
      }
      if(isWaqfMarkAttachable(cp)){
        buffer += ch;
        continue;
      }
      // Word boundary (whitespace): flush the completed word as plain
      // text, then emit the boundary character itself.
      if(ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\u00A0'){
        out += buffer;
        buffer = '';
        out += ch;
        continue;
      }
      // Any other character (new base letter, punctuation, etc.): stay
      // inside the current word buffer. This is what keeps ر + ب + ه + م
      // in one continuous run so a later waqf mark can wrap the whole
      // word without a mid-word span boundary. The former LAM+ALEF
      // special-case is no longer needed — both letters remain in the
      // same buffer by default and form their ligature inside the span.
      buffer += ch;
    }
    out += buffer;
    return out;
  }

  // Wraps every word of an ayah in its own span so a personal reminder star
  // can be anchored above any single word. The dot itself is always in the
  // DOM (hidden by default via CSS) and only switched on per-word via the
  // "has-waqf" class plus a "mark-<color>" class, so toggling/updating
  // marks never requires re-building this HTML.
  // A handful of words in this Uthmani dataset (e.g. فَٱدَّـٰرَ ٰٔتُمۡ in
  // 2:72) encode a purely typographic internal gap using a Unicode space
  // character (here, U+2009 THIN SPACE — not a plain U+0020), even though
  // it's grammatically one word — no real Arabic word starts with a bare
  // floating diacritic, so a space immediately followed by one is never a
  // genuine word boundary. Left as a normal split point, the browser could
  // legally line-wrap between the two halves at some font sizes, splitting
  // the word across two lines. The space itself is never removed (still
  // exactly what's in data.js) — it's only swapped for this placeholder
  // just long enough to keep both halves inside a single split() chunk,
  // then restored as a real space in the merged text before rendering, in
  // one non-breaking word span.
  var MIDWORD_SPACE_PLACEHOLDER = '\u2060';
  var MIDWORD_SPACE_REGEX = /\s(?=[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED])/g;

  // genuine U+0020 space -- not a floating diacritic, so MIDWORD_SPACE_REGEX
  // above does not catch this case -- even though they are grammatically one
  // word, e.g. "وَاٰ تُوۡهُمۡ" for وَآتُوهُمْ. Reported: the app was
  // wrapping "...وا" onto one line and "توهم..." onto the next (60:10).
  // Covers every confirmed occurrence of this exact bug across the
  // mushaf: وَآتُوا (4:2, 4:4, 4:77, 24:56, 60:11), فَ/وَآتُوهُنَّ
  // (4:24, 4:25, 65:6), فَ/وَآتُوهُمْ (4:33, 24:33, 60:10), آلَاءَ
  // (7:69, 7:74), سَوْآتُهُمَا (20:121), and ءَاتَيْتُمُوهُنَّ (60:10).
  // Unlike "اٰ" followed by a space before a genuinely separate next
  // word (e.g. رَاٰ كَوۡكَبًا -- "رأى" + "كوكبا", two real words that
  // must stay separately breakable, confirmed correct and left alone --
  // along with the same pattern in 6:76, 6:78, 7:17, 10:87, 12:24,
  // 12:28, 17:83, 20:10, 41:51), these exact sequences are a single word
  // split mid-way -- listed explicitly here rather than matched by a
  // general pattern, since a blanket rule would also wrongly glue
  // together those genuine word boundaries sharing the same "اٰ" shape.
  // Joined with a real non-breaking space (\u00A0, not the placeholder
  // above) so the two halves render as one unbroken visual word even
  // though -- unlike the diacritic case -- they stay separate DOM tokens.
// tokens split by a genuine U+0020 ("ذٰ" + "لِكَ"), so the same line-wrap bug hits
// every occurrence of dhalika throughout the mushaf (reported: 9:6, where
// "ذٰ" rendered as its own line, disconnected from "لِكَ"). Covers both the
// "ذٰ لِكَ" and "ذٰ لِكُ" (dhalikum-family) spellings confirmed in the
// dataset -- these recur at ~200+ occurrences each across the text, since
// joinKnownSplitWords replaces every match, not just the first.
// أَلَّا ("alla", fatha-alef + lam-shadda-fatha-alef) is likewise split
// (خَلۡفِهِمۡ اَ / لَّا خَوۡفٌ, the "اَ" stranding itself at the end of one
// line and "لَّا" starting the next). Every confirmed occurrence of this
// exact split in the dataset: 2:229, 3:170, 5:8. Not to be confused with
// إِلَّا ("illa", hamza-kasra) or any other lam-alef sequence -- only this
// exact fatha-alef + lam-shadda-fatha-alef sequence is affected.
// أَكَّالُونَ ("akkaloon") is likewise split by a genuine U+0020 in
// Only confirmed occurrence of this exact split in the dataset: 5:42.
// وَأَلۡقَيۡنَا ("wa-alqaynaa") is likewise split by a genuine
// where "وَاَ" rendered with a visible gap before "لۡقَيۡنَا" in
// The 29 fragments below this line were found by a full data.js scan
// (tools/scan-alif-split.js, kept alongside the tests) for the same bug
// shape: an isolated "ا" (+ diacritics, optionally prefixed with a single
// و/ف) split from the rest of the word by a genuine U+0020, where the
// remainder starts with ل. Same restricted heuristic as the manually-found
// entries above -- it does not fire on real two-word sequences like
// "قَالَ لَهُ" or "يَا لَيۡتَ", since those first tokens are full words,
// not a lone alif (+ optional 1-letter prefix). Each fragment covers every
// occurrence in the mushaf, not just the one ayah it was first spotted in
// -- see tests/search-regression.js (A2c) for the reference ayah used to
// verify each one.
var KNOWN_SPLIT_WORD_FRAGMENTS = ["اٰ تُوۡهُمۡ", "اٰ تَيۡتُمُوۡهُنَّ", "اٰ تُوا", "اٰ تُوۡهُنَّ", "اٰ لَۤاءَ", "اٰ تُہُمَا", "ذٰ لِكَ", "ذٰ لِكُ", "اَ لَّا", "اَ لَّذِيۡنَ", "اَ كّٰلُوۡنَ", "وَاَ لۡقَيۡنَا", "اَ لِيۡمٌ‏", "اَ لِيۡمٍ‏", "فَاَ لَّفَ", "اَ لِيۡمًا‏", "اَ لۡقٰٓى", "اَ لۡقٰٮهَاۤ", "اَ لِيۡمًا", "اَ لۡيَوۡمَ", "اَ لِيۡمٌۢ", "اَ لۡفًا", "اَ لِيۡمٍۙ‏", "اَ لۡحَمۡدُ", "اَ لَّنۡ", "اَ لَمۡ", "وَاَ لۡقِ", "اَ لِيۡمٍ‏", "اَ لۡمُلۡكُ", "اَ لِيۡمًا", "فَاَ لۡقٰى", "فَاَ لۡقِيۡهِ", "اَ لۡقِ", "اَ لۡفَ", "وَاَ لۡقٰى", "اَ لِيۡمًا‏", "اَ لۡحَـقۡتُمۡ", "اَ لۡوَانُهٗ", "اَ لَيۡسَ", "اَ لِيۡمٌۙ‏", "فَاَ لۡقِيٰهُ"];
  var KNOWN_SPLIT_PLACEHOLDER = '\u2061';
  function joinKnownSplitWords(s){
    KNOWN_SPLIT_WORD_FRAGMENTS.forEach(function(frag){
      s = s.split(frag).join(frag.replace(' ', KNOWN_SPLIT_PLACEHOLDER));
    });
    return s;
  }

  // Splits ayah text into exactly the same word tokens that end up as
  // individual .quran-word spans in the rendered DOM below — this is the
  // ONE place in the app that decides what counts as a "word" for
  // indexing purposes (the numeric suffix in each span's data-key).
  // SearchManager.findMatchWordRange() calls this too (see searchManager.js),
  // instead of tokenizing independently, so a search result's computed
  // word-range can never drift out of sync with the real DOM word index
  // encodes a waqf mark as its own space-delimited token (e.g. 2:137),
  // since only this function's MIDWORD_SPACE_REGEX step folds it back
  // into the previous word.
  function tokenizeAyahWords(rawText){
    var src = joinKnownSplitWords(rawText);
    src = src.replace(MIDWORD_SPACE_REGEX, MIDWORD_SPACE_PLACEHOLDER);
    return src.split(/\s+/).filter(Boolean);
  }

  // QUL) بنفس صيغة "مسافة + الرمز" الملحقة بآخر كلمة، في كل مواضع
  // السجدة المعروفة في هذا المصحف عدا موضع واحد — 96:19 — حيث الرمز
  // موجود في a.text (مصحف المدينة/العثماني، الذي لا يُعدَّل هنا ولا في
  // خط الناسخ لهذه الآية تحديدًا رغم ظهوره الصحيح في العثماني.
  //
  // يُلحَق هنا بنفس الصيغة النصية الحرفية المستخدمة أصلًا في بقية
  // المواضع الأربعة عشر ("مسافة + ۩") قبل تمرير النص لنفس مسار
  // المعالجة المعتاد (tokenizeAyahWords / MIDWORD_SPACE_REGEX الذي
  // يتعامل بالفعل بشكل صحيح مع "مسافة + علامة وقف" الملحقة بآخر كلمة —
  // شوف تعليق tokenizeAyahWords فوق) — بلا أي معالجة خاصة إضافية.
  //
  // الشرط مبني على فحص a.text نفسه (لا رقم سورة/آية مكتوب يدويًا)
  // إذا أُضيفت العلامة هناك لاحقًا، يصبح الشرط الثاني false ولا يتكرر
  // الإلحاق. مستخرجة كدالة منفصلة (بدل تضمينها مباشرة في
  // renderAyahWords) عشان تصير قابلة للاختبار مباشرة بمعزل عن state.
  // المخزَّن هناك فوق آخر حرف من "اِبۡرٰهِيۡمَ" (قبل "اِنَّهٗ") هو
  // U+06D9 ("لا"، وقف ممنوع)، بينما كتاب "علل الوقوف" للسجاوندي —
  // المرجع الأصلي لمنظومة علامات الوقف هذه بالذات — ينص صراحة عند هذا
  // الموضع بالذات ("في الكتاب - إبراهيم - 41") أن الوقف هو "ط" (وقف
  // مطلق)، لا "لا". تحقّق مباشر من الكتاب (صورة الصفحة)، وليس تخمينًا.
  // الكتلة الكلاسيكية 06D6–06DB وهو U+0615 — انظر التعليق الطويل فوق
  // WAQF_COMBINING أعلاه، الذي يوثّق هذا بالفعل من فحص جداول الخط
  // في الذاكرة لحظة العرض)، ولا يمسّ data.js إطلاقًا، ومقصور على وضع
  // أصلًا). مُقيَّد بمفتاح سورة:آية صريح حتى لا يمسّ أي موضع آخر ولو
  // تكرر نفس الرمز U+06D9 في آيات أخرى صحيحة.
  var WAQF_MARK_CORRECTIONS = {
    '19:41': [{ from: '\u06D9', to: '\u0615' }]
  };
  function applyWaqfMarkCorrections(a, src){
    var fixes = WAQF_MARK_CORRECTIONS[a.surah + ':' + a.ayah];
    if(!fixes) return src;
    fixes.forEach(function(fix){
      src = src.replace(fix.from, fix.to);
    });
    return src;
  }

  function resolveAyahSourceText(a, fontStyle){
    // Madinah-only: always Uthmani source text.
    return a.text;
  }

  // by the 2:245 tokenization-mismatch exclusion above (its own comment
  // explains WHY 2:245 is excluded from the normal index lookup; this
  // function is the targeted workaround for that one specific word,
  // added on direct request rather than fixing the tokenization itself).
  // وَيَبۡصُۜطُ can't be found by its old Uthmani-based word index in
  // itself is still findable directly by its own base letters,
  // independent of where it lands in the token list. Strips every
  // combining mark down to bare base letters -- ordinary harakat, the
  // classical Unicode waqf-mark range, AND this font's PUA waqf
  // extensions (e.g. the small-high-seen U+06DC drawn on this exact
  // word, plus the standalone marks in WAQF_STANDALONE/WAQF_COMBINING
  // above, all outside \u0621-\u064A so the single allow-list regex
  // below drops them too, no separate list needed) -- then folds ص back
  // to س, the phonetic spelling this whole "seen written as sad"
  // feature is about, so a lookup for "ويبسط" finds "وَيَبۡصُۜطُ"
  // regardless of which exact marks happen to be riding on it that
  // release. Deliberately narrow: only ever consulted for this one
  // renderAyahWords below), so it cannot affect any other word, ayah,
  // or the Uthmani path.
  function normalizeSeenAsSadFallbackWord(w){
    return String(w)
      .replace(/[^\u0621-\u064A]/g, '')
      .replace(/\u0635/g, '\u0633');
  }
  var SEEN_AS_SAD_INDOPAK_FALLBACK_2_245 = '\u0648\u064A\u0628\u0633\u0637'; // "ويبسط"

  function renderAyahWords(a){
    var src = resolveAyahSourceText(a, state.fontStyle);
    var words = tokenizeAyahWords(src).map(function(w){
      return w.split(MIDWORD_SPACE_PLACEHOLDER).join(' ').split(KNOWN_SPLIT_PLACEHOLDER).join('\u00A0');
    });
    var ayahKey = a.surah + ':' + a.ayah;
    // UPDATE (طلب مباشر): كانت هذه الجداول الخمسة (وألوانها) مقصورة على
    // مصحف المدينة (Uthmani) فقط. طُلب تفعيلها في مصحف النسخ (Naskh/
    // فهرس كلمة محدد سلفًا لكل موضع، وهو ما تحقّقنا منه مباشرة: تشغيل
    // الـ24 في الجداول الخمسة أظهر تطابقًا تامًا في عدد وترتيب الكلمات
    // لِـ22 منها -- فهرس الكلمة نفسه يشير لنفس الكلمة بالضبط في الخطّين،
    // فلا حاجة لجدول فهارس منفصل بمصحف النسخ.
    //
    // الاستثناء: آيتان فقط (2:245 وَ30:54) يختلف فيهما عدد الكلمات بين
    // الخطين في نص الإندوباك (QUL) تحديدًا -- علامات وقف عائمة ورمز ۞
    // ملتصقة بالكلمة المجاورة كما في a.text، فيزيد عدد الكلمات هناك (18
    // بدل 16 في 2:245، و27 بدل 24 في 30:54) ويُزيح باقي الفهارس. تفعيل
    // هذين الموضعين بنفس الفهرس القديم كان سيُلوّن كلمة خاطئة تمامًا في
    // مصحف النسخ، فبقيا مستثنيين هنا فقط (يبقيان يعملان بشكل طبيعي في
    // مصحف المدينة) -- إصلاح هذا التفاوت يحتاج تعديل آلية التوكينة نفسها
    // (KNOWN_SPLIT_WORD_FRAGMENTS وما شابه)، وهو تغيير في البنية التحتية
    // خارج نطاق هذا التعديل تحديدًا.
    var saktaIdxs = SAKTA_HIGHLIGHT_WORDS[ayahKey] || null;
    var muqattaatIdxs = MUQATTAAT_MAD_WORDS[ayahKey] || null;
    var seenSadIdxs = SEEN_AS_SAD_WORDS[ayahKey] || null;
    var madFarqIdxs = MAD_FARQ_WORDS[ayahKey] || null;
    var tajweedNoteIdxs = TAJWEED_NOTE_WORDS[ayahKey] || null;
    // مصحف المدينة فقط — مصدر الحقيقة: MADINAH_SAJAWANDI
    var madinahMarksForAyah = MADINAH_SAJAWANDI_BY_AYAH[ayahKey] || null;
    // نجمة السجاوندي المرتبطة برأس غير الكوفيين (ما عدا «لا»):
    // تُعرض على **الكلمة المضيفة نفسها** (كلمة رأس الآية — مثل يسقون
    // في 28:23)، لا على الفهرس السابق. الفهرس في الخريطة قد ينزاح؛
    // لذلك نُطابق حروف الأساس (NON_KUFI_HEADS_BASE_UTHMANI) مع نص
    // الكلمة الفعلي في الآية. الرأس نفسه يُرسم بلون خط المصحف.
    // «لا»: الرأس يبقى أخضر، بلا نجمة سجاوندي إضافية على نفس الكلمة.
    var shiftedMutlaqIdxs = [];
    var shiftedSadIdxs = [];
    var shiftedLazimIdxs = [];
    var shiftedZayIdxs = [];
    var shiftedQadIdxs = [];
    var shiftedQifIdxs = [];
    var shiftedJeemIdxs = [];
    // فهرس مضيف مُتحقق منه بالحروف → لضبط لون الرأس لاحقًا
    var nonKufiHostResolved = Object.create(null); // key "surah:ayah:idx" → {sym, color}
    function nonKufiBaseNorm(s){
      return String(s || '').replace(/[\u0640]/g, '')
        .replace(/[^\u0621-\u064A\u0671]/g, '')
        .replace(/\u0671/g, '\u0627')
        .replace(/[\u0622\u0623\u0625]/g, '\u0627')
        .replace(/\u0629/g, '\u0647')
        .replace(/\u0649/g, '\u064A')
        .replace(/\u0626/g, '\u064A')
        .replace(/\u0624/g, '\u0648')
        .replace(/\u0621/g, '');
    }
    function nonKufiBaseSoft(s){
      return nonKufiBaseNorm(s).replace(/\u064A/g, '').replace(/\u0627/g, '');
    }
    function nonKufiBaseOk(actual, expected){
      var a = nonKufiBaseNorm(actual), e = nonKufiBaseNorm(expected);
      if(a === e) return true;
      var sa = nonKufiBaseSoft(actual), se = nonKufiBaseSoft(expected);
      if(sa === se) return true;
      if(sa.length >= 3 && se.length >= 3 &&
        (sa.indexOf(se) !== -1 || se.indexOf(sa) !== -1)) return true;
      return false;
    }
    function findWordIdxByBase(wordList, expectedBase, preferredIdx){
      if(!expectedBase) return -1;
      // 1) الفهرس المخزَّن إن طابق الأساس (الأدق عند تكرار الكلمة في الآية)
      if(typeof preferredIdx === 'number' && preferredIdx >= 0 && preferredIdx < wordList.length &&
        nonKufiBaseOk(wordList[preferredIdx], expectedBase)){
        return preferredIdx;
      }
      // 2) مطابقة أساس تامة وحيدة
      var exact = [];
      for(var fi = 0; fi < wordList.length; fi++){
        if(nonKufiBaseNorm(wordList[fi]) === nonKufiBaseNorm(expectedBase)) exact.push(fi);
      }
      if(exact.length === 1) return exact[0];
      if(exact.length > 1 && typeof preferredIdx === 'number' && exact.indexOf(preferredIdx) !== -1) return preferredIdx;
      if(exact.length > 1) return exact[0];
      // 3) مطابقة مرنة وحيدة فقط (تجنّب التقاط كلمة أخرى بالخطأ)
      var softHits = [];
      for(var fj = 0; fj < wordList.length; fj++){
        if(nonKufiBaseOk(wordList[fj], expectedBase)) softHits.push(fj);
      }
      if(softHits.length === 1) return softHits[0];
      if(softHits.length > 1 && typeof preferredIdx === 'number' && softHits.indexOf(preferredIdx) !== -1) return preferredIdx;
      return -1;
    }
    if(state.fontStyle === 'uthmani'){
      var nkMapShift = window.NON_KUFI_HEADS_UTHMANI;
      var nkSymShift = window.NON_KUFI_HEADS_SYM_UTHMANI;
      var nkBaseShift = window.NON_KUFI_HEADS_BASE_UTHMANI;
      if(nkMapShift){
        // اجمع مفاتيح هذه الآية من الخريطة
        var ayahPrefix = a.surah + ':' + a.ayah + ':';
        Object.keys(nkMapShift).forEach(function(skey){
          if(skey.indexOf(ayahPrefix) !== 0) return;
          var mapIdx = parseInt(skey.slice(ayahPrefix.length), 10);
          var expectedBase = nkBaseShift && nkBaseShift[skey];
          var hostIdx = (expectedBase) ? findWordIdxByBase(words, expectedBase, mapIdx) : -1;
          if(hostIdx < 0 && !isNaN(mapIdx) && mapIdx >= 0 && mapIdx < words.length){
            // احتياطي: الفهرس المخزَّن إن طابق الأساس أو لم يتوفر أساس
            if(!expectedBase || nonKufiBaseOk(words[mapIdx], expectedBase)) hostIdx = mapIdx;
          }
          if(hostIdx < 0) return;
          var hostKey = a.surah + ':' + a.ayah + ':' + hostIdx;
          var sSym = nkSymShift && nkSymShift[skey];
          var sCol = nkMapShift[skey];
          nonKufiHostResolved[hostKey] = {sym: sSym || '', color: sCol, mapKey: skey};
          // ما عدا «لا» وبلا رمز: ضع نجمة سجاوندي على المضيف نفسه
          if(!sSym || sSym === 'لا') return;
          // رمز رأس غير الكوفيين (NON_KUFI_HEADS_SYM_*) على المضيف.
          // تلوين نص السجاوندي في المدينة يأتي من MADINAH_SAJAWANDI فقط؛
          // هذا المسار لرأس غير الكوفيين/النجمة وليس لإعادة بناء جداول الوقف.
          if(sSym === 'ط') shiftedMutlaqIdxs.push(hostIdx);
          else if(sSym === 'قف') shiftedQifIdxs.push(hostIdx);
          else if(sSym === 'ص') shiftedSadIdxs.push(hostIdx);
          else if(sSym === 'ز') shiftedZayIdxs.push(hostIdx);
          else if(sSym === 'ق' || sSym === 'قلي') shiftedQadIdxs.push(hostIdx);
          else if(sSym === 'ج') shiftedJeemIdxs.push(hostIdx);
          else if(sSym === 'م') shiftedLazimIdxs.push(hostIdx);
        });
      }
    }
    return words.map(function(w, idx){
      var key = a.surah + ':' + a.ayah + ':' + idx;
      var extraCls = '';
      var isKhilafWord = !!(
        (saktaIdxs && saktaIdxs.indexOf(idx) !== -1) ||
        (muqattaatIdxs && muqattaatIdxs.indexOf(idx) !== -1) ||
        (seenSadIdxs && seenSadIdxs.indexOf(idx) !== -1) ||
        (madFarqIdxs && madFarqIdxs.indexOf(idx) !== -1) ||
        (tajweedNoteIdxs && tajweedNoteIdxs.indexOf(idx) !== -1)
      );
      if(saktaIdxs && saktaIdxs.indexOf(idx) !== -1) extraCls += ' sakta-word';
      if(muqattaatIdxs && muqattaatIdxs.indexOf(idx) !== -1) extraCls += ' muqattaat-mad-word';
      if(seenSadIdxs && seenSadIdxs.indexOf(idx) !== -1) extraCls += ' seen-as-sad-word';
      if(madFarqIdxs && madFarqIdxs.indexOf(idx) !== -1) extraCls += ' mad-farq-word';
      if(tajweedNoteIdxs && tajweedNoteIdxs.indexOf(idx) !== -1) extraCls += ' tajweed-note-word';
      // طلب مباشر 2026-08-01: عند تقاطع كلمة بنفسجية (خلاف الروضة) مع
      // علامة سجاوندية افتراضية (has-default-*)، تبقى الكلمة بنفسجية
      // بالكامل دومًا، وتُعرض العلامة كنجمة تذكير عادية بلون الوقف بدل
      // تلوين نص الكلمة — راجع القواعد المقابلة في style.css التي تستثني
      // .khilaf-word من تلوين نص has-default-* وتُظهر النجمة بدلاً منه.
      if(isKhilafWord) extraCls += ' khilaf-word';
      // ط وم وج: تُلوَّن حتى على آخر كلمة في الآية.
      // ط: ليتوافق مع ظهورها في مصحف النسخ (مثل «الدين» و«نستعين» في الفاتحة — طلب 2026-08-10).
      // م: بلا استثناء «آخر كلمة» أصلًا (الوقف اللازم).
      // ج: طلب مباشر لاحق — تُلوَّن بالبني حتى لو كانت آخر كلمة في الآية (مصحف المدينة).
      // باقي العلامات (ص/ز/ق/قف) تبقى على قاعدة «لا تُلوَّن آخر كلمة»
      // لأن نهاية الآية وقف بالفعل.
      if (madinahMarksForAyah) {
        var _msMark = madinahMarksForAyah[idx + 1];
        var _msCls = _msMark && MADINAH_MARK_TO_CLS[_msMark];
        if (_msCls) extraCls += ' ' + _msCls;
      }
      // رأس آية لغير الكوفيين — نجمة في مصحف المدينة فقط.
      // المضيف يُحدَّد بمطابقة حروف الأساس (أعلاه) لا بالفهرس وحده.
      // معاني رأس غير الكوفيين — مطابقة دليل القارئ (1.0.766):
      //   خضراء (green) = الوصل أولى.
      //   مفرّغة / عدم تلوين ("") = عدم الوقف.
      //   أزرق/بني = تتبع علامة الوقف (ط/ج) على نفس المضيف.
      // «لا»+green → أخضر. «لا»+"" → مفرّغ. مصحف النسخ: بدون تدخل.
      var isUthmani = true; // Madinah-only
      var nonKufiColor = null; // null = ليس رأس غير كوفي؛ "" = بلا لون (حبر النص)
      if(isUthmani){
        var resolved = nonKufiHostResolved[key];
        if(resolved){
          if(resolved.sym === 'لا'){
            // دليل القارئ: green = الوصل أولى
            //               ""    = عدم الوقف (مفرّغة)
            // طلب مباشر 1.0.756: احترم "" الصريح في الجدول؛ وإلا أخضر افتراضي
            nonKufiColor = (resolved.color === '') ? '' : 'green';
          } else if(resolved.sym){
            // طلب مباشر 1.0.764/1.0.767: أزرق/بني تتبع علامة الوقف (ط/ج) من الجدول
            // لا يُفرَّغ الرأس عند وجود علامة وقف ملونة على نفس المضيف
            var _c = resolved.color;
            nonKufiColor = (_c === 'blue' || _c === 'brown' || _c === 'red' || _c === 'green') ? _c : '';
          } else {
            nonKufiColor = ''; // عارٍ بلا علامة وقف
          }
        } else {
          // مفاتيح بلا أساس/فشل المطابقة: مسار احتياطي بالفهرس القديم
          var nonKufiMap = window.NON_KUFI_HEADS_UTHMANI;
          var nonKufiBaseMap = window.NON_KUFI_HEADS_BASE_UTHMANI;
          if(nonKufiMap && Object.prototype.hasOwnProperty.call(nonKufiMap, key)){
            nonKufiColor = nonKufiMap[key];
            if(nonKufiBaseMap && nonKufiBaseMap[key] && !nonKufiBaseOk(w, nonKufiBaseMap[key])){
              nonKufiColor = null;
            }
            var fbSym = window.NON_KUFI_HEADS_SYM_UTHMANI && window.NON_KUFI_HEADS_SYM_UTHMANI[key];
            // طلب مباشر 1.0.764: غير «لا» — أبقِ لون الجدول إن كان blue/brown/red/green
            if(nonKufiColor !== null && fbSym && fbSym !== 'لا'){
              if(nonKufiColor !== 'blue' && nonKufiColor !== 'brown' &&
                 nonKufiColor !== 'red' && nonKufiColor !== 'green') nonKufiColor = '';
            }
            // طلب مباشر 1.0.756: احترم "" الصريح في الجدول لـ«لا»
            if(nonKufiColor !== null && fbSym === 'لا') nonKufiColor = (nonKufiColor === '') ? '' : 'green';
          }
        }
      }
      if(nonKufiColor !== null) extraCls += ' has-non-kufi-head';
      if(nonKufiColor !== null && isUthmani){
        var _nkR = nonKufiHostResolved[key];
        var _nkSym = (_nkR && _nkR.sym) || (window.NON_KUFI_HEADS_SYM_UTHMANI && window.NON_KUFI_HEADS_SYM_UTHMANI[key]) || '';
        if(_nkSym === 'لا') extraCls += ' has-non-kufi-la';
      }

      var nonKufiColorCls = (nonKufiColor === 'red' || nonKufiColor === 'green' ||
        nonKufiColor === 'blue' || nonKufiColor === 'brown')
        ? (' mark-' + nonKufiColor) : '';
      // aria-label — مطابقة دليل القارئ (1.0.766)
      var nonKufiAria = 'رأس آية لغير الكوفيين';
      if(nonKufiColor === '') nonKufiAria += ' — عدم الوقف';
      else if(nonKufiColor === 'green')
        nonKufiAria += ' — الوصل أولى';
      else if(nonKufiColor === 'blue' || nonKufiColor === 'brown' || nonKufiColor === 'red')
        nonKufiAria += ' — تتبع علامة الوقف';
      var nonKufiHtml = nonKufiColor !== null
        ? ('<span class="non-kufi-mark' + nonKufiColorCls + '" aria-label="' + nonKufiAria + '">' +
           '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 2 L23 10 L31 6 L27 14 L36 15 L28 20 L36 25 L27 26 L31 34 L23 30 L20 38 L17 30 L9 34 L13 26 L4 25 L12 20 L4 15 L13 14 L9 6 L17 10 Z"/></svg>' +
           '</span>')
        : '';
      return '<span class="quran-word' + extraCls + '" data-key="' + key + '">' +
        cleanAyahText(w) +
        nonKufiHtml +
        '<span class="waqf-mark" aria-hidden="true">\u2605</span>' +
      '</span>';
    }).join(' ');
  }

  // -----------------------------------------------------------------
  // Render page
  // -----------------------------------------------------------------
  var lastCartouchePage = -1;
  var lastCartoucheSubtitle = '';
  // Written exactly once, right below the surah name, on the page/ruku
  // where that surah's ayah 1 first appears — the mushaf convention for
  // every surah's opening except: at-Tawbah (9), which carries no
  // basmala at all in the mushaf, and al-Fatiha (1), whose own ayah 1
  // already IS this basmala and is already visible in the ayah flow, so
  // repeating it here would duplicate it.
  var BASMALA = '\u0628ِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ';
  function renderPage(){
    var idx = state.page;
    var p = PAGES[idx];
    if(!p) return;

    // Most consecutive rukus belong to the same page, so this text is
    // very often identical to what's already there — skip the DOM write
    // (and the reflow it triggers) when nothing actually changed.
    if(idx !== lastCartouchePage){
      // One block per surah appearing on this page: "سورة <name>" on its
      // own line, followed by the basmala on the next line only when this
      // page is where that surah's ayah 1 begins. Displayed names use the
      // vocalized (مشكّل) form from surah-names-vocalized.js when
      // available, matched by surah number — p.surahs and p.surahNames
      // are parallel arrays. This only affects what's rendered here; it
      // never touches the underlying data.js surahName field used
      // elsewhere for search/matching.
      var blocks = p.surahs.map(function(num, si){
        var name = (window.SURAH_NAMES_VOCALIZED && window.SURAH_NAMES_VOCALIZED[num]) || p.surahNames[si];
        var opensHere = p.ayahs.some(function(a){ return a.surah === num && a.ayah === 1; });
        var html = '<span class="surah-name-plain">\u0633\u0648\u0631\u0629 ' + name + '</span>' +
          '<span class="surah-divider" aria-hidden="true"></span>';
        if(opensHere && num !== 1 && num !== 9){
          html += '<b>' + BASMALA + '</b>';
        }
        return html;
      });
      var vocalNames = p.surahs.map(function(num, si){
        return (window.SURAH_NAMES_VOCALIZED && window.SURAH_NAMES_VOCALIZED[num]) || p.surahNames[si];
      }).join(' \u2014 ');
      els.surahCartouche.innerHTML = blocks.join('<span class="cartouche-sep">\u060C\u060C</span>');
      lastCartouchePage = idx;
      lastCartoucheSubtitle = vocalNames;
    }

    var waqfMarks = getWaqfMarks();
    var html = '';
    var lastSurah = null;
    p.ayahs.forEach(function(a){
      if(lastSurah !== null && a.surah !== lastSurah){
        html += '<br><br>';
      }
      if(a.juzStart){
        html += '<span class="juz-marker">بداية الجزء ' + toArabicDigits(a.juzStart) + '</span>';
      }
      html += '<span class="ayah-block" data-ayah-key="' + a.surah + ':' + a.ayah + '">' +
        renderAyahWords(a) + ' ' + ayahMarker(a.surah, a.ayah) +
      '</span> ';
      lastSurah = a.surah;
    });
    els.ayahFlow.innerHTML = html;
    els.ayahFlow.querySelectorAll('.quran-word').forEach(function(el){
      var key = el.getAttribute('data-key');
      var mark = waqfMarks[key];
      if(mark){
        el.classList.add('has-waqf');
        var markSpan = el.querySelector('.waqf-mark');
        if(markSpan) markSpan.classList.add('mark-' + (REMINDER_COLORS[mark.c] ? mark.c : 'red'));
      }
    });

    if(JUZ_INFO.fullMushaf){
      // الجزء والربع الرسميان (effectiveJuz + آية بداية الربع على الصفحة).
      var footerJuz = p.juz;
      if(window.Navigation && typeof window.Navigation.effectiveJuzForPage === 'function'){
        footerJuz = window.Navigation.effectiveJuzForPage(p);
      }
      var footerRub = 0;
      if(window.RUB_STARTS && p.ayahs && p.ayahs.length){
        var base = (footerJuz - 1) * 8;
        var rq, rp, ai, a;
        for(rq = 7; rq >= 0; rq--){
          rp = window.RUB_STARTS[base + rq];
          if(!rp) continue;
          for(ai = 0; ai < p.ayahs.length; ai++){
            a = p.ayahs[ai];
            if(a.surah === rp[0] && a.ayah === rp[1]){
              footerRub = rq + 1;
              break;
            }
          }
          if(footerRub) break;
        }
        if(!footerRub){
          var fa = p.ayahs[0];
          for(rq = 7; rq >= 0; rq--){
            rp = window.RUB_STARTS[base + rq];
            if(!rp) continue;
            if(fa.surah > rp[0] || (fa.surah === rp[0] && fa.ayah >= rp[1])){
              footerRub = rq + 1;
              break;
            }
          }
        }
      }
      var label = 'نهاية الركوع ' + toArabicDigits(p.ruku) + ' • الجزء ' + toArabicDigits(footerJuz);
      if(footerRub >= 1 && footerRub <= 8){
        label += ' • الربع ' + toArabicDigits(footerRub);
      }
      els.rukuLabel.textContent = label;
      els.rukuEnd && els.rukuEnd.classList.remove('incomplete');
      if(els.rukuMarkSpan) els.rukuMarkSpan.textContent = 'ع';
        } else {
      els.rukuLabel.textContent = 'نهاية الركوع رقم ' + toArabicDigits(p.rukuInJuz) + ' من ' + (window.JUZ_INFO ? window.JUZ_INFO.name : 'الجزء');
      if(p.rukuComplete === false){
        els.rukuEnd && els.rukuEnd.classList.add('incomplete');
        if(els.rukuMarkSpan) els.rukuMarkSpan.textContent = '⋯';
        els.rukuLabel.textContent = 'ينتهي ' + (window.JUZ_INFO ? window.JUZ_INFO.name : 'الجزء') + ' هنا \u2014 وتكتمل بقية هذا الركوع في الجزء التالي';
      } else {
        els.rukuEnd && els.rukuEnd.classList.remove('incomplete');
        if(els.rukuMarkSpan) els.rukuMarkSpan.textContent = 'ع';
      }
    }
    els.pageIndicator.textContent = toArabicDigits(idx+1) + ' / ' + toArabicDigits(PAGES.length);
    els.pageSubtitle.textContent = lastCartoucheSubtitle + ' \u2022 صفحة ' + toArabicDigits(idx+1);

    updateNavButtons();

    if(onAfterRender) onAfterRender();
  }

  // Returns true if pages a and b fall within the same "نطاق العرض" unit
  // (surah/juz/manzil) currently selected in الإعدادات — or always true
  // when the scope is 'all'. Shared by updateNavButtons() (disables the
  // prev/next buttons at the boundary) and goToRelativePage() below (blocks
  // swipe/arrow-key crossing), so the boundary rule lives in one place.
  function inSameDisplayScope(a, b){
    var scope = state.displayScope;
    if(!scope || scope === 'all') return true;
    if(!PAGES[a] || !PAGES[b]) return true;
    if(scope === 'surah'){
      return PAGES[a].ayahs[0].surah === PAGES[b].ayahs[0].surah;
    }
    if(scope === 'juz'){
      // جزء رسمي عبر بداية الأرباع/الأجزاء (RUB_STARTS)، مش page.juz فقط —
      // حتى يبقى ع 183 (بداية الجزء 12 @ هود 6) ضمن الجزء 12 مع ع 184+.
      if(window.Navigation && typeof window.Navigation.effectiveJuzForPage === 'function'){
        return window.Navigation.effectiveJuzForPage(PAGES[a]) === window.Navigation.effectiveJuzForPage(PAGES[b]);
      }
      return PAGES[a].juz === PAGES[b].juz;
    }
    if(scope === 'manzil'){
      var range = window.getManzilRange(PAGES[a].ayahs[0].surah);
      var surahB = PAGES[b].ayahs[0].surah;
      return surahB >= range.start && surahB <= range.end;
    }
    return true;
  }

  // Disables btnPrev/btnNext at the edges of the whole mushaf as before,
  // and additionally at the edges of the current نطاق العرض unit
  // (surah/juz/manzil) when one is selected in الإعدادات — so the buttons
  // themselves reflect the constraint without needing a full re-render.
  // Called from renderPage() and directly by Navigation.js right after
  // the select changes.
  function updateNavButtons(){
    var idx = state.page;
    var atMushafStart = idx <= 0;
    var atMushafEnd = idx >= PAGES.length - 1;
    var atScopeStart = idx > 0 && !inSameDisplayScope(idx, idx - 1);
    var atScopeEnd = idx < PAGES.length - 1 && !inSameDisplayScope(idx, idx + 1);
    els.btnPrev.disabled = atMushafStart || atScopeStart;
    els.btnNext.disabled = atMushafEnd || atScopeEnd;
  }

  // -----------------------------------------------------------------
  // Change page
  // -----------------------------------------------------------------
  // Scrolls back to the top of the reader — real navigation only. Kept
  // separate from renderPage() (called only from goToPage() below)
  // because renderPage() is also called directly, for same-page,
  // in-place refreshes where the reader's current scroll position must
  // be left alone (switching الرسم/script style, importing reminder
  // marks — see settings.js). Those callers now preserve scroll
  // automatically, with no flag or parameter needed anywhere, simply by
  // never calling goToPage().
  //
  // onSettled(), if given, fires once this function's OWN reset has
  // actually finished being (re-)applied — not a fixed frame count a
  // caller has to guess and keep in sync with this function's internals.
  // goToPage() below forwards opts.onSettled here so a caller like
  // audioManager.js's auto page-turn (which needs to scroll to a
  // specific ayah only after this reset is done, or the reset
  // overwrites it) can wait for that exact moment instead of assuming
  // how many rAFs this function happens to use — keeping the two files
  // decoupled from each other's internal timing.
  //
  // navToken guards against a *stale* onSettled: if a second goToPage()
  // starts (a manual swipe landing at the same moment as an audio-driven
  // auto page-turn, or two auto page-turns in quick succession for very
  // short ayaat) before the first one's rAFs have fired, both reset
  // chains still run, but only the callback whose token still matches
  // the current one actually fires — the same guard pattern as
  // audioManager.js's own playToken, applied here to navigation instead
  // of playback. Without it, an older call's onSettled could still fire
  // after a newer page's, highlighting/scrolling to the wrong ayah.
  var navToken = 0;
  function resetScrollToTop(onSettled, myNavToken){
    els.pageScroll.scrollTop = 0;
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    // Re-apply once layout has actually settled — one frame for layout,
    // one for paint — the same double-rAF pattern already used in
    // openAyah() below for search-result jumps. A single rAF (the
    // previous fix here) measures/sets scroll before the new page's
    // content has actually laid out on-device, so it silently does
    // nothing and the reader is left wherever the *previous* page had
    // scrolled to — exactly the "opens the new ruku but stays at the
    // bottom of the page" symptom. This also naturally covers the
    // Android keyboard-close resize when navigation is triggered from
    // "الذهاب إلى ركوع رقم" (whose input may still hold focus), since it
    // re-applies after that settles too, not on a hardcoded delay.
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        els.pageScroll.scrollTop = 0;
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        if(onSettled && myNavToken === navToken) onSettled();
      });
    });
  }
  function goToPage(i, opts){
    if(i < 0 || i >= PAGES.length) return;
    if(onBeforePageChange) onBeforePageChange(opts);
    state.page = i;
    // The per-script resume point/progress is only updated here, on real
    // navigation — not inside renderPage(), which also runs when merely
    // switching الرسم on the same page and must not credit that page as
    // "read" in the newly-selected script.
    if(onPageChanged) onPageChanged(i);
    var myNavToken = ++navToken;
    renderPage();
    resetScrollToTop(opts && opts.onSettled, myNavToken);
  }


  // Sequential (±1) navigation only — prev/next buttons, arrow keys, and
  // swipe (called from Navigation.js) — shared here so the "نطاق العرض"
  // boundary (surah/juz/manzil) is enforced in exactly one place instead
  // of being duplicated at each call site. Deliberate jumps (الفهرس,
  // فهرس السور/الأجزاء, البحث, المفضلة, علامة القراءة, الذهاب إلى ركوع
  // رقم) still call goToPage() directly and are never constrained by
  // this — the scope only limits casual page-turning, not intentional
  // navigation elsewhere in the mushaf.
  function goToRelativePage(delta){
    var target = state.page + delta;
    if(target < 0 || target >= PAGES.length) return;
    if(!inSameDisplayScope(state.page, target)) return;
    goToPage(target);
  }

  // -----------------------------------------------------------------
  // Highlight + scroll to a specific ayah/word range (used when a search
  // result is opened) — change page, then highlight and scroll to the
  // matched word(s) once the new page has actually laid out.
  // -----------------------------------------------------------------
  function openAyah(pageIdx, surah, ayah, wStart, wEnd){
    if(typeof wStart !== 'number' || isNaN(wStart)) wStart = 0;
    if(typeof wEnd !== 'number' || isNaN(wEnd)) wEnd = wStart;
    if(showReaderFn) showReaderFn();
    goToPage(pageIdx);
    // The reader screen has only just been unhidden/re-rendered, so its
    // layout isn't settled yet on this same tick — scrollIntoView called
    // right now would measure a container that still thinks it's empty
    // and silently do nothing. Wait two frames (one for layout, one for
    // paint) before measuring.
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        var words = [];
        for(var i = wStart; i <= wEnd; i++){
          var w = els.ayahFlow && els.ayahFlow.querySelector('.quran-word[data-key="' + surah + ':' + ayah + ':' + i + '"]');
          if(w) words.push(w);
        }
        if(!words.length) return;
        words[Math.floor(words.length / 2)].scrollIntoView({block: 'center'});
        words.forEach(function(w){
          w.classList.add('search-hit-flash');
          setTimeout(function(){ w.classList.remove('search-hit-flash'); }, 2000);
        });
      });
    });
  }

  // -----------------------------------------------------------------
  // Find which page (ruku) index contains a given surah:ayah — used by
  // "الانتقال إلى آية" (go-to-ayah dialog, opened from فهرس السور).
  // Linear scan is fine here (556 ruku pages, each with a handful of
  // ayahs) since this only runs once per dialog confirmation, not on
  // every render. Returns -1 if the surah/ayah combination isn't found
  // (shouldn't happen once the dialog validates against SURAH_META, but
  // this stays defensive rather than assuming the caller always did).
  // -----------------------------------------------------------------
  function findPageIndexForAyah(surah, ayah){
    for(var i = 0; i < PAGES.length; i++){
      var p = PAGES[i];
      for(var j = 0; j < p.ayahs.length; j++){
        var a = p.ayahs[j];
        if(a.surah === surah && a.ayah === ayah) return i;
      }
    }
    return -1;
  }

  // Same shape as openAyah() above (change page, then highlight+scroll
  // once the new page has actually laid out) but highlights the WHOLE
  // ayah — every .quran-word span sharing this surah:ayah prefix in its
  // data-key — instead of a specific word range, since "الانتقال إلى
  // آية" has no search match to bound. Returns true/false so the caller
  // (Navigation) knows whether to also close the surah-index panel.
  function openAyahByNumber(surah, ayah){
    var pageIdx = findPageIndexForAyah(surah, ayah);
    if(pageIdx === -1) return false;
    if(showReaderFn) showReaderFn();
    goToPage(pageIdx);
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        var prefix = surah + ':' + ayah + ':';
        var words = els.ayahFlow ? els.ayahFlow.querySelectorAll('.quran-word[data-key^="' + prefix + '"]') : [];
        if(!words.length) return;
        words[Math.floor(words.length / 2)].scrollIntoView({block: 'center'});
        words.forEach(function(w){
          w.classList.add('search-hit-flash');
          setTimeout(function(){ w.classList.remove('search-hit-flash'); }, 2000);
        });
      });
    });
    return true;
  }

  // -----------------------------------------------------------------
  // Change-page input: prev/next buttons, arrow keys, and swipe.
  // (Swipe-to-turn-page shares a touch-gesture state machine with pinch-
  // to-zoom-font in app.js — a genuinely single, tightly-coupled gesture
  // detector, not two separable features — so that combined detector
  // stays in app.js and simply calls ReaderManager.goToPage() for the
  // swipe branch, rather than being mechanically split across two files.)
  // -----------------------------------------------------------------
  function setupNavControls(){
    if(els.btnPrev) els.btnPrev.addEventListener('click', function(){ goToRelativePage(-1); });
    if(els.btnNext) els.btnNext.addEventListener('click', function(){ goToRelativePage(1); });
    document.addEventListener('keydown', function(e){
      if(els.readerScreen.classList.contains('hidden')) return;
      if(e.key === 'ArrowLeft') goToRelativePage(1);
      if(e.key === 'ArrowRight') goToRelativePage(-1);
    });
  }

  function init(deps){
    PAGES = deps.PAGES;
    JUZ_INFO = deps.JUZ_INFO;
    state = deps.state;
    els = deps.els;
    toArabicDigits = deps.toArabicDigits;
    REMINDER_COLORS = deps.REMINDER_COLORS;
    getWaqfMarks = deps.getWaqfMarks;
    showReaderFn = deps.showReader;
    onBeforePageChange = deps.onBeforePageChange;
    onPageChanged = deps.onPageChanged;
    onAfterRender = deps.onAfterRender;

    setupNavControls();
  }

  // Builds read-only display HTML for a FULL ayah with a word range
  // highlighted — used by the search results page, which shows the whole
  // ayah (not a short snippet) with the matched word(s) picked out.
  // Deliberately reuses the exact same tokenize/split/clean pipeline as
  // renderAyahWords() above (same MIDWORD_SPACE_PLACEHOLDER/
  // KNOWN_SPLIT_PLACEHOLDER handling, same cleanAyahText for waqf-sign
  // glyphs etc.) so a result here renders identically to the mushaf page
  // it links to — the only differences are no data-key/reminder-star
  // (search results aren't a personal-waqf-mark surface) and the added
  // .search-hit class on the matched range.
  function renderAyahTextWithHighlight(rawText, range){
    var words = tokenizeAyahWords(rawText).map(function(w){
      return w.split(MIDWORD_SPACE_PLACEHOLDER).join(' ').split(KNOWN_SPLIT_PLACEHOLDER).join('\u00A0');
    });
    return words.map(function(w, idx){
      var isHit = range && idx >= range.start && idx <= range.end;
      return '<span class="quran-word' + (isHit ? ' search-hit' : '') + '">' + cleanAyahText(w) + '</span>';
    }).join(' ');
  }

  window.ReaderManager = {
    init: init,
    renderPage: renderPage,
    goToPage: goToPage,
    goToRelativePage: goToRelativePage,
    updateNavButtons: updateNavButtons,
    openAyah: openAyah,
    findPageIndexForAyah: findPageIndexForAyah,
    openAyahByNumber: openAyahByNumber,
    tokenizeAyahWords: tokenizeAyahWords,
    resolveAyahSourceText: resolveAyahSourceText,
    renderAyahWords: renderAyahWords,
    renderAyahTextWithHighlight: renderAyahTextWithHighlight,
    refreshAyahMarkerShapes: refreshAyahMarkerShapes
  };
})();
