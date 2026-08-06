// =============================================================================
// qcf-override.js — استبدال كلمات محددة برسم QCF الرسمي (جزء رسمي من المشروع)
// =============================================================================
// خط واحد مصغَّر (fonts/qcf-merged.woff2) يحتوي فقط الـ glyphs المعتمدة
// في tools/qcf-words.json. الرموز من نطاق PUA خاص بالمشروع (U+E000+)،
// وليست رموز QCF الأصلية (غير عالمية عبر الصفحات).
//
// لا استبدال تلقائي — فقط المواضع الصريحة في QCF_OVERRIDE_TABLE أدناه.
// لا يعدّل: data.js، البحث، التجويد، الوقف، ولا readerManager.js.
// يعمل عبر MutationObserver على DOM بعد الرسم.
//
// الحجم: Auto Scale → Auto Margin → Manual Override (انظر fitAllGlyphs).
//
// إضافة كلمة: أضفها إلى tools/qcf-words.json ثم شغّل
// tools/build_qcf_font.py (يحدّث الخط وهذا الجدول تلقائيًا).
// التفاصيل: tools/README.md
//
// الإزالة الكاملة: احذف هذا الملف وسطر تحميله في index.html،
// وqcf-override.css وسطر تحميله، وfonts/qcf-merged.woff2،
// والإدخالات المقابلة في sw.js.
// =============================================================================

(function () {
  'use strict';

  // كل مفتاح "سورة:آية:فهرس" (فهرس الكلمة صفر-الأساس، بنفس تنسيق
  // data-key الذي يبنيه readerManager.js في renderAyahWords بالفعل).
  // القيمة: الرمز الجديد (PUA خاص بالمشروع) داخل الخط المُجمَّع الواحد.
  var QCF_OVERRIDE_TABLE = {
    '2:40:1': { glyph: '\uE000' }, // إسرائيل
    '2:43:6': { glyph: '\uE001' }, // الراكعين
    '2:47:1': { glyph: '\uE002' }, // إسرائيل
    '2:72:3': { glyph: '\uE003' }, // فَٱدَّـٰرَ⁠ٰٔتُمۡ
    '2:83:4': { glyph: '\uE004' }, // إسرائيل
    '2:122:1': { glyph: '\uE005' }, // إسرائيل
    '2:211:2': { glyph: '\uE006' }, // إسرائيل
    '2:246:6': { glyph: '\uE007' }, // إسرائيل
    '3:43:6': { glyph: '\uE008' }, // الراكعين
    '3:49:3': { glyph: '\uE009' }, // إسرائيل
    '3:93:5': { glyph: '\uE00A' }, // إسرائيل
    '3:93:9': { glyph: '\uE00B' }, // إسرائيل
    '5:12:5': { glyph: '\uE00C' }, // إسرائيل
    '5:32:6': { glyph: '\uE00D' }, // إسرائيل
    '5:70:4': { glyph: '\uE00E' }, // إسرائيل
    '5:72:13': { glyph: '\uE00F' }, // إسرائيل
    '5:78:5': { glyph: '\uE010' }, // إسرائيل
    '5:110:49': { glyph: '\uE011' }, // إسرائيل
    '7:105:17': { glyph: '\uE012' }, // إسرائيل
    '7:134:21': { glyph: '\uE013' }, // إسرائيل
    '7:137:17': { glyph: '\uE014' }, // إسرائيل
    '7:138:2': { glyph: '\uE015' }, // إسرائيل
    '10:90:2': { glyph: '\uE016' }, // إسرائيل
    '10:90:23': { glyph: '\uE017' }, // إسرائيل
    '10:93:3': { glyph: '\uE018' }, // إسرائيل
    '17:2:6': { glyph: '\uE019' }, // إسرائيل
    '17:4:3': { glyph: '\uE01A' }, // إسرائيل
    '17:101:8': { glyph: '\uE01B' }, // إسرائيل
    '17:104:4': { glyph: '\uE01C' }, // إسرائيل
    '19:58:17': { glyph: '\uE01D' }, // وإسرائيل
    '20:47:8': { glyph: '\uE01E' }, // إسرائيل
    '20:80:1': { glyph: '\uE01F' }, // إسرائيل
    '20:94:14': { glyph: '\uE020' }, // إسرائيل
    '26:17:4': { glyph: '\uE021' }, // إسرائيل
    '26:22:7': { glyph: '\uE022' }, // إسرائيل
    '26:59:3': { glyph: '\uE023' }, // إسرائيل
    '26:197:8': { glyph: '\uE024' }, // إسرائيل
    '27:76:6': { glyph: '\uE025' }, // إسرائيل
    '32:23:13': { glyph: '\uE026' }, // إسرائيل
    '40:53:6': { glyph: '\uE027' }, // إسرائيل
    '43:59:9': { glyph: '\uE028' }, // إسرائيل
    '44:30:3': { glyph: '\uE029' }, // إسرائيل
    '45:16:3': { glyph: '\uE02A' }, // إسرائيل
    '46:10:13': { glyph: '\uE02B' }, // إسرائيل
    '60:4:13': { glyph: '\uE02C' }, // بُرَءَٰٓؤُا۟
    '61:6:6': { glyph: '\uE02D' }, // إسرائيل
    '61:14:25': { glyph: '\uE02E' }, // إسرائيل
    '66:10:26': { glyph: '\uE02F', scale: 0.8, marginFactor: 1.02 }, // ٱلدَّٰخِلِينَ
  };

  function applyOverrides(root) {
    var scope = root || document.getElementById('ayahFlow');
    if (!scope) return;

    // مصحف المدينة (Uthmani) فقط. عند التبديل إلى مصحف النسخ/الإندوباك
    // (body.indopak-font) نتوقف تمامًا دون أي أثر — renderPage يعيد بناء
    // كل HTML الآيات عند كل تبديل خط، فهذا الفحص يُعاد تلقائيًا معه.
    if (!document.body.classList.contains('uthmani-font')) return;

    Object.keys(QCF_OVERRIDE_TABLE).forEach(function (key) {
      var el = scope.querySelector('.quran-word[data-key="' + key + '"]');
      if (!el || el.getAttribute('data-qcf-applied') === '1') return;

      var entry = QCF_OVERRIDE_TABLE[key];

      // نفصل محتوى الكلمة الحالي (كما بناه renderAyahWords/cleanAyahText
      // بالضبط) إلى: (أ) عناصر زخرفية معروفة تُنقَل كما هي بحالتها
      // المطبَّقة فعليًا (ألوان/أصناف)، و(ب) كل ما تبقى — النص العربي
      // الحقيقي بعينه — يُنقَل بالكامل دون تغيير إلى طبقة .qcf-real-text
      // المخفية بصريًا فقط (opacity:0)، فتبقى هي المصدر الحقيقي للنسخ
      // ولقارئات الشاشة، ولمقاييس السطر أيضًا.
      var preservedMarks = [];
      var realTextNodes = [];
      Array.prototype.forEach.call(el.childNodes, function (node) {
        if (node.nodeType === 1 &&
          (node.classList.contains('waqf-mark') || node.classList.contains('non-kufi-mark'))) {
          preservedMarks.push(node);
        } else {
          realTextNodes.push(node);
        }
      });

      var realTextSpan = document.createElement('span');
      realTextSpan.className = 'qcf-real-text';
      realTextNodes.forEach(function (node) { realTextSpan.appendChild(node); });

      var glyphSpan = document.createElement('span');
      glyphSpan.className = 'qcf-override-glyph';
      glyphSpan.setAttribute('aria-hidden', 'true');
      glyphSpan.textContent = entry.glyph;
      // تعديلات موضعية اختيارية (مراجعة بصرية فردية، وليست قاعدة عامة —
      // راجع qcf-words.json لكل كلمة على حدة): scale لتصغير رسم كلمة
      // بعينها فقط عن حجمها الطبيعي (استثناء، لا افتراضي)، وmarginFactor
      // لهامش أمان أكبر من المعتاد (1.06) عند التوسيع لكلمة بعينها فقط.
      if (typeof entry.scale === 'number') {
        glyphSpan.dataset.qcfScale = entry.scale;
      }
      if (typeof entry.marginFactor === 'number') {
        glyphSpan.dataset.qcfMarginFactor = entry.marginFactor;
      }
      // خط واحد فقط للجميع الآن — لا حاجة لاختيار font-family/palette
      // لكل كلمة حسب صفحتها (كانت ضرورة في البنية السابقة، أُزيلت هنا).

      while (el.firstChild) el.removeChild(el.firstChild);
      el.appendChild(realTextSpan);
      el.appendChild(glyphSpan);
      preservedMarks.forEach(function (node) { el.appendChild(node); });

      el.setAttribute('data-qcf-applied', '1');
    });
  }

  // ---------------------------------------------------------------------------
  // Auto Scale + Auto Margin (آلية رسمية)
  // ---------------------------------------------------------------------------
  // ترتيب الأولويات لكل كلمة QCF مستبدَلة:
  //   1) Auto Scale  — نسبة عرض KFGQPC ÷ عرض رسم QCF الطبيعي، مقيَّدة
  //                    ضمن [AUTO_SCALE_MIN, AUTO_SCALE_MAX].
  //   2) Auto Margin — إن ظل الرسم بعد التحجيم أعرض من مساحة KFGQPC،
  //                    تُوسَّع طبقة .qcf-real-text المخفية بهامش أمان
  //                    (افتراضي 1.06) بدل السماح بالفيض على الجار.
  //   3) Manual Override — الحقلان الاختياريان scale و marginFactor في
  //                    qcf-words.json يتجاوزان الحساب التلقائي بالكامل
  //                    لهذه الكلمة فقط. لا يُضافان إلا بعد مراجعة بصرية
  //                    تُثبت أن النتيجة التلقائية غير كافية.
  // ---------------------------------------------------------------------------
  var AUTO_SCALE_MIN = 0.75;
  var AUTO_SCALE_MAX = 1.00;
  var AUTO_MARGIN_FACTOR = 1.06;

  function fitAllGlyphs() {
    // ثلاث مراحل منفصلة تمامًا، لا تداخل بينها: (1) إعادة ضبط، ثم قياس
    // العرض الطبيعي لكل من رسم QCF (بلا أي scale) والنص الحقيقي بخط
    // KFGQPC معًا؛ (2) حساب النسبة التلقائية (أو استخدام scale اليدوي
    // إن وُجد) لكل كلمة؛ (3) كتابة كل التصحيحات معًا. فصل القياس عن
    // الكتابة يمنع أن يُغيّر تصحيح كلمة قياسات كلمة أخرى على نفس السطر
    // المُبرَّر (justify) قبل معالجتها في نفس الدورة.
    var glyphs = document.querySelectorAll('.qcf-override-glyph');

    // المرحلة 1: إعادة ضبط + قياس العرض الطبيعي (بلا أي scale) لكل من
    // الرسم والنص الحقيقي معًا.
    var pending = [];
    Array.prototype.forEach.call(glyphs, function (glyphSpan) {
      var el = glyphSpan.parentElement;
      if (!el) return;
      var realTextSpan = el.querySelector('.qcf-real-text');
      if (!realTextSpan) return;
      realTextSpan.style.display = '';
      realTextSpan.style.width = '';
      glyphSpan.style.transform = 'translate(-50%, -50%) scale(1)';
      pending.push({ glyphSpan: glyphSpan, realTextSpan: realTextSpan });
    });
    pending.forEach(function (item) {
      // عرض النص الحقيقي الطبيعي بخط KFGQPC — هذا هو "الهدف" الذي
      // يُقارَن به رسم QCF لحساب النسبة التلقائية.
      item.naturalWordWidth = item.glyphSpan.parentElement.getBoundingClientRect().width;
      item.naturalGlyphWidth = item.glyphSpan.getBoundingClientRect().width;
    });

    // المرحلة 2: تحديد الحجم النهائي لكل كلمة.
    // يدوي (scale في qcf-words.json) يتجاوز التلقائي بالكامل لهذه الكلمة.
    // وإلا: ratio = KFGQPC_width / QCF_width، مقيَّد ضمن [0.75, 1.00].
    // الحد الأعلى 1.00 يمنع تكبير رسم QCF الأضيق من KFGQPC فوق حجمه
    // الطبيعي (يبدو مبالَغًا). الحد الأدنى 0.75 يمنع تصغيرًا مفرطًا
    // يفقد معه الرسم وضوحه عندما يكون QCF أعرض بكثير.
    pending.forEach(function (item) {
      var manualScale = item.glyphSpan.dataset.qcfScale
        ? parseFloat(item.glyphSpan.dataset.qcfScale) : null;
      if (manualScale !== null && !isNaN(manualScale)) {
        item.finalScale = manualScale;
      } else if (item.naturalGlyphWidth > 0) {
        var ratio = item.naturalWordWidth / item.naturalGlyphWidth;
        item.finalScale = Math.max(AUTO_SCALE_MIN, Math.min(AUTO_SCALE_MAX, ratio));
      } else {
        item.finalScale = 1;
      }
      item.scaledGlyphWidth = item.naturalGlyphWidth * item.finalScale;
    });

    // المرحلة 3: كتابة كل التصحيحات معًا، بعد اكتمال كل الحسابات.
    pending.forEach(function (item) {
      item.glyphSpan.style.transform =
        'translate(-50%, -50%) scale(' + item.finalScale + ')';
      // Auto Margin: إن ظل الرسم أعرض من مساحة KFGQPC بعد التحجيم
      // (نادر مع Auto Scale المقيَّد؛ يحدث أساسًا مع scale يدوي أكبر
      // من اللازم، أو عند حدود الـ clamp الدنيا)، تُوسَّع المساحة بدل
      // السماح بالفيض على الجار.
      if (item.scaledGlyphWidth > item.naturalWordWidth) {
        var marginFactor = item.glyphSpan.dataset.qcfMarginFactor
          ? parseFloat(item.glyphSpan.dataset.qcfMarginFactor) : AUTO_MARGIN_FACTOR;
        var neededWidth = item.scaledGlyphWidth * marginFactor;
        item.realTextSpan.style.display = 'inline-block';
        item.realTextSpan.style.width = neededWidth + 'px';
      }
    });
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(fitAllGlyphs);
  }
  // إعادة محاولة إضافية قصيرة الأجل، تحسبًا لأي كلمات ظهرت بعد حل
  // fonts.ready (المشكلة الموصوفة أعلاه بالضبط) ولم تُلتقط بعد عبر
  // المراقبين أدناه لأي سبب — شبكة أمان زهيدة التكلفة، لا بديل عنها.
  // الاعتماد فقط على مؤقتات ثابتة (600ms، 1500ms) كان كافيًا في اختبارات
  // معزولة، لكن اتضح أنه غير كافٍ أحيانًا على جهاز حقيقي بعد مسح كامل
  // لبيانات الموقع (تحميل بارد: data.js (~3.2MB) + كل الخطوط من جديد،
  // قد يستغرق أطول من ذلك فعليًا على جهاز فعلي، لا محاكاة). document.fonts.load()
  // يطلب تحميل الخط صراحة فورًا (بدل انتظار استخدامه الأول في نص مرسوم)،
  // ويُرجع وعدًا يتحقق بمجرد اكتمال التحميل الفعلي — أوثق من أي مؤقت ثابت.
  // المؤقتات أدناه تبقى كشبكة أمان إضافية فقط، بمدى زمني أوسع.
  if (document.fonts && document.fonts.load) {
    document.fonts.load("1em 'QCF-Merged'").then(fitAllGlyphs).catch(function () {});
  }
  [400, 900, 1800, 3200, 5000].forEach(function (ms) {
    setTimeout(fitAllGlyphs, ms);
  });
  var ayahFlowEl = document.getElementById('ayahFlow');
  if (!ayahFlowEl) return;

  applyOverrides(ayahFlowEl);

  // إعادة التطبيق تلقائيًا في كل مرة يُعاد فيها بناء محتوى الصفحة.
  var observer = new MutationObserver(function () {
    applyOverrides(ayahFlowEl);
    fitAllGlyphs();
  });
  observer.observe(ayahFlowEl, { childList: true });

  // إصلاح سباق توقيت معروف (وُجِّه سابقًا على جهاز حقيقي): ReaderManager.init()
  // يرسم الصفحة الأولى قبل أن يضيف Settings.applyAll() صنف body.uthmani-font
  // لأول مرة (راجع ترتيب safeInit في app.js). هذه المراقبة الإضافية على
  // تغيّر صنف <body> تضمن إعادة المحاولة بمجرد إضافة الصنف، بصرف النظر
  // عن ترتيب التشغيل.
  var bodyObserver = new MutationObserver(function () {
    applyOverrides(ayahFlowEl);
    fitAllGlyphs();
  });
  bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
})();
