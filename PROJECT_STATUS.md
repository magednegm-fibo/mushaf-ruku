# Project Status

**الإصدار الحالي:** 1.0.252  
**آخر تحديث:** 2026-08-03

هذا الملف يُحدَّث مع كل إصدار ويُضمَّن دائمًا داخل الـ ZIP.  
الغرض: حالة واضحة في بداية أي Session جديدة — ما اكتمل، وما هو معلَّق، وما يُفترض ألا يُمس.

---

## Session Handoff

إذا بدأت Session جديدة:

1. اقرأ هذا الملف أولًا.
2. لا تعيد مراجعة العناصر الموجودة في **Completed**.
3. ركّز على **Pending** فقط.
4. اعتبر هذا الملف هو المرجع الرسمي لحالة المشروع.

---

## Completed

### 1.0.252 — إضافة مريم 19:58 (وَإِسْرَائِيلَ) إلى QCF Override

- أُضيف الموضع `19:58:18` (مفتاح الجدول `19:58:17`) إلى `tools/qcf-words.json`
  برمز QCF `FC87` من صفحة 309، والتسمية `وإسرائيل` (مع واو العطف لأن
  الكلمة في النص تحمل الواو).
- أُعيد بناء `fonts/qcf-merged.woff2` وتحديث جدول `QCF_OVERRIDE_TABLE` في
  `qcf-override.js` تلقائيًا عبر `tools/build_qcf_font.py` — التحقق من
  مطابقة الموضع في `data.js` نجح (46/46).
- **بلا Manual Override** (لا `scale` ولا `marginFactor`) — يخضع لـ Auto
  Scale مثل بقية مواضع إسرائيل.
- لم يُمس أي ملف منطق عرض آخر.

### 1.0.251 — تقليل الحشو الجانبي لمساحة القراءة

- تقليل الحشو الأفقي لـ `.reader` من `14px` إلى `8px` لتوسيع إطار المصحف وتحسين استغلال عرض الشاشة مع الإبقاء على هامش مريح.
- لم يُغيَّر حجم الخط ولا توزيع السطور ولا أماكن الأزرار ولا أي خاصية أخرى.
- الملف المعدَّل: `style.css` فقط (سطر padding الخاص بـ `.reader`).

### 1.0.230 — إصلاح أقوى للمسافة المفقودة (جهاز حقيقي: الإصلاح السابق لم يكفِ)

- تقرير مباشر من جهاز حقيقي: مسافة margin-inline-start (v1.0.229) لم
  تُظهر أي فراغ فعلي بين "الحفاظ" والقوس — تحقّقتُ وقتها أن الإصلاح كان
  موجودًا فعليًا داخل الملف المُغلَّف، فهذا ليس تكرارًا لمشكلة كاش قديمة
  موثَّقة سابقًا، بل دليل حقيقي على أن الإصلاح نفسه لم يكن كافيًا على
  الجهاز الفعلي.
- طُبِّقت قاعدة المشروع الدائمة: الدليل من الجهاز الحقيقي يُقدَّم على أي
  تحليل نظري، فأُعيد تقييم الافتراض بدل اقتراح نظرية جديدة فوق نفس
  الأساس.
- الإصلاح الجديد الأقوى: استُبدلت المسافة النصية العادية قبل الـspan
  بمسافة غير قابلة للكسر (U+00A0) داخل السلسلة النصية نفسها، في
  `resolveKhilafMarkInfo` (`reader-reminders.js`). هذه المسافة لا تخضع
  لقواعد تقليم/كسر المسافات عند حدود عناصر الـflex الضمنية إطلاقًا (بخلاف
  المسافة العادية)، فهي أكثر اعتمادية من هامش CSS وحده. `margin-inline-
  start` من v1.0.229 أُبقي كطبقة أمان إضافية في `style.css`، لا كحل وحيد.
- حُدِّث `tests/khilaf-info-popup-regression.js` (الاختباران 2 و3) ليطابق
  حرف U+00A0 الجديد بدل المسافتين العاديتين.
- تشغيل كامل مجموعة الاختبارات: **1642 ناجح، 0 فاشل**.

### 1.0.229 — إصلاح المسافة المفقودة قبل القوس في نافذة خلاف الروضة

- تقرير مباشر من جهاز حقيقي: لا مسافة ظاهرة بين "الحفاظ" والقوس `[` رغم
  وجود مسافة نصية في الكود منذ v1.0.225.
- السبب الجذري: `.waqf-info-label` عنصر `display:inline-flex`. نص
  "خلاف مع روضة الحفاظ" الخام والـ`<span class="khilaf-inline-symbol">`
  المُضاف في v1.0.227 يصبحان عنصرَي flex منفصلين ضمنيًا، فتُقلَّم أي
  مسافات نصية عادية بينهما — لا تُترجَم دائمًا لمسافة مرئية كما يحدث في
  التدفق النصي العادي. بقية أنواع هذه النافذة (رأس غير الكوفيين،
  العلامات الافتراضية) غير متأثرة، لأن تسمياتها نص خام واحد بلا عناصر
  HTML متداخلة.
- الإصلاح: `margin-inline-start: 4px` على `.khilaf-inline-symbol` نفسها
  في `style.css` — تضمن المسافة عبر margin على العنصر، لا عبر مسافات في
  نص المصدر. لا تعديل في أي كود JavaScript، ولا في نصوص الاختبار (بنية
  النص التي تفحصها الاختبارات لم تتغيّر).
- تشغيل كامل مجموعة الاختبارات: **1642 ناجح، 0 فاشل**.

### 1.0.228 — الأقواس تدخل ضمن تلوين رمز العلامة

- طلب مباشر يكمل v1.0.227: القوسان `[ ]` أصبحا الآن داخل نفس الـspan
  الملوَّن مع الرمز، لا نصًّا بنفسجيًا خارجه — فتُصبح "[ م ]" و"[ ص ]"
  كتلة واحدة ملوَّنة بالكامل (أحمر/أخضر على الترتيب)، بدل قوسين بنفسجيين
  يحيطان برمز ملوَّن بلون مختلف.
- تعديل بسيط في `resolveKhilafMarkInfo` (`reader-reminders.js`): نقل
  القوسين إلى داخل نص الـspan بدل أن يكونا خارجه في السلسلة النصية.
- حُدِّث `tests/khilaf-info-popup-regression.js` (النصوص المتوقَّعة
  للاختبارين 2 و3) ليطابق الشكل الجديد.
- تشغيل كامل مجموعة الاختبارات: **1642 ناجح، 0 فاشل**.

### 1.0.227 — تلوين رمز العلامة داخل نافذة خلاف الروضة بلونها الخاص

- طلب مباشر يعكس جزءًا من قرار v1.0.225: الرمز بين القوسين لكلمتَي
  مرقدنا (م) وويبصط (ص) يأخذ الآن لون علامته الخاصة — الميم أحمر، الصاد
  أخضر — بدل البقاء بنفسجيًا مثل بقية النص.
- بقية النص ("خلاف مع روضة الحفاظ") يبقى بنفسجيًا كما هو؛ التلوين جزئي
  على الرمز فقط، عبر `<span>` مضمَّن داخل التسمية (فئات
  `.khilaf-inline-symbol-red/green/blue/brown` جديدة في `style.css`،
  نهاري/ليلي، بنفس القيم اللونية المستخدمة في بقية المشروع لكل نوع).
- `openInfoPopup` تحوّل من `textContent` إلى `innerHTML` لعرض هذا التلوين
  الجزئي (آمن لبقية الأنواع، لأن كل نصوصها الحالية خالية من رموز HTML
  خاصة).
- ملاحظة تقنية: رُصد واحتاج تصحيح فوري خلال هذا التعديل نفسه — قاعدة
  اللون الجزئي الأولى كانت ستُهزَم بقاعدة اللون البنفسجي الأشمل بسبب
  خصوصية CSS (specificity) أعلى لتلك الأخيرة رغم التداخل الأعمق؛ صُححت
  بتوسيع سلسلة المحدِّدات (selectors) لقواعد اللون الجزئي بدل استخدام
  `!important`.
- حُدِّث `tests/khilaf-info-popup-regression.js` (النصوص المتوقَّعة +
  التعليق التوضيحي أعلى الملف) ليطابق السلوك الجديد.
- تشغيل كامل مجموعة الاختبارات: **1642 ناجح، 0 فاشل**.

### 1.0.226 — اختصار نص نافذة خلاف الروضة

- طلب مباشر: تسمية نافذة خلاف الروضة (v1.0.225) اختُصرت من "موضع خلاف مع
  روضة الحفاظ" إلى **"خلاف مع روضة الحفاظ"** — حذف كلمة "موضع" فقط، بلا
  تغيير في اللون أو الرمز الإضافي بين قوسين للكلمتين مرقدنا/ويبصط.
- حُدِّث `tests/khilaf-info-popup-regression.js` ليطابق النص الجديد.
- تشغيل كامل مجموعة الاختبارات: **1642 ناجح، 0 فاشل**.

### 1.0.225 — نافذة معلومات جديدة عند الضغط المطول على كلمة خلاف (بنفسجي)

- ميزة جديدة كاملة، لم تكن موجودة سابقًا (تحقّقتُ ولم أجد أي نص "موضع
  خلاف مع روضة الحفاظ" في أي مكان بالكود قبل هذا الإصدار — الكلمات
  البنفسجية بلا علامة سجاوندي كانت تسقط بلا أي نافذة معلومات لقائمة
  إضافة/حذف علامة التذكير الشخصية العادية).
- الآن: الضغط المطول على أي كلمة `khilaf-word` (29 كلمة، راجع
  `docs/khilaf-munfasil-words.md`) يعرض نافذة معلومات بعنوان "موضع خلاف
  مع روضة الحفاظ"، بلون بنفسجي مخصص (`info-khilaf`، بنفس متغيّر
  `--khilaf-highlight`)، بلا أي رمز كبير أعلى النافذة (طلب مباشر).
- للكلمتين اللتين تحملان أيضًا علامة سجاوندي افتراضية على نفس الكلمة
  (36:52 مرقدنا ← وقف لازم، 2:245 ويبصط ← وقف مرخص): تُضاف رمز تلك
  العلامة بين قوسين لنفس التسمية (نفس أسلوب `resolveNonKufiMarkInfo`
  لرأس الآية عند غير الكوفيين)، **لكن اللون يبقى بنفسجيًا دائمًا** ولا
  يرث لون العلامة المصاحبة — بخلاف منطق غير الكوفيين، وهذا طلب مباشر
  صريح تم التأكد منه.
- الترتيب عند الضغط المطول أصبح: رأس غير الكوفيين ← خلاف الروضة ← علامة
  سجاوندي افتراضية عادية ← قائمة التذكير الشخصي (بلا تغيير في أي من
  الفروع الثلاثة الأخرى).
- ملف اختبار انحدار دائم جديد: `tests/khilaf-info-popup-regression.js`
  (5 حالات: كلمة بنفسجية عادية، مرقدنا، ويبصط، كلمة عادية بعلامة غير
  خلافية، كلمة عادية تمامًا).
- تشغيل كامل مجموعة الاختبارات (11 ملفًا الآن): **1642 ناجح، 0 فاشل**.

### 1.0.224 — توثيق سبب مواضع خلاف مدّ المنفصل (توثيق فقط، بلا تغيير سلوك)

- تأكيد مباشر من المستخدم (2026-08-01): الكلمات الـ29 عبر الجداول الخمسة
  (SAKTA_HIGHLIGHT_WORDS, MUQATTAAT_MAD_WORDS, SEEN_AS_SAD_WORDS,
  MAD_FARQ_WORDS, TAJWEED_NOTE_WORDS) هي تحديدًا المواضع التي يقرأ فيها
  طريق الشاطبية بمدّ المنفصل بينما يقرأ فيها طريق روضة الحفاظ بقصر
  المنفصل — وهذا هو السبب الدقيق لتسمية إعداد الواجهة "قصر المنفصل"،
  وليس اسمًا متخلِّفًا عن ميزة قديمة محذوفة (تحليل سابق افترض ذلك خطأً،
  ورُفض صراحة).
- أُضيف ملف مرجعي رسمي جديد: `docs/khilaf-munfasil-words.md` — يوثّق
  السبب والقائمة الكاملة (29 كلمة، 27 آية، مصنَّفة حسب الجدول)، ويُرجَع
  إليه أولاً لأي سؤال مستقبلي حول هذا التلوين.
- حُدِّث التعليق العام أعلى `SAKTA_HIGHLIGHT_WORDS` في `readerManager.js`
  ليشير لهذا الملف المرجعي ويحمل نفس التوضيح.
- لا تغيير في أي منطق أو سلوك عرض — تعديل توثيقي/تعليقات فقط. رُفع رقم
  الإصدار لأن `readerManager.js` من الملفات المخزَّنة في Service Worker
  cache (راجع القاعدة الدائمة لرفع الإصدار عند أي تغيير في ملف مخزَّن).

### 1.0.223 — تكبير الكلمة الافتراضية 1.1em + تصحيح 10 اختبارات قديمة

- تكبير الكلمة المُلوَّنة بعلامة سجاوندي افتراضية (`has-default-*`، مصحف المدينة فقط) رجع من 1.2em إلى **1.1em** — طلب مباشر 2026-08-01. `.waqf-sign` الأصلية (1em) وحارس منع التكبير المزدوج بلا تغيير.
- **لم يُغيَّر أي سلوك آخر.** جميع التعديلات التالية على ملفات الاختبار فقط، بعد تأكيد أن السبب اختبار قديم لا يطابق الكود الحالي، وليس خللاً في الكود:
  - `tests/color-coding-toggle-regression.js`: حُدِّثت قيمة التكبير المتحقق منها إلى 1.1em؛ وسِّعت نافذة regex التي تتحقق من إخفاء النجمة (كانت 400 حرف، والمسافة الفعلية حتى `display:none` وصلت 540 حرفًا)؛ حارس منع التكبير المزدوج أُعيد كتابته ليتحقق من القاعدة الأساس الفعلية (`body.uthmani-font .waqf-sign{font-size:1em}`) بدل قاعدة فرعية صريحة كانت محذوفة عمدًا سابقًا لأنها زائدة (التكبير 1em نسبي، فيرث تلقائيًا حجم أي أب مكبَّر).
  - `tests/default-waqf-mutlaq-marks-regression.js`: نفس فئة الخلل بالضبط تكررت في 7 فحوصات (كل أنواع العلامات الافتراضية: waqf, sad-rukhsa, waqf-lazim, zay-jawaz, qad-qila, qif, jeem) — كل الفحوصات لم تكن تحسب `:not(.khilaf-word)` المُضافة لاحقًا لميزة تقاطع البنفسجي مع السجاوندي (2026-08-01)، ونافذة البحث كانت غير كافية لبعض التجمعات (مثل ص/ز/ق التي تشترك في قاعدة لون واحدة، المسافة الفعلية 202 حرفًا مقابل حد 150). حُدِّثت جميعها بنفس المنهج: إضافة `(?::not(.khilaf-word))?` اختيارية، وتوسيع النوافذ (150→250، 400→600).
  - `tests/mad-munfasil-indopak-regression.js`: فحصا 2:245 (وَيَبۡصُۜطُ) كانا يتحققان من `class="quran-word seen-as-sad-word"` بمطابقة حرفية تامة، بينما الكلمة تحمل الآن أيضًا `khilaf-word` (2:245 أحد الموضعين الموثَّقين لتقاطع البنفسجي مع السجاوندي — راجع التدقيق الشامل السابق). حُدِّث الفحصان للسماح بوجود `khilaf-word` اختياريًا بعد `seen-as-sad-word`.
- تشغيل كامل مجموعة الاختبارات (10 ملفات) بعد كل التعديلات: **1637 ناجح، 0 فاشل**، رمز خروج 0 لكل ملف.
- ملاحظة أمانة: أثناء العمل ظهر محتوى CSS غير موجود في الملف المرفوع الأصلي داخل نسخة عمل سابقة (كتلة `:has(.waqf-sign)` مع تحذير iOS غير مُختبر) — جرى تجاهله بالكامل وأُعيد بناء نسخة العمل من الملف المرفوع الأصلي حصرًا قبل أي تعديل نهائي.

### نجمة السجاوندي على الكلمة المضيفة لرأس غير الكوفيين (1.0.182 + توثيق 1.0.183)

**المضيف** = مطابقة حروف الأساس (لا الفهرس وحده). مثال: 28:23 → **يسقون**.
- غير **لا**: ⭐ سجاوندي باللون المناسب **+** رأس بلون خط المصحف على **نفس المضيف**.
- **لا**: رأس أخضر فقط (`has-non-kufi-la`).
- عارٍ (4): رأس بلون المصحف فقط.
- المرجع الرسمي: `docs/non-kufi-ayah-head-marks.md` §3–4.

### رؤوس غير الكوفيين العارية — لون خط المصحف (1.0.179 + توثيق 1.0.180)

المواضع الأربعة بلا علامة وقف ملاصقة (`20:88` موسى، `29:67` يؤمنون، `37:9` دحورا، `47:4` منهم):
- قيمة الخريطة `""` → نجمة بدون `mark-red/green/blue/brown`.
- `color: inherit` على `.non-kufi-mark` → **لون خط المصحف** في الوضعين:
  - نهاري: `#2B2013` (`--ink`)
  - ليلي: `#F2F0EA` (`body.night .ayah-flow`)
- الضغط المطوّل: `info-plain` بنفس حبر النص.
- باقي الـ117 تبقى ملوّنة حسب درجة الوقف.
- المرجع الرسمي: `docs/non-kufi-ayah-head-marks.md` §3.

### ألوان العرض — بنفسجي الخلاف + popup الليلي (1.0.178)

- تغميق بنفسجي مواضع خلاف قصر المنفصل ~12% (×0.88): نهاري `#6A1B9A` → `#5D1888`، ليلي `#CE93D8` → `#B581BE` (يشمل `--mad-munfasil` وكلمة «البنفسجي» في دليل القارئ).
- نافذة شرح الضغط المطوّل على علامات وقف السجاوندي في الوضع الليلي: نفس درجات `body.night .waqf-mark.mark-*` (أحمر `#E53935`، أخضر `#43A047`، أزرق `#1E88E5`، بني `#C9A06A`) بدل ألوان النهار الأغمق.

### Smart Placement Engine — بحث بالقرب البصري + Cache (1.0.177)

استبدال منطق previous/next-sibling بفحص قرب بصري حقيقي: كل عنصر من
`.quran-word .ayah-num .ruku-mark .sajdah-mark .waqf-sila-lift
.waqf-sakta-lift .waqf-mark-lower .waqf-mark-lower-mutlaq
.waqf-ruku-mark-noon-lift .non-kufi-mark .waqf-mark` يُفحص عبر
`getBoundingClientRect()` إن وقع صندوقه داخل نصف قطر 50px حول الموضع
الافتراضي للعلامة (بصرف النظر عن ترتيبه في الـDOM)، مع استبعاد الكلمة
المضيفة نفسها دائمًا. أضيف Cache بالذاكرة مفتاحه `data-key` الكلمة،
مع توقيع (حجم الخط + حجم خط العلامة + أبعاد الشاشة + الخط
عثماني/إندوباك) — أي تغيير في التوقيع يُبطل الإدخال المخزَّن ويُعاد
البحث الهندسي من جديد؛ غير ذلك يُطبَّق الإزاحة المخزَّنة مباشرة بلا
إعادة بحث.

### Smart Placement Engine لعلامات التذكير + السجاوندي (1.0.176)

ملف جديد `mark-placement-engine.js`. لا يمس `waqf-positions.js` ولا أي
إحداثيات ثابتة — يقيس الـDOM المرسوم فعليًا وقت التشغيل عبر
`getBoundingClientRect()` ويفحص تقاطع مستطيلات (بهامش أمان 6px) مع:
الكلمة المضيفة (حروف+تشكيل+سجاوندي أصلي، كلها داخل نفس span)، الكلمة
السابقة/التالية، أرقام الآيات، وعلامة الركوع. إذا وُجد تداخل، يجرّب
بالترتيب: +8px يمين، -8px يسار، -8px أعلى، +8px أسفل، ثم الأقطار
الأربعة — أول موضع خالٍ من التداخل يُعتمد، بحد أقصى ~12px إزاحة. لا
تغيير إطلاقًا إذا كان الموضع الافتراضي خاليًا من التداخل. الإزاحة تُطبَّق
عبر متغيرات CSS مضافة (`--mark-dx`/`--mark-dy`) فوق الـtransform
الموجود أصلًا في style.css، فيبقى الموضع الافتراضي كما هو (مفضَّل دائمًا)
ولا حاجة لأي تعديل يدوي مستقبلي عند تغيير حجم الخط أو حجم العلامة.
مُفعَّل من: `onAfterRender` (كل تغيير صفحة)، `applyFontSize` (أزرار
+/- والـpinch-zoom)، و`updateWordMarkUI` (إضافة/حذف علامة تذكير على
كلمة واحدة)، بالإضافة لمستمع resize مُهدَّأ (debounced) لتغييرات
الاتجاه/حجم الشاشة. مُضاف إلى قائمة الـprecache في `sw.js`.

### تكبير علامات التذكير + السجاوندي (1.0.175)

مصحف المدينة فقط (`body.uthmani-font .waqf-mark`): `font-size` من `0.40em`
إلى `0.44em` (+10%، طلب مباشر). القاعدة واحدة لعلامات التذكير الشخصية
وعلامات وقف السجاوندي الافتراضية معًا (نفس الـspan). بقية الخطوط
(نسخ/إندوباك) لم تُمس.

### علامات الوقف الافتراضية (تلوين الكلمات)

| النوع | اللون | الحالة |
|---|---|---|
| **ط** `TA_MUTLAQ` | أزرق | ✅ مكتمل — بما فيه فجوات الاستخراج (البسيطة + المعقّدة) والمراجعة اليدوية |
| **ص** `SAD_RUKHSA` | أخضر | ✅ مكتمل — استبعاد نهائي لأي تقاطع فعّال مع لا أو صلي |
| **م** `WAQF_LAZIM` | أحمر | ✅ مكتمل |
| **ز** `ZAY_JAWAZ` | أخضر | ⚠️ جزئي — التلوين الأساسي يعمل؛ تقاطع ز×صلي معلَّق (انظر Pending) |
| **ق** `QAD_QILA` | أخضر | ✅ مكتمل — استبعاد نهائي لأي تقاطع فعّال مع لا أو صلي |
| **قف** `QIF` | أزرق | ✅ مكتمل — تعارضات داخلية نظيفة محسومة؛ لا/صلي/تعانق محسومة |
| **ج** `JEEM` | بني | ✅ مكتمل — مراجعة بصرية لـ 21 موضع تعانق معلّق (7 أخضر، 14 مستبعد) |

### ج × تعانق — الحسم النهائي (1.0.126)

**أخضر (7):**  
`2:96:8`، `5:41:16`، `7:163:22`، `7:172:17`، `28:35:11`، `25:32:9`، `60:3:5`

**مستبعد نهائيًا (14):**  
`2:96:5`، `5:41:19`، `7:163:23`، `7:172:16`، `28:35:10`، `5:32:3`، `7:92:7`، `25:32:10`، `25:59:13`، `33:61:1`، `44:45:1`، `60:3:7`، `68:41:3`، `84:15:1`

### محرك البحث

- ✅ تطبيع Perso-Arabic + ألف خنجرية + واو/ألف (صلاة/زكاة/حياة)
- ✅ بحث موحّد (سورة + آية)
- ✅ مطابقة تامة متسقة بين اسم السورة ونص الآية
- ✅ جاهزية v1.0 (type safety + regression suite)

### بنية عامة

- ✅ PWA مستقر (Service Worker، كاش، إصدار موحّد عبر `version.js`)
- ✅ تلاوة صوتية (كل آية / ركوع / سورة / جزء / منزل)
- ✅ علامات تذكير المستخدم + علامة قراءة مشتركة
- ✅ Regression suites لعلامات الوقف والبحث والمد المنفصل

---

## Pending

### 1. ز × صلي — 34 موضعًا نشطًا

استبعاد **معلَّق** (قابل للتراجع) في `DEFAULT_MARK_MANUAL_EXCLUSIONS['ZAY_JAWAZ']`.  
الطلب الأصلي: عدم التلوين إلا بعد مراجعة كل موضع في «علل الوقوف» للسجاوندي.

أمثلة للاختبار: `2:168:8`، `73:20:48`.

القائمة الكاملة في `readerManager.js` تحت مفتاح `ZAY_JAWAZ` داخل `DEFAULT_MARK_MANUAL_EXCLUSIONS`.

### 2. تعارض داخلي غير محسوم: `11:46:10` (قد قيل × ز)

نفس الكلمة مصنَّفة قد قيل وز معًا؛ لا قرار نهائي بعد.  
مستبعدة تلقائيًا من الطرفين عبر آلية التعارض الداخلي (`DEFAULT_MARK_CONFLICT_KEYS`) مع `console.warn`.

---

## Deferred / Out of Scope

- **لا تعديل يدوي على `data.js` أو `waqf-positions.js`** — قيد مطلق.  
  أي تصحيح عرض يُطبَّق وقت الرسم فقط في `readerManager.js`  
  (`DEFAULT_MARK_MANUAL_*`، `DEFAULT_MARK_CONFLICT_RESOLUTIONS`، `WORD_MARK_CORRECTIONS`).
- **الـ ZIP الجاهز للنشر هو مصدر الحقيقة** — أي إصلاح لا يُعتبر مكتملًا إلا بعد التحقق داخل الـ ZIP المعبَّأ نفسه.
- **نص القرآن لا يُعدَّل أبدًا** (حتى عند أخطاء محتملة في مصدر QUL مثل 5:7).
- ميزات مستقبلية مذكورة في README (ورد اليوم، إحصائيات، توسيع التلاوة) — خارج نطاق عمل علامات الوقف الحالي.

---

## Notes — قرارات تصميم معتمدة

1. **سياسة لا / صلي النهائية:** أي علامة ط/ص/ز/ق/قف/ج تتقاطع فعليًا (غير آخر كلمة) مع لا أو صلي → استبعاد نهائي من التلوين، بلا استثناءات فردية.
2. **آخر كلمة في الآية:** لا تُلوَّن بعلامة وقف افتراضية (طلب مباشر صريح لكل الأنواع).
3. **التعانق (MUANAQAH):** ليس استبعادًا تلقائيًا؛ يحتاج معرفة الطرف الآخر (رأس آية؟ قوة العلامة؟). عند تعادل تام (ج×ج) يُحسم بالمراجعة البصرية.
4. **ترتيب القوة الداخلي (عند تعارض نوعين على نفس الكلمة بلا طرف ثالث):**  
   ط / قف > ج > ز > ق > ص  
   (مع قرارات فردية موثَّقة في `DEFAULT_MARK_CONFLICT_RESOLUTIONS` عند الحاجة).
5. **ألوان التلوين الافتراضي:**
   - أزرق (`#1565C0` / ليلي `#64B5F6`): ط، قف
   - أخضر (`#2E7D32` / ليلي `#81C784`): ص، ز، ق
   - بني / ذهبي (`#A9793B` / ليلي `#C9A227`): ج — نفس درجة لون دائرة ع أسفل الصفحة (نهاري)
   - أحمر: م (وقف لازم)
6. **تصحيحات العرض لا تُكتب في بيانات المصدر** — تبقى في `readerManager.js` فقط.

---

## مرجع موثَّق — رأس الآية لعدّ غير الكوفيين

**الملف الكامل:** [`docs/non-kufi-ayah-head-marks.md`](./docs/non-kufi-ayah-head-marks.md)  
**الخرائط:** `non-kufi-heads.js` · **العرض:** مصحف المدينة فقط (منذ 1.0.170)

- الرمز في `textIndopak`: **U+E021** — موضع نهاية الآية عند غير الكوفيين (ليس ركوعًا).
- **الإجمالي:** 121 · **بدرجة وقف:** 117 · **بلا علامة ملاصقة:** 4 (`20:88` موسى، `29:67` يؤمنون، `37:9` دحورا، `47:4` منهم).
- **اللون:** لا/ص/ز/ق → أخضر · ط/قف → أزرق · ج → بني · بلا علامة → أزرق.
- **الضغط المطوّل:** `رأس آية لغير الكوفيين [ لا ]` إن وُجدت علامة؛ بدون أقواس إن لم توجد.
- **النسخ (Indopak):** بدون تدخل — رمز PDMS الأصلي.
- قواعد التنفيذ التفصيلية في القسم «قواعد التنفيذ المعتمدة» داخل ملف docs أعلاه.

لا تُعدْ مسح المصحف من الصفر — ارجع للملف أعلاه + `non-kufi-heads.js`.

---

## ملفات حساسة عند أي تغيير على علامات الوقف

| ملف | الدور |
|---|---|
| `readerManager.js` | جداول الاستبعاد/الإضافة/حسم التعارض + بناء خرائط التلوين |
| `waqf-positions.js` | مصدر المواضع (مولَّد — لا يُعدَّل يدويًا) |
| `sila-positions.js` | مواضع صلي (مرجع للتعارض، لا تلوين مستقل) |
| `tests/default-waqf-mutlaq-marks-regression.js` | فحوصات الارتداد — يجب أن تبقى `FAIL: 0` |
| `style.css` | ألوان `.has-default-*` |
| `version.js` + `manifest.json` | رفع الرقم مع كل إصدار يمس العرض أو البيانات |

---

## Change Log

### 1.0.191
- Policy: Indopak (`textIndopak`) is the sole source of truth for stop-mark *types*; Madinah is display-only after word mapping.
- Closed **27** high-confidence `WAQF_REVIEW` gaps via `DEFAULT_MARK_MANUAL_ADDITIONS` (JEEM 19, WAQF_LAZIM 6, TA_MUTLAQ 1, ZAY_JAWAZ 1). Medium/Low left in REVIEW.

### 1.0.190
- `DEFAULT_MARK_MANUAL_ADDITIONS['WAQF_LAZIM']`: first manual bridge from `WAQF_REVIEW` — add **4:171 word 43** (`وَلَدٞۘ`) so Madinah mode applies `has-default-waqf-lazim` red coloring (Indopak U+06D8 was extracted but alignment never produced a `WAQF_POSITIONS` word index).

### 1.0.189
- Soften default Sajawandi colored-word enlargement (`has-default-*`) further: **1.15em → 1.1em** (Madinah only). Native `.waqf-sign` and double-scale guard unchanged.

### 1.0.188
- Soften default Sajawandi colored-word enlargement (`has-default-*`) from 1.2em to **1.15em** (Madinah only). Native `.waqf-sign` sizing and double-scale guard unchanged.

### 1.0.187
- Dead-code cleanup: permanently removed the old general مد منفصل highlighting (`MAD_MUNFASIL_REGEX` / `YA_HA_MUNFASIL_REGEX` / `MAD_SILA_KUBRA_REGEX` and helpers). Ordinary مد منفصل text stays plain ink.
- Semantic rename of remaining purple-khilaf identifiers so they no longer imply the removed feature: `--mad-munfasil` → `--khilaf-highlight`, `body.show-mad-munfasil` → `body.show-khilaf-highlight`, `applyMadMunfasilVisibility` → `applyKhilafHighlightVisibility`, `.mad-munfasil-color-name` → `.khilaf-highlight-color-name`. Curated قصر المنفصل khilaf tables unchanged in behaviour.

### 1.0.186
- Madinah-mushaf words colored by a default Sajawandi mark (ط/ص/م/ز/ق/قف/ج) but with no native embedded waqf glyph of their own now enlarge 1.2em, same degree as `.waqf-sign` (words carrying an original mushaf waqf mark) — طلب مباشر 2026-07-31. Guarded against double-scaling if the same word also contains a native `.waqf-sign`; the "إظهار علامات التذكير والوقف" toggle resets the enlargement too. `tests/color-coding-toggle-regression.js` extended with 3 new checks.

### 1.0.185
- Default Sajawandi stop marks (ط/ص/م/ز/ق/قف/ج): reverted to coloring the word's own text with the mark's color, removing the star entirely (طلب مباشر 2026-07-31 — direct reversal of the 1.0.148 star design). `.non-kufi-mark` decoupled from parent-word color so it keeps mushaf ink regardless (1.0.179 decision unchanged). "إظهار علامات التذكير والوقف" toggle now resets word-text color instead of hiding a star. `tests/color-coding-toggle-regression.js` and `tests/default-waqf-mutlaq-marks-regression.js` updated to assert the new word-coloring design instead of the old star design (21 checks rewritten).

### 1.0.184
- Fix: long-press info popup for a رأس آية لغير الكوفيين now matches the color of the Sajawandi mark on the same word (was falling back to plain mushaf ink when the paired mark lives on `.waqf-mark` rather than `.non-kufi-mark` itself). New regression test: `tests/non-kufi-info-popup-color-regression.js`.

### 1.0.183
- Formal documentation of non-Kufi host-word Sajawandi rules in `docs/non-kufi-ayah-head-marks.md` §3–4 (host = base match; star on same word; لا exception). PROJECT_STATUS + heads header aligned.

### 1.0.182
- Fix: Sajawandi star on **host word** (base-letter match, e.g. يسقون 28:23), not previous index. لا = green head only. Bare = mushaf ink.

### 1.0.180
- Document non-Kufi bare heads: star uses mushaf text ink in day (`--ink` #2B2013) and night (`#F2F0EA`) via `color: inherit` — `docs/non-kufi-ayah-head-marks.md` §3, style/heads comments.

### 1.0.179
- Non-Kufi bare heads (4, no adjacent waqf): uncolored star (`color: inherit`), map value `""`, long-press `info-plain`.

### 1.0.178
- Darken قصر المنفصل khilaf purple ~12%: day `#5D1888`, night `#B581BE` (`--mad-munfasil` + guide «البنفسجي»).
- Night mode: long-press Sajawandi info popup text uses the same night mark colors as the stars (`#E53935` / `#43A047` / `#1E88E5` / `#C9A06A`).

### 1.0.174
- Documented non-Kufi display rules in `docs/non-kufi-ayah-head-marks.md` (نطاق المدينة فقط، ألوان، ضغط مطوّل، مواضع عارية، منع مسح الجيران).

### 1.0.173
- Full audit of 121 non-Kufi heads: fix host `2:10`→اليم+لا؛ `7:29`→ط؛ color↔symbol consistency 0 conflicts.

### 1.0.172
- Non-Kufi long-press: symbol from `NON_KUFI_HEADS_SYM_*` only (no neighbor scan — fixed false `[ ص ]` on 37:9 دحورا).

### 1.0.171
- Non-Kufi ayah-head marks (U+E021): colored star **Uthmani/Madinah only** (Indopak keeps native PDMS glyph).
- Long-press label: `رأس آية لغير الكوفيين [ لا ]` etc. (117 with symbol, 4 bare).
- Hide default/personal waqf star when co-located with non-Kufi head.
- `non-kufi-heads.js` in SW `DYNAMIC_ASSETS`.

### 1.0.161
- Long-press on a word carrying a colored default Sajawandi stop-mark (ط/ص/م/ز/ق/قف/ج) no longer opens the personal reminder-mark menu; it shows a small popup naming the waqf type instead (e.g. "ص وقف مرخص للضرورة"), colored to match the mark's own color (blue/green/red/brown), auto-dismissing after ~2.6s or on outside tap.
- New elements: `#waqfInfoPopup` / `#waqfInfoSymbol` / `#waqfInfoLabel` (index.html), wired in `app.js`, logic in `reader-reminders.js` (`DEFAULT_MARK_INFO`, `resolveDefaultMarkInfo`, `openInfoPopup`), styling in `style.css` (`.waqf-info-popup`, `.info-red/green/blue/brown`).
- Words with no default Sajawandi mark keep the existing add/delete reminder-mark long-press behavior unchanged.

### 1.0.159
- Guide color legend: color names (أحمر/أزرق/بني/أخضر) use exact .waqf-mark.mark-* hex values.
- قصر المنفصل note: «البنفسجي» uses explicit #6A1B9A / night #CE93D8 (same as page خلاف words).

### 1.0.158
- Settings: rename toggle label «الترميز اللوني» → «إظهار علامات التذكير».
- Guide (علامات الوقف): add color-legend box for reminder stop marks (red/blue/brown/green) at end of tab.
- Guide (قصر المنفصل): color only the word «البنفسجي» with --mad-munfasil purple in the خلاف note box.

### 1.0.157
- Raise listen/tafsir overlay buttons slightly (top 60→52px). No page padding change.

### 1.0.157
- Fix: purple قصر المنفصل now truly hides with «إظهار علامات التذكير والوقف» (toggle show-mad-munfasil in JS + CSS override).

### 1.0.149
- Removed separate «تفعيل الترميز اللوني» toggle. «إظهار علامات التذكير والوقف» now shows/hides personal stars + Sajawandi default stars + purple قصر المنفصل together.

### 1.0.148
- Default Sajawandi stop marks: show reminder star above the word (same colors as personal marks: blue/green/red/brown) instead of coloring the word text. Default mode. Toggle «تفعيل الترميز اللوني» hides the stars.

### 1.0.147 (docs addendum — no version bump)
- Documented non-Kufi ayah-head mark inventory (U+E021): `docs/non-kufi-ayah-head-marks.md` + pointer in PROJECT_STATUS. Reference only; no code/display change.

### 1.0.147
- Shrink reminder delete/add menu panel ~10% (item padding 12/16→11/14, font 14→13, gap 8→7, radius 12→11).

### 1.0.146
- Shrink reminder colour picker ~10% (btn 34→31px, padding 8→7, gap 4→3, font 17→15).

### 1.0.145
- Personal reminder marks: added fourth colour **brown** (`#A9793B`). Picker order (RTL right→left): blue, brown, green, red. Storage/export accepts `brown`; unknown colours still fall back to red on display.

### 1.0.144
- Changed JEEM (ج) default colour only from green to brown/gold matching the ruku-end circle (`#A9793B` day / `#C9A227` night). ص/ز/ق remain green.

### 1.0.143
- Documented WAQF_REVIEW Semantics (ayah-level only; must not infer same-word multi-marks).

### 1.0.137
- Added tools/find-unmapped-review-positions.js (pre-release WAQF_REVIEW gap scanner).
- Filled remaining recoverable JEEM REVIEW gaps (JEEM --type PASS).

### 1.0.133
- Fixed JEEM gap: 60:9:16 and 30 other WAQF_REVIEW JEEM positions now colored green.
- Added regression tests for REVIEW JEEM extraction gaps.

### 1.0.132
- Documented Artifact Delivery / Mandatory Output Rule.

### 1.0.131
- Added Source of Truth section.

### 1.0.130
- Added Project Metrics dashboard section.

### 1.0.129
- Added formal Change Log section to `PROJECT_STATUS.md`.

### 1.0.128
- Added `PROJECT_STATUS.md`.
- Added Session Handoff.
- Documented current stop-mark status.

### 1.0.127
- First inclusion of `PROJECT_STATUS.md` in the release ZIP.

### 1.0.126
- Finalized JEEM visual review (21 تعانق positions).
- Removed 7 JEEM exclusions → green coloring.
- Kept 14 JEEM exclusions permanent.
- Updated regression tests.

---

## Project Metrics

**Current Version:** 1.0.174

**Regression Tests:**
- Stop Marks: 263/263 PASS
- Search: 175/175 PASS *(documented suite; see `docs/search-regression-suite.md`)*

**Current Pending:**
- Z × Salli (ز×صلي): 34
- Internal conflict (قد قيل × ز، `11:46:10`): 1

**Status:** Release Candidate

---

## Source of Truth

- `waqf-positions.js`: Generated from Indopak (Do not edit manually)
- Indopak `textIndopak`: Source of truth for stop-mark *existence*
- Uthmani `text`: Display / word numbering only — never proves or disproves a mark
- `readerManager.js`: Manual display corrections only
- `PROJECT_STATUS.md`: Canonical project status
- Regression tests: Required before every release
- tests/sajawandi-freeze-regression.js: Freezes Sajawandi stop-mark behaviour (`FAIL: 0`)
- Release ZIP: Sole publishable artifact — verify fixes inside the packaged ZIP, not only working files

---


---

### WAQF_REVIEW Semantics

`WAQF_REVIEW` is **ayah-level only**.

It indicates that a stop-mark type exists *somewhere* in the ayah (extraction could not assign a trusted Uthmani word number).

It **MUST NOT** be used to infer that multiple stop-mark types belong to the same word.

Word-level colouring decisions must always use `WAQF_POSITIONS` (after Indopak → Uthmani alignment), or explicit `DEFAULT_MARK_MANUAL_ADDITIONS` keys of the form `surah:ayah:word`.

Source of truth for mark *existence*: Indopak (`textIndopak`). Uthmani (`text`) is display / word numbering only.

## Artifact Delivery Rule

A release is considered complete **only when** the ZIP has been attached as a downloadable file in the chat.

### Mandatory Output Rule

Whenever a ZIP is requested:

1. Attach the ZIP as a downloadable file.
2. Never respond with only an internal filesystem path.
3. Do not assume the user can access the agent workspace.
4. If the attachment fails, explicitly state that it failed instead of printing the path.

Never finish by printing only an internal filesystem path.
