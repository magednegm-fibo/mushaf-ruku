# اختبارات المتصفح الحقيقي (Playwright E2E)

## الغرض وحدود التغطية

هذا المجلد يحتوي اختبارات تعمل داخل متصفح حقيقي عبر Playwright. وجود الاختبار في المستودع لا يعني أنه نُفّذ أو اجتاز؛ يجب تسجيل نتيجة التشغيل وتاريخها بصورة منفصلة.

| المجال | الاختبار الموجود | حالة التحقق في مراجعة 1.0.946 |
|---|---|---|
| فتح التطبيق Offline بعد زيارة Online | `basic-scenarios.spec.js` | موجود؛ لم يُشغّل Playwright في هذه المراجعة |
| الصلاة/القبلة Offline عند أول فتح للتبويب | `prayer-offline.spec.js` | اختبار Node البنيوي 16/16 ناجح؛ اختبار المتصفح لم يُشغّل |
| عرض الهاتف وعدم التمرير الأفقي | `mobile-storage-sw.spec.js` | موجود لمحاكاة Pixel 7 وiPhone 13؛ لم يُشغّل |
| فشل الكتابة بسبب `QuotaExceededError` | `storage-quota-regression.js` + اختبار E2E | Node 4/4 ناجح؛ E2E لم يُشغّل |
| دورة حياة Service Worker | `sw-update-lifecycle-regression.js` + اختبار E2E | Node 4/4 ناجح؛ E2E لم يُشغّل |
| التحديث الفعلي من عامل قديم إلى عامل جديد مع تبويب قديم | لا يوجد اختبار قبول كامل حاليًا | غير مثبت |
| الصوت الفعلي على أجهزة Android/iOS | لا يوجد اختبار جهاز فعلي | غير مثبت |
| GPS والبوصلة والحساسات الفعلية | اختبارات صلاحيات/واجهة فقط | يلزم اختبار جهاز فعلي |
| Safari على iOS فعليًا | WebKit محاكاة عبر Playwright فقط | غير مثبت على iPhone فعلي |
| استعادة نسخة احتياطية كبيرة تحت ضغط | لا يوجد اختبار حجم/ضغط شامل | غير مثبت |

**تمييز مهم:** اختبار `mobile-webkit` يستخدم محرك WebKit مع إعدادات جهاز iPhone 13؛ لا يساوي اختبار Safari على iOS. ومحاكاة `QuotaExceededError` لا تملأ قرص الهاتف فعليًا.

## متطلبات التثبيت

من جذر المشروع:

```bash
npm install
npx playwright install chromium
npx playwright install webkit
```

على Linux قد تحتاج إلى:

```bash
npx playwright install-deps chromium
npx playwright install-deps webkit
```

## التشغيل

```bash
# اختبارات الوحدة والانحدار (Node)
npm run test:unit

# كل اختبارات المتصفح وفق المشاريع المعرفة في playwright.config.js
npm run test:e2e

# اختبارات المتصفح الأساسية فقط
npx playwright test e2e/basic-scenarios.spec.js --project=chromium

# اختبار Offline للصلاة/القبلة
npx playwright test e2e/prayer-offline.spec.js --project=chromium

# محاكاة هاتف Android
npx playwright test e2e/mobile-storage-sw.spec.js --project=mobile-chromium

# محاكاة WebKit/iPhone
npx playwright test e2e/mobile-storage-sw.spec.js --project=mobile-webkit

# واجهة Playwright
npm run test:e2e:ui

# تشغيل مرئي
npm run test:e2e:headed
```

يشغّل Playwright خادم `serve` تلقائيًا على `http://127.0.0.1:4173` وفق الإعدادات الحالية.

## توزيع الملفات

| الملف | المسؤولية |
|---|---|
| `basic-scenarios.spec.js` | فتح التطبيق، التنقل، البحث، إعدادات العرض، النسخ الاحتياطي، Offline |
| `advanced-scenarios.spec.js` | سيناريوهات RTL والتفاعل والصلاحيات وService Worker |
| `prayer-offline.spec.js` | زيارة Online أولًا، التحقق من تخزين `prayer.js`، ثم أول فتح للصلاة/القبلة Offline |
| `mobile-storage-sw.spec.js` | محاكاة الهاتف، فشل التخزين، تسجيل/تحديث Service Worker |
| `helpers.js` | دوال مساعدة مشتركة |
| `../playwright.config.js` | المشاريع والأجهزة والمحاكاة وإعداد الخادم |

## حالة Offline الصحيحة في التطبيق

- `prayer.js` محمّل مباشرة من `index.html`، وموجود في `CORE_ASSETS` و`DYNAMIC_ASSETS` في `sw.js`. لذلك فهو ليس Lazy-loaded.
- `reader-tafsir.js` محمّل مباشرة من `index.html` وموجود في `DYNAMIC_ASSETS`؛ ليس Lazy-loaded.
- `radio-player.js` يُحمّل عند الحاجة عبر `LazyLoader`، لكنه موجود في `DYNAMIC_ASSETS` ليُخزّن مسبقًا عند نجاح طلب التخزين.
- `quran-tashkeel-dictionary.js` و`tts-diacritizer.js` يُحمّلان في الخلفية بعد تهيئة التفسير عبر `LazyLoader.loadMany`.
- ملفات `CORE_ASSETS` تُخزّن بالتتابع، ويُرفض تثبيت العامل الجديد إذا لم تكتمل. بقية `STATIC_ASSETS` و`DYNAMIC_ASSETS` تُخزّن في مرحلة Best-effort؛ فشل ملف غير Core لا يمنع تثبيت العامل.
- نجاح اختبار Offline يتطلب زيارة Online أولًا، واكتمال تسجيل/تثبيت Service Worker وتخزين الملف المطلوب. لا يعني ذلك أن البث الصوتي الخارجي أو كل مورد اختياري متاح دون إنترنت.

## الاختبارات البنيوية المرتبطة بـ Offline والتخزين والتحديث

```bash
node tests/prayer-offline-precache-regression.js
node tests/storage-quota-regression.js
node tests/sw-update-lifecycle-regression.js
npm run version:check
```

هذه الاختبارات لا تستبدل E2E. الاختبارات البنيوية تفحص الكود وشروطه، بينما E2E تتحقق من السلوك داخل المتصفح. ولا يُعلن اجتياز E2E إلا بعد تشغيل Playwright فعليًا وتسجيل النتائج.

## سياسة تسجيل النتائج

عند كل مراجعة، سجّل:
1. الأمر الذي تم تشغيله.
2. عدد الاختبارات الناجحة والفاشلة والمتخطاة.
3. اسم المتصفح/المشروع وإصدار Playwright عند تشغيل E2E.
4. أي فشل معروف مع مرجعه وسبب عدم اعتباره نجاحًا.
5. لا تصف محاكاة الجهاز بأنها اختبار جهاز فعلي.
