# Project Status

**الإصدار الحالي:** 1.0.489  
**آخر تحديث:** 2026-08-21

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

### 1.0.489 — Juz-scope quarter index: clamp starts inside the juz

- Bug: with نطاق العرض = الجزء الحالي, opening the ruku index on a page in juz 4 highlighted the 8th quarter correctly, but tapping «الربع الأول» jumped to a page still tagged juz=3 (RUB_STARTS first quarter of juz 4 = آل عمران 93 lands on a juz-3 page). Reopening the index then used curPage.juz=3 and highlighted the 8th quarter of juz 3.
- Cause: traditional rub boundaries in `RUB_STARTS` can start slightly before the first `PAGES[i].juz === N` page.
- Fix (`navigation.js` `computeJuzQuarterRows`): clamp each quarter `startIdx`/`endIdx` to `[firstPageOfJuz, lastPageOfJuz]` so navigation never leaves the display scope.
- No change to RUB_STARTS data, other scopes, or search.

### 1.0.488 — Tafsir TTS: correct pronunciation of «يا أيها»

- Bug: Aysar (and sometimes Mukhtasar) TTS read concatenated `ياأيها` with sukoon on the yāʾ before hāʾ (yā-yhā) instead of the correct أَيُّهَا (shadda + ḍamma).
- Fix (`reader-tafsir.js`):
  - New TTS-only helper `normalizeYaAyyuhaForTts` rewrites common surface forms (`ياأيها`, `يا أيها`, partial tashkeel) to `يَا أَيُّهَا`.
  - Applied on both Aysar Direct path and Mukhtasar full pipeline.
  - Display/source text never modified.
- No other TTS / settings / source changes.

### 1.0.487 — Keep-screen-awake after backup restore

- Bug: after «استعادة من ملف» when the restored settings had `keepScreenAwake: true`, the toggle showed ON but the Screen Wake Lock was not held (screen still slept). Toggling the switch off/on fixed it.
- Cause: FileReader.onload is async — user activation from the file picker expires, and any visibilitychange while the picker was open requested the lock with the *pre-restore* state (usually false).
- Fix (`settings.js`):
  - Re-request wake lock after `rehydrateFromStorage()` completes on the restore path.
  - `requestWakeLock` skips if a sentinel is already held; clearer comments on silent failure cases.
  - Factory Reset path explicitly `releaseWakeLock()` after rehydrate (defaults are off).
- No change to storage schema, backup format, or other settings.

---

### 1.0.486 — Audio mutual exclusion: Quran vs Tafsir TTS

- Only one audio source may play at a time (Quran HTMLAudioElement ↔ Tafsir speechSynthesis)
- `playQueue` (shared TTS entry) calls `AudioManager.stopListening()` before any Tafsir speech
- `playAyahAt` and `playSurahPlaylistAt` call `ReaderTafsir.stopTts()` before any Quran playback
- No UI / prefetch / playlist / repeat / TTS voice changes

---

### 1.0.485 — Tafsir TTS: pause after ornate closing bracket ﴾

- Aysar uses ﴿...﴾ (U+FD3E close), not ASCII ). Pause now applied on U+FD3E
- ASCII ) and fullwidth ） still supported

---

### 1.0.484 — Aysar letter-name TTS: match partial diacritics + ﴿﴾

- Aysar API ships ألِف / لاَم / مِيم with partial tashkeel and ornate brackets
- Letter-name matcher now allows optional diacritics between base letters and wraps ﴿ ﴾ / ( )
- Display text unchanged; Mukhtasar path untouched

---

### 1.0.483 — Tafsir TTS: pause after closing parentheses

- TTS-only: `)` and `﴾` become a short speech boundary (period) so the next word is not joined
- Applies to Mukhtasar + Aysar speak paths; display text unchanged
- No other TTS / settings / source changes

---

### 1.0.482 — Tafsir TTS rate 0.9

- سرعة نطق التفسير (المختصر + أيسر): `u.rate = 0.9` بدل 0.95
- لا تغيير آخر

---

### 1.0.481 — دمج أيسر التفاسير مع الحفاظ على المختصر كـ baseline

- BASELINE: 1.0.476 (المختصر في تفسير القرآن + TTS كامل CATT/dictionary/…)
- أُضيف: أيسر التفاسير (Quranpedia book 54) من 1.0.480 مع Direct TTS فقط
- محدد تفسير في الإعدادات (بعد نطاق التلاوة) — default = المختصر
- عزل cache و TTS state بين التفسيرين
- لا تغيير على نظام التلاوة القرآنية أو باقي الإعدادات

---

### 1.0.476 — استبعاد تلقائي شامل لـ لا/صلي من تلوين السجاوندي

- سبب الإصلاح: بعد السماح بتلوين ج على آخر كلمة (1.0.475) ظهرت مواضع ج×صلي
  لم تكن في قائمة الاستبعاد اليدوية (مثال: 111:3:4 «لَهَبٖ» في سورة المسد).
- التنفيذ: فهرس موحَّد `DEFAULT_MARK_LA_SILA_BLOCK` يُبنى من `WAQF_POSITIONS` (LA)
  و`SILA_POSITIONS` (صلي)، ويُطبَّق تلقائيًا داخل `buildDefaultWordMap` وعلى
  مسارات `shifted*` لرؤوس غير الكوفيين.
- السياسة: أي علامة من الأنواع الملوَّنة (ط/ص/م/ز/ق/قف/ج) على كلمة تحمل لا أو
  صلي → لا تُلوَّن. لا اعتماد بعد الآن على اكتمال القوائم اليدوية لهذا الغرض.
- تغطية: كل مواضع القرآن (LA ≈1475، SILA =258).

### 1.0.475 — ج على آخر كلمة في الآية (مصحف المدينة)

- تلوين علامة الوقف السجاوندي **ج** بالبني حتى لو كانت على آخر كلمة في الآية (مثل ط وم).
- مصحف المدينة فقط. باقي الأنواع (ص/ز/ق/قف) ما زالت مستبعدة على آخر كلمة.

## Completed

### 1.0.471 — Context correction: وأقسم بالخيل → وَأَقْسَمَ بِالْخَيْلِ

- Extends aqsama chain for العاديات tafsir (2–3): continuation of divine oath, not 1st person.
- Phrase-guarded (`اقسم بالخيل`); `وأقسم بالرياح` and bare `أقسم` unchanged.
- Keeps أقسم الله → أَقْسَمَ اللَّهُ from 1.0.470.

### 1.0.470 — Context correction: أقسم الله → أَقْسَمَ اللَّهُ

- Phrase-guarded only (`اقسم الله`); bare `أقسم` / `وأقسم بالرياح` unchanged.
- Fixes CATT choosing 1st-person imperfect (أُقْسِمُ) instead of past (أَقْسَمَ).
- No changes to CATT / buildInput / restoreSkeleton / Preserve / Smart Wait / IDB.

### 1.0.469 — Production: disable TTS pipeline debug overlay

- `TTS_PIPELINE_DEBUG = false` (no on-screen SOURCE/CATT/FINAL panel).
- Keeps: Smart Wait, IndexedDB, pausable warm-up, AR_WORD_RE word boundaries, Preserve SOURCE tashkeel over CATT.

### 1.0.468 — Preserve SOURCE tashkeel over CATT

- `restoreSkeleton`: if a SOURCE word already has linguistic tashkeel (`\u064B-\u065F`, `\u0670`), keep SOURCE; otherwise use CATT.
- Applied on fresh CATT results and on memory/IDB cache hits via `preserveSourceTashkeel` (heals stale bad cache without clearing IDB).
- CATT still receives full-sentence context; only the merge policy changed.
- No global override for سحب; no changes to buildInput / Smart Wait / IDB architecture.

### 1.0.467 — Contextual TTS correction: السُّحُب (clouds) vs السَّحْب

- Debug proved CATT returns `وَبِالسَّحْبِ` for 51:2 tafsir while SOURCE has damma.
- Added `TTS_CONTEXT_CORRECTIONS` + `applyTtsContextCorrections` after CATT/dict layers.
- Guarded by (surah:ayah = 51:2) OR phrase context (سحب…تحمل…الماء / الغزير) — not a global word map.
- Ambiguous root سحب elsewhere is left unchanged.
- TTS pipeline debug overlay still enabled for verification.

### 1.0.466 — TTS pipeline debug overlay (diagnosis only)

- Mobile-visible panel on Play: SOURCE / CATT (status) / FINAL TTS.
- Does not change pronunciation, CATT, or local post-processing.
- Toggle: `TTS_PIPELINE_DEBUG` in `reader-tafsir.js` (true in this build).
- Closes on Stop or via إغلاق button.
- Purpose: diagnose السُّحب and similar without desktop console.

### 1.0.465 — CATT buildInput: word boundary includes diacritics

- Root cause: `AR_WORD_RE` matched base letters only, so diacritized words split into single letters (`مُحِيَ` → `م ح ي`) before CATT.
- Fix: expand `AR_WORD_RE` so a word is base letter + optional letters/tatweel/diacritics. Shared by `buildInput` and `restoreSkeleton` (count invariant preserved).
- `stripArabicMarks`, Smart Wait, IndexedDB, warm-up pause unchanged.
- New regression: `tests/catt-buildinput-word-boundary-regression.js`.

### 1.0.464 — CATT TTS: Smart Wait + Persistent Cache + Pausable Warm-up

- **Smart Wait (1.8s):** On Play, if CATT is not cached, wait up to 1.8s for an in-flight or new CATT result before local fallback. Shared `pending[key]` avoids duplicate requests.
- **IndexedDB persistent cache:** Last 400 CATT results survive refresh/tab close. Memory → IDB (≤120ms probe) → CATT. Never blocks CATT start beyond the probe budget.
- **Warm-up order:** connection → current ruku → next → previous.
- **Pause during TTS:** ALL background CATT warm-up (including current ruku) pauses while the user is listening, so the connection stays free for the current ayah Smart Wait. Resumes when the queue drains or Stop is pressed.
- **Panel open:** `warmConnection()` fired immediately on tafsir open.
- Display text never modified; local TTS pipeline unchanged for Mushaf rendering.
- Regression: same-ayah 66, muqattaat 39, phrase-override 14, tatweel-seat 23, waqf-word-shaping 20 — all PASS.

### 1.0.446 — iOS-only tatweel-seat identity (WebKit joining)

- Baseline: v1.0.420 (includes word-level `wrapWaqfSigns`).
- On iPhone / iPad / iPadOS only: `tatweelSeatHtml` returns the seat cluster unchanged (no mid-word `.tatweel-seat` span) so Arabic shaping stays one run.
- Android and Desktop keep v1.0.420 behavior: mid-word span + CSS `scaleX(0.55)` and margins.
- Detection: iPhone/iPod/iPad UA, or MacIntel + maxTouchPoints > 1; Android UA explicitly excluded.
- No QCF overrides, no CSS/Android/Desktop/TTS changes.
- Confirmed on-device: iPhone Safari PASS, iPhone Chrome PASS.
- Regression: tatweel-seat 23/23, waqf-word-shaping 20/20, muqattaat-tts 39/39.


### 1.0.399 — دعاء الختم: لون أصلي + حجم 20.5px

- إرجاع لون `.khatm-dua-text` إلى `var(--ink)` / ليلي `#F2F2F2`.
- `font-size: 20.5px`.

### 1.0.398 — لون نص دعاء الختم = ink-soft

- `.khatm-dua-text` نهاري: `var(--ink-soft)` / ليلي: `#9A9A9E` — نفس لون `.tajweed-guide-intro` («رواية حفص عن عاصم…»).

### 1.0.397 — حجم خط دعاء ختم القرآن 21px

- `.khatm-dua-text { font-size: 21px }` (كان 20px).

### 1.0.396 — iOS/WebKit: إصلاح اتصال حروف كلمات الوقف Uthmani

- iOS/WebKit only (`@supports (-webkit-touch-callout: none)`): كلمات `.has-default-*` في مصحف المدينة تستخدم `font-size: 1em` + `transform: scale(1.1)` + `margin-inline: 0.05em` بدل `font-size: 1.1em` الذي يكسر الـshaping.
- Android/Blink دون تغيير (يبقى `font-size: 1.1em` كما في 1.0.395).
- معالج `hide-waqf-marks`. لا تغيير DOM/QCF/JS/TTS. مدعوم باختبار iPhone حقيقي.

### 1.0.395 — تفضيل صوت TTS رجالي عربي للتفسير

- اختيار الصوت العربي الأعلى تقييمًا: أسماء رجالية شائعة + `gender=male` إن وُجد + تفضيل ar-SA.
- تجنب الأصوات النسائية المعروفة بالاسم؛ بلا الاعتماد الإلزامي على خاصية gender.

### 1.0.394 — إصلاح تظليل TTS عند التبديل بين الآيات

- عند الضغط على آية أخرى أثناء التشغيل: إلغاء القراءة السابقة كان يطلق `onend` فيُزيل التظليل عن الآية الجديدة.
- `ttsGeneration` يُبطّل callbacks القديمة حتى يبقى التظليل على الآية الحالية.

### 1.0.393 — TTS: إظهار الأزرار مع وجود speechSynthesis

- إظهار أزرار TTS فور دعم Web Speech API (كما في 1.0.389) بدل الاعتماد الحصري على ظهور ar في getVoices().
- عند التشغيل: استخدام صوت عربي من القائمة إن وُجد، وإلا `lang=ar-SA` فقط دون تعيين صوت غير عربي.

### 1.0.392 — إصلاح اختفاء زر TTS رغم وجود صوت عربي

- لا يُقفل الفحص عند وصول قائمة أصوات بدون عربي مبكرًا (قد يصل ar لاحقًا).
- إعادة فحص عند فتح لوحة التفسير + polls قصيرة + `onvoiceschanged`.
- توسيع كشف الصوت العربي عبر `lang` و`name` (Arabic/عربي) دون fallback لغير عربي.

### 1.0.391 — TTS: رفع fallback timeout إلى 3000ms

- `voiceschanged` يبقى المسار الأساسي؛ لا انتظار إن وصلت الأصوات أبكر.
- شبكة أمان فقط: إعادة فحص بعد 3000ms إذا بقيت القائمة فارغة.

### 1.0.390 — TTS: إظهار أزرار التشغيل فقط عند توفر صوت عربي

- فحص `speechSynthesis` + `getVoices()` قبل إظهار أي زر TTS.
- لا يظهر الزر إن لم يوجد صوت `ar*`؛ لا disabled ولا رسالة خطأ ولا fallback لصوت غير عربي.
- دعم `voiceschanged` + إعادة فحص متأخرة حتى لا يختفي الزر خطأً على أجهزة تتأخر فيها قائمة الأصوات.
- يُطبَّق على زر الركوع الكامل وأزرار كل آية.

### 1.0.389 — TTS: volume = 1 صراحةً

- ضبط `SpeechSynthesisUtterance.volume = 1` (أقصى مستوى في Web Speech API).

### 1.0.388 — Arabic TTS لصفحة التفسير

- زر «استمع للتفسير» في رأس لوحة التفسير (تشغيل/إيقاف لكل تفسير الركوع بالتسلسل).
- أيقونة سماعة بجانب كل آية لقراءة تفسيرها فقط.
- Web Speech API مع تفضيل صوت `ar-SA` ثم أي صوت عربي.
- إيقاف تلقائي عند إغلاق اللوحة أو التنقل لركوع آخر.
- تمييز الآية الجاري قراءتها + تمرير سلس إليها.
- لا مكتبات خارجية ولا تحميلات إضافية.

### 1.0.387 — QCF manual scale لـ«الراكعين» (آل عمران 43)

- `3:43:6` في qcf-override.js و tools/qcf-words.json: `scale: 0.9`.


### 1.0.386 — إصلاح اتصال الواو في نص النسخ (3:50 و 49:10)

- آل عمران 50: `عَلَيۡكُمۡوَ جِئۡتُكُمۡ` → `عَلَيۡكُمۡ وَجِئۡتُكُمۡ` (فصل الواو عن الميم وإلحاقها بجئتكم).
- الحجرات 10: نفس نمط الخطأ `اَخَوَيۡكُمۡوَ اتَّقُوا` → `اَخَوَيۡكُمۡ وَاتَّقُوا`.


### 1.0.385 — توحيد حجم الخط وعلامات التذكير بين المصحفين

- حجم الخط مشترك (المدينة + النسخ): أزرار +/- والـpinch يحدّثان المفتاحين معًا.
- إظهار/إخفاء علامات تذكير الوقف مشترك على المصحفين.
- مفاتيح التخزين القديمة تبقى متزامنة للتوافق مع Backup.
- ترحيل عند التحميل: توحيد أي اختلاف قديم لصالح قيم المدينة.


### 1.0.383 — إيقاف التلاوة عند Factory Reset

- قبل `factoryReset` + rehydrate: استدعاء `AudioManager.stopListening()` فقط في مسار Factory Reset.
- لا تشغيل تلقائي للقارئ الافتراضي؛ Restore غير متأثر.

### 1.0.382 — رسائل فشل rehydrate

- `.catch()` بعد Restore: «تعذّرت استعادة النسخة الاحتياطية»
- `.catch()` بعد Factory Reset: «تعذّرت إعادة ضبط التطبيق»

### 1.0.381 — إصلاح lifecycle لـ Restore / Factory Reset

- مسار مستقل `rehydrateFromStorage()`: لا `applyAll`، لا رسم مزدوج، لا `location.reload`.
- `applyFontChrome()` للـ CSS/classes/marks/size بدون `renderPage`.
- `applyFontSize({skipQcfFit:true})` أثناء rehydrate لتجنّب قياس QCF على DOM قديم.
- `waitForCurrentQuranFont()` عبر `document.fonts.load` لأسماء `@font-face` الفعلية (`Uthmanic Hafs` / `PDMS Saleem QuranFont`) + timeout آمن.
- رسم واحد بعد جاهزية الخط → `onAfterRender` الطبيعي.
- `btnFactoryReset` بدل `btnClearAllReminders`.
- اختبارات: `tests/rehydrate-runtime-regression.js` (26 PASS).

### 1.0.380 — إعادة ضبط التطبيق (Factory Reset)

- زر الإعدادات: «إعادة ضبط التطبيق» بدل «حذف جميع علامات التذكير».
- `StorageManager.factoryReset()` يمسح كل مفاتيح بيانات المستخدم ثم يعود للـdefaults (مع rollback عند الفشل).
- حوار تأكيد: إلغاء | إعادة الضبط.
- بعد النجاح: تحديث runtime عبر `applyRestoredDataToRuntime`.
- حُذف `ReaderReminders.clearAllMarks`.
- الاختبارات: 53 PASS في backup-restore (يشمل factory reset).

### 1.0.379 — تقليل المسافات الرأسية بين أقسام الإعدادات

- `.settings-divider` margin: من `18px 10px` إلى `12px 10px` (قبل: القارئ، نطاق العرض، نطاق التلاوة، التكبير، النسخ الاحتياطي، …).

### 1.0.378 — إزالة نسبة القراءة وإعادة الضبط من الإعدادات فقط

- حذف عنصر «نسبة القراءة» وزر «إعادة ضبط تقدّم القراءة» من Settings.
- حذف `Home.resetProgress` وربطها في settings، ومراجع DOM في app.js، وسطر تحديث `settingsProgress` في `updateProgressUI`.
- **لم يُمس:** تخزين التقدم (`lastPageShared` / furthest / page)، الشاشة الرئيسية، Backup/Restore، `.reset-btn` (ما زال لزر حذف علامات التذكير).

### 1.0.377 — إزالة وصف قسم النسخ الاحتياطي

- حذف سطر «حفظ واستعادة بياناتك وإعداداتك» من الإعدادات (العنوان كافٍ).

### 1.0.376 — رسالة نجاح النسخ الاحتياطي

- Toast بعد التنزيل: «تم الحفظ في مجلد التنزيلات».

### 1.0.375 — اسم فريد لملف النسخة الاحتياطية

- اسم التنزيل: `Mushaf_Al-Ruku_Backup_YYYY-MM-DD_HH-mm-ss.json` (توقيت الجهاز).
- التنزيل يبقى عبر آلية المتصفح الطبيعية (`<a download>`).
- Toast بعد النجاح يعرض اسم الملف.

### 1.0.374 — نسخ احتياطي كامل واستعادة آمنة

- ملف JSON مستقل (`full-backup`, `schemaVersion: 1`) يشمل: الإعدادات والتقدم، المفضلة، علامة القراءة، علامات التذكير للرسمين.
- استعادة: استبدال القسم إن وُجد في الملف فقط؛ الأقسام الغائبة تُترك كما هي.
- فشل التطبيق → rollback كامل للحالة السابقة (لا حالة جزئية).
- دعم ملفات `reminder-marks` القديمة (merge).
- واجهة الإعدادات: عنوان «النسخ الاحتياطي والاستعادة» + وصف؛ زر الحذف الأحمر يبقى لعلامات التذكير فقط.
- اختبارات: `tests/backup-restore-regression.js` (38 PASS).

### 1.0.373 — تصغير رقم الآية ودائرته في المفضلة سنة صغيرة

- `.fav-ayah-num`: `font-size` من 16px إلى 15px (الدائرة 1.5em تتبع تلقائيًا).
- المسافة عن «آية» والباقي بلا تغيير.

### 1.0.372 — زيادة المسافة بين «آية» ودائرة رقم الآية في المفضلة

- `.fav-ayah-num`: إضافة `margin-inline-start: 0.25em` لفصل بسيط عن كلمة «آية».
- لا تغيير في حجم الرقم أو الدائرة أو باقي التخطيط.

### 1.0.371 — ربط تلوين خلاف روضة الحفاظ بمفتاح علامات التذكير

- مواضع الخلاف (البنفسجي) كانت تظهر دائمًا بغض النظر عن مفتاح «علامات تذكير الوقف».
- الآن: `applyKhilafHighlightVisibility` يضيف/يزيل `body.show-khilaf-highlight` حسب نفس المفتاح.
- عند إيقاف الإعداد: يختفي البنفسجي + نجوم التذكير + تلوين السجاوندي معًا.
- عند تفعيله: يعود البنفسجي مع بقية العلامات.

### 1.0.370 — تقليل المسافة الرأسية بين عناصر المفضلة

- `.fav-item` padding: من `14px 12px` إلى `12px 12px` (أعلى/أسفل فقط؛ الأفقي يبقى 12px).
- لا تغيير في أحجام النصوص أو الدائرة أو ترتيب العناصر.

### 1.0.369 — تكبير اسم السورة وكلمة «آية» في المفضلة إلى 20px

- `.fav-item .fav-sub`: من 18px إلى 20px (اسم السورة + «آية»).
- رقم الآية `.fav-ayah-num` يبقى 16px بوزن طبيعي ودائرة CSS كما هي (لا تغيير).
- لا تغيير في ترتيب العناصر أو حجم صف المفضلة أو زر الحذف.

### 1.0.368 — رقم الآية في المفضلة 16px مع دائرة متناسبة

- `.fav-ayah-num`: `font-size: 16px`، دائرة `1.5em`، `font-weight: normal`، دائرة CSS واحدة فقط.

### 1.0.367 — رقم الآية في المفضلة 18px مع دائرة متناسبة

- `.fav-ayah-num`: `font-size: 18px`، دائرة `1.5em`، `font-weight: normal`، دائرة CSS واحدة فقط.

### 1.0.366 — رقم الآية في المفضلة 19px مع دائرة متناسبة أصغر قليلًا

- `.fav-ayah-num`: `font-size: 19px` (بدل 20)، دائرة `1.55em`، `font-weight: normal`، `font-ui` (دائرة CSS واحدة فقط).

### 1.0.365 — دائرة واحدة فقط حول رقم الآية في المفضلة

- السبب: `font-quran` (Uthmanic Hafs) يرسم دائرة زخرفية مدمجة حول الأرقام + `border` CSS = دائرتان.
- `.fav-ayah-num`: `font-family: var(--font-ui)` + `font-weight: normal` + `font-size: 20px` + دائرة CSS واحدة مفرغة.
- لا SVG ولا تضمين علامة آية. اسم السورة و«آية» وزر الحذف بلا تغيير.

### 1.0.364 — رقم الآية في المفضلة: 20px بوزن طبيعي ودائرة متناسبة

- إزالة `font-weight: 700` و`font-family: var(--font-ui)` من `.fav-ayah-num` — الوزن والخط موروثان من `.fav-sub`.
- الدائرة `1.55em` مع `border-radius: 999px` لتسع الأرقام الثلاثية دون ملامسة الحافة.

### 1.0.363 — تكبير رقم الآية في المفضلة 18→20px مع دائرة متناسبة

- رقم الآية داخل `.fav-sub` غُلّف بـ `.fav-ayah-num`: `font-size: 20px` ودائرة `1.45em` (~+11% عن مقاس الرقم السابق).
- اسم السورة وكلمة «آية» وارتفاع الصف وزر الحذف بلا تغيير.

### 1.0.362 — تكبير أيقونة حذف المفضلة 18→20px

- SVG زر `.fav-remove` في قائمة المفضلة: من 18px إلى 20px (+2px).

### 1.0.361 — تكبير أيقونات `.icon-btn` 20→22px

- `.icon-btn svg`: من 20px إلى 22px (الفهرس والإغلاق والشريط العلوي…).
- دائرة الزر تبقى 40×40 بلا تغيير.

### 1.0.360 — تكبير أيقونات أزرار الصفحة الأربعة 17→19px

- `.fav-btn` / `.bookmark-btn` / `.listen-btn` / `.tafsir-btn` svg: من 17px إلى 19px.
- أبعاد الأزرار (34×34) والـborder والمواضع بلا تغيير.

### 1.0.359 — إصلاح تداخل سهم Dropdown مع النص في الإعدادات (بعد Chrome)

- السبب: `.reciter-select` كان يستخدم `padding: 7px 30px 7px 12px` (مساحة السهم على اليمين) بينما السهم المخصص مرسوم على اليسار (`left 8px`) في واجهة RTL — فتداخل السهم مع النص بعد تغيير rendering في Chrome.
- الإصلاح المشترك لكل الـselects (نطاق العرض، تكرار الركوع/الآية، السرعة، نطاق التلاوة، القارئ): `padding-inline-start/end` منطقي + الإبقاء على السهم المخصص عند `left` (inline-end في RTL).
- بدون تغيير حجم الخط أو أبعاد الحقول أو ألوان التصميم.

### 1.0.358 — دائرة رقم الآية بـ CSS border بدل SVG stroke (سمك 1.8px)

- رؤوس الآيات بدون سجاوندي (`.ayah-num-circle`): الحلقة تُرسَم بـ `::before` و`border: 1.8px solid currentColor` بدل SVG `<circle>` + `stroke` + `vector-effect="non-scaling-stroke"`.
- القطر ≈ 75% من الحاوية (مكافئ r=15 في viewBox 40×40)؛ الرقم وحجمه وموضعه بلا تغيير.
- النجمة و`no-sajawandi-heads` وعلامة الركوع `(ع)` ونص القرآن بلا تغيير.
- الهدف: ثبات بصري أمام تحديثات Chrome/Android بدل الاعتماد على سماكة SVG stroke.

### 1.0.357 — استثناء «آخر كلمة» مُلغى للوقف المطلق ط فقط

- ط تُلوَّن حتى على آخر كلمة في الآية (مثل الفاتحة: الدين / نستعين).
- ص، ز، ق، قف، ج: ما زالت لا تُلوَّن إذا وقعت على آخر كلمة.
- م بلا هذا الاستثناء أصلًا.

### 1.0.356 — إظهار علامات السجاوندي على آخر كلمة في الآية (مصحف المدينة)

- إصلاح: ط على «الدين» و«نستعين» في الفاتحة (وغيرها) كانت مخفية بسبب قاعدة «لا تُلوَّن آخر كلمة».
- أُلغي الاستثناء لكل أنواع السجاوندي الافتراضية حتى يتوافق تلوين المدينة مع ظهور العلامة في مصحف النسخ.

### 1.0.355 — منع Select text / Dictionary على عنوان الصفحة الرئيسية

- `.home-brand` وعنوانه وشرحه: `user-select: none`.
- `isMushafPageTarget` يشمل `#homeScreen` / `.home-brand`.

### 1.0.354 — لون علامة قف السجاوندي بني في مصحف المدينة

- `has-default-qif`: من الأزرق (#1565C0) إلى البني (#A9793B)، وليليًا #C9A06A.
- ط يبقى أزرقًا. Popup الضغط المطوّل لـ«قف» يعرض بنيًا أيضًا.

### 1.0.353 — تخفيف إضافي لـ Haptic feedback

- مدة الاهتزاز الافتراضية من 5ms إلى 3ms.

### 1.0.352 — تخفيف إضافي لـ Haptic feedback

- مدة الاهتزاز الافتراضية من 8ms إلى 5ms.

### 1.0.351 — Haptic على نتائج البحث وصفوف الفهرس وزر مسح

- توسيع `isInteractive` ليشمل `.index-item` و `.search-result-item` و `.fav-item` وبطاقة علامة القراءة.
- مستمع النقر في مرحلة capture حتى يعمل حتى مع `stopPropagation`.

### 1.0.350 — تخفيف شدة Haptic feedback

- مدة الاهتزاز الافتراضية من 12ms إلى 8ms.

### 1.0.349 — إصلاح صندوق البحث بعد Haptic / user-select

- إزالة `user-select:none` عن `.panel` و `.panel-body` (كانت تمنع التركيز على حقول الإدخال في Chrome Android).
- تأكيد `user-select:text` + `pointer-events:auto` على كل حقول النص.
- مستمع Haptic لا يمس حقول الإدخال؛ يعمل في مرحلة bubble وليس capture.
- `isMushafPageTarget` يستثني `#searchInput` / `#searchInputRow` ولا يغطي `.panel` بشكل أعمى.

### 1.0.348 — تعميم Haptic feedback على الأزرار والقوائم

- `wireGlobalHaptics()` في `UI.init`: اهتزاز عند النقر على أي زر (الرئيسية، حفظ/استعادة، تنقّل، …) وعند تغيير `select` أو مفتاح تبديل.
- Debounce 40ms حتى لا يتكرر الاهتزاز مع الاستدعاءات الفردية السابقة.

### 1.0.347 — Haptic feedback في الإعدادات

- `UI.haptic()` عبر Vibration API (نبضة ~12ms).
- يعمل عند أزرار حجم الخط (+/−)، اختيار رسم المصحف، ومفاتيح التبديل (ليل، علامات تذكير، تكبير، إبقاء الشاشة).
- كذلك عند تغيير القارئ / نطاق التلاوة / التمرير التلقائي / السرعة / التكرار.

### 1.0.346 — تكبير سطر المرجع في المفضلة (سورة • آية)

- `.fav-item .fav-sub`: من 15px إلى 18px (مثل «البقرة • آية ٨٣»).

### 1.0.345 — منع التحديد وGoogle Dictionary في كل اللوحات (شامل المفضلة)

- حماية عامة على `.panel` / `.panel-body` / `.empty-state` / `.fav-item`.
- الإبقاء على التحديد داخل `input` و `textarea` فقط.
- توسيع `isMushafPageTarget` ليشمل المفضلة والبحث والإعدادات والدليل والفهرس.
- يغطي نص «لا توجد عناصر في المفضلة بعد» وكل النصوص الثابتة داخل اللوحات.

### 1.0.344 — منع التحديد وGoogle Dictionary في لوحة التفسير

- `user-select: none` على `.tafsir-text` و `.tafsir-ayah-head` و `#tafsirPanel .panel-body`.
- توسيع `isMushafPageTarget` ليشمل `#tafsirPanel` ومحتوى التفسير.
- يمنع Copy/Share/Select-all و Touch-to-Search عند الضغط المطوّل على نص التفسير (Chrome Android 16).

### 1.0.343 — منع التحديد وGoogle Dictionary على عناوين الأجزاء في الفهرس

- `user-select: none` على `.index-juz-header` و `.juz-header` (الجزء N في فهرس السور/الأجزاء).
- توسيع `isMushafPageTarget` في `gestures.js` ليشمل عناوين الأجزاء وصفوف الفهرس وقوائم الوقف.
- إضافة العناوين للقائمة العامة المانعة للتحديد في `style.css`.

### 1.0.342 — منع Google Dictionary أثناء الضغط المطوّل (Chrome Android 16)

- `killSelectionDuringPress` في `Gestures.longPress`: مسح التحديد كل 16ms طوال مدة الضغط على كلمة مصحف.
- مسح التحديد عند فتح نافذة نوع الوقف وبعدها (0ms / 80ms).
- `user-select: none` على `.waqf-menu` و`.waqf-info-popup` وكل الأبناء.
- `touch-action: pan-y` على `.ayah-flow` + إخفاء `::selection`.
- الضغط المطوّل لعرض نوع الوقف يبقى يعمل.

### 1.0.341 — تقوية منع التحديد وGoogle Dictionary على علامات السجاوندي

- فرض `user-select: none !important` على `.quran-word` وكل الأبناء و`.waqf-sign` و`.ayah-block` (الكلمات الملوّنة بعلامات الوقف الافتراضية كانت لا تزال تفتح القاموس عند النقر).
- `selectstart` في مرحلة capture + إيقاف الانتشار.
- مسح التحديد عند `touchend` / `mouseup` / `click` مع تأخير إطارين (0ms و 50ms) لأن بعض إصدارات Chrome على أندرويد تُنشئ التحديد بعد انتهاء المعالج.
- منع `contextmenu` على منطقة المصحف في مرحلة capture.
- الضغط المطوّل لعرض نوع الوقف (ج وقف جائز، …) يبقى يعمل عبر `Gestures.longPress`.

### 1.0.340 — منع Google Dictionary عند النقر على صفحة المصحف

- توسيع `user-select: none` على `.page-frame` و `.page-scroll` (وليس فقط `.ayah-flow`).
- توسيع مستمع `selectstart` في `gestures.js` ليشمل `.page-scroll` و `.page-frame`.
- إضافة مستمع `selectionchange` يمسح أي تحديد يظهر داخل منطقة الصفحة فورًا.
- الهدف: منع ظهور شريط Google Dictionary / Smart Text Selection عند النقر أو الضغط على أي جزء من صفحة المصحف على أندرويد.

### 1.0.339 — QCF: Manual Scale لـ وجزؤا (42:40)

- وَجَزَـٰٓؤُاْ (42:40:0): scale 0.9
- marginFactor يبقى الافتراضي العام 1.06.
- لا تأثير على أي كلمة أخرى.

### 1.0.338 — QCF: Manual Scale لـ والذاكرات (33:35)

- وَٱلذَّـٰكِرَٰتِ (33:35:23): scale 0.85
- marginFactor يبقى الافتراضي العام 1.06.
- لا تأثير على أي كلمة أخرى.

### 1.0.337 — QCF: Manual Scale لـ والذاكرين (33:35)

- وَٱلذَّـٰكِرِينَ (33:35:20): scale 0.85
- marginFactor يبقى الافتراضي العام 1.06.
- لا تأثير على أي كلمة أخرى.

### 1.0.336 — QCF: Manual Scale لـ للذاكرين والذاريات

- لِلذَّـٰكِرِينَ (11:114:13): scale 0.9
- وَٱلذَّـٰرِيَٰتِ (51:1:0): scale 0.9
- marginFactor يبقى الافتراضي العام 1.06.

### 1.0.335 — QCF Override: للذاكرين + الذاريات + الذاكرين/ات + وجزؤا

- لِلذَّـٰكِرِينَ: 11:114:14
- وَٱلذَّـٰرِيَٰتِ: 51:1:1
- وَٱلذَّـٰكِرِينَ: 33:35:21
- وَٱلذَّـٰكِرَٰتِ: 33:35:24
- وَجَزَـٰٓؤُاْ: 42:40:1
- مَرَّـٰتٖۚ (24:58:14) كانت مضافة مسبقًا.
- كلها Auto Scale فقط.

### 1.0.334 — QCF Override: للأوابين (17:25)

- موضع واحد: 17:25:11 (لِلۡأَوَّـٰبِينَ) — Auto Scale فقط، بلا Manual Override.
- إضافة إلى qcf-words.json + إعادة بناء qcf-merged.woff2.

### 1.0.333 — QCF: Manual Scale لـ لَأَوَّـٰهٌ (9:114)

- scale: 0.9 للموضع 9:114:20 فقط.
- marginFactor يبقى الافتراضي العام 1.06.
- لا تأثير على أي كلمة أخرى.

### 1.0.332 — QCF Override: لأواه (9:114)

- موضع واحد: 9:114:21 (لَأَوَّـٰهٌ) — Auto Scale فقط، بلا Manual Override.
- إضافة إلى qcf-words.json + إعادة بناء qcf-merged.woff2.

### 1.0.331 — QCF Override: فالزاجرات + قوامين

- فَٱلزَّـٰجِرَٰتِ: 37:2:1 — Auto Scale فقط.
- قَوَّـٰمِينَ: 4:135:5 و 5:8:5 — Auto Scale فقط.
- إضافة إلى qcf-words.json + إعادة بناء qcf-merged.woff2.

### 1.0.330 — QCF Override: طوافون (24:58)

- موضع واحد: 24:58:37 (طَوَّـٰفُونَ) — Auto Scale فقط، بلا Manual Override.
- إضافة إلى qcf-words.json + إعادة بناء qcf-merged.woff2.

### 1.0.329 — QCF Override: ذلك (7:176 فقط)

- موضع واحد: 7:176:21 (ذَّـٰلِكَ) — Auto Scale فقط، بلا Manual Override.
- إضافة إلى qcf-words.json + إعادة بناء qcf-merged.woff2.

### 1.0.328 — QCF Override: جزؤه في 12:75 (قالوا جزاؤه)

- موضع 12:75:2 (جَزَـٰٓؤُهُۥ) — Auto Scale فقط.
- الموضع 12:75:8 (جَزَـٰٓؤُهُۥۚ) كان مضافًا مسبقًا.

### 1.0.327 — QCF Override: جزؤه (12:74)

- موضع واحد: 12:74:3 (جَزَـٰٓؤُهُۥٓ) — Auto Scale فقط، بلا Manual Override.
- إضافة إلى qcf-words.json + إعادة بناء qcf-merged.woff2.

### 1.0.326 — QCF Override: جزؤا (كل المواضع)

- 3 مواضع لـ جَزَـٰٓؤُاْ: 5:29، 5:33، 59:17 — Auto Scale فقط.
- وَجَزَـٰٓؤُاْ في 42:40 لم تُدرج (صيغة مختلفة بواو العطف).

### 1.0.325 — QCF Override: تراءا (26:61)

- موضع واحد: 26:61:2 (تَرَـٰٓءَا) — Auto Scale فقط، بلا Manual Override.
- إضافة إلى qcf-words.json + إعادة بناء qcf-merged.woff2.

### 1.0.324 — QCF Override: أواه (11:75)

- موضع واحد: 11:75:4 (أَوَّـٰهٞ) — Auto Scale فقط، بلا Manual Override.
- إضافة إلى qcf-words.json + إعادة بناء qcf-merged.woff2.
- ملاحظة: صيغة 9:114 (أَوَّـٰهٌ / لَأَوَّـٰهٌ) مختلفة ولم تُدرج.

### 1.0.323 — QCF: تعديل Manual Scale لـ ٱلزَّـٰهِدِينَ (12:20)

- scale: 0.85 + margin_factor: 1.0 للموضع 12:20:8 فقط.
- لا تأثير على أي كلمة أخرى.

### 1.0.322 — QCF: Manual Scale لـ ٱلزَّـٰهِدِينَ (12:20)

- scale: 0.8 للموضع 12:20:8 فقط.
- marginFactor يبقى الافتراضي العام 1.06.
- لا تأثير على أي كلمة أخرى.

### 1.0.321 — QCF Override: الزاهدين (12:20)

- موضع واحد: 12:20:9 (ٱلزَّـٰهِدِينَ) — Auto Scale فقط، بلا Manual Override.
- إضافة إلى qcf-words.json + إعادة بناء qcf-merged.woff2.

### 1.0.320 — QCF Override: الزارعون (56:64)

- موضع واحد: 56:64:5 (ٱلزَّـٰرِعُونَ) — Auto Scale فقط، بلا Manual Override.
- إضافة إلى qcf-words.json + إعادة بناء qcf-merged.woff2.

### 1.0.319 — QCF: تعديل marginFactor لـ ٱلرَّـٰكِعُونَ (9:112)

- scale: 0.85 + margin_factor: 1.0 للموضع 9:112:4 فقط.
- لا تأثير على أي كلمة أخرى.

### 1.0.318 — QCF: تعديل Manual Scale لـ ٱلرَّـٰكِعُونَ (9:112)

- scale: 0.85 + margin_factor: 1.02 للموضع 9:112:4 فقط.
- لا تأثير على أي كلمة أخرى.

### 1.0.317 — QCF: Manual Scale لـ ٱلرَّـٰكِعُونَ (9:112)

- scale: 0.81 للموضع 9:112:4 فقط (≈ +3% فوق تقدير Auto Scale ≈0.786).
- marginFactor يبقى الافتراضي العام 1.06 (بلا تخصيص).
- لا تأثير على أي كلمة أخرى.

### 1.0.316 — QCF Override: الراكعون (9:112)

- موضع واحد: 9:112:5 (ٱلرَّـٰكِعُونَ) — Auto Scale فقط، بلا Manual Override.
- إضافة إلى qcf-words.json + إعادة بناء qcf-merged.woff2.

### 1.0.315 — QCF Override: الراشدون (49:7)

- موضع واحد: 49:7:28 (ٱلرَّـٰشِدُونَ) — Auto Scale فقط، بلا Manual Override.
- إضافة إلى qcf-words.json + إعادة بناء qcf-merged.woff2.

### 1.0.314 — QCF: Manual Scale لـ ٱلرَّـٰزِقِينَ (5:114)

- scale: 0.9 للموضع 5:114:21 فقط (ٱلرَّـٰزِقِينَ).
- بقية مواضع الرزقين تبقى Auto Scale.

### 1.0.313 — QCF: فصل مسؤوليات Observer

- MutationObserver(childList): fitAllGlyphs فقط.
- onAfterRender: المصدر الوحيد لـ applyOverrides بعد renderPage.
- bodyObserver دون تغيير.

### 1.0.312 — QCF: applyOverrides متزامن قبل أول paint

- استدعاء `applyOverrides` من `onAfterRender` (نفس دورة renderPage).
- يمنع flicker النص الأصلي عند العودة من الرئيسية.
- `scheduleFitAllGlyphs` يبقى فقط لإعادة القياس بعد تغيير الحجم.

### 1.0.311 — QCF Override: الرزقين (كل المواضع)

- 5 مواضع لـ ٱلرَّـٰزِقِينَ: 5:114، 22:58، 23:72، 34:39، 62:11.
- Auto Scale فقط. (بِرَٰزِقِينَ في 15:20 ليست نفس الصيغة فلم تُدرج.)

### 1.0.310 — QCF: إعادة قياس بعد تغيير حجم الخط

- `scheduleFitAllGlyphs()`: double-rAF + coalescing بعد تغيّر `--ayah-size`.
- `applyFontSize()` يستدعيها بدل الاكتفاء بـ MarkPlacementEngine.
- يمنع بقاء width/scale القديمة على كلمات QCF (أول/آخر السطر).

### 1.0.309 — الرحمين: Manual Scale لـ 21:83 و 23:118

- scale: 0.8 + margin_factor: 1.02 للموضعين فقط (جليف QCF يدمج رقم الآية).
- بقية مواضع الرحمين تبقى Auto Scale.

### 1.0.308 — QCF Override: الرحمين (كل المواضع)

- 6 مواضع لـ ٱلرَّـٰحِمِينَ: 7:151، 12:64، 12:92، 21:83، 23:109، 23:118.
- Auto Scale فقط، بلا Manual Override.

### 1.0.307 — QCF Override: الخرّاصون (51:10:2)

- الموضع الوحيد في المصحف لكلمة ٱلۡخَرَّـٰصُونَ.
- Auto Scale فقط، بلا Manual Override.

### 1.0.306 — QCF Override: جزاؤه (12:75:8)

- موضع واحد في `qcf-words.json` + إعادة بناء الخط — Auto Scale فقط.
- الكلمة تحمل ۚ مضمّنة؛ تُعالَج تلقائيًا عبر استخراج العلامة النقية من `.waqf-sign`.

### 1.0.305 — QCF: وراثة لون السجاوندي الافتراضي

- `.qcf-override-glyph { color: inherit }` بدل `var(--ink)` حتى يرث لون `has-default-jeem` / `has-default-waqf` وغيرها من الأب.
- ليلاً: فرض لون الليل فقط للكلمات التي بلا تلوين سجاوندي خاص.

### 1.0.304 — QCF + waqf-sign: استخراج العلامة النقية فقط

- عند تطبيق QCF Override على كلمة تحمل `.waqf-sign`: نستخرج حروف العلامة النقية فقط (U+06DA وغيرها) ونترك حروف القاعدة تذهب للطبقة المخفية.
- يمنع الرسم المزدوج للحرف الأخير الذي كان يفسد شكل «مرات» ويجعلها لا تطابق مصحف المدينة.
- الموضع 24:58:14 ما زال Auto Scale فقط.

### 1.0.303 — QCF مرات: جليف كامل + علامة سجاوندي

- إصلاح استخراج COLR: استخدام الجليف الأساسي (outline الكامل) بدل أي طبقة لون منفردة — يمنع الرسوم الناقصة.
- whitelist: الإبقاء على إضافة `.waqf-sign` في applyOverrides حتى تظهر علامة الجيم بحجمها ولونها.
- الموضع 24:58:14 فقط، Auto Scale، بدون Manual.

### 1.0.302 — QCF: مرات (24:58) + إصلاح علامة السجاوندي + دمج الطبقات الداكنة

- إضافة موضع 24:58:14 (مرات) — Auto Scale فقط.
- whitelist في applyOverrides: إضافة `.waqf-sign` حتى لا تختفي علامة الجيم السجاوندية الأصلية المضمّنة في الكلمة.
- build_qcf_font.py: دمج كل الطبقات الداكنة (أسود/شبه أسود) عند استخراج جليف COLR بدل الطبقة السوداء الصرفة فقط — يمنع الرسوم الناقصة لبعض الكلمات.

### 1.0.301 — QCF Override: مرات (24:58)

- موضع واحد في `qcf-words.json` + إعادة بناء الخط — Auto Scale فقط.
- الكلمة: مَرَّـٰتٖۚ (position 14, page 357, codepoint FCA9).

### 1.0.298 — QCF Override: التوابين (2:222)

- موضع واحد في `qcf-words.json` + إعادة بناء الخط — Auto Scale فقط.

### 1.0.297 — إقلاب: وزن أوضح قليلًا

- `.iqlab-mark`: `-webkit-text-stroke: 0.028em currentColor` + `paint-order: stroke fill`.

### 1.0.296 — تكبير علامة الإقلاب ~14%

- `.iqlab-mark` font-size: 0.42em → 0.48em؛ الموضع (top/vertical-align/margin) دون تغيير.

### 1.0.295 — البحث: مطابقة عابرة لحدود الآيات المتجاورة

- في `searchAyahs`: إن لم تطابق الآية منفردة، تُختبر مع الآية التالية (نفس السورة) كنص موصول؛ النتيجة تُنسب للآية الأولى دون تكرار.

### 1.0.294 — البحث: استثناء ن/ص/ق من حد الحرفين

- في `navigation.js` فقط: السماح بالبحث بحرف واحد إن كان ن أو ص أو ق، مع تفعيل المطابقة التامة تلقائيًا.

### 1.0.293 — QCF: جليف أحادي من v4 غير ملوّن (إصلاح السمك)

- السبب: خطوط التجويد (COLR) عند فرض mono عبر font-palette ترسم الطبقات فوق بعضها → سمك زائد.
- الحل: البناء من QCF v4 غير الملوّن؛ اللون من CSS (`color` / night).

### 1.0.292 — QCF Override: الراسخون (3:7 و 4:162)

- إضافة موضعين فقط إلى `qcf-words.json` ثم إعادة بناء `qcf-merged.woff2` و`qcf-override.js`.
- Auto Scale فقط — بلا Manual Override.

### 1.0.291 — دليل القارئ: توحيد لون رأس غير الكوفيين ليليًا

- `body.night .waqf-guide-symbol.waqf-symbol-non-kufi` → `#F2F2F2` (نفس باقي رموز الدليل).

### 1.0.290 — QCF Manual Override: الراكعين (2:43)

- `scale: 0.85`، `marginFactor: 1.02` في `qcf-words.json` و`qcf-override.js`.

### 1.0.289 — QCF Override: لون ليلي مطابق لنص الآية

- السبب: `--qcf-mono-black` يفرض أسودًا على كل مداخل CPAL → كلمات QCF
  (مثل إسرائيل 2:40 وكل مواضع `qcf-words`) تظهر بلون خاطئ في الوضع الليلي.
- الإصلاح: لوحة `--qcf-mono-night` بـ `#F2F0EA` (نفس `body.night .ayah-flow`)
  تُطبَّق على `.qcf-override-glyph` تحت `body.night` — يشمل كل الجدول.

### 1.0.288 — تخفيف سمك دائرة رأس الآية −10%

- `.ayah-num-outer-circle` stroke-width: 2 → **1.8** (بكسل شاشة عبر non-scaling-stroke).

### 1.0.287 — دائرة رأس الآية r=15

- نصف قطر دائرة رأس الآية: 16 → **15**.

### 1.0.286 — دائرة رأس الآية أكبر بصريًا + لون دليل غير الكوفيين

- نصف قطر دائرة رأس الآية: 14 → **16** (توازن بصري مع بروز رؤوس النجمة، لا مساواة هندسية فقط).
- رمز رأس غير الكوفيين في دليل علامات الوقف: `#2E7D32` / ليلي `#43A047` (نفس `.non-kufi-mark.mark-green` كما في الفاتحة 7 عليهم الأولى).

### 1.0.285 — دليل القارئ: لون رأس غير الكوفيين = أخضر الدليل

- رمز رأس غير الكوفيين في علامات الوقف بلون `var(--emerald)` مثل بقية الرموز (ليلي `#F2F2F2`).

### 1.0.284 — دليل القارئ: دمج ملحوظة الدائرة + موضع/حجم غير الكوفيين

- جملة الدائرة المتصلة مدمجة في فقرة رأس الآية بلا كلمة «ملحوظة» ولا سطر جديد.
- بند رأس غير الكوفيين بعد علامة الركوع، ورمز أصغر قليلًا (18px).

### 1.0.283 — دليل القارئ: ضبط نص الملحوظة + لون رأس غير الكوفيين

- ملحوظة رأس الآية: «تُرسَم الدائرة متصلة في صفحة الركوع للدلالة على الوقف التام.»
- رمز رأس غير الكوفيين في الدليل بلون حبر المصحف (نهاري `--ink`).
- جملتا شرح غير الكوفيين في فقرة واحدة متصلة.

### 1.0.282 — دليل القارئ: رأس الآية + رأس غير الكوفيين

- ملحوظة الدائرة المتصلة (وقف تام لجميع القراء) في بند رأس الآية.
- بند جديد «رأس الآية لغير الكوفيين» بنفس مسار SVG المستخدم في الصفحة (لا Unicode بديل)، مع توضيح اللون الأخضر = الوصل أولى.

### 1.0.281 — دائرة فوق الرقم فقط؛ النجمة كما كانت

- إطار **الدائرة** فقط (`ayah-num-circle`) فوق الرقم (`z-index:2`).
- **النجمة** تبقى تحت الرقم (السلوك السابق قبل 1.0.280).
- فئة `ayah-num-circle` تُضاف في `ayahMarker` وتُزامَن في `refreshAyahMarkerShapes`.

### 1.0.280 — رقم الآية: إطار النجمة/الدائرة فوق الرقم

- `.ayah-num svg` أصبح `z-index:2` فوق `<span>` الرقم (`z-index:1`).
- كلا الشكلين (نجمة ودائرة) أصلًا `fill="none"` فالإطار فقط فوق الأرقام؛ الوسط شفاف والرقم يبقى ظاهرًا.
- بلا تغيير في الحجم أو اللون أو منطق اختيار نجمة/دائرة (`no-sajawandi-heads`).

### 1.0.279 — تنظيف نهائي: إزالة كل أثر لنظام الوقف الهبطي

- حذف كامل للكود والبيانات والاختبارات والأدوات والتوثيق المتعلقة بالوقف الهبطي.
- تنظيف سجل الحالة وسجل التغييرات من إدخالات التطوير التاريخية لهذا النظام.
- لا يبقى أي ملف أو إشارة تشغيلية لهذا النظام في المشروع.

### 1.0.278 — إزالة نظام الوقف الهبطي من التطبيق

- أُزيل العرض (تلوين/نجمة/نافذة/دليل القارئ) وكل ملفات البيانات المرتبطة.

### 1.0.277 — إصلاح دائرة رؤوس الآيات بلا علامة سجاوندي (PUA)

- كانت آيات مثل النازعات 27/29/31 تُرسم بدائرة متصلة رغم وجود علامة وقف
  سجاوندي من رموز PUA في نص Indopak ( وقفة،  ص). السبب: كشف العلامات
  في اختبار الـregression وفي توليد القائمة كان يتجاهل PUA.
- أُضيفت `PUA_WAQF_MARKS` (E01A/E01B/E01C/E01E/E01F) وأُعيد توليد
  `data/no-sajawandi-heads.json` → 4039 موضعًا (بدل 4042).
- `tests/no-sajawandi-heads-regression.js` محدَّث ومتوافق.

### 1.0.272 — إضافة بُرَءَٰٓؤُا۟ (60:4) إلى QCF Override

- أُضيف الموضع `60:4:14` (مفتاح الجدول `60:4:13`) إلى `tools/qcf-words.json`
  برمز QCF `FC9F` من صفحة 549، والتسمية `بُرَءَٰٓؤُا۟`.
- أُعيد بناء `fonts/qcf-merged.woff2` وتحديث جدول `QCF_OVERRIDE_TABLE` في
  `qcf-override.js` تلقائيًا عبر `tools/build_qcf_font.py` — التحقق من
  مطابقة الموضع في `data.js` نجح (48/48).
- **بلا Manual Override** (لا `scale` ولا `marginFactor`) — يخضع لـ Auto
  Scale مثل بقية المواضع الافتراضية.
- لم يُمس أي ملف منطق عرض آخر.


### 1.0.269 — MarkPlacement: مرشّحات أدق (4px) مع تفضيل الأعلى

- إضافة STEP_FINE=4 وترتيب يبدأ بـ up 4 ثم up 8 قبل المحاور الأفقية.
- CLEARANCE يبقى 3px. بلا تداخل → pixel-identical.

### 1.0.268 — MarkPlacement: خلوص بصري 3px

- `CLEARANCE = 3` في فحص التداخل فقط: يُضخَّم مستطيل العائق 3px
  حتى لا تلتصق النجمة بعلامة المدينة حافةً بحافة.
- المواضع ذات الفراغ > 3px تبقى pixel-identical.

### 1.0.267 — MarkPlacement: `.waqf-sign` ضمن عوائق التداخل

- السبب الجذري: نجمة التذكير (وأي `.waqf-mark`) لم تكن ترى علامة المدينة
  المغلّفة في `.waqf-sign` لأن هذا الصنف لم يكن في `OBSTACLE_SELECTOR`،
  والكلمة المضيفة مستبعدة بالتصميم.
- الإصلاح الأدنى: إضافة `.waqf-sign` فقط إلى قائمة العوائق في
  `mark-placement-engine.js` — بلا استثناء موضعي، بلا تغيير CSS افتراضي.
- لا يُحرَّك أي نجم إلا عند تداخل هندسي فعلي (المرشّح 0 يبقى إن كان صافيًا).


### 1.0.263 — margin_factor 1.02 لكلمة ٱلدَّٰخِلِينَ (66:10)

- الإبقاء على scale = **0.80**.
- عند margin_factor 1.00 ظهر تداخل بصري بين رسم ﴿ٱلدَّٰخِلِينَ﴾ وكلمة ﴿مَعَ﴾.
- رُفع `margin_factor` إلى **1.02** لهذه الكلمة فقط (بين 1.00 و1.06).
- الملفات: `tools/qcf-words.json`, `qcf-override.js`, `version.js`, `manifest.json`.

### 1.0.262 — margin_factor موضعي لكلمة ٱلدَّٰخِلِينَ (66:10)

- الإبقاء على Manual Scale = **0.80** (الرسم أفضل بصريًا).
- scale 0.80 > Auto ≈0.765 فعّل Auto Margin بالعامل العام 1.06 فوسّع
  صندوق الكلمة وظهر فراغ كبير حولها.
- أُضيف `margin_factor: 1.00` **لهذه الكلمة فقط** لتقليل التوسيع إلى عرض
  الرسم المحجَّم بالضبط، دون المساس بـ Auto Margin لبقية الكلمات.
- `margin_factor` قابل للتخصيص لكل Override أصلًا عبر `qcf-words.json`.
- الملفات: `tools/qcf-words.json`, `qcf-override.js`,
  `docs/qcf-auto-scale-regression.md`, `version.js`, `manifest.json`.

### 1.0.261 — Manual Scale لكلمة ٱلدَّٰخِلِينَ (66:10)

- مراجعة بصرية: Auto Scale (≈0.765) لكلمة ﴿ٱلدَّٰخِلِينَ﴾ في التحريم 10
  لا يعطي المظهر المطلوب.
- أُضيف Manual Scale = **0.80** لهذه الكلمة وحدها في `tools/qcf-words.json`
  و`qcf-override.js` — لا يؤثر على آلية Auto Scale لبقية الكلمات.
- بلا `margin_factor` إضافي؛ Auto Margin يبقى شبكة أمان تلقائية.
- الملفات المعدَّلة: `tools/qcf-words.json`, `qcf-override.js`,
  `docs/qcf-auto-scale-regression.md`, `version.js`, `manifest.json`.

### 1.0.253 — تحسينات SEO في index.html فقط

- وصف meta description أغنى بالعربية (قراءة، ركوع، بحث، تفسير، تلاوة، إشارات، مفضلة، PWA).
- canonical + Open Graph + Twitter Card + Schema.org JSON-LD (WebApplication).
- بلا أي تغيير في المنطق أو DOM خارج `<head>` أو السلوك.

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
