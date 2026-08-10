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
  // طلب مباشر: الآيات التي آخر كلمة فيها لا تحمل أي علامة وقف سجاوندي
  // إطلاقًا (Single Source of Truth: data/no-sajawandi-heads.json، عبر
  // no-sajawandi-heads.js) تُرسَم بدائرة بدل النجمة الثمانية.
  // أقصى امتداد هندسي لرؤوس مسار النجمة = 14 من المركز (20,20)، لكن
  // بروز الرؤوس + stroke-width للنجمة يجعلها تبدو أكبر بصريًا. رُفع نصف
  // قطر الدائرة إلى 15 لتحقيق توازن بصري مع الامتداد الخارجي للنجمة
  // (وليس مساواة القطر الرياضي فقط) — طلب مباشر 1.0.286؛ ضُبط إلى 15 في 1.0.287.
  // موضع الرقم غير متأثر (نفس <span> خارج الـsvg). سمك خط الدائرة
  // vector-effect="non-scaling-stroke" = 1.8px شاشة (−10% عن 2px) في style.css.
  var AYAH_NUM_STAR_PATH =
    '<path d="M 20.00 6.00 L 23.29 12.05 L 29.90 10.10 L 27.95 16.71 L 34.00 20.00 L 27.95 23.29 L 29.90 29.90 L 23.29 27.95 L 20.00 34.00 L 16.71 27.95 L 10.10 29.90 L 12.05 23.29 L 6.00 20.00 L 12.05 16.71 L 10.10 10.10 L 16.71 12.05 Z" ' +
    'class="ayah-num-outer" fill="none" stroke="currentColor" stroke-linejoin="round"/>';
  var AYAH_NUM_CIRCLE_PATH =
    '<circle cx="20" cy="20" r="15" class="ayah-num-outer-circle" fill="none" stroke="currentColor" vector-effect="non-scaling-stroke"/>';

  function ayahMarkerShapeSvg(surah, ayah){
    var isNoSajawandiHead = window.NoSajawandiHeads && window.NoSajawandiHeads.has(surah, ayah);
    return isNoSajawandiHead ? AYAH_NUM_CIRCLE_PATH : AYAH_NUM_STAR_PATH;
  }

  function ayahMarker(surah, ayah){
    var num = toArabicDigits(ayah);
    var digitClass = ayah >= 100 ? ' three-digit' : '';
    var isCircle = !!(window.NoSajawandiHeads && window.NoSajawandiHeads.has(surah, ayah));
    var circleClass = isCircle ? ' ayah-num-circle' : '';
    return '<span class="ayah-num' + digitClass + circleClass + '" aria-hidden="false" data-surah="' + surah + '" data-ayah="' + ayah + '">' +
      '<svg viewBox="0 0 40 40">' +
      ayahMarkerShapeSvg(surah, ayah) +
      '</svg>' +
      '<span>' + num + '</span></span>';
  }

  // معالجة نفس فئة السباق الموثَّقة سابقًا مع نظام QCF Override (v1.0.235):
  // no-sajawandi-heads.js يُحمَّل بـfetch غير متزامن، وأول رسم للصفحة عند
  // إقلاع التطبيق يحدث غالبًا قبل اكتمال هذا التحميل (ayahMarkerShapeSvg
  // ترجع النجمة افتراضيًا وقتها). هذه الدالة تُستدعى من app.js فور اكتمال
  // NoSajawandiHeads.load() لتصحيح رؤوس الآيات المرسومة فعلًا على الصفحة
  // الحالية فقط دون إعادة رسم الصفحة كاملة.
  function refreshAyahMarkerShapes(){
    if(!els.ayahFlow) return;
    var nums = els.ayahFlow.querySelectorAll('.ayah-num[data-surah][data-ayah]');
    for(var i=0; i<nums.length; i++){
      var el = nums[i];
      var svg = el.querySelector('svg');
      if(!svg) continue;
      var s = parseInt(el.getAttribute('data-surah'), 10);
      var a = parseInt(el.getAttribute('data-ayah'), 10);
      var shouldBeCircle = !!(window.NoSajawandiHeads && window.NoSajawandiHeads.has(s, a));
      var isCircleNow = !!svg.querySelector('.ayah-num-outer-circle');
      if(shouldBeCircle !== isCircleNow){
        svg.innerHTML = shouldBeCircle ? AYAH_NUM_CIRCLE_PATH : AYAH_NUM_STAR_PATH;
      }
      // مزامنة فئة التكديس: دائرة → إطار فوق الرقم؛ نجمة → الرقم فوق الإطار
      if(shouldBeCircle) el.classList.add('ayah-num-circle');
      else el.classList.remove('ayah-num-circle');
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
  function tatweelSeatHtml(match, nextChar){
    var nextCp = nextChar ? nextChar.codePointAt(0) : null;
    var bigGap = !!(nextCp && TATWEEL_BIG_GAP_AFTER[nextCp]);
    var cls = bigGap ? 'tatweel-seat' : 'tatweel-seat tatweel-seat-tight';
    return '<span class="' + cls + '">' + match + '</span>';
  }

  function cleanAyahText(text){
    // رأس غير الكوفيين (U+E021): في مصحف المدينة فقط نخفيه ونستبدله
    // بنجمتنا الملوّنة (.non-kufi-mark). في مصحف النسخ نبقي الرمز الأصلي
    // من خط PDMS دون أي تعديل (طلب مباشر: الشغل على المدينة فقط).
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

  // Follow-up fix (reported directly, screenshot, 70:15, Uthmani mode):
  // the SAME misplaced-madda glyph bug as KALLA_MADDA_REGEX above, but
  // for the 6 occurrences that regex explicitly could NOT reach yet (see
  // the SCOPE NOTE in the long comment above): 23:100, 26:62, 70:15,
  // 70:39, 74:16, 89:21. All 6 are كَلَّآ immediately followed by a waqf
  // mark with no space in between, and wrapWaqfSigns() runs BEFORE this
  // point in cleanAyahText -- for exactly these 6 words (and only these,
  // confirmed against data.js), it treats the لام as a fresh "new base
  // letter", flushing the preceding ك+fatha as bare plain text and
  // opening a *separate* <span class="waqf-sign"> starting at the لام.
  // That tag sitting between ك and ل is why the plain 7-codepoint
  // KALLA_MADDA_REGEX above never matches these 6: the sequence is no
  // longer textually contiguous.
  //
  // Rather than touch wrapWaqfSigns()'s general-purpose letter-flushing
  // logic (risking every other already-confirmed collision fix that
  // depends on it), this matches the exact resulting shape instead: ك+
  // fatha, then the waqf-sign span's opening tag, then ل+shadda+fatha+
  // alef+maddah, then the waqf mark character(s) (deliberately requiring
  // NO further nested tag before the closing </span> -- confirmed all 6
  // occurrences are a single plain mark here with no sila/sakta-lift
  // collision, so this stays narrowly scoped to the confirmed shape
  // rather than guessing at cases that don't exist in the data).
  //
  // Output nests .kalla-cluster OUTSIDE the original .waqf-sign span
  // (rather than duplicating or reordering it), so the waqf mark keeps
  // rendering through the exact same .waqf-sign sizing/positioning rules
  // as every other waqf mark in the mushaf -- this fix only changes
  // where the madda glyph is drawn, same as KALLA_MADDA_REGEX above.
  // UNCONFIRMED ON DEVICE -- reuses .kalla-cluster/.kalla-madda-glyph
  // as-is (no new CSS), same offset already tuned for the plain case;
  // open 70:15 after this build and confirm it looks right, since the
  // madda glyph here sits inside the enlarged .waqf-sign font-size
  // context (1.2em/1.3em) rather than ambient size, which may need its
  // own nudge.
  var KALLA_MADDA_WAQF_REGEX =
    /\u0643\u064E(<span class="waqf-sign">)\u0644\u0651\u064E\u0627\u0653([^<]*)(<\/span>)/g;
  function kallaMaddaWaqfHtml(match, waqfSignOpen, markChars, waqfSignClose){
    return '<span class="kalla-cluster">' +
      '\u0643\u064E' + waqfSignOpen +
      '\u0644\u0651\u064E\u0627' +
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
  //          normalizeSeenAsSadFallbackWord/SEEN_AS_SAD_INDOPAK_FALLBACK_2_245
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

  // ============================================================
  // منهجية العمل العامة لهذا القسم بالكامل (تلخيص، مؤكَّد مباشرة مع
  // المستخدم): العلامات الملوَّنة فعليًا في مصحف المدينة هي ثلاثة فقط
  // — ط (TA_MUTLAQ، أزرق)، ص (SAD_RUKHSA، أخضر)، م (WAQF_LAZIM، أحمر).
  // أما لا (LA — الوقف الممنوع)، وصلي (SILA_POSITIONS.js — ترجيح وصل
  // من محقّقي القراءات، مصدر مستقل عن السجاوندي تمامًا)، والتعانق
  // (MUANAQAH) — فهذه الثلاثة لا تُلوَّن ولا تُعرَض بصريًا بأي شكل؛
  // دورها الوحيد هو **التحقق** من صحة اعتماد ط/ص/م عند كل كلمة: كلما
  // تقاطعت واحدة منها مع موضع ط/ص/م فعّال، تُراجَع الحالة يدويًا في
  // "علل الوقوف" للسجاوندي تحديدًا (لا صلي ولا التعانق نفسها) لتحديد
  // القرار الصحيح — راجع الأمثلة الفعلية أعلاه وأسفل هذا التعليق:
  //   • DEFAULT_MARK_CONFLICT_RESOLUTIONS: تعارضات ط↔م رُوجعت وحُسمت.
  //   • DEFAULT_MARK_MANUAL_EXCLUSIONS['TA_MUTLAQ']: مواضع ط+تعانق حُذف
  //     بعضها بعد المراجعة.
  //   • DEFAULT_MARK_MANUAL_ADDITIONS: مواضع ط أُضيفت يدويًا بعد مراجعة
  //     مماثلة (33:13 "بعورة").
  //   • DEFAULT_MARK_MANUAL_EXCLUSIONS['SAD_RUKHSA']: مواضع ص تعارضت مع
  //     لا، حُذف بعضها بعد المراجعة (24:37، 91:14) وأُبقي غيرها (55:11).
  //   • تعارض ص مع صلي (24:22): رُوجع وتقرَّر إبقاء ص كما هي — صلي لم
  //     تُغيّر القرار لأنها ليست مصدر السجاوندي نفسه.
  // ============================================================

  // علامات تذكير افتراضية عند مواضع الوقف (السجاوندي) — طلب مباشر من
  // المستخدم: الاستفادة من مواضع waqf-positions.js لتلوين الكلمة نفسها
  // (بلا رمز عائم) في مصحف المدينة عند أنواع محددة من مواضع الوقف،
  // ثابتة، محفوظة في البرنامج نفسه لا في تخزين المستخدم.
  //
  // buildDefaultWordMap(type) يبني الجدول تلقائيًا مرة واحدة من
  // window.WAQF_POSITIONS لنوع مُعطى، محوّلًا رقم الكلمة الوارد هناك
  // (1-based، محسوب على نص مصحف المدينة نفسه — راجع تعليق الترويسة في
  // waqf-positions.js) إلى فهرس 0-based يطابق data-key بتاع كل
  // quran-word span (راجع idx في renderAyahWords أدناه). مشترك بين كل
  // أنواع هذه العلامات الافتراضية (خلافًا للجداول اليدوية أعلاه)، حتى
  // لا يتكرر نفس منطق البناء لكل نوع.
  //
  // DEFAULT_MARK_TYPES: كل الأنواع المشمولة بهذا التلوين الافتراضي حاليًا
  // (يُضاف إليها أي نوع مستقبلي بنفس الأسلوب). تُستخدم لحساب التعارضات
  // (نفس الكلمة مصنَّفة بأكثر من نوع من هذه الأنواع معًا) قبل بناء أي
  // جدول فردي — راجع DEFAULT_MARK_CONFLICT_KEYS أدناه مباشرة. لا وصلي
  // والتعانق عمدًا خارج هذا الجدول (راجع التعليق الأعلى) — لا تشارك في
  // التلوين، دورها تحقّقي فقط.
  var DEFAULT_MARK_TYPES = {TA_MUTLAQ: true, SAD_RUKHSA: true, WAQF_LAZIM: true, ZAY_JAWAZ: true, QAD_QILA: true, QIF: true, JEEM: true};

  // مراجعة يدوية مباشرة من المستخدم لتعارضين حقيقيين ظهرا بين ط وم
  // (راجع DEFAULT_MARK_CONFLICT_KEYS أدناه) — تحقّق المستخدم منهما
  // مباشرة في "علل الوقوف" للسجاوندي (صور فعلية من صفحات الكتاب):
  //   • 6:124 الكلمة 13 ("رسل الله"): الكتاب يضع ط فوق "الله" تحديدًا
  //     (نهاية "رسل الله")، وليس م.
  //   • 67:19 الكلمة 7 ("ويقبضن"): الكتاب يضع ط فوق "ويقبضن" (سطر
  //     "ويقبض – 19 – ط")، وليس م.
  // كلا الموضعين إذًا ط فعليًا لا م — خطأ استخراج/محاذاة في
  // waqf-positions.js (النوع WAQF_LAZIM لا يخصهما)، وليس خلافًا حقيقيًا
  // بين نوعين صحيحين. بما أن waqf-positions.js وdata.js لا يُعدَّلان
  // يدويًا أبدًا (قيد المشروع)، يُطبَّق التصحيح هنا فقط، وقت العرض،
  // بنفس أسلوب التصحيحات المشابهة الأخرى في هذا الملف (قارن
  // tests/waqf-mark-correction-regression.js لتصحيح مشابه بمصدر Indopak).
  // القيمة هنا هي النوع "الصحيح" المؤكَّد؛ يُستبعد الموضع تلقائيًا من
  // جدول أي نوع آخر غير هذا (راجع buildDefaultWordMap أدناه) بدل
  // الاستبعاد الكامل الذي كان يحدث قبل هذا التصحيح.
  var DEFAULT_MARK_CONFLICT_RESOLUTIONS = {
    '6:124:13': 'TA_MUTLAQ',
    '67:19:7': 'TA_MUTLAQ',
    // 78:38 الكلمة 5 ("صَفّٗا") — مُصنَّفة ط ولا وقد قيل معًا في نفس
    // الوقت (raw data: LA + QAD_QILA + TA_MUTLAQ؛ هذا أيضًا الموضع
    // الوحيد في كل البيانات الذي فيه ط×قد_قيل تحديدًا — راجع تعليق
    // DEFAULT_QAD_QILA_WORDS أدناه). كانت قد رُوجعت وحُسمت "ط سليمة" في
    // جولتي مراجعة منفصلتين سابقتين (قبل قد قيل حتى، ثم أُعيد التأكيد
    // مباشرة من علل الوقوف). UPDATE (طلب مباشر نهائي لاحق): "ط مع لا
    // شيلها بردة من التلوين نهائيًا" — هذا يُلغي الاستثناء أعلاه بالكامل؛
    // 78:38 لم تعد تُحسَم ط بعد الآن. بإزالة هذا الإدخال من الجدول، تصبح
    // الكلمة تعارضًا داخليًا غير محسوم تلقائيًا (ط×قد_قيل عبر
    // DEFAULT_MARK_CONFLICT_KEYS)، فتُستبعد من كلا اللونين معًا (لا أزرق
    // ولا أخضر) وتُصدر تحذيرًا — بلا حاجة لجدول استبعاد منفصل لهذا
    // الموضع تحديدًا؛ الآلية القائمة تكفي.
    // طلب مباشر: من الثمانية تعارضات الداخلية بين ق (قد قيل) وز (الوقف
    // الجائز)، يُعتمد أخضر مباشرة فقط للمواضع التي تحمل ق وز **حصرًا**
    // (بلا أي علامة أخرى معهما، بما في ذلك صلي) و**ليست** آخر كلمة في
    // آيتها — طلب مباشر صريح بهذين الشرطين معًا. من الثمانية:
    //   • 11:46:10 ("صَٰلِحٖۖ"): مستبعدة من الاعتماد — تحمل صلي أيضًا،
    //     فتخالف شرط "بلا أي علامات تانية". تبقى غير محسومة (تعارض
    //     داخلي عادي، مُستبعدة من الطرفين وتُصدر تحذيرًا لحين المراجعة).
    //   • 51:54:5 ("بِمَلُومٖ"): مستبعدة من الاعتماد — آخر كلمة في
    //     آيتها. تبقى غير محسومة أيضًا (لا فرق عملي: مُستبعدة أصلًا
    //     بقاعدة آخر كلمة لكلا النوعين، لكن تركها بلا حسم أدق توثيقيًا).
    // الباقي (6 مواضع) تحمل ق وز فقط بلا أي شيء آخر، وليست آخر كلمة —
    // تُحسم أخضر مباشرة (سواء عبر ز أو قد قيل، لا فرق بصري).
    '2:34:10': 'QAD_QILA', '3:187:11': 'QAD_QILA', '4:45:6': 'QAD_QILA',
    '28:15:11': 'QAD_QILA', '28:15:29': 'QAD_QILA', '29:32:13': 'QAD_QILA',
    // طلب مباشر نهائي: مراجعة المستخدم للتعارضات الداخلية الثلاثة
    // المتبقية (كانت "غير محسومة" وتُصدر تحذيرًا) — كل واحد بسبب مختلف،
    // كلها تنتهي بنفس القرار: استبعاد نهائي مؤكَّد، لا تعليق بانتظار
    // مراجعة بعد الآن. القيمة 'CONFIRMED_EXCLUDED' هنا قيمة وهمية عمدًا
    // (لا تطابق أي نوع حقيقي في DEFAULT_MARK_TYPES)، فتُبقي الكلمة
    // مُستبعدة من كل الألوان دائمًا (نفس الأثر العملي للاستبعاد غير
    // المحسوم)، لكنها تُخرِج الموضع من عدّاد "تعارض غير محسوم" في
    // DEFAULT_MARK_CONFLICT_KEYS، فيتوقف console.warn عن ذكره — لأنه لم
    // يعد معلَّقًا، القرار نهائي وموثَّق هنا:
    //   • 78:38 الكلمة 5 ("صَفّٗا"، ط×قد_قيل): معاها لا في مصحف النسخ —
    //     تُستبعد.
    //   • 11:46 الكلمة 10 ("صَٰلِحٖۖ"، قد_قيل×ز): معاها صلي في مصحف
    //     النسخ — تُستبعد.
    //   • 51:54 الكلمة 5 ("بِمَلُومٖ"، قد_قيل×ز): رأس آية في مصحف
    //     النسخ — تُستبعد (لا فرق عملي: كانت مُستبعدة أصلًا بقاعدة آخر
    //     كلمة لكلا النوعين، لكن التوثيق هنا أدق).
    '78:38:5': 'CONFIRMED_EXCLUDED',
    '11:46:10': 'CONFIRMED_EXCLUDED',
    '51:54:5': 'CONFIRMED_EXCLUDED',
    // طلب مباشر: حسم تعارضات قف الداخلية مع ط/ص/ز — بشرط ألا تشترك معها
    // أي علامة ثالثة (تعانق أو غيره). من الـ9 تعارضات الخام (6 مع ط، 2
    // مع ص، 1 مع ز)، 8 منها "نظيفة" (قف + نوع واحد بس، لا شيء ثالث):
    //   • قف×ط (5 مواضع نظيفة: 7:183، 19:30، 24:58، 32:24، 88:21):
    //     "كلاهما نفس المعنى وهو الوقف" — تُحسم أزرق (نفس اللون بأي
    //     حال، سواء ط أو قف).
    //   • قف×ص (2 موضع: 3:135، 19:17): "ترجّح في الرأي، الوصل هنا
    //     أولى" — تُحسم أخضر (لصالح ص، لا قف الأزرق).
    //   • قف×ز (1 موضع: 27:66): نفس السبب — تُحسم أخضر (لصالح ز).
    // الاستثناء الوحيد: 65:10 الكلمة 11 — رغم كونها قف×ط، **ليست**
    // نظيفة (مُصنَّفة MUANAQAH أيضًا في نفس الوقت — ثلاث علامات معًا)،
    // فتخالف شرط "لم يشترك معهم أي علامة" صراحةً. لم تُدرَج هنا ضمن
    // الثمانية النظيفة، لكنها حُسمت لاحقًا بشكل منفصل — راجع تعليق
    // "قف×تعانق" أدناه مباشرة لسبب حسمها أزرق تحديدًا.
    '7:183:2': 'QIF', '19:30:4': 'QIF', '24:58:27': 'QIF',
    '32:24:7': 'QIF', '88:21:1': 'QIF',
    '3:135:16': 'SAD_RUKHSA', '19:17:4': 'SAD_RUKHSA',
    '27:66:10': 'ZAY_JAWAZ',
    // قف×تعانق: مراجعة يدوية مباشرة من المستخدم للسبعة مواضع الفعّالة
    // (راجع تعليق DEFAULT_QIF_WORDS أدناه للقائمة الكاملة). قرار حسم
    // مباشر لموضعين منها فقط (الباقي استبعاد نهائي في
    // DEFAULT_MARK_MANUAL_EXCLUSIONS['QIF'] أدناه، لا حسم هنا):
    //   • 65:10 الكلمة 11 (هو نفسه استثناء قف×ط أعلاه): تُحسم أزرق —
    //     "الموضع الآخر في التعانق عليه صلي"، فيُرجَّح هذا الطرف.
    //   • 47:4 الكلمة 20 ("أَوۡزَارَهَاۚ"): تُحسم أزرق — "عندها علامة
    //     رأس الآية عند غير الكوفيين"، فيُختار هذا الطرف بالسنة، ويُلغي
    //     الوقفة عند الطرف الآخر. UPDATE: هذا يُلغي قرارًا سابقًا كان قد
    //     أبقى الطرف الآخر (47:4 الكلمة 21 "ذَٰلِكَۖ") أزرق (بحجة أن ط
    //     أقوى من قف) — راجع الاستبعاد الجديد لـ47:4:21 في
    //     DEFAULT_MARK_MANUAL_EXCLUSIONS['TA_MUTLAQ'] أدناه، الذي يعكس
    //     ذلك القرار السابق بمعلومة "رأس الآية" الجديدة.
    '65:10:11': 'QIF', '47:4:20': 'JEEM',
    // ج (الوقف الجائز — JEEM) — طلب مباشر أول: "بناءً على القواعد التي
    // لديك، أضف ج باللون الأزرق"، ثم طلب مباشر لاحق: غُيِّر إلى الأخضر.
    // تطبيقًا للبند 3 من الخوارزمية العامة (ترتيب قوة العلامة: ط > قف >
    // ج > ز > ق > ص — القرار مبني على القوة لا على اللون، فلم يتغيّر
    // بتغيّر لون ج)، تُحسم تلقائيًا كل تعارضات ج الداخلية "النظيفة" (بلا
    // علامة ثالثة) مع ط/ص/ز/ق/قف — 11 موضعًا من أصل 13 تقاطع خام (الاثنان
    // الباقيان ليسا نظيفين، يُعالَجان بشكل منفصل في تعليق
    // DEFAULT_JEEM_WORDS أدناه):
    //   • ج×ط (2، ط أقوى): 4:103:9، 10:98:9 → أزرق (ط لسه أزرق، ج بقت
    //     خضراء — فرق لون حقيقي الآن، ط تفوز).
    //   • ج×ص (1، ج أقوى): 2:62:18 → أخضر (الاثنان أخضر الآن، لا فرق
    //     بصري، لكن ج تفوز رسميًا حسب الترتيب).
    //   • ج×ز (3، ج أقوى): 9:30:21، 40:62:10، 44:20:6 → أخضر (نفس
    //     الملاحظة، لا فرق بصري بعد تغيير لون ج).
    //   • ج×ق قد قيل (1، ج أقوى): 18:21:13 → أخضر (نفس الملاحظة).
    //   • ج×قف (4، قف أقوى): 18:27:10، 19:1:1، 22:11:18، 50:1:1 → أزرق
    //     (قف لسه أزرق، ج بقت خضراء — فرق لون حقيقي الآن، قف تفوز).
    '4:103:9': 'JEEM', '10:98:9': 'JEEM',
    '2:62:18': 'JEEM',
    '9:30:21': 'JEEM', '40:62:10': 'JEEM', '44:20:6': 'JEEM',
    '18:21:13': 'JEEM',
    '18:27:10': 'JEEM', '19:1:1': 'JEEM', '22:11:18': 'JEEM', '50:1:1': 'JEEM',
    // أضعف يفوز (مراجعة ز/ق/ص 1.0.140): ج×ز → ز، ج×ق → ق، ج×ص → ص
    '9:30:21': 'ZAY_JAWAZ', '40:62:10': 'ZAY_JAWAZ', '44:20:6': 'ZAY_JAWAZ',
    '3:119:12': 'QAD_QILA', '18:21:13': 'QAD_QILA',
    '2:62:18': 'SAD_RUKHSA',
    // 3:119:12 (ج×ق قد قيل): تقاطع "غير نظيف" — تحمل صلي أيضًا (كانت
    // مُدرَجة أصلًا ضمن استبعاد قد_قيل×صلي الدائم). بانضمام ج لنفس
    // الموضع، تُستبعد الكلمة بالكامل من كل الألوان (طبقًا لسياسة "أي
    // علامة تلاقي معاها صلي تُستبعد نهائيًا" العامة) بدل تركها كتعارض
    // داخلي غير محسوم.
    '3:119:12': 'CONFIRMED_EXCLUDED'
  };

  // مراجعة يدوية مباشرة من المستخدم لمواضع ط تتقاطع مع علامة التعانق
  // (MUANAQAH) — بخلاف تعارضات ط/ص/م أعلاه، هذه ليست تعارضًا بين نوعين
  // من DEFAULT_MARK_TYPES (التعانق أصلًا خارج DEFAULT_MARK_TYPES، ولا
  // تُحسب تعارضًا بواسطة DEFAULT_MARK_CONFLICT_KEYS) — لكن المستخدم
  // راجع القائمة الكاملة لكل مواضع ط+تعانق (11 موضعًا) وقرر حذف علامة
  // ط تحديدًا من موضعين منها فقط:
  //   • 14:9 الكلمة 13 ("بَعۡدِهِمۡ")
  //   • 33:13 الكلمة 18 ("عَوۡرَةٞ") — راجع DEFAULT_MARK_MANUAL_ADDITIONS
  //     أدناه مباشرة لمتابعة هذا الاستبعاد بالذات (إضافة ط في موضع آخر
  //     من نفس الآية، بدل الموضع المستبعد هنا).
  //
  // ============================================================
  // خوارزمية عامة لحسم أي تعانق (طلب مباشر: "كل المعلومات دي كنت ممكن
  // تستنتجها تلقائيًا") — تُطبَّق تلقائيًا على أي زوج تعانق مستقبلي بلا
  // حاجة لمراجعة يدوية من الصفر في كل مرة؛ كل قرارات ط×تعانق وقف×تعانق
  // الموثَّقة في هذا الملف (أدناه، وفي DEFAULT_MARK_CONFLICT_RESOLUTIONS
  // وDEFAULT_MARK_MANUAL_EXCLUSIONS) متوافقة معها بالضبط:
  //   1) رأس آية (سواء عند الكوفيين أو غير الكوفيين) = أولوية مطلقة،
  //      تلغي أي اعتبار آخر (حتى قوة العلامة في البند 3 أدناه).
  //   2) لو أحد طرفَي التعانق عليه لا أو صلي، يُستبعد ذلك الطرف تلقائيًا،
  //      والأولوية للطرف الآخر (بصرف النظر عن قوة العلامتين).
  //   3) لو الطرفان "سليمان" (لا رأس آية ولا لا/صلي على أي منهما)، تُحسم
  //      بترتيب قوة العلامة: ط > قف > ج > ز > ق (قد قيل) > ص. الأقوى يفوز.
  //   4) تنبيه مهم (طلب مباشر): لو الطرفان "سليمان" ومعهما **نفس العلامة**
  //      بالضبط (تعادل تام، مثل 11:49 حيث الطرفان ط)، **لا تُرجَّح** أحد
  //      الموضعين تلقائيًا بأي قاعدة افتراضية (لا بالترتيب ولا بغيره) —
  //      هذه الحالة تحديدًا تحتاج الرجوع إلى التلقي (النقل الشفهي
  //      المتوارث)، لا خوارزمية. القرار الموثَّق فعليًا عند 11:49 (اعتماد
  //      الطرف الأول) كان قرارًا مباشرًا من المستخدم بناءً على تلقيه هو،
  //      وليس تطبيقًا لقاعدة عامة — أي حالة تعادل جديدة تحتاج نفس المراجعة
  //      المباشرة، لا حسمًا تلقائيًا بالقياس على هذه الحالة.
  // ============================================================
  //
  // منهجية التعانق مع ط (طلب مباشر، مراجعة كاملة للستة مواضع الفعّالة
  // المتبقية من أصل 11 تقاطع ط×تعانق الخام — 2:151 و74:39 مستبعدان أصلًا
  // بقاعدة آخر كلمة، و14:9:13 و33:13:18 مستبعدان أعلاه لسبب مختلف تمامًا):
  //
  // القاعدة العامة للتعانق: كل زوج تعانق له طرفان (موضعان متقاربان،
  // الوقف على أحدهما يُلغي الوقف عند الآخر). إذا كان أحد الطرفين رأس
  // آية، يُختار اتباعًا للسنة بالوقف على رؤوس الآيات، فيُلغي الوقفة عند
  // الطرف الآخر تلقائيًا. إذا لم يكن أي من الطرفين رأس آية، فالأمر
  // يحتاج مراجعة فردية لتحديد أيهما يُعتمد (لا يُعتمد الاثنان معًا أبدًا).
  //
  // القرارات الفعلية للستة مواضع (بعد المراجعة):
  //   • 3:172 الكلمة 9 ("ٱلۡقَرۡحُۚ"): ط موجودة عند الطرف الثاني للتعانق،
  //     لكن الطرف الأول رأس آية — فيُعتمد الطرف الأول (السنة)، وتُلغى ط
  //     هنا تمامًا. تُستبعد.
  //   • 9:101 الكلمة 5 ("مُنَٰفِقُونَۖ"): ط عند الطرف الأول، والطرف الثاني
  //     عليه ج (وقف جائز — أضعف من ط المطلق). لا طرف منهما رأس آية،
  //     فتُعتمد ط لأنها الأقوى. تبقى ط (لا تغيير).
  //   • 11:49 الكلمتان 15 و16 ("هَٰذَاۖ" و"فَٱصۡبِرۡۖ"): كلا طرفَي التعانق
  //     عليهما ط، ولا طرف منهما رأس آية — لا يجوز اعتماد الاثنين معًا،
  //     فيُعتمد الطرف الأول (15 "هذا") وتبقى ط، ويُستبعد الطرف الثاني
  //     (16 "فاصبر") تمامًا رغم كونه ط في البيانات الخام.
  //   • 14:9 الكلمتان 10 و13 ("وَثَمُودَ" و"بَعۡدِهِمۡ"): الطرف الأول
  //     ("ثمود") رأس آية عند غير الكوفيين، فتُعتمد ط هناك (تبقى، لا
  //     تغيير)، وتُلغى تلقائيًا عند الطرف الثاني ("بعدهم") — وهو نفس
  //     الموضع المُستبعد أعلاه أصلًا لسبب آخر منفصل (بلا علاقة مباشرة)،
  //     فالنتيجتان متوافقتان.
  //   • 47:4 الكلمة 21 ("ذَٰلِكَۖ"): ط موجودة عند الطرف الثاني، والطرف
  //     الأول عليه قف (أضعف من ط). لا طرف منهما رأس آية، فتُعتمد ط عند
  //     الطرف الثاني لأنها الأقوى. تبقى ط (لا تغيير).
  //
  // خلاصة التغيير الفعلي المطلوب: استبعاد إضافيان فقط — 3:172:9 و
  // 11:49:16 — الأربعة الباقية (9:101:5، 11:49:15، 14:9:10، 47:4:21)
  // كانت بالفعل نشطة وصحيحة، فبقيت بلا تغيير.
  //
  // سياسة عامة مؤكَّدة أيضًا (طلب مباشر): "نستبعد علامة الوقف مع لا
  // دائمًا، نستبعد علامة الوقف مع صلي دائمًا" — قاعدة نهائية بلا
  // استثناءات، تشمل الآن ط أيضًا (لا تقتصر على ص/ق/ز فقط كما كانت
  // أول مرة)، حتى يكون الوقف المُعتمد مثبتًا بالإجماع بلا أي خلاف مع
  // مصدرين آخرين. أما التعانق فمعاملته مختلفة تمامًا كما هو موضَّح
  // أعلاه — ليس استبعادًا تلقائيًا، بل اختيار بين طرفين.
  // ============================================================
  var DEFAULT_MARK_MANUAL_EXCLUSIONS = {
    // UPDATE (طلب مباشر لاحق، أثناء مراجعة قف×تعانق): 47:4 الكلمة 21
    // ("ذَٰلِكَۖ") كانت قد أُبقيت زرقاء سابقًا (ط أقوى من قف المفترضة
    // وقتها) — لكن مراجعة لاحقة لموضع قف نفسه (47:4 الكلمة 20
    // "أَوۡزَارَهَاۚ"، الطرف الآخر من نفس زوج التعانق) كشفت أنه هو
    // رأس الآية فعليًا عند غير الكوفيين، فيُختار بالسنة، ويُلغي هذا
    // الطرف ("ذلك") — راجع '47:4:20': 'QIF' في
    // DEFAULT_MARK_CONFLICT_RESOLUTIONS أعلاه لتفاصيل القرار الجديد.
    'TA_MUTLAQ': {'14:9:13': true, '33:13:18': true, '3:172:9': true, '11:49:16': true, '47:4:21': true},
    // مراجعة يدوية مباشرة من المستخدم لتقرير تعارض ط/ص/م مع لا (الوقف
    // الممنوع عند السجاوندي — النوع LA في waqf-positions.js): من أصل 4
    // مواضع نشطة فعليًا فيها تقاطع (الباقي مستبعد أصلًا بقاعدة آخر
    // كلمة)، راجع المستخدم كل موضع في "علل الوقوف" مباشرة (صور فعلية
    // من صفحات 1084، 738، 985، 1132) وقرر في حينه:
    //   • 78:38 ("صَفّٗا"): ط سليمة كما هي (قرار وقتها).
    //   • 55:11 ("فَٰكِهَةٞ"): ص سليمة كما هي (قرار وقتها).
    //   • 24:37 ("ٱلزَّكَوٰةِ"): الكتاب يثبت لا هنا فعليًا — تُستبعد ص.
    //   • 91:14 ("فَعَقَرُوهَا"): لا وقف عليها إطلاقًا في الكتاب (ولا
    //     حتى لا) — تُستبعد ص.
    // UPDATE (طلب مباشر لاحق، سياسة عامة نهائية): "أي علامة ص/ق/ز معاها
    // علامة لا أو صلي، شيلها فورًا ولا تعتمدها بالتلوين" — هذا يُلغي
    // قرار الإبقاء الفردي على 55:11 أعلاه (وعلى 24:22 أدناه، تعارض
    // ص×صلي كان قد أُبقي عليه سابقًا لنفس السبب)؛ كلاهما يُستبعد الآن
    // نهائيًا، بلا استثناءات فردية بعد اليوم لهذا النوع من التقاطع —
    // القاعدة العامة تفوز على أي قرار سابق مبني على مراجعة حالة بحالة.
    // UPDATE 2 (طلب مباشر أوسع لاحق): "ط مع لا شيلها بردة من التلوين
    // نهائيًا" — وسَّع نفس السياسة لتشمل ط كمان (كانت مقصورة على
    // ص/ق/ز فقط في UPDATE الأول)؛ راجع إزالة استثناء 78:38 في
    // DEFAULT_MARK_CONFLICT_RESOLUTIONS أعلاه لتطبيق هذا التوسيع.
    'SAD_RUKHSA': {'24:37:13': true, '91:14:2': true, '55:11:2': true, '24:22:15': true},
    // طلب مباشر أولي: "مش عايز أحطها إلا لما أراجعها الأول" — الـ34 موضع
    // النشط فعليًا من تقاطع ز×صلي (راجع تعليق DEFAULT_ZAY_JAWAZ_WORDS
    // أدناه للتفاصيل الكاملة؛ الـ25 موضع الباقي من الـ59 الخام مستبعد
    // أصلًا بقاعدة آخر كلمة، فلا داعي لذكرها هنا).
    // UPDATE (طلب مباشر لاحق، سياسة عامة نهائية): "أي علامة ص/ق/ز معاها
    // علامة لا أو صلي، شيلها فورًا ولا تعتمدها بالتلوين" — هذا يحسم
    // مصير الـ34 موضعًا نهائيًا كاستبعاد **دائم**، لا مؤقت معلَّق بانتظار
    // مراجعة فردية كما كان الحال أصلًا؛ لا حاجة لمراجعة كل موضع في علل
    // الوقوف بعد الآن لهذا النوع من التقاطع تحديدًا.
    'ZAY_JAWAZ': {
      '2:168:8': true, '4:140:22': true, '4:141:13': true, '5:22:6': true,
      '5:107:22': true, '6:141:25': true, '6:146:26': true, '7:83:4': true,
      '7:144:8': true, '7:150:30': true, '7:151:8': true, '7:154:7': true,
      '7:179:7': true, '7:196:6': true, '8:69:5': true, '9:52:18': true,
      '9:129:5': true, '11:16:8': true, '19:48:8': true,
      '21:45:4': true, '21:56:8': true, '21:92:5': true, '25:50:4': true,
      '27:20:7': true, '29:60:9': true, '33:23:15': true, '35:3:19': true,
      '35:8:15': true, '35:13:11': true, '42:6:8': true, '46:23:5': true,
      '46:26:11': true, '73:20:48': true
      // ملاحظة: 11:46:10 كانت هنا (تقاطع ز×صلي)، لكنها حُذفت من هذه
      // القائمة لأنها مُستبعدة بالفعل تلقائيًا عبر آلية التعارض الداخلي
      // (DEFAULT_MARK_CONFLICT_KEYS — نفس الموضع تقاطع داخلي حقيقي غير
      // محسوم بين ز وقد قيل، راجع DEFAULT_QAD_QILA_WORDS أدناه)، فذكرها
      // هنا كان تكرارًا زائدًا لا فائدة منه.
    },
    // طلب مباشر نهائي: "ق مع لا، أو ق مع صلي، تُستبعد تمامًا" — بخلاف
    // الاستبعاد المؤقت المعلَّق المطبَّق على ز أعلاه، هذا **قرار نهائي**
    // من المستخدم: أي تقاطع فعّال (غير آخر كلمة) بين قد قيل ولا، أو بين
    // قد قيل وصلي، يُستبعد نهائيًا من التلوين — لا حاجة لمراجعة يدوية
    // لاحقة في علل الوقوف لهذين النوعين تحديدًا. صفر تقاطعات فعّالة مع
    // التعانق أصلًا. 78:38:5 غير مُدرَجة هنا (كان استثناءً "ط سليمة"
    // سابقًا، لكن ذلك الاستثناء نفسه أُلغي لاحقًا — راجع
    // DEFAULT_MARK_CONFLICT_RESOLUTIONS أعلاه؛ الكلمة الآن مُستبعدة عبر
    // آلية التعارض الداخلي بين ط وقد قيل، لا عبر هذا الجدول). المجموع: 5 من لا + 70 من صلي = 75 موضعًا
    // مُستبعدة نهائيًا. (لا علاقة لهذا القرار بتقاطع قد_قيل×ز الداخلي
    // غير المحسوم — 11:46:10 — الذي يبقى معلَّقًا كما هو، لم يُذكر في
    // هذا الطلب.)
    'QAD_QILA': {
      // لا (5 مواضع، مستبعدة نهائيًا؛ 78:38:5 مُستبعدة أيضًا لكن عبر آلية أخرى — راجع التعليق أعلاه)
      '2:20:9': true, '2:25:31': true, '2:101:15': true, '30:30:17': true,
      '47:4:11': true,
      // صلي (70 موضعًا، مستبعدة نهائيًا)
      '3:45:9': true, '3:98:7': true, '3:119:12': true,
      '3:173:12': true, '3:193:10': true, '4:62:10': true, '4:101:11': true,
      '4:143:2': true, '5:20:15': true, '6:70:16': true, '6:138:5': true,
      '7:11:9': true, '8:67:14': true, '12:3:10': true,
      '13:35:16': true, '14:40:6': true, '17:73:10': true, '17:79:6': true,
      '18:18:4': true, '18:18:9': true, '18:64:5': true, '18:82:21': true,
      '19:6:5': true, '19:19:5': true, '21:3:4': true, '21:3:6': true,
      '21:17:8': true, '21:63:3': true, '21:87:19': true, '22:17:10': true,
      '22:36:9': true, '23:17:5': true, '23:18:8': true, '23:67:1': true,
      '23:72:6': true, '24:15:12': true, '24:16:11': true, '24:33:21': true,
      '25:65:7': true, '26:35:6': true, '28:9:9': true, '28:19:18': true,
      '29:46:8': true, '29:60:6': true, '30:25:11': true, '30:25:13': true,
      '31:6:12': true, '35:12:3': true, '36:47:18': true, '37:31:4': true,
      '38:65:4': true, '39:8:30': true, '39:23:7': true, '39:67:5': true,
      '40:28:3': true, '40:81:2': true, '42:10:13': true, '43:81:5': true,
      '46:12:14': true, '46:17:18': true, '47:35:5': true, '47:35:7': true,
      '50:38:9': true, '57:19:7': true, '58:1:11': true, '60:1:32': true,
      '60:1:35': true, '76:2:6': true, '77:23:1': true
    },
    // قف (QIF — طلب مباشر: "أدخل قف عند السجاوندي، وكرر: قف وليس ق").
    // طلب مباشر: "استبعد نهائيًا... المواضع اللي فيها لا وفيها صلي مع
    // قف" — قرار نهائي بلا استثناءات، بنفس سياسة ط/ص/ز/ق العامة.
    //   • قف×لا: 6 تقاطعات خام، 5 فعّالة (15:43:4 آخر كلمة في آيتها،
    //     مستبعدة أصلًا بقاعدة آخر كلمة، فلا داعي لذكرها هنا). الخمسة
    //     الفعّالة أدناه تُستبعد نهائيًا.
    //   • قف×صلي: تقاطع خام واحد، فعّال (27:40:23) — يُستبعد نهائيًا.
    // التعانق (7 مواضع فعّالة) والتعارضات الداخلية مع ط/ص/ز (9 مواضع:
    // 6 مع ط، 2 مع ص، 1 مع ز) — كانت "عايز فيها تقرير الأول علشان
    // أقرر فيها" مبدئيًا. التعارضات الداخلية الثمانية النظيفة مُحسومة
    // الآن (راجع DEFAULT_MARK_CONFLICT_RESOLUTIONS أعلاه)، ومواضع
    // التعانق السبعة رُوجعت وحُسمت فرديًا:
    //   • أزرق (حُسمت، لم تعد هنا — راجع DEFAULT_MARK_CONFLICT_RESOLUTIONS
    //     أعلاه): 65:10:11 ("الموضع الآخر عليه صلي")، 47:4:20
    //     ("رأس آية عند غير الكوفيين").
    //   • مستبعدة نهائيًا (الخمسة الباقية أدناه): 9:101:8 (الطرف الآخر
    //     ط، أقوى)، 26:209:1، 40:70:7، 74:40:2، 97:5:1 (الأربعة هذه
    //     طرفها الآخر رأس آية، فيُختار بالسنة ويُلغي هذا الطرف).
    'QIF': {
      // لا (6 مواضع، مستبعدة نهائيًا) — +16:70:4 من REVIEW
      '2:251:3': true, '2:256:4': true, '6:19:7': true, '7:128:9': true,
      '14:27:14': true, '16:70:4': true,
      // صلي (موضع واحد، مستبعد نهائيًا)
      '27:40:23': true,
      // تعانق (5 مواضع مستبعدة نهائيًا؛ 65:10:11 و47:4:20 حُسمتا أزرق
      // ونُقلتا لـDEFAULT_MARK_CONFLICT_RESOLUTIONS أعلاه، فلم تعودا هنا)
      '9:101:8': true, '26:209:1': true, '40:70:7': true,
      '74:40:2': true, '97:5:1': true
    },
    // ج (JEEM) — طلب مباشر، نفس سياسة لا/صلي النهائية المطبَّقة على
    // باقي العلامات (ط/ص/ز/ق/قف): أي تقاطع فعّال (غير آخر كلمة) مع لا
    // أو صلي يُستبعد نهائيًا، بلا حاجة لمراجعة.
    //   • ج×لا: 4 مواضع فعّالة، مستبعدة نهائيًا.
    //   • ج×صلي: 51 موضعًا فعّالًا؛ 3:119:12 منها مُستبعدة عبر
    //     DEFAULT_MARK_CONFLICT_RESOLUTIONS أعلاه بدل هنا (كانت أيضًا
    //     تعارضًا داخليًا مع قد قيل)، فالباقي الصريح هنا 50.
    // ج×تعانق: 32 موضعًا فعّالًا إجمالًا. البند 2 من الخوارزمية العامة
    // (لا/صلي على أحد الطرفين يستبعده تلقائيًا) يحسم 5 منها فورًا —
    // نفس المواضع موجودة أصلًا ضمن قائمة صلي أعلاه (2:2:4، 2:195:9،
    // 3:30:9، 7:188:18، 65:10:9)، فلا داعي لتكرارها هنا. موضع واحد
    // (47:4:20) رُوجع وحُسم منفصلًا أزرق بالفعل (راجع
    // DEFAULT_MARK_CONFLICT_RESOLUTIONS). موضع واحد آخر (33:13:21
    // "بِعَوۡرَةٍۖ") استُبعد هنا خصيصًا — ط موجودة بالفعل في هذه الكلمة
    // بقرار مباشر سابق مستقل تمامًا (راجع DEFAULT_MARK_MANUAL_ADDITIONS
    // أدناه، "علل الوقوف" ص 817)، فلا يجوز لـج منافسته هنا. الباقي (25
    // موضعًا) **لا يمكن حسمه تلقائيًا** — الخوارزمية العامة تحتاج معرفة
    // حالة الطرف الآخر من كل زوج تعانق (رأس آية؟ قوة العلامة؟)، وهذه
    // المعلومة غير متاحة في بيانات المشروع (لا يوجد ربط صريح بين طرفَي
    // كل زوج تعانق في waqf-positions.js) — فتُستبعد مؤقتًا لحين توفير
    // معلومات الطرف الآخر من المستخدم.
    'JEEM': {
      // لا (4 مواضع، مستبعدة نهائيًا)
      '3:49:10': true, '3:181:18': true, '4:75:26': true, '29:66:3': true,
      // صلي (50 موضعًا، مستبعدة نهائيًا)
      '2:2:4': true, '2:14:6': true, '2:24:11': true, '2:76:6': true,
      '2:89:16': true, '2:109:11': true, '2:133:24': true, '2:174:26': true,
      '2:180:9': true, '2:195:9': true, '2:221:28': true, '2:236:13': true,
      '2:240:5': true, '2:266:23': true, '3:30:9': true, '3:118:19': true,
      '3:167:3': true, '5:41:62': true, '7:167:16': true, '7:188:18': true,
      '9:17:14': true, '10:109:8': true, '11:31:27': true, '12:29:6': true,
      '13:39:5': true, '21:32:4': true, '22:24:5': true, '23:24:20': true,
      '26:154:5': true, '29:41:9': true, '30:7:5': true, '33:19:2': true,
      '33:44:4': true, '34:31:18': true, '36:33:4': true, '36:37:3': true,
      '38:5:4': true, '38:6:8': true, '38:7:6': true, '40:64:17': true,
      '42:31:5': true, '44:49:1': true, '46:17:22': true, '47:26:12': true,
      '48:12:17': true, '48:23:7': true, '50:16:8': true, '65:10:9': true,
      '67:9:12': true, '78:40:4': true,
      // 33:13:21 — استثناء خاص: ط موجودة هنا بقرار مستقل سابق (راجع
      // DEFAULT_MARK_MANUAL_ADDITIONS أدناه)، فتُستبعد ج هنا كي لا تنافسها
      '33:13:21': true,
      // تعانق: طلب مباشر: "ممكن تجيب البيانات من مصحف النسخ تعليق عندك
      // إن استطعت" — استخرجت أزواج التعانق فعليًا من نص مصحف النسخ
      // الخام (علامات Unicode القياسية للسجاوندي: U+06D6 صلى، U+06D9 لا،
      // U+06DA ج، U+06DB تعانق) بمطابقة نصية بين مصحف المدينة ومصحف
      // النسخ لكل كلمة على حدة (وليس برقم الكلمة، لأن ترقيم الكلمتين
      // غير متطابق في أغلب هذه الآيات). النتيجة من الـ25 موضعًا الأصلية:
      //   • 4 مواضع حُسمت تلقائيًا (البند 2 من الخوارزمية — الطرف الآخر
      //     معه صلى فعليًا في النص، تحقّق مزدوج: مطابقة النص الخام +
      //     تأكيد من waqf-positions.js/sila-positions.js نفسيهما لنفس
      //     الطرف الآخر) — نُقلت لتصبح مواضع ج فعّالة عادية (خارج هذا
      //     الجدول تمامًا): 2:2:5، 2:195:10، 3:30:13، 7:188:21.
      //   • 10 مواضع (5 أزواج) تعادل تام حقيقي (كلا الطرفين ج) + 11
      //     موضعًا تعذَّر تحديد طرفها الآخر — رُوجعت كلها يدويًا بالرقية
      //     البصرية (طلب مباشر). الحسم النهائي:
      //       أخضر (نُقلت خارج هذا الجدول): 2:96:8، 5:41:16، 7:163:22،
      //         7:172:17، 28:35:11، 25:32:9، 60:3:5.
      //       مستبعدة نهائيًا (الطرف الآخر من كل زوج + الباقي): أدناه.
      '2:96:5': true,
      '5:32:3': true, '5:41:19': true,
      '7:92:7': true, '7:163:23': true, '7:172:16': true,
      '25:32:10': true,
      '25:59:13': true, '28:35:10': true, '33:61:1': true,
      '44:45:1': true, '60:3:7': true, '68:41:3': true,
      '84:15:1': true
    }
  };

  // متابعة مباشرة من المستخدم لاستبعاد 33:13 الكلمة 18 ("عَوۡرَةٞ")
  // أعلاه — راجع صورة فعلية من "علل الوقوف" للسجاوندي (ص 817): النص
  // يضع ط فوق «بعورة» (وليس «عورة» الأولى) تحديدًا "لمن لم يقف على
  // «عورة»" — أي أن ط تكون في الموضع الثاني («بعورة») عند عدم الوقوف
  // على الموضع الأول («عورة»)، وهذا هو الرأي "الأصح" بنص الكتاب نفسه
  // (وصل «إن يريدون» بما قبلها). بما أننا استبعدنا فعلًا ط من «عورة»
  // (الكلمة 18، الموضع الأول) أعلاه — أي اخترنا عدم الوقوف عندها — يجب
  // إذًا إضافة ط عند «بعورة» (الكلمة 21، الموضع الثاني) لإكمال العلامة
  // الصحيحة بحسب الكتاب، رغم أن waqf-positions.js لا يذكر هذه الكلمة
  // إطلاقًا (لم تُستخرَج من نص الإندوباك أصلًا لهذا الموضع). لا تعديل
  // على waqf-positions.js أو data.js (قيد المشروع) — هذه إضافة يدوية
  // مؤكَّدة بمصدر مباشر، تُدمَج هنا وقت العرض فقط.
  //
  // 60:8 الكلمة 17 ("إِلَيۡهِمۡۚ") — بلاغ مباشر من المستخدم: "في مصحف
  // النسخ عليها ط ولم تُلوَّن". تحقّق مباشر من نص مصحف النسخ الخام
  // (textIndopak) في data.js يؤكِّد ذلك: الكلمة 18 في نص الإندوباك
  // ("اِلَيۡهِمۡ​ؕ") تحمل فعليًا علامة U+0615 (ARABIC SMALL HIGH TAH —
  // الرمز القياسي لعلامة ط في هذا الترميز)، لكن waqf-positions.js
  // لا يحتوي أي مدخل TA_MUTLAQ لآية 60:8 إطلاقًا — bug حقيقي في
  // الاستخراج الأصلي (فجوة في waqf-positions.js نفسها، وليس خطأ في
  // منطق العرض هنا). تمت إضافتها يدويًا هنا (بلا تعديل على
  // waqf-positions.js أو data.js، طبقًا لقيد المشروع).
  //
  // ⚠️ نطاق المشكلة أوسع من هذا الموضع الواحد (طلب مباشر: "تتبّع جميع
  // المواضع التي لم تؤخذ في الاعتبار لعلامة الوقف ط"): بمقارنة عدد
  // ظهور U+0615 الفعلي في نص كل آية بمصحف النسخ الكامل (data.js) مقابل
  // عدد مداخل TA_MUTLAQ المسجَّلة لنفس الآية في waqf-positions.js،
  // ظهر تطابق بـ6,236 آية 6,065 منها سليمة، لكن **171 آية فيها فجوة
  // فعلية** — إجمالي 248 علامة ط في نص مصحف النسخ الخام غير مُستخرَجة
  // في waqf-positions.js. 60:8 كانت أبسط حالة (فجوة كاملة لآية بلا أي
  // مدخل TA_MUTLAQ خالص، وعلامة واحدة مرتبطة بكلمة واضحة).
  //
  // تصنيف الـ171: 65 "بسيطة" (كل ظهور U+0615 ملتصق بكلمة واضحة، لا رموز
  // منفصلة) و106 "معقّدة" (فيها رمز U+0615 ظاهر "لوحده" في نص الإندوباك،
  // غير ملتصق بأي كلمة — يحتاج فحصًا فرديًا لا استخراجًا آليًا، لسه
  // مؤجّلة). هذه الدفعة تحل الـ65 البسيطة (63 منها فعليًا؛ 19:41 اتجاهها
  // معكوس ومُصحَّحة أصلًا عبر WORD_MARK_CORRECTIONS أدناه، و60:8 مُضافة
  // أعلاه بالفعل).
  //
  // المنهجية: لكل آية، مُطابقة كل "كلمة" حقيقية في نص الإندوباك (بعد دمج
  // أي رمز وقف تابع منفصل بمسافة مع الكلمة التي تسبقه) مع نظيرتها في نص
  // مصحف المدينة عبر "هيكل" الحروف الأساسية لكل كلمة (بعد تجريد كل
  // التشكيل والرموز التوجيهية وتوحيد صور الألف/الهمزة/الياء المختلفة بين
  // الرسمين)، ثم محاذاة التسلسلين (Longest Common Subsequence) لإيجاد رقم
  // كلمة مصحف المدينة المقابل لكل كلمة إندوباك تحمل U+0615 وليست مسجَّلة
  // أصلًا في waqf-positions.js. تحقّق هذه الطريقة تلقائيًا من الحالة
  // المعروفة (60:8 ← الكلمة 17) قبل تعميمها. 7 مواضع (من أصل 65) فيها
  // اختلاف رسم حقيقي بين الرسمين (ألف مقصورة بدل الألف الممدودة في بعض
  // الأعلام والكلمات، مثل "مَٰرُوتَ"/"مَارُوۡتَ") تعذّر على المطابقة
  // الآلية حسمها فراجعتها فرديًا: 2:102 (الكلمتان 66، 71)، 2:243 (17)،
  // 3:153 (21)، 40:56 (17)، 57:20 (33)، 88:1 (4) — كل ماعدا هذه السبعة
  // حُسم آليًا بثقة عالية (بلا أي تعارض مع لا أو صلي في نفس الموضع، تم
  // التحقق برمجيًا من الثمانين موضعًا كلها).
  var DEFAULT_MARK_MANUAL_ADDITIONS = {
    'TA_MUTLAQ': {
      '33:13:21': true, '60:8:17': true,
      // Indopak ط (U+0615) on word — keep as TA_MUTLAQ (not JEEM).
      // Madinah may show U+06DA; Indopak is source of truth.
      '3:152:20': true, '4:171:31': true, '4:171:34': true, '5:44:32': true, '6:144:34': true, '7:160:25': true, '7:160:37': true, '7:176:20': true, '7:187:15': true, '7:187:19': true, '10:83:14': true, '22:78:14': true, '22:78:17': true, '33:4:19': true, '35:43:5': true, '35:43:11': true, '48:29:24': true, '57:12:18': true,
      // الدفعة الأولى من فجوات الاستخراج (65 آية "بسيطة"، 80 كلمة) —
      // مرتّبة بترتيب المصحف (رقم السورة تصاعديًا).
      '2:29:15': true, '2:102:71': true, '2:243:17': true,
      '2:258:23': true, '2:258:38': true, '3:65:13': true, '3:151:16': true,
      '3:152:35': true, '3:153:21': true, '3:162:11': true,
      '3:197:5': true, '4:97:9': true, '4:97:14': true, '4:97:22': true,
      '4:97:25': true, '5:63:9': true, '6:46:16': true, '6:62:6': true,
      '6:165:14': true, '8:16:18': true, '8:40:6': true, '9:73:9': true,
      '9:115:13': true, '11:28:15': true, '12:88:17': true, '13:18:25': true,
      '14:5:14': true, '14:12:9': true, '14:12:13': true, '14:21:25': true,
      '16:28:12': true, '16:70:16': true, '16:76:19': true, '18:37:16': true,
      '20:11:4': true, '22:37:18': true,
      '22:78:38': true, '24:40:13': true, '24:40:17': true, '24:40:23': true,
      '24:57:9': true, '28:32:21': true, '28:77:21': true, '32:20:5': true,
      '40:56:17': true, '40:56:19': true, '42:51:19': true, '43:80:7': true,
      '51:16:4': true, '51:16:9': true, '57:15:11': true,
      '57:15:13': true, '57:20:25': true, '57:20:33': true, '57:23:9': true,
      '58:19:6': true, '58:19:9': true, '59:19:7': true,
      '61:6:24': true, '65:7:13': true, '65:7:20': true, '66:9:9': true,
      '74:27:4': true, '74:47:3': true, '77:14:5': true, '79:43:4': true,
      '79:44:3': true, '79:45:5': true, '82:18:6': true, '83:8:4': true,
      '83:19:4': true, '88:1:4': true, '89:15:11': true, '97:2:5': true,
      // الدفعة الثانية والأخيرة من فجوات الاستخراج (106 آية "معقّدة" —
      // فيها رمز U+0615 ظاهر "لوحده" في نص الإندوباك، غير ملتصق بأي
      // كلمة، فتعذّرت المطابقة الآلية بهيكل الحروف). حُسمت كل آية فرديًا
      // عبر أداة اختيار بصرية (تعرض نص مصحف المدينة كاملًا مقسَّمًا
      // لكلمات، بمقابلة رقم كل كلمة إندوباك تحمل ط برقم كلمتها في مصحف
      // المدينة يدويًا)، ثم راجَع المستخدم النتيجة كلمة كلمة. 208 اختيارًا
      // خامًا عبر الـ106 آية (كل ظهور ط في الآية، سواء كان مسجَّلًا بالفعل
      // أو ناقصًا، لأغراض التحقق)؛ 39 منها كانت مطابقة لمداخل TA_MUTLAQ
      // موجودة أصلًا في waqf-positions.js (فلم تُضَف هنا ثانية)، فبقي 169
      // اختيارًا فعليًا جديدًا. من هذه الـ169، استُبعدت 12 حالة بعد مراجعة
      // يدوية مباشرة من المستخدم (ملف استبعادات مخصَّص لهذه الدفعة):
      //   • 10 مواضع "رأس آية" (5:46:26، 69:3:4، 70:7:2، 79:30:4، 79:42:5،
      //     90:12:4، 91:10:4، 101:3:4، 101:10:4، 104:5:4) — كل العشرة فعليًا
      //     آخر كلمة في آيتها (تحقّق برمجيًا)، فتُستبعد بنفس القاعدة العامة
      //     أعلاه ("لا تُوضع عند آخر كلمة في الآية")، لا استثناء جديدًا.
      //   • 46:15:39 ("ذُرِّيَّتِيٓۖ"): الكلمة تحمل ط وج معًا في نص النسخ.
      //     راجع المستخدم علل الوقوف وقرر اعتماد ج (الأضعف) بدل ط — أُضيفت
      //     أدناه ضمن DEFAULT_MARK_MANUAL_ADDITIONS['JEEM'] بدلًا من هنا،
      //     وليست ط رغم وجود الرمز خامًا.
      //   • 18:49:19 ("أَحۡصَىٰهَاۚ"): اختيار زائد من الأداة لا يخصّ ط
      //     إطلاقًا — تحقّق مباشر من نص النسخ الخام يؤكِّد أن الرمز عند
      //     هذه الكلمة تحديدًا هو ج (U+06DA) لا ط (U+0615)؛ 18:49 نفسها
      //     فيها ط واحدة فقط (عند الكلمة 23 "حَاضِرٗاۗ"، وهي المُضافة
      //     أدناه). موضع ج هذا خارج نطاق هذه الدفعة (فجوة مختلفة كليًا،
      //     غير مذكورة في تقرير فجوات ط ولا في ملف الاستبعادات)، فتُركت
      //     بلا إضافة لحين مراجعة مخصَّصة لها منفصلة.
      //   • 7:187:15 ("مُرۡسَىٰهَاۖ"): تحمل ط وم معًا؛ راجع المستخدم علل
      //     الوقوف وقرر اعتماد ط (الأضعف) هنا تحديدًا — تبقى ط عاديةً
      //     (مُدرَجة أدناه ضمن الـ157، لا استثناء عملي).
      // الناتج: 157 مدخلًا جديدًا فعليًا لـTA_MUTLAQ أدناه (169 - 10 رأس
      // آية - 1 جيم - 1 زائد = 157)، مرتّبة بترتيب المصحف:
      '2:72:5': true, '2:142:11': true, '2:142:15': true, '2:144:14': true,
      '2:144:20': true, '2:144:29': true, '2:247:35': true, '2:247:40': true,
      '2:251:13': true, '2:272:8': true, '2:272:13': true, '2:272:19': true,
      '2:282:71': true, '2:282:77': true, '2:282:86': true, '2:282:107': true,
      '2:282:115': true, '2:282:120': true, '2:282:122': true, '2:282:124': true,
      '3:28:21': true, '3:28:24': true, '3:93:17': true, '3:144:16': true,
      '3:144:24': true, '3:148:7': true, '3:180:12': true, '3:180:16': true,
      '3:180:22': true, '3:180:26': true, '4:20:13': true, '4:37:11': true,
      '4:84:17': true, '4:105:11': true, '4:114:16': true,
      '4:171:38': true, '4:171:50': true, '5:7:14': true,
      '5:43:12': true, '5:48:42': true, '5:66:16': true,
      '5:66:19': true, '5:68:15': true, '5:72:29': true, '6:71:29': true,
      '6:71:35': true, '6:80:8': true, '6:80:18': true, '6:80:23': true,
      '6:90:6': true, '6:90:11': true, '6:128:31': true,
      '7:22:14': true, '7:27:23': true, '7:38:34': true, '7:43:28': true,
      '7:89:14': true, '7:89:25': true, '7:89:30': true, '7:89:33': true,
      '7:157:30': true, '7:160:20': true, '7:160:32': true,
      '7:187:5': true,
      '7:187:23': true, '7:187:27': true, '8:43:16': true,
      '9:111:23': true, '9:111:33': true, '9:127:14': true, '10:16:16': true,
      '10:23:9': true, '10:24:38': true, '10:38:3': true,
      '11:13:3': true, '11:35:3': true, '11:41:7': true, '11:54:7': true,
      '11:88:21': true, '11:88:27': true, '11:88:31': true, '12:21:14': true,
      '12:21:23': true, '12:30:13': true, '12:36:21': true, '12:68:20': true,
      '12:96:9': true, '14:6:20': true, '14:34:5': true, '14:34:11': true,
      '17:5:14': true, '17:40:7': true, '17:67:15': true, '17:97:23': true,
      '18:49:23': true, '21:103:6': true, '24:33:27': true, '24:33:39': true,
      '24:39:19': true, '25:43:5': true, '28:25:14': true, '28:50:17': true,
      '29:24:14': true, '31:32:15': true, '32:9:11': true,
      '33:4:22': true, '33:37:25': true, '33:37:44': true, '33:48:9': true,
      '33:53:26': true, '33:53:38': true, '33:53:45': true, '33:53:49': true,
      '33:53:63': true, '35:2:16': true, '35:11:18': true, '35:11:29': true,
      '39:21:25': true, '40:35:8': true,
      '40:35:15': true, '41:12:10': true, '41:12:15': true, '42:45:10': true,
      '42:45:21': true, '45:23:17': true, '45:23:22': true, '46:8:3': true,
      '46:8:12': true, '46:8:17': true, '46:8:22': true,
      '48:29:44': true, '49:9:26': true, '49:13:16': true, '58:6:10': true,
      '58:12:11': true, '58:12:15': true, '58:13:7': true, '58:13:20': true,
      '59:7:33': true, '62:5:11': true, '62:5:18': true, '65:4:14': true,
      '65:4:20': true,
      // WAQF_REVIEW high-confidence (Indopak = source of truth) — 1.0.191
      // NOTE: '2:72:6' intentionally omitted. Ayah 2:72 has a mid-word thin
      // space (فَٱدَّـٰرَ ٰٔتُمۡ) that tokenizeAyahWords folds into one token,
      // shifting every subsequent index by -1. The correct display index for
      // فِيهَا is therefore produced by the earlier manual '2:72:5' (already
      // present in the complex-batch list above). Adding :6 would colour
      // وَٱللَّهُ (the next word) blue by mistake — reported 2026-08-02.
      // Interactive review batch (Host Word chosen visually via the
      // WAQF_REVIEW tool, one entry per approved case) — 1.0.192
      '5:46:26': true, '69:3:4': true, '70:7:2': true, '79:30:4': true,
      '79:42:5': true, '90:12:4': true, '91:10:4': true, '101:3:4': true,
      '101:10:4': true, '104:5:4': true
    },
    // 46:15 الكلمة 39 ("ذُرِّيَّتِيٓۖ") — راجع تعليق الدفعة الثانية أعلاه:
    // الكلمة تحمل ط وج معًا خامًا في نص النسخ؛ قرار مباشر من المستخدم
    // بعد مراجعة علل الوقوف: تُعتمد ج (أخضر)، لا ط. مدرجة هنا بدل جدول
    // TA_MUTLAQ أعلاه كي لا تُلوَّن مرتين بلونين مختلفين لنفس الكلمة.
    'JEEM': {
      '46:15:39': true,
      // WAQF_REVIEW JEEM gaps — word from UTH U+06DA glyph; skipped if
      // already TA_MUTLAQ manual addition, last-word, or LA/SILA.
      // 60:9:16 reported by user opened this sweep.
      '3:152:28': true, '5:44:6': true, '5:44:23': true,
      '6:34:13': true, '6:34:17': true, '6:144:23': true, '6:161:12': true,
      '7:22:2': true, '7:46:8': true,
      '7:143:23': true, '7:143:32': true, '7:176:10': true, '7:176:26': true,
      '7:190:8': true, '9:51:10': true, '9:74:24': true, '9:74:38': true,
      '10:10:7': true, '18:49:19': true, '18:63:15': true, '22:78:32': true,
      '24:11:21': true, '27:36:12': true, '32:3:3': true, '33:4:15': true,
      '35:43:16': true, '48:29:28': true, '49:9:20': true, '59:7:31': true,
      '60:9:16': true,
      // Remaining REVIEW JEEM gaps (not covered by any other type's additions)
      '2:198:8': true, '4:171:12': true, '7:143:11': true, '7:160:5': true,
      '10:15:16': true, '22:78:5': true, '24:11:6': true, '24:11:14': true,
      '25:58:8': true, '46:15:13': true, '48:29:3': true, '59:7:23': true,
      '66:2:6': true,
      // Indopak-sourced REVIEW JEEM → Uthmani mid-ayah word (alignment).
      // Mark existence from textIndopak only; Uthmani is display numbering.
      '4:54:9': true, '5:68:25': true, '6:40:12': true, '6:60:14': true,
      '7:103:11': true, '10:104:21': true, '11:27:20': true, '11:91:11': true,
      '11:97:6': true, '12:36:10': true, '12:36:23': true, '21:65:4': true,
      '25:4:12': true, '41:35:5': true, '52:18:4': true,
      // Hard Indopak→Uthmani alignments (mark on/after token; mid-ayah)
      '3:150:3': true, '4:142:6': true, '9:95:14': true, '12:30:10': true,
      '12:96:9': true, '12:96:13': true, '21:5:9': true,
      // WAQF_REVIEW high-confidence (Indopak = source of truth) — 1.0.191
      '2:72:11': true, '3:48:5': true, '3:152:32': true, '4:171:28': true, '5:110:26': true, '6:161:7': true, '7:160:15': true, '7:187:10': true, '7:189:18': true, '10:15:31': true, '10:83:19': true, '35:43:21': true, '40:45:10': true, '56:23:3': true, '57:12:22': true, '59:9:31': true, '66:4:17': true, '76:11:8': true, '79:16:6': true,
      // Interactive review batch (Host Word chosen visually via the
      // WAQF_REVIEW tool, one entry per approved case) — 1.0.192
      '2:198:20': true, '2:258:43': true, '4:37:15': true, '7:43:23': true,
      '7:176:13': true, '9:78:11': true, '22:78:40': true, '23:46:7': true,
      '53:54:3': true, '66:2:8': true, '89:16:10': true
    },
    // قف (QIF) — فجوات WAQF_REVIEW (Indopak U+E01E → كلمة المدينة).
    // سياسة التعارض على نفس الكلمة (1.0.139):
    //   قف+ط → قف | قف+ج → ج | قف+ص → ص | قف+ز → ز
    //   لا / صلي / تعانق → استبعاد أولًا
    'QIF': {
      '3:50:16': true, '4:171:28': true, '6:62:9': true,
      '7:43:16': true, '7:46:14': true, '11:63:18': true, '28:25:22': true,
      // ط+قف على نفس توكن النسخ → قف
      '2:102:66': true, '59:9:24': true,
      // Interactive review batch (Host Word chosen visually via the
      // WAQF_REVIEW tool, one entry per approved case) — 1.0.192
      '48:29:31': true
    },
    // ز (ZAY_JAWAZ) — فجوات WAQF_REVIEW (Indopak U+E01A)
    // آخر كلمة / لا / صلي: لا تُضاف
    'ZAY_JAWAZ': {
      '4:171:25': true, '5:7:12': true, '6:165:18': true, '7:157:12': true,
      '10:23:18': true, '11:91:14': true, '12:21:19': true, '18:62:6': true,
      '20:121:11': true, '28:25:5': true, '28:26:4': true, '33:53:33': true,
      '48:29:18': true,
      // WAQF_REVIEW high-confidence (Indopak = source of truth) — 1.0.191
      '37:75:5': true,
      // Interactive review batch (Host Word chosen visually via the
      // WAQF_REVIEW tool, one entry per approved case) — 1.0.192
      '4:121:3': true
    },
    // ق (QAD_QILA) — فجوات WAQF_REVIEW (Indopak U+E01C)
    'QAD_QILA': {
      '59:2:28': true, '59:2:37': true, '59:7:27': true
      // 10:16 / 18:63 / 41:12: صلي على التوكن → استبعاد
    },
    // ص (SAD_RUKHSA) — فجوات WAQF_REVIEW (Indopak U+E01B)
    'SAD_RUKHSA': {
      '2:144:9': true, '2:282:110': true,
      '5:46:12': true, '6:71:23': true, '16:28:5': true,
      // سور الشمس القصيرة: أغلبها آخر كلمة (policy OK)
      // 20:121:15 آخر كلمة + صلي؛ 91:14:2 مستبعد سابقًا
      // Interactive review batch (Host Word chosen visually via the
      // WAQF_REVIEW tool, one entry per approved case) — 1.0.192
      '79:29:4': true, '79:31:4': true
    },
    // م (WAQF_LAZIM) — فجوات WAQF_REVIEW: الاستخراج من النسخ نجح
    // (U+06D8) لكن المحاذاة إلى رقم كلمة المدينة فشلت فبقيت في
    // WAQF_REVIEW بلا word. تُضاف هنا يدويًا بعد التحقق من نص المدينة.
    // 4:171 الكلمة 43 = وَلَدٞۘ (U+06D8 على نفس الكلمة في الرسم العثماني).
    'WAQF_LAZIM': {
      '4:171:43': true,
      // WAQF_REVIEW high-confidence (Indopak = source of truth) — 1.0.191
      '2:258:12': true, '3:170:19': true, '7:187:15': true, '38:21:4': true, '51:24:6': true, '59:7:37': true,
      // Interactive review batch (Host Word chosen visually via the
      // WAQF_REVIEW tool, one entry per approved case) — 1.0.192
      '20:9:4': true, '79:15:4': true
    }
  };

  // sila-positions.js (window.SILA_POSITIONS/SILA_REVIEW) — مواضع علامة
  // "صلي" (السِّلَة، U+06D6) في مصحف النسخ، مُحمَّلة الآن في index.html
  // بعد waqf-positions.js مباشرة (طلب مباشر: "نضمه عندنا لقاعدة
  // البيانات"). صلي ليست علامة وقف سجاوندية (علل الوقوف) بذاتها — هي
  // ترجيح بالوصل من بعض محقّقي هذا العلم، مصدر مستقل تمامًا. لذلك:
  //   • غير مدمجة في WAQF_POSITIONS ولا في DEFAULT_MARK_TYPES — لا تشارك
  //     في DEFAULT_MARK_CONFLICT_KEYS ولا في أي تلوين افتراضي حاليًا.
  //   • عند تعارضها مع موضع ط/ص/م فعّال (نفس الكلمة)، القرار الفاصل هو
  //     مراجعة علل الوقوف للسجاوندي تحديدًا، لا صلي نفسها — طلب مباشر
  //     صريح من المستخدم.
  // فحص التعارض الفعلي (258 موضع صلي، مقارنة بمواضعنا الثلاثة الفعّالة
  // بعد كل الاستبعادات/الإضافات أعلاه): صفر تقاطع مع ط، صفر مع م،
  // تقاطعان خامان مع ص — أحدهما (19:31) مستبعد أصلًا بقاعدة آخر كلمة،
  // والآخر (24:22 الكلمة 15 "ٱللَّهِ" في "في سبيل الله") رُوجع يدويًا:
  // راجع المستخدم علل الوقوف مباشرة (صورة فعلية من ص 736) وأكَّد أن ص
  // هنا سليمة كما هي — لا استبعاد، لا تغيير في DEFAULT_MARK_MANUAL_EXCLUSIONS.

  // طلب مباشر: لو كلمة واحدة صُنِّفت (خطأً أو بسبب تفاوت محاذاة) بأكثر
  // من نوع من DEFAULT_MARK_TYPES معًا (مثلًا ط وص في نفس الكلمة)، فلا
  // يجوز ترك CSS cascade يختار لونًا تلقائيًا (كان سيكسب آخر قاعدة في
  // الملف بصمت، بلا قرار واعٍ) — بل تُستبعد هذه الكلمة من التلوين
  // بالكامل (لا أزرق ولا أخضر ولا أحمر) لحين المراجعة اليدوية المباشرة
  // في "علل الوقوف" للسجاوندي وتحديد أيهما الصحيح فعلًا. الكلمات التي
  // رُوجعت بالفعل ولها قرار في DEFAULT_MARK_CONFLICT_RESOLUTIONS أعلاه
  // لا تُعتبر تعارضًا مُستبعدًا هنا — يُطبَّق عليها القرار مباشرة بدل
  // الاستبعاد. تحذير في console عند وجود أي تعارض غير محسوم، حتى يظهر
  // أثناء التطوير/الاختبار ولو لم يظهر بصريًا.
  var DEFAULT_MARK_CONFLICT_KEYS = (function(){
    var positions = (typeof window !== 'undefined' && window.WAQF_POSITIONS) || [];
    var typesSeenByWord = {};
    for(var i = 0; i < positions.length; i++){
      var p = positions[i];
      if(!DEFAULT_MARK_TYPES[p.type]) continue;
      var wordKey = p.surah + ':' + p.ayah + ':' + p.word;
      if(!typesSeenByWord[wordKey]) typesSeenByWord[wordKey] = {};
      typesSeenByWord[wordKey][p.type] = true;
    }
    var conflicts = {};
    var conflictList = [];
    Object.keys(typesSeenByWord).forEach(function(wordKey){
      var typeCount = Object.keys(typesSeenByWord[wordKey]).length;
      if(typeCount > 1 && !DEFAULT_MARK_CONFLICT_RESOLUTIONS[wordKey]){
        conflicts[wordKey] = true;
        conflictList.push(wordKey);
      }
    });
    if(conflictList.length && typeof console !== 'undefined' && console.warn){
      console.warn(
        'مصحف الركوع: تعارض بين أنواع علامات الوقف الافتراضية (' +
        conflictList.length + ' كلمة) — تم استبعادها من التلوين ' +
        'لحين المراجعة اليدوية في علل الوقوف للسجاوندي: ' + conflictList.join(', ')
      );
    }
    return conflicts;
  })();

  function buildDefaultWordMap(waqfType){
    var map = {};
    var positions = (typeof window !== 'undefined' && window.WAQF_POSITIONS) || [];
    for(var i = 0; i < positions.length; i++){
      var p = positions[i];
      if(p.type !== waqfType) continue;
      var wordKey = p.surah + ':' + p.ayah + ':' + p.word;
      if(DEFAULT_MARK_MANUAL_EXCLUSIONS[waqfType] && DEFAULT_MARK_MANUAL_EXCLUSIONS[waqfType][wordKey]){
        continue; // استبعاد يدوي مؤكَّد — راجع تعليق DEFAULT_MARK_MANUAL_EXCLUSIONS أعلاه
      }
      var resolution = DEFAULT_MARK_CONFLICT_RESOLUTIONS[wordKey];
      if(resolution){
        if(resolution !== waqfType) continue; // رُوجعت وتخص نوعًا آخر — راجع الجدول أعلاه
      } else if(DEFAULT_MARK_CONFLICT_KEYS[wordKey]){
        continue; // تعارض غير محسوم بعد — راجع التعليق أعلاه
      }
      var key = p.surah + ':' + p.ayah;
      var idx = p.word - 1;
      if(!map[key]) map[key] = [];
      if(map[key].indexOf(idx) === -1) map[key].push(idx);
    }
    var manualAdditions = DEFAULT_MARK_MANUAL_ADDITIONS[waqfType];
    if(manualAdditions){
      Object.keys(manualAdditions).forEach(function(wordKey){
        var parts = wordKey.split(':');
        var key = parts[0] + ':' + parts[1];
        var idx = parseInt(parts[2], 10) - 1;
        if(!map[key]) map[key] = [];
        if(map[key].indexOf(idx) === -1) map[key].push(idx);
      });
    }
    return map;
  }

  // ط (الوقف المطلق) — طُبِّق أول مرة كرمز ط عائم فوق الكلمة، ثم — طلب
  // مباشر لاحق — استُبدل بتلوين نص الكلمة نفسها مباشرة (بلا رمز عائم
  // إطلاقًا)، بنفس أسلوب تلوين الكلمات الآخر في هذا الملف (راجع
  // body.show-khilaf-highlight في style.css كمثال على نفس النمط).
  // تُلوَّن حتى على آخر كلمة في الآية ليتوافق مع ظهور ط في مصحف النسخ
  // (طلب 2026-08-10؛ أُلغي استثناء «آخر كلمة» لـ ط فقط، لا لباقي العلامات).
  //
  // طبقة مستقلة تمامًا عن نظام "علامات التذكير الشخصية"
  // (ReaderReminders/StorageManager.loadReminder): لا تُخزَّن في
  // localStorage، ولا تتأثر بمسح/تصدير/استيراد علامات المستخدم، ولا
  // يمكن للقارئ حذفها أو تغيير لونها — ثابتة دائمًا طالما ظلت ط في
  // النص. راجع قاعدة .quran-word.has-default-waqf في style.css للون
  // (نفس أزرق .waqf-mark.mark-blue بالضبط — طلب مباشر) — غير مرتبطة
  // بإعداد "مواضع الخلاف لقصر المنفصل"، تظهر دائمًا.
  //
  // مقصورة على مصحف المدينة (العثماني) فقط: رقم الكلمة في
  // WAQF_POSITIONS محسوب على نص هذا الرسم تحديدًا، وليس على نص
  // الإندوباك (ترقيم الكلمات بين الرسمين غير متطابق في كثير من
  // المواضع — راجع ترويسة waqf-positions.js).
  var DEFAULT_WAQF_MUTLAQ_WORDS = buildDefaultWordMap('TA_MUTLAQ');

  // ص (الوقف المرخَّص للضرورة) — طلب مباشر لاحق، بنفس القيود والأسلوب
  // بالضبط المطبَّقين على ط أعلاه: لا تُوضع عند آخر كلمة في الآية،
  // طبقة مستقلة تمامًا عن علامات التذكير الشخصية، مقصورة على مصحف
  // المدينة فقط. راجع قاعدة .quran-word.has-default-sad-rukhsa في
  // style.css للون (نفس أخضر .waqf-mark.mark-green بالضبط — طلب مباشر.
  // جُرِّب تغميق مؤقت لـ#1B5E20 ثم اتراجع عنه بالكامل بطلب مباشر
  // ("مش حلو")، فرجع الاثنان لنفس اللون الأصلي #2E7D32).
  var DEFAULT_SAD_RUKHSA_WORDS = buildDefaultWordMap('SAD_RUKHSA');

  // م (الوقف اللازم) — طلب مباشر لاحق. بخلاف ط وص أعلاه: تُضاف
  // بالكامل، بما فيها المواضع الواقعة على آخر كلمة في الآية (طلب
  // مباشر صريح — لا يُطبَّق استثناء "آخر كلمة" هنا إطلاقًا). باقي
  // القيود نفسها بالضبط: طبقة مستقلة تمامًا عن علامات التذكير
  // الشخصية، مقصورة على مصحف المدينة فقط، مشمولة في فحص التعارض
  // (DEFAULT_MARK_CONFLICT_KEYS أعلاه) — كان يُوجد تعارضان حقيقيان
  // بين م وط في البيانات الحالية (6:124 الكلمة 13، و67:19 الكلمة 7)،
  // رُوجعا يدويًا بالفعل وتبيَّن أنهما ط لا م — راجع
  // DEFAULT_MARK_CONFLICT_RESOLUTIONS أعلاه. راجع قاعدة
  // .quran-word.has-default-waqf-lazim في style.css للون (نفس أحمر
  // .waqf-mark.mark-red بالضبط — طلب مباشر).
  var DEFAULT_WAQF_LAZIM_WORDS = buildDefaultWordMap('WAQF_LAZIM');

  // ز (الوقف الجائز — ZAY_JAWAZ) — طلب مباشر لاحق: أخضر، نفس لون
  // .waqf-mark.mark-green بالضبط (#2E7D32 نهاري — جُرِّب تغميق مؤقت
  // لـ#1B5E20 ثم اتراجع عنه بالكامل — /#81C784 ليلي)، **نفس لون ص بالضبط أيضًا** — طلب صريح، لكن
  // يعني إن ز وص لن يكونا قابلين للتمييز بصريًا عن بعض على الصفحة
  // (كلاهما نفس درجة الأخضر). يتبع نفس نمط ط/ص: يُستبعد عند آخر كلمة في
  // الآية (افتراض بالقياس على ط/ص، لم يُطلب صراحةً لـز — راجع مع
  // المستخدم لو مطلوب غير كده).
  //
  // فحص التعارض (طلب مباشر: "بحيث لا يوجد تعارض مع لا وصلي وتعانق"):
  //   • ز×ط، ز×ص، ز×م (DEFAULT_MARK_TYPES الداخلية): صفر تقاطع خام —
  //     مشمولة تلقائيًا في DEFAULT_MARK_CONFLICT_KEYS لأي تعارض مستقبلي.
  //   • ز×تعانق: صفر تقاطع خام.
  //   • ز×لا: تقاطع خام واحد فقط (33:38 الكلمة 22 "مَّقۡدُورًا")، وهو
  //     أصلًا آخر كلمة في الآية — مُستبعد تلقائيًا بقاعدة آخر كلمة، فلا
  //     تعارض فعّال إطلاقًا.
  //   • ز×صلي: 59 تقاطعًا خامًا، منها 25 مستبعدة تلقائيًا (آخر كلمة).
  //     الـ34 الباقية: طلب مباشر لاحق — "مش عايز أحطها إلا لما أراجعها
  //     الأول" — فاستُبعدت مؤقتًا (راجع DEFAULT_MARK_MANUAL_EXCLUSIONS
  //     ['ZAY_JAWAZ'] أعلاه) لحين مراجعة كل موضع يدويًا في علل الوقوف؛
  //     هذا استبعاد معلَّق بانتظار المراجعة، وليس قرارًا نهائيًا بحذف ز
  //     من هذه المواضع دائمًا.
  var DEFAULT_ZAY_JAWAZ_WORDS = buildDefaultWordMap('ZAY_JAWAZ');

  // ق (قد قيل — QAD_QILA) — طلب مباشر لاحق (ملاحظة مهمة: هذا نوع مختلف
  // تمامًا عن ق "قِف" — QIF — اللي كان اتبنى قبل كده وأُلغي بالكامل
  // بطلب مباشر لأنه كان النوع الغلط؛ "قد قيل" أضعف تأكيدًا: تعني أن
  // بعض العلماء قال بجواز الوقف هنا، وليست توصية مباشرة زي قِف). أخضر
  // بنفس لون ص/ز بالضبط (#2E7D32 نهاري — جُرِّب تغميق مؤقت لـ#1B5E20 ثم
  // اتراجع عنه بالكامل — /#81C784 ليلي — طلب مباشر). تُستبعد عند آخر
  // كلمة في الآية (طلب مباشر صريح).
  //
  // فحص التعارض (طلب مباشر: "نفس الأسلوب" مع كل من ط/ص/ز/لا/تعانق/صلي):
  //   • الداخلي (قد قيل مضافة الآن لـDEFAULT_MARK_TYPES، فتُفحص تلقائيًا
  //     ضد ط/ص/م/ز عبر DEFAULT_MARK_CONFLICT_KEYS): تقاطع واحد مع ط
  //     (78:38 الكلمة 5 — هذا الموضع الوحيد في كل البيانات فيه ط×قد_قيل
  //     تحديدًا. كان مُستثنى ومحسومًا "ط" في البداية، لكن طلب مباشر
  //     نهائي لاحق ألغى الاستثناء ("ط مع لا شيلها بردة") فأصبحت الآن
  //     تعارضًا داخليًا غير محسوم عاديًا، مُستبعدة من كلا اللونين تلقائيًا
  //     عبر DEFAULT_MARK_CONFLICT_KEYS — راجع DEFAULT_MARK_CONFLICT_
  //     RESOLUTIONS أعلاه)، صفر مع ص، صفر مع م،
  //     8 تقاطعات مع ز.
  //     UPDATE (طلب مباشر لاحق): من الثمانية، 6 مواضع تحمل ق وز **حصرًا**
  //     (بلا صلي أو أي علامة أخرى) وليست آخر كلمة — اعتُمدت أخضر مباشرة
  //     عبر DEFAULT_MARK_CONFLICT_RESOLUTIONS أعلاه، بلا حاجة لمراجعة.
  //     الموضعان الباقيان ظلّا على قاعدة الاستبعاد المؤقت التلقائية (لم
  //     يُحسما): 11:46:10 (تحمل صلي أيضًا، فتخالف شرط "بلا علامات
  //     أخرى")، و51:54:5 (آخر كلمة في آيتها).
  //   • قد قيل×لا: 13 تقاطعًا خامًا، 6 فعّالة (منها 78:38:5 — مُستبعدة
  //     أيضًا الآن، لكن عبر آلية التعارض الداخلي مع ط لا عبر هذا الجدول
  //     — راجع DEFAULT_MARK_CONFLICT_RESOLUTIONS أعلاه، فالباقي 5
  //     مُستبعدة **نهائيًا** هنا صراحةً — راجع DEFAULT_MARK_MANUAL_
  //     EXCLUSIONS['QAD_QILA'] أعلاه؛ طلب مباشر نهائي: "ق مع لا... تُستبعد
  //     تمامًا"، وليس استبعادًا معلَّقًا بانتظار مراجعة).
  //   • قد قيل×تعانق: تقاطع خام واحد فقط (26:208 الكلمة 7)، وهو آخر
  //     كلمة في الآية — مستبعد أصلًا بقاعدة آخر كلمة، فلا تعارض فعّال.
  //   • قد قيل×صلي: 81 تقاطعًا خامًا، 70 منها فعّالة (منها 11:46:10 —
  //     تقاطع مزدوج مع صلي وز معًا، غير محسوم كما هو موضح أعلاه، فمُستبعدة
  //     عبر آلية التعارض الداخلي لا عبر هذه القائمة) — الـ70 مُستبعدة
  //     **نهائيًا** في DEFAULT_MARK_MANUAL_EXCLUSIONS['QAD_QILA'] أعلاه —
  //     طلب مباشر نهائي، وليس استبعادًا معلَّقًا بانتظار مراجعة.
  var DEFAULT_QAD_QILA_WORDS = buildDefaultWordMap('QAD_QILA');

  // قف (QIF) — طلب مباشر، أُعيد بناؤها من الصفر (كانت "ق" اتبنت قبل
  // كده بالغلط كـQIF ثم اتلغت بالكامل لما تبيَّن أنها لم تكن المطلوبة؛
  // المطلوب فعليًا كان "قد قيل" — QAD_QILA أعلاه، نوع مختلف تمامًا).
  // هذه المرة صراحةً وبتأكيد مباشر متكرر: "قف وليس ق". بني (#A9793B =
  // .waqf-mark.mark-brown نهاري / #C9A06A ليلي — طلب 2026-08-09؛
  // كانت سابقًا بنفس أزرق ط ثم فُصلت). تُستبعد عند آخر كلمة في الآية (طلب مباشر صريح).
  //
  // فحص التعارض:
  //   • الداخلي (قف مضافة الآن لـDEFAULT_MARK_TYPES، فتُفحص تلقائيًا ضد
  //     ط/ص/م/ز/ق عبر DEFAULT_MARK_CONFLICT_KEYS القائمة): 6 تقاطعات مع
  //     ط، 2 مع ص، 1 مع ز، صفر مع م وق. التسعة كلها تُستبعد تلقائيًا من
  //     الطرفين المتعارضين (لا حاجة لجدول استبعاد يدوي منفصل)، وتُصدر
  //     تحذيرًا في console — طلب مباشر: "عايز فيها تقرير الأول علشان
  //     أقرر فيها"، فتُركت بلا حسم عمدًا لحين المراجعة.
  //   • قف×لا: 5 مواضع فعّالة، مستبعدة **نهائيًا** (راجع 'QIF' في
  //     DEFAULT_MARK_MANUAL_EXCLUSIONS أعلاه) — طلب مباشر نهائي، نفس
  //     سياسة ط/ص/ز/ق.
  //   • قف×صلي: موضع واحد فعّال (27:40:23)، مستبعد **نهائيًا** لنفس السبب.
  //   • قف×تعانق: 7 مواضع فعّالة، مستبعدة **مؤقتًا** لحين المراجعة
  //     (نفس أسلوب ز وقد قيل تمامًا — استبعاد معلَّق قابل للتراجع).
  var DEFAULT_QIF_WORDS = buildDefaultWordMap('QIF');

  // ج (الوقف الجائز — JEEM) — طلب مباشر أول: "بناءً على القواعد التي
  // لديك، أضف ج باللون الأزرق"، ثم طلب مباشر لاحق: غُيِّر إلى الأخضر —
  // نفس لون .has-default-sad-rukhsa/.has-default-zay-jawaz/
  // .has-default-qad-qila بالضبط (#2E7D32 نهاري / #81C784 ليلي). تُستبعد
  // عند آخر كلمة في الآية (نفس النمط الافتراضي المتبع لباقي العلامات).
  //
  // فحص التعارض (طلب مباشر: تطبيق الخوارزمية العامة الموثَّقة أعلاه
  // تلقائيًا بلا حاجة لمراجعة يدوية من الصفر):
  //   • الداخلي: 13 تقاطع خام (2 مع ط، 1 مع ص، 3 مع ز، 2 مع قد قيل، 5
  //     مع قف). 11 منها "نظيفة" (بلا علامة ثالثة) حُسمت تلقائيًا بترتيب
  //     القوة (البند 3) — راجع DEFAULT_MARK_CONFLICT_RESOLUTIONS أعلاه.
  //     الاثنان غير النظيفين: 3:119:12 (تحمل صلي أيضًا — استُبعدت
  //     بالكامل)، و47:4:20 (تحمل تعانق أيضًا — كانت قد حُسمت أزرق
  //     مسبقًا ضمن مراجعة قف×تعانق، فلا تغيير).
  //   • ج×لا: 4 مواضع فعّالة، مستبعدة نهائيًا (البند 2 عمومًا، وسياسة
  //     "أي علامة تلاقي معاها لا تُستبعد نهائيًا" خصوصًا).
  //   • ج×صلي: 51 موضعًا فعّالًا، 50 منها مستبعدة نهائيًا هنا صراحةً
  //     (3:119:12 مُستبعدة أعلاه بدلًا من ذلك).
  //   • ج×تعانق: 32 موضعًا فعّالًا إجمالًا — 5 منها يحملون صلي على نفس
  //     الطرف فاستُبعدوا تلقائيًا بالبند 2 (موجودون أصلًا ضمن قائمة
  //     الصلي، لا تكرار)، وموضع واحد (47:4:20) محسوم مسبقًا، وموضع واحد
  //     (33:13:21) مُستبعد لتعارضه مع قرار ط سابق مستقل. الباقي 25
  //     موضعًا: طلب مباشر لاحق ("ممكن تجيب البيانات من مصحف النسخ")
  //     استُخرجت أزواج التعانق فعليًا من النص الخام لمصحف النسخ (علامات
  //     Unicode القياسية: U+06DB تعانق، U+06D6 صلى، إلخ — بمطابقة نصية
  //     دقيقة بين الرسمين لكل موضع، لا برقم الكلمة). النتيجة: 4 مواضع
  //     حُسمت أخضر تلقائيًا (البند 2، الطرف الآخر معه صلى فعليًا،
  //     تحقّق مزدوج من النص الخام ومن sila-positions.js معًا)؛ ثم رُوجعت
  //     الـ21 المتبقية يدويًا بالرقية البصرية — 7 حُسمت أخضر (2:96:8،
  //     5:41:16، 7:163:22، 7:172:17، 28:35:11، 25:32:9، 60:3:5) و14
  //     استُبعدت نهائيًا. راجع DEFAULT_MARK_MANUAL_EXCLUSIONS['JEEM']
  //     أعلاه للتفصيل الكامل لكل فئة.
  var DEFAULT_JEEM_WORDS = buildDefaultWordMap('JEEM');


  // Reported (device screenshots, Naskh/Indopak mode, two rounds): the
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
    var out = '', buffer = '';
    for(var i=0; i<text.length; i++){
      var ch = text[i], cp = text.codePointAt(i);
      if(WAQF_COMBINING[cp]){
        // Stacked waqf marks (e.g. jaiz immediately followed by muanaqah)
        // all belong in the same span as the base letter they sit above.
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
        // The source text (textIndopak, from the QUL dataset) frequently
        // inserts a zero-width format character (U+200B–U+200F — most
        // often U+200B ZERO WIDTH SPACE) between the base letter and the
        // waqf mark that follows it. It was already being kept in the
        // same buffer/span as the base letter (see isWaqfMarkAttachable),
        // which fixed accidental line-wrapping there, but a second,
        // separate problem remained: this font's OpenType shaper (verified
        // by testing with/without it — the mark only anchors correctly
        // once it's gone) treats a zero-width format character as a
        // shaping-cluster break, the same way it's used elsewhere in text
        // processing to prevent letters from joining. That splits the
        // base letter and the mark into two separate shaping clusters, so
        // the font's GPOS mark-to-base lookup — which only fires within a
        // single cluster — never applies, and the mark falls back to its
        // own unanchored, full-size default glyph instead of the small
        // combining form. Dropping it here only affects the rendered
        // HTML string built at display time; data.js keeps the character
        // exactly as-is.
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
      // A new base letter (or any other character): flush whatever was
      // pending — it was never followed by a waqf mark — then start a
      // fresh pending cluster with this character.
      // EXCEPTION: if the pending cluster's base letter is a LAM and this
      // new character is one of the ALEF forms it mandatorily ligates
      // with ("لا"/"لأ"/"لإ"/"لآ"/"لٱ"), don't flush — keep them in the
      // same buffer instead. Splitting a LAM from the ALEF right after it
      // across two separate DOM nodes (plain text before vs. inside the
      // next waqf-sign span) breaks that mandatory ligature (a GSUB
      // feature) the exact same way splitting a mark from its base letter
      // breaks GPOS mark anchoring elsewhere in this function — confirmed
      // on-device on مَثَلٗاۘ (2:26), where the trailing "لا" before the
      // waqf-lazim mark rendered as two disconnected letters instead of
      // the correct single ligature shape. buffer[0] is always this
      // cluster's base letter (only combining marks get appended after
      // it), so checking it is enough regardless of any tanween/harakat
      // sitting on the LAM in between.
      if(buffer.codePointAt(0) === 0x0644 && LAM_ALEF_PARTNERS[cp]){
        buffer += ch;
        continue;
      }
      out += buffer;
      buffer = ch;
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

  // A few words in the Indopak/QUL dataset (textIndopak) are split by a
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
// ذٰلِكَ (dhalika) etc. are likewise encoded in textIndopak as two
// tokens split by a genuine U+0020 ("ذٰ" + "لِكَ"), so the same line-wrap bug hits
// every occurrence of dhalika throughout the mushaf (reported: 9:6, where
// "ذٰ" rendered as its own line, disconnected from "لِكَ"). Covers both the
// "ذٰ لِكَ" and "ذٰ لِكُ" (dhalikum-family) spellings confirmed in the
// dataset -- these recur at ~200+ occurrences each across the text, since
// joinKnownSplitWords replaces every match, not just the first.
// أَلَّا ("alla", fatha-alef + lam-shadda-fatha-alef) is likewise split
// by a genuine U+0020 in textIndopak ("اَ" + "لَّا") -- reported at 3:170
// (خَلۡفِهِمۡ اَ / لَّا خَوۡفٌ, the "اَ" stranding itself at the end of one
// line and "لَّا" starting the next). Every confirmed occurrence of this
// exact split in the dataset: 2:229, 3:170, 5:8. Not to be confused with
// إِلَّا ("illa", hamza-kasra) or any other lam-alef sequence -- only this
// exact fatha-alef + lam-shadda-fatha-alef sequence is affected.
// أَكَّالُونَ ("akkaloon") is likewise split by a genuine U+0020 in
// textIndopak ("اَ" + "كّٰلُوۡنَ") -- reported at 5:42, where the "اَ"
// rendered with a visible gap before "كّٰلُوۡنَ" in Naskh/Indopak mode.
// Only confirmed occurrence of this exact split in the dataset: 5:42.
// وَأَلۡقَيۡنَا ("wa-alqaynaa") is likewise split by a genuine
// U+0020 in textIndopak ("وَاَ" + "لۡقَيۡنَا") -- reported at 5:64,
// where "وَاَ" rendered with a visible gap before "لۡقَيۡنَا" in
// Naskh/Indopak mode. Only confirmed occurrence: 5:64.
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
  // again — they used to disagree silently on ayaat whose Indopak text
  // encodes a waqf mark as its own space-delimited token (e.g. 2:137),
  // since only this function's MIDWORD_SPACE_REGEX step folds it back
  // into the previous word.
  function tokenizeAyahWords(rawText){
    var src = joinKnownSplitWords(rawText);
    src = src.replace(MIDWORD_SPACE_REGEX, MIDWORD_SPACE_PLACEHOLDER);
    return src.split(/\s+/).filter(Boolean);
  }

  // علامة السجدة (۩ — U+06E9): موجودة أصلًا في a.textIndopak (بيانات
  // QUL) بنفس صيغة "مسافة + الرمز" الملحقة بآخر كلمة، في كل مواضع
  // السجدة المعروفة في هذا المصحف عدا موضع واحد — 96:19 — حيث الرمز
  // موجود في a.text (مصحف المدينة/العثماني، الذي لا يُعدَّل هنا ولا في
  // أي مكان آخر) لكنه غائب كليًا من a.textIndopak، فيختفي الرمز في وضع
  // خط الناسخ لهذه الآية تحديدًا رغم ظهوره الصحيح في العثماني.
  //
  // يُلحَق هنا بنفس الصيغة النصية الحرفية المستخدمة أصلًا في بقية
  // المواضع الأربعة عشر ("مسافة + ۩") قبل تمرير النص لنفس مسار
  // المعالجة المعتاد (tokenizeAyahWords / MIDWORD_SPACE_REGEX الذي
  // يتعامل بالفعل بشكل صحيح مع "مسافة + علامة وقف" الملحقة بآخر كلمة —
  // شوف تعليق tokenizeAyahWords فوق) — بلا أي معالجة خاصة إضافية.
  //
  // الشرط مبني على فحص a.text نفسه (لا رقم سورة/آية مكتوب يدويًا)
  // فيبقى صحيحًا تلقائيًا حتى لو تغيّرت بيانات textIndopak مستقبلًا:
  // إذا أُضيفت العلامة هناك لاحقًا، يصبح الشرط الثاني false ولا يتكرر
  // الإلحاق. مستخرجة كدالة منفصلة (بدل تضمينها مباشرة في
  // renderAyahWords) عشان تصير قابلة للاختبار مباشرة بمعزل عن state.
  // موضع وقف مُخطَّأ في textIndopak (بيانات QUL) عند مريم:41 — الرمز
  // المخزَّن هناك فوق آخر حرف من "اِبۡرٰهِيۡمَ" (قبل "اِنَّهٗ") هو
  // U+06D9 ("لا"، وقف ممنوع)، بينما كتاب "علل الوقوف" للسجاوندي —
  // المرجع الأصلي لمنظومة علامات الوقف هذه بالذات — ينص صراحة عند هذا
  // الموضع بالذات ("في الكتاب - إبراهيم - 41") أن الوقف هو "ط" (وقف
  // مطلق)، لا "لا". تحقّق مباشر من الكتاب (صورة الصفحة)، وليس تخمينًا.
  // ط في خط هذا المصحف (Indopak/Naskh) لها كود Unicode مخصَّص خارج
  // الكتلة الكلاسيكية 06D6–06DB وهو U+0615 — انظر التعليق الطويل فوق
  // WAQF_COMBINING أعلاه، الذي يوثّق هذا بالفعل من فحص جداول الخط
  // نفسها. التصحيح هنا على مستوى العرض فقط (يمس textIndopak المُحمَّل
  // في الذاكرة لحظة العرض)، ولا يمسّ data.js إطلاقًا، ومقصور على وضع
  // الإندوباك/الناسخ فقط (مصحف المدينة العثماني لا يستخدم textIndopak
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
    var src = (fontStyle !== 'uthmani' && a.textIndopak) ? a.textIndopak : a.text;
    if(fontStyle !== 'uthmani' && a.textIndopak &&
       /\u06E9\s*$/.test(a.text) && a.textIndopak.indexOf('\u06E9') === -1){
      src = src.replace(/\s*$/, '') + ' \u06E9';
    }
    if(fontStyle !== 'uthmani' && a.textIndopak){
      src = applyWaqfMarkCorrections(a, src);
    }
    return src;
  }

  // Indopak-only fallback for the ONE seen-as-sad word left unreachable
  // by the 2:245 tokenization-mismatch exclusion above (its own comment
  // explains WHY 2:245 is excluded from the normal index lookup; this
  // function is the targeted workaround for that one specific word,
  // added on direct request rather than fixing the tokenization itself).
  // وَيَبۡصُۜطُ can't be found by its old Uthmani-based word index in
  // Indopak mode anymore (the extra floating-mark tokens earlier in that
  // ayah's Indopak text shift every index after them), but the word
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
  // ayah key in Indopak mode (see the guard at its only call site in
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
    // Indopak) أيضًا. هذه الجداول لا تعتمد على تحليل رسمي عام بل على
    // فهرس كلمة محدد سلفًا لكل موضع، وهو ما تحقّقنا منه مباشرة: تشغيل
    // tokenizeAyahWords على a.text وa.textIndopak لكل آية من الآيات
    // الـ24 في الجداول الخمسة أظهر تطابقًا تامًا في عدد وترتيب الكلمات
    // لِـ22 منها -- فهرس الكلمة نفسه يشير لنفس الكلمة بالضبط في الخطّين،
    // فلا حاجة لجدول فهارس منفصل بمصحف النسخ.
    //
    // الاستثناء: آيتان فقط (2:245 وَ30:54) يختلف فيهما عدد الكلمات بين
    // الخطين في نص الإندوباك (QUL) تحديدًا -- علامات وقف عائمة ورمز ۞
    // تظهر كرمز/كلمة منفصلة بمسافة حقيقية في a.textIndopak بدل أن تكون
    // ملتصقة بالكلمة المجاورة كما في a.text، فيزيد عدد الكلمات هناك (18
    // بدل 16 في 2:245، و27 بدل 24 في 30:54) ويُزيح باقي الفهارس. تفعيل
    // هذين الموضعين بنفس الفهرس القديم كان سيُلوّن كلمة خاطئة تمامًا في
    // مصحف النسخ، فبقيا مستثنيين هنا فقط (يبقيان يعملان بشكل طبيعي في
    // مصحف المدينة) -- إصلاح هذا التفاوت يحتاج تعديل آلية التوكينة نفسها
    // (KNOWN_SPLIT_WORD_FRAGMENTS وما شابه)، وهو تغيير في البنية التحتية
    // خارج نطاق هذا التعديل تحديدًا.
    var saktaIdxs = SAKTA_HIGHLIGHT_WORDS[ayahKey] || null;
    var muqattaatIdxs = MUQATTAAT_MAD_WORDS[ayahKey] || null;
    var seenSadIdxs = (state.fontStyle === 'uthmani' || ayahKey !== '2:245') ?
      (SEEN_AS_SAD_WORDS[ayahKey] || null) : null;
    // See normalizeSeenAsSadFallbackWord above -- fires ONLY for this
    // exact excluded case (Indopak mode, ayah 2:245), never touching
    // Uthmani rendering or any other ayah's lookup.
    if(!seenSadIdxs && state.fontStyle !== 'uthmani' && ayahKey === '2:245'){
      for(var seenSadFallbackIdx = 0; seenSadFallbackIdx < words.length; seenSadFallbackIdx++){
        if(normalizeSeenAsSadFallbackWord(words[seenSadFallbackIdx]) === SEEN_AS_SAD_INDOPAK_FALLBACK_2_245){
          seenSadIdxs = [seenSadFallbackIdx];
          break;
        }
      }
    }
    var madFarqIdxs = MAD_FARQ_WORDS[ayahKey] || null;
    var tajweedNoteIdxs = (state.fontStyle === 'uthmani' || ayahKey !== '30:54') ?
      (TAJWEED_NOTE_WORDS[ayahKey] || null) : null;
    // مقصورة على مصحف المدينة فقط — راجع تعليق DEFAULT_WAQF_MUTLAQ_WORDS أعلاه.
    var defaultWaqfMutlaqIdxs = (state.fontStyle === 'uthmani') ?
      (DEFAULT_WAQF_MUTLAQ_WORDS[ayahKey] || null) : null;
    var defaultSadRukhsaIdxs = (state.fontStyle === 'uthmani') ?
      (DEFAULT_SAD_RUKHSA_WORDS[ayahKey] || null) : null;
    var defaultWaqfLazimIdxs = (state.fontStyle === 'uthmani') ?
      (DEFAULT_WAQF_LAZIM_WORDS[ayahKey] || null) : null;
    var defaultZayJawazIdxs = (state.fontStyle === 'uthmani') ?
      (DEFAULT_ZAY_JAWAZ_WORDS[ayahKey] || null) : null;
    var defaultQadQilaIdxs = (state.fontStyle === 'uthmani') ?
      (DEFAULT_QAD_QILA_WORDS[ayahKey] || null) : null;
    var defaultQifIdxs = (state.fontStyle === 'uthmani') ?
      (DEFAULT_QIF_WORDS[ayahKey] || null) : null;
    var defaultJeemIdxs = (state.fontStyle === 'uthmani') ?
      (DEFAULT_JEEM_WORDS[ayahKey] || null) : null;
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
      // ط فقط: تُلوَّن حتى على آخر كلمة في الآية ليتوافق مع ظهورها في
      // مصحف النسخ (مثل «الدين» و«نستعين» في الفاتحة — طلب 2026-08-10).
      // باقي العلامات (ص/ز/ق/قف/ج) تبقى على قاعدة «لا تُلوَّن آخر كلمة»
      // لأن نهاية الآية وقف بالفعل. م (الوقف اللازم) بلا هذا الاستثناء أصلًا.
      var isDefaultWaqfMutlaq = !!(defaultWaqfMutlaqIdxs && defaultWaqfMutlaqIdxs.indexOf(idx) !== -1) ||
        shiftedMutlaqIdxs.indexOf(idx) !== -1;
      if(isDefaultWaqfMutlaq) extraCls += ' has-default-waqf';
      var isDefaultSadRukhsa = ((!!(defaultSadRukhsaIdxs && defaultSadRukhsaIdxs.indexOf(idx) !== -1) &&
        idx !== words.length - 1) || shiftedSadIdxs.indexOf(idx) !== -1);
      if(isDefaultSadRukhsa) extraCls += ' has-default-sad-rukhsa';
      var isDefaultWaqfLazim = !!(defaultWaqfLazimIdxs && defaultWaqfLazimIdxs.indexOf(idx) !== -1) ||
        shiftedLazimIdxs.indexOf(idx) !== -1;
      if(isDefaultWaqfLazim) extraCls += ' has-default-waqf-lazim';
      var isDefaultZayJawaz = ((!!(defaultZayJawazIdxs && defaultZayJawazIdxs.indexOf(idx) !== -1) &&
        idx !== words.length - 1) || shiftedZayIdxs.indexOf(idx) !== -1);
      if(isDefaultZayJawaz) extraCls += ' has-default-zay-jawaz';
      var isDefaultQadQila = ((!!(defaultQadQilaIdxs && defaultQadQilaIdxs.indexOf(idx) !== -1) &&
        idx !== words.length - 1) || shiftedQadIdxs.indexOf(idx) !== -1);
      if(isDefaultQadQila) extraCls += ' has-default-qad-qila';
      var isDefaultQif = ((!!(defaultQifIdxs && defaultQifIdxs.indexOf(idx) !== -1) &&
        idx !== words.length - 1) || shiftedQifIdxs.indexOf(idx) !== -1);
      if(isDefaultQif) extraCls += ' has-default-qif';
      var isDefaultJeem = ((!!(defaultJeemIdxs && defaultJeemIdxs.indexOf(idx) !== -1) &&
        idx !== words.length - 1) || shiftedJeemIdxs.indexOf(idx) !== -1);
      if(isDefaultJeem) extraCls += ' has-default-jeem';
      // رأس آية لغير الكوفيين — نجمة في مصحف المدينة فقط.
      // المضيف يُحدَّد بمطابقة حروف الأساس (أعلاه) لا بالفهرس وحده.
      // «لا»: رأس أخضر. غير «لا»: رأس بلون المصحف + نجمة سجاوندي على نفس الكلمة.
      // بلا رمز: رأس بلون المصحف فقط. مصحف النسخ: بدون تدخل.
      var isUthmani = state.fontStyle === 'uthmani';
      var nonKufiColor = null; // null = ليس رأس غير كوفي؛ "" = بلا لون (حبر النص)
      if(isUthmani){
        var resolved = nonKufiHostResolved[key];
        if(resolved){
          if(resolved.sym === 'لا'){
            nonKufiColor = 'green';
          } else if(resolved.sym){
            nonKufiColor = ''; // لون المصحف؛ السجاوندي على نفس الكلمة عبر shifted*
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
            if(nonKufiColor !== null && fbSym && fbSym !== 'لا') nonKufiColor = '';
            if(nonKufiColor !== null && fbSym === 'لا') nonKufiColor = 'green';
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
      var nonKufiHtml = nonKufiColor !== null
        ? ('<span class="non-kufi-mark' + nonKufiColorCls + '" aria-label="رأس آية لغير الكوفيين">' +
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
      els.rukuLabel.textContent = 'نهاية الركوع رقم ' + toArabicDigits(p.ruku) + ' من ' + toArabicDigits(PAGES.length) + ' \u2022 الجزء ' + toArabicDigits(p.juz);
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
