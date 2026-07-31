# تقرير WAQF_REVIEW الكامل

تاريخ التقرير: 2026-07-31

## منهجية

- **مصدر وجود العلامة:** `textIndopak` + كودبوينت النوع.
- **رقم الكلمة:** محاذاة حروف (بعد التجريد) إلى `text` (المدينة).
- **Manual Addition:** من `DEFAULT_MARK_MANUAL_ADDITIONS` في `readerManager.js` الحالي (1.0.190).
- **رمز المدينة:** للعرض فقط، لا يثبت ولا ينفي وجود العلامة.
- صف واحد لكل عنصر في `WAQF_REVIEW` (377). عند تعدد مضيفي العلامة في الآية تُختار أول فجوة غير محلولة بأعلى ثقة.

## إحصائية إجمالية

| النوع | عدد REVIEW | مغطى Manual | يُحسم تلقائيًا (ثقة high) | يحتاج مراجعة بشرية | بلا مضيف في النسخ | REVIEW متبقٍ فقط |
|---|---:|---:|---:|---:|---:|---:|
| JEEM | 72 | 36 | 18 | 18 | 0 | 0 |
| LA | 66 | 0 | 0 | 36 | 0 | 0 |
| MUANAQAH | 3 | 0 | 0 | 3 | 0 | 0 |
| QAD_QILA | 6 | 2 | 0 | 4 | 0 | 0 |
| QIF | 11 | 7 | 0 | 4 | 0 | 0 |
| SAD_RUKHSA | 20 | 5 | 0 | 15 | 0 | 0 |
| TA_MUTLAQ | 170 | 149 | 1 | 20 | 0 | 0 |
| WAQFA | 2 | 0 | 0 | 1 | 0 | 0 |
| WAQF_LAZIM | 9 | 1 | 6 | 2 | 0 | 0 |
| ZAY_JAWAZ | 18 | 13 | 1 | 4 | 0 | 0 |
| **المجموع** | **377** | **213** | **26** | **107** | | |

- عناصر WAQF_REVIEW: **377**
- يمكن حسمها تلقائيًا الآن (محاذاة unique-exact + نوع ملوَّن + بلا manual): **26**
- مغطاة أصلًا بـ Manual Addition: **213**
- تحتاج مراجعة بشرية (أو ثقة أقل من high): **107**

## JEEM (72)

| سورة:آية | كلمة النسخ | كلمة المدينة | سبب فشل المحاذاة | اقتراح 0-based | اقتراح 1-based | الثقة | رمز في المدينة؟ | Manual؟ | تلقائي؟ | بشري؟ |
|---|---|---|---|---:|---:|---|---|---|---|---|
| 2:72 | تَكۡتُمُوۡنَۚ‏ | تَكۡتُمُونَ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 10 | 11 | high | false | لا | نعم | لا |
| 2:198 | هَدٰٮکُمۡ​ۚ | هَدَىٰكُمۡ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 19 | 20 | low | false | آية أخرى | لا | نعم |
| 2:258 | الظّٰلِمِيۡنَ​ۚ‏ | ٱلظَّـٰلِمِينَ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 42 | 43 | medium | false | لا | لا | نعم |
| 3:48 | وَالۡاِنۡجِيۡلَ​ۚ‏ | وَٱلۡإِنجِيلَ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 4 | 5 | high | false | لا | نعم | لا |
| 3:150 | مَوۡلٰٮكُمۡ​ۚ | مَوۡلَىٰكُمۡۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 2 | 3 | medium | false | نعم | لا | لا |
| 3:152 | لِيَبۡتَلِيَكُمۡ​ۚ | لِيَبۡتَلِيَكُمۡۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 31 | 32 | high | false | آية أخرى | نعم | لا |
| 4:37 | ۚ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 4:54 | فَضۡلِهٖ​ۚ | فَضۡلِهِۦۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 8 | 9 | high | false | نعم | لا | لا |
| 4:142 | خَادِعُوْهُمۡ​ +[ۚ] | خَٰدِعُهُمۡ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 5 | 6 | low | false | نعم | لا | لا |
| 4:171 | وَرُسُلِهٖ​ +[​ۚ] | وَرُسُلِهِۦۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 27 | 28 | high | false | آية أخرى | نعم | لا |
| 5:44 | وَّنُوۡرٌ​ +[ۚ] | وَنُورٞۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 5 | 6 | high | true | نعم | لا | لا |
| 5:68 | وَّكُفۡرًا​ۚ | وَكُفۡرٗاۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 24 | 25 | high | false | نعم | لا | لا |
| 5:110 | وَالۡاِنۡجِيۡلَ​ +[ۚ] | وَٱلۡإِنجِيلَۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 25 | 26 | high | false | لا | نعم | لا |
| 6:34 | نَصۡرُنَا​ +[ۚ] | نَصۡرُنَاۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 12 | 13 | high | true | نعم | لا | لا |
| 6:40 | تَدۡعُوۡنَ​ۚ | تَدۡعُونَ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 11 | 12 | high | false | نعم | لا | لا |
| 6:60 | مُّسَمًّى​ۚ | مُّسَمّٗىۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 13 | 14 | high | false | نعم | لا | لا |
| 6:144 | بِهٰذَا​ +[ۚ] | بِهَٰذَاۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 22 | 23 | high | true | نعم | لا | لا |
| 6:161 | مُّسۡتَقِيۡمٍۚ | مُّسۡتَقِيمٖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 6 | 7 | high | false | آية أخرى | نعم | لا |
| 7:22 | بِغُرُوۡرٍ​ +[ۚ] | بِغُرُورٖۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 1 | 2 | high | true | نعم | لا | لا |
| 7:43 | اللّٰهُ​ +[​ۚ] | ٱللَّهُۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 22 | 23 | medium | false | لا | لا | نعم |
| 7:46 | بِسِيۡمٰٮهُمۡ​ +[ۚ] | بِسِيمَىٰهُمۡۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 7 | 8 | medium | true | نعم | لا | لا |
| 7:103 | بِهَا​ +[ۚ] | بِهَاۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 10 | 11 | high | false | نعم | لا | لا |
| 7:143 | صَعِقًا​ +[ۚ] | صَعِقٗاۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 31 | 32 | high | true | نعم | لا | لا |
| 7:160 | الۡحَجَرَ​ +[ۚ] | ٱلۡحَجَرَۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 14 | 15 | high | false | آية أخرى | نعم | لا |
| 7:176 | الۡـكَلۡبِ​ +[ۚ] | ٱلۡكَلۡبِ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 12 | 13 | medium | false | آية أخرى | لا | نعم |
| 7:187 | رَبِّىۡ​ +[ۚ] | رَبِّيۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 9 | 10 | high | false | لا | نعم | لا |
| 7:189 | بِهٖ​ +[ۚ] | بِهِۦۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 17 | 18 | high | false | لا | نعم | لا |
| 7:190 | اٰتٰٮهُمَا​ +[ۚ] | ءَاتَىٰهُمَاۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 7 | 8 | low | true | نعم | لا | لا |
| 9:51 | ۚ | — | alignment-failed: empty-letters | — | — | low | false | آية أخرى | لا | نعم |
| 9:74 | فَضۡلِهٖ​ +[ۚ] | فَضۡلِهِۦۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 23 | 24 | high | true | نعم | لا | لا |
| 9:78 | ۚ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 9:95 | جَهَـنَّمُ​ۚ | جَهَنَّمُ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 13 | 14 | medium | false | نعم | لا | لا |
| 10:10 | سَلٰمٌ​ۚ | سَلَٰمٞۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 6 | 7 | high | true | نعم | لا | لا |
| 10:15 | اِلَىَّ​ +[ۚ] | إِلَيَّۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 30 | 31 | high | false | آية أخرى | نعم | لا |
| 10:83 | الۡاَرۡضِ​ +[ۚ] | ٱلۡأَرۡضِ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 18 | 19 | high | false | لا | نعم | لا |
| 10:104 | ۖۚ​ | — | alignment-failed: empty-letters | — | — | low | false | آية أخرى | لا | نعم |
| 11:27 | الرَّاۡىِ​ۚ | ٱلرَّأۡيِ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 19 | 20 | high | false | نعم | لا | لا |
| 11:91 | ضَعِيۡفًا​ +[ۚ] | ضَعِيفٗاۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 10 | 11 | high | false | نعم | لا | لا |
| 11:97 | فِرۡعَوۡنَ​ۚ | فِرۡعَوۡنَۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 5 | 6 | medium | false | نعم | لا | لا |
| 12:30 | نَّـفۡسِهٖ​ۚ | نَّفۡسِهِۦۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 9 | 10 | medium | false | نعم | لا | لا |
| 12:36 | خَمۡرًا​ +[ۚ] | خَمۡرٗاۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 9 | 10 | high | false | نعم | لا | لا |
| 12:96 | لَّـكُمۡ​ +[ۚ​] | لَّكُمۡ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 12 | 13 | medium | false | نعم | لا | لا |
| 18:49 | اَحۡصٰٮهَا​ +[ۚ] | أَحۡصَىٰهَاۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 18 | 19 | medium | true | نعم | لا | لا |
| 18:63 | اَذۡكُرَهٗ​ +[​ۚ] | أَذۡكُرَهُۥۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 14 | 15 | high | true | نعم | لا | لا |
| 21:5 | ۖۚ | — | alignment-failed: empty-letters | — | — | low | false | آية أخرى | لا | نعم |
| 21:65 | رُءُوۡسِہِمۡ​ۚ | رُءُوسِهِمۡ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 3 | 4 | low | false | نعم | لا | لا |
| 22:78 | مَوۡلٰٮكُمۡ​ۚ | مَوۡلَىٰكُمۡۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 39 | 40 | medium | false | آية أخرى | لا | نعم |
| 23:46 | ۚ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 24:11 | الۡاِثۡمِ​ +[ۚ] | ٱلۡإِثۡمِۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 20 | 21 | high | true | نعم | لا | لا |
| 25:4 | ۛۚ | — | alignment-failed: empty-letters | — | — | low | false | آية أخرى | لا | نعم |
| 25:58 | ۛۚ | — | alignment-failed: empty-letters | — | — | low | false | آية أخرى | لا | نعم |
| 27:36 | اٰتٰٮكُمۡ​ۚ | ءَاتَىٰكُمۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 11 | 12 | low | true | نعم | لا | لا |
| 32:3 | افۡتَرٰٮهُ​ۚ | ٱفۡتَرَىٰهُۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 2 | 3 | medium | true | نعم | لا | لا |
| 33:4 | اُمَّهٰتِكُمۡ +[​ۚ] | أُمَّهَٰتِكُمۡۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 14 | 15 | high | true | نعم | لا | لا |
| 35:43 | الۡاَوَّلِيۡنَ +[ۚ] | ٱلۡأَوَّلِينَۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 15 | 16 | high | true | نعم | لا | لا |
| 40:45 | الۡعَذَابِ​ۚ‏ | ٱلۡعَذَابِ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 9 | 10 | high | false | لا | نعم | لا |
| 41:35 | صَبَرُوۡا​ۚ | صَبَرُواْ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 4 | 5 | high | false | نعم | لا | لا |
| 46:15 | ؕۚ | — | alignment-failed: empty-letters | — | — | low | false | آية أخرى | لا | نعم |
| 48:29 | ۖۚ | — | alignment-failed: empty-letters | — | — | low | false | آية أخرى | لا | نعم |
| 49:9 | اللّٰهِ +[​ۚ] | ٱللَّهِۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 19 | 20 | medium | true | نعم | لا | لا |
| 52:18 | رَبُّهُمۡ​ۚ | رَبُّهُمۡ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 3 | 4 | medium | false | نعم | لا | لا |
| 53:54 | غَشّٰى​ۚ‏ | غَشَّىٰ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 2 | 3 | low | false | لا | لا | نعم |
| 56:23 | الۡمَكۡنُوۡنِ​ۚ‏ | ٱلۡمَكۡنُونِ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 2 | 3 | high | false | لا | نعم | لا |
| 57:12 | الۡعَظِيۡمُ​ۚ‏ | ٱلۡعَظِيمُ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 21 | 22 | high | false | لا | نعم | لا |
| 59:7 | فَانْتَهُوۡا​ +[ۚ] | فَٱنتَهُواْۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 30 | 31 | high | true | نعم | لا | لا |
| 59:9 | الۡمُفۡلِحُوۡنَ​ۚ‏ | ٱلۡمُفۡلِحُونَ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 30 | 31 | high | false | لا | نعم | لا |
| 60:9 | تَوَلَّوۡهُمۡ​ۚ | تَوَلَّوۡهُمۡۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 15 | 16 | high | true | نعم | لا | لا |
| 66:2 | مَوۡلٰٮكُمۡ​ۚ | مَوۡلَىٰكُمۡۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 7 | 8 | medium | false | آية أخرى | لا | نعم |
| 66:4 | الۡمُؤۡمِنِيۡنَ​ۚ | ٱلۡمُؤۡمِنِينَۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 16 | 17 | high | false | لا | نعم | لا |
| 76:11 | وَّسُرُوۡرًا​ۚ‏ | وَسُرُورٗا | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 7 | 8 | high | false | لا | نعم | لا |
| 79:16 | طُوًى​ۚ‏ | طُوًى | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 5 | 6 | high | false | لا | نعم | لا |
| 89:16 | اَهَانَنِ​ۚ‏ | أَهَٰنَنِ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 9 | 10 | low | false | لا | لا | نعم |

## LA (66)

| سورة:آية | كلمة النسخ | كلمة المدينة | سبب فشل المحاذاة | اقتراح 0-based | اقتراح 1-based | الثقة | رمز في المدينة؟ | Manual؟ | تلقائي؟ | بشري؟ |
|---|---|---|---|---:|---:|---|---|---|---|---|
| 2:258 | وَيُمِيۡتُۙ | وَيُمِيتُ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 18 | 19 | high | false | لا | لا | لا |
| 3:3 | وَالۡاِنۡجِيۡلَۙ‏ | وَٱلۡإِنجِيلَ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 10 | 11 | high | false | لا | لا | لا |
| 3:170 | خَلۡفِهِمۡۙ | خَلۡفِهِمۡ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 12 | 13 | high | false | لا | لا | لا |
| 4:97 | ۙ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 4:105 | ۙ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 4:142 | كُسَالٰى +[ۙ] | كُسَالَىٰ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 11 | 12 | low | false | لا | لا | نعم |
| 5:7 | بِهۤ +[ۙ] | بِهِۦٓ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 7 | 8 | high | false | لا | لا | لا |
| 5:46 | وَّنُوۡرٌ +[ۙ] | وَنُورٞ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 16 | 17 | high | false | لا | لا | لا |
| 5:48 | تَخۡتَلِفُوۡنَۙ‏ | تَخۡتَلِفُونَ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 50 | 51 | high | false | لا | لا | لا |
| 6:71 | الۡعٰلَمِيۡنَۙ‏ | ٱلۡعَٰلَمِينَ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 38 | 39 | high | false | لا | لا | لا |
| 6:152 | ۙ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 7:51 | هٰذَا +[ۙ] | هَٰذَا | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 14 | 15 | high | false | لا | لا | لا |
| 7:111 | ۙ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 7:157 | ۙ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 9:59 | وَرَسُوۡلُهٗۙ | وَرَسُولُهُۥ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 6 | 7 | medium | false | لا | لا | نعم |
| 9:74 | اَلِيۡمًا +[ۙ] | أَلِيمٗا | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 34 | 35 | high | false | لا | لا | لا |
| 10:23 | اَنۡفُسِكُمۡ​ۙ | أَنفُسِكُمۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 14 | 15 | high | false | لا | لا | لا |
| 10:104 | الۡمُؤۡمِنِيۡنَۙ‏ | ٱلۡمُؤۡمِنِينَ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 25 | 26 | high | false | لا | لا | لا |
| 11:54 | ۙ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 12:96 | ۙ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 16:32 | عَلَيۡكُمُۙ | عَلَيۡكُمُ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 6 | 7 | high | false | لا | لا | لا |
| 16:70 | يَتَوَفّٰٮكُمۡ​ۙ | يَتَوَفَّىٰكُمۡۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 3 | 4 | medium | false | لا | لا | نعم |
| 16:76 | هُوَۙ | هُوَ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 21 | 22 | high | false | لا | لا | لا |
| 19:30 | ۙ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 21:2 | يَلۡعَبُوۡنَۙ‏ | يَلۡعَبُونَ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 10 | 11 | high | false | لا | لا | لا |
| 22:78 | الۡمُسۡلِمِيۡنَ | ٱلۡمُسۡلِمِينَ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 19 | 20 | high | false | لا | لا | لا |
| 24:39 | ۙ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 25:43 | ۙ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 25:58 | ۙ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 26:218 | تَقُوۡمُۙ‏ | تَقُومُ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 3 | 4 | high | false | لا | لا | لا |
| 28:25 | الۡقَصَصَ +[ۙ] | ٱلۡقَصَصَ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 18 | 19 | high | false | لا | لا | لا |
| 28:30 | ۙ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 29:25 | ۙ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 29:65 | الدِّيۡنَ | ٱلدِّينَ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 8 | 9 | high | false | لا | لا | لا |
| 38:21 | الۡمِحۡرَابَۙ‏ | ٱلۡمِحۡرَابَ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 6 | 7 | high | false | لا | لا | لا |
| 39:57 | الۡمُتَّقِيۡنَۙ‏ | ٱلۡمُتَّقِينَ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 8 | 9 | high | false | لا | لا | لا |
| 40:56 | اَتٰٮهُمۡۙ | أَتَىٰهُمۡ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 8 | 9 | low | false | لا | لا | نعم |
| 44:56 | الۡجَحِيۡمِۙ‏ | ٱلۡجَحِيمِ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 9 | 10 | high | false | لا | لا | لا |
| 53:41 | الۡاَوۡفٰىۙ‏ | ٱلۡأَوۡفَىٰ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 3 | 4 | medium | false | لا | لا | نعم |
| 57:20 | شَدِيۡدٌ +[ۙ] | شَدِيدٞ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 28 | 29 | high | false | لا | لا | لا |
| 57:23 | فَخُوۡرِۙ‏ | فَخُورٍ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 14 | 15 | high | false | لا | لا | لا |
| 72:16 | ۙ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 74:52 | ۙ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 76:12 | ۙ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 79:28 | ۙ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 79:32 | ۙ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 82:7 | فَعَدَلَـكَۙ‏ | فَعَدَلَكَ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 3 | 4 | medium | false | لا | لا | نعم |
| 82:17 | الدِّيۡنِۙ‏ | ٱلدِّينِ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 4 | 5 | high | false | لا | لا | لا |
| 85:17 | الۡجُـنُوۡدِۙ‏ | ٱلۡجُنُودِ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 3 | 4 | medium | false | لا | لا | نعم |
| 86:2 | الطَّارِقُۙ‏ | ٱلطَّارِقُ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 3 | 4 | high | false | لا | لا | لا |
| 89:15 | وَنَعَّمَهٗ | وَنَعَّمَهُۥ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 7 | 8 | high | false | لا | لا | لا |
| 89:16 | رِزۡقَهٗ | رِزۡقَهُۥ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 6 | 7 | high | false | لا | لا | لا |
| 91:1 | ۙ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 91:2 | ۙ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 91:3 | ۙ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 91:4 | ۙ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 91:5 | ۙ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 91:6 | ۙ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 91:7 | ۙ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 91:8 | ۙ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 91:9 | ۙ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 91:11 | ۙ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 91:12 | ۙ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 91:14 | ۙفَدَمۡدَمَ | فَدَمۡدَمَ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 2 | 3 | high | false | لا | لا | لا |
| 92:15 | الۡاَشۡقَىۙ‏ | ٱلۡأَشۡقَى | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 3 | 4 | high | false | لا | لا | لا |
| 102:1 | التَّكَاثُرُۙ‏ | ٱلتَّكَاثُرُ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 1 | 2 | high | false | لا | لا | لا |

## MUANAQAH (3)

| سورة:آية | كلمة النسخ | كلمة المدينة | سبب فشل المحاذاة | اقتراح 0-based | اقتراح 1-based | الثقة | رمز في المدينة؟ | Manual؟ | تلقائي؟ | بشري؟ |
|---|---|---|---|---:|---:|---|---|---|---|---|
| 25:4 | ۛۚ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 25:58 | ۛۚ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 48:29 | التَّوۡرٰٮةِ +[ۛ] | ٱلتَّوۡرَىٰةِۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 27 | 28 | medium | false | لا | لا | نعم |

## QAD_QILA (6)

| سورة:آية | كلمة النسخ | كلمة المدينة | سبب فشل المحاذاة | اقتراح 0-based | اقتراح 1-based | الثقة | رمز في المدينة؟ | Manual؟ | تلقائي؟ | بشري؟ |
|---|---|---|---|---:|---:|---|---|---|---|---|
| 10:16 | ​ۖ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 18:63 |  | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 29:25 | نّٰصِرِيۡنَ | نَّـٰصِرِينَ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 26 | 27 | medium | false | لا | لا | نعم |
| 41:12 |  | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 59:2 | يَحۡتَسِبُوۡا | يَحۡتَسِبُواْۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 27 | 28 | high | other-waqf | نعم | لا | لا |
| 59:7 | فَخُذُوْهُ | فَخُذُوهُ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 26 | 27 | high | false | نعم | لا | لا |

## QIF (11)

| سورة:آية | كلمة النسخ | كلمة المدينة | سبب فشل المحاذاة | اقتراح 0-based | اقتراح 1-based | الثقة | رمز في المدينة؟ | Manual؟ | تلقائي؟ | بشري؟ |
|---|---|---|---|---:|---:|---|---|---|---|---|
| 2:102 | خَلَاقٍ​ؕ | وَلَبِئۡسَ | alignment-failed: no-confident-align | 66 | 67 | low | other-waqf | آية أخرى | لا | نعم |
| 3:50 | رَّبِّكُمۡ | رَّبِّكُمۡ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 15 | 16 | high | other-waqf | نعم | لا | لا |
| 4:171 | وَرُسُلِهٖ​ | وَرُسُلِهِۦۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 27 | 28 | high | other-waqf | نعم | لا | لا |
| 6:62 | الۡحُكۡمُ | ٱلۡحُكۡمُ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 8 | 9 | high | other-waqf | نعم | لا | لا |
| 7:43 | لِهٰذَا | لِهَٰذَا | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 15 | 16 | high | false | نعم | لا | لا |
| 7:46 | عَلَيۡكُمۡ​ | عَلَيۡكُمۡۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 13 | 14 | high | other-waqf | نعم | لا | لا |
| 11:63 | عَصَيۡتُهٗ​ | عَصَيۡتُهُۥۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 17 | 18 | high | other-waqf | نعم | لا | لا |
| 16:70 | يَتَوَفّٰٮكُمۡ​ۙ | يَتَوَفَّىٰكُمۡۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 3 | 4 | medium | other-waqf | لا | لا | نعم |
| 28:25 | تَخَفۡ​ | تَخَفۡۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 21 | 22 | high | other-waqf | نعم | لا | لا |
| 48:29 | ۛۚ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 59:9 | ؕ | — | alignment-failed: empty-letters | — | — | low | false | آية أخرى | لا | نعم |

## SAD_RUKHSA (20)

| سورة:آية | كلمة النسخ | كلمة المدينة | سبب فشل المحاذاة | اقتراح 0-based | اقتراح 1-based | الثقة | رمز في المدينة؟ | Manual؟ | تلقائي؟ | بشري؟ |
|---|---|---|---|---:|---:|---|---|---|---|---|
| 2:144 | تَرۡضٰٮهَا​ | تَرۡضَىٰهَاۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 8 | 9 | medium | other-waqf | نعم | لا | لا |
| 2:282 | تَبَايَعۡتُمۡ | تَبَايَعۡتُمۡۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 109 | 110 | high | other-waqf | نعم | لا | لا |
| 5:46 | التَّوۡرٰٮةِ​ | ٱلتَّوۡرَىٰةِۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 11 | 12 | medium | other-waqf | نعم | لا | لا |
| 6:71 | حَيۡرَانَ | حَيۡرَانَ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 22 | 23 | high | other-waqf | نعم | لا | لا |
| 16:28 | اَنۡفُسِهِمۡ​ | أَنفُسِهِمۡۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 4 | 5 | high | other-waqf | نعم | لا | لا |
| 20:121 | فَغَوٰى​ۖ‏ | فَغَوَىٰ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 14 | 15 | low | false | لا | لا | نعم |
| 79:29 | ضُحٰٮهَا‏ | ضُحَىٰهَا | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 3 | 4 | low | false | لا | لا | نعم |
| 79:31 | وَمَرۡعٰٮهَا‏ | وَمَرۡعَىٰهَا | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 3 | 4 | medium | other-waqf | لا | لا | نعم |
| 91:1 | وَضُحٰٮهَا +[] | وَضُحَىٰهَا | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 1 | 2 | medium | false | لا | لا | نعم |
| 91:2 | تَلٰٮهَا +[] | تَلَىٰهَا | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 2 | 3 | low | false | لا | لا | نعم |
| 91:3 | جَلّٰٮهَا | جَلَّىٰهَا | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 2 | 3 | low | false | لا | لا | نعم |
| 91:4 | يَغۡشٰٮهَا | يَغۡشَىٰهَا | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 2 | 3 | medium | other-waqf | لا | لا | نعم |
| 91:5 | بَنٰٮهَا | بَنَىٰهَا | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 2 | 3 | low | false | لا | لا | نعم |
| 91:6 | طَحٰٮهَا | طَحَىٰهَا | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 2 | 3 | low | false | لا | لا | نعم |
| 91:7 | سَوّٰٮهَا | سَوَّىٰهَا | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 2 | 3 | low | false | لا | لا | نعم |
| 91:8 | وَتَقۡوٰٮهَا | وَتَقۡوَىٰهَا | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 2 | 3 | medium | other-waqf | لا | لا | نعم |
| 91:9 | زَكّٰٮهَا | زَكَّىٰهَا | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 3 | 4 | low | false | لا | لا | نعم |
| 91:11 | بِطَغۡوٰٮهَآ +[] | بِطَغۡوَىٰهَآ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 2 | 3 | medium | other-waqf | لا | لا | نعم |
| 91:12 | اَشۡقٰٮهَا +[] | أَشۡقَىٰهَا | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 2 | 3 | medium | other-waqf | لا | لا | نعم |
| 91:14 | فَسَوّٰٮهَا +[] | فَسَوَّىٰهَا | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 6 | 7 | medium | false | لا | لا | نعم |

## TA_MUTLAQ (170)

| سورة:آية | كلمة النسخ | كلمة المدينة | سبب فشل المحاذاة | اقتراح 0-based | اقتراح 1-based | الثقة | رمز في المدينة؟ | Manual؟ | تلقائي؟ | بشري؟ |
|---|---|---|---|---:|---:|---|---|---|---|---|
| 2:29 | سَمٰوٰتٍ​ؕ | سَمَٰوَٰتٖۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 14 | 15 | high | false | نعم | لا | لا |
| 2:72 | فِيۡهَا +[​ؕ] | فِيهَاۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 5 | 6 | high | false | آية أخرى | نعم | لا |
| 2:102 | اَنۡفُسَهُمۡ​ؕ | أَنفُسَهُمۡۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 70 | 71 | high | false | نعم | لا | لا |
| 2:142 | عَلَيۡهَا +[​ؕ] | عَلَيۡهَاۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 10 | 11 | high | false | نعم | لا | لا |
| 2:144 | رَّبِّهِمۡ​ؕ | رَّبِّهِمۡۗ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 28 | 29 | high | true | نعم | لا | لا |
| 2:243 | اَحۡيَاھُمۡ​ؕ | أَحۡيَٰهُمۡۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 16 | 17 | low | false | نعم | لا | لا |
| 2:247 | يَّشَآءُ +[​ؕ] | يَشَآءُۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 39 | 40 | high | false | نعم | لا | لا |
| 2:251 | يَشَآءُ +[​ؕ] | يَشَآءُۗ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 12 | 13 | high | true | نعم | لا | لا |
| 2:258 | وَاُمِيۡتُ​ؕ | وَأُمِيتُۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 22 | 23 | high | false | نعم | لا | لا |
| 2:272 | فَلِاَنۡفُسِكُمۡ​ؕ | فَلِأَنفُسِكُمۡۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 12 | 13 | high | false | نعم | لا | لا |
| 2:282 | اَجَلِهٖ​ؕ | أَجَلِهِۦۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 85 | 86 | high | false | نعم | لا | لا |
| 3:28 | نَفۡسَهٗ​ +[ؕ] | نَفۡسَهُۥۗ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 23 | 24 | high | true | نعم | لا | لا |
| 3:65 | بَعۡدِهٖؕ | بَعۡدِهِۦٓۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 12 | 13 | high | false | نعم | لا | لا |
| 3:93 | ​ؕ | — | alignment-failed: empty-letters | — | — | low | false | آية أخرى | لا | نعم |
| 3:144 | اَعۡقَابِكُمۡ​ؕ | أَعۡقَٰبِكُمۡۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 15 | 16 | medium | false | نعم | لا | لا |
| 3:148 | الۡاٰخِرَةِ​ +[ؕ] | ٱلۡأٓخِرَةِۗ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 6 | 7 | medium | true | نعم | لا | لا |
| 3:151 | النَّارُ​ؕ | ٱلنَّارُۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 15 | 16 | high | false | نعم | لا | لا |
| 3:152 | تُحِبُّوۡنَ​ؕ | تُحِبُّونَۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 19 | 20 | high | false | نعم | لا | لا |
| 3:153 | اَصَابَكُمۡ​ؕ | أَصَٰبَكُمۡۗ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 20 | 21 | low | true | نعم | لا | لا |
| 3:162 | جَهَنَّمُ​ؕ | جَهَنَّمُۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 10 | 11 | high | false | نعم | لا | لا |
| 3:180 | وَالۡاَرۡضِ​ؕ | وَٱلۡأَرۡضِۗ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 25 | 26 | high | true | نعم | لا | لا |
| 3:197 | جَهَنَّمُ​ؕ | جَهَنَّمُۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 4 | 5 | high | false | نعم | لا | لا |
| 4:20 | شَيۡـــًٔا​ +[ؕ] | شَيۡـًٔاۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 12 | 13 | low | false | نعم | لا | لا |
| 4:37 | فَضۡلِهٖ​ +[ؕ] | فَضۡلِهِۦۗ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 10 | 11 | high | true | نعم | لا | لا |
| 4:84 | كَفَرُوۡا​ +[ؕ] | كَفَرُواْۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 16 | 17 | high | false | نعم | لا | لا |
| 4:97 | كُنۡتُمۡ​ؕ | كُنتُمۡۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 8 | 9 | high | false | نعم | لا | لا |
| 4:105 | اللّٰهُ​ +[ؕ] | ٱللَّهُۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 10 | 11 | medium | false | نعم | لا | لا |
| 4:114 | النَّاسِ​ +[ؕ] | ٱلنَّاسِۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 15 | 16 | high | false | نعم | لا | لا |
| 4:171 | الۡاَرۡضِ​ؕ | ٱلۡأَرۡضِۗ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 49 | 50 | high | true | نعم | لا | لا |
| 5:7 | اللهَ +[ؕ] | ٱللَّهَۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 13 | 14 | medium | false | نعم | لا | لا |
| 5:43 | ؕ | — | alignment-failed: empty-letters | — | — | low | false | آية أخرى | لا | نعم |
| 5:44 | قَلِيۡلًا​ +[ؕ] | قَلِيلٗاۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 31 | 32 | high | false | نعم | لا | لا |
| 5:46 | ؕ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 5:48 | ​ؕ | — | alignment-failed: empty-letters | — | — | low | false | آية أخرى | لا | نعم |
| 5:63 | السُّحۡتَ​ؕ | ٱلسُّحۡتَۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 8 | 9 | high | false | نعم | لا | لا |
| 5:66 | اَرۡجُلِهِمۡ​ؕ | أَرۡجُلِهِمۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 15 | 16 | high | false | نعم | لا | لا |
| 5:68 | رَّبِّكُمۡ​ +[ؕ] | رَّبِّكُمۡۗ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 14 | 15 | high | true | نعم | لا | لا |
| 5:72 | النَّارُ​ +[ؕ] | ٱلنَّارُۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 28 | 29 | high | false | نعم | لا | لا |
| 6:46 | بِهؕ | بِهِۗ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 15 | 16 | high | true | نعم | لا | لا |
| 6:62 | الۡحَـقِّ​ؕ | ٱلۡحَقِّۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 5 | 6 | medium | false | نعم | لا | لا |
| 6:71 | ائۡتِنَا +[​ؕ] | ٱئۡتِنَاۗ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 28 | 29 | high | true | نعم | لا | لا |
| 6:80 | عِلۡمًا​ؕ | عِلۡمًاۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 22 | 23 | high | false | نعم | لا | لا |
| 6:90 | اقۡتَدِهۡ +[​ؕ] | ٱقۡتَدِهۡۗ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 5 | 6 | high | true | نعم | لا | لا |
| 6:128 | ؕ | — | alignment-failed: empty-letters | — | — | low | false | آية أخرى | لا | نعم |
| 6:144 | عِلۡمٍ​ +[ؕ] | عِلۡمٍۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 33 | 34 | high | false | نعم | لا | لا |
| 6:165 | اٰتٰٮكُمۡ​ؕ | ءَاتَىٰكُمۡۗ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 13 | 14 | low | true | نعم | لا | لا |
| 7:22 | الۡجَـنَّةِ​ +[ؕ] | ٱلۡجَنَّةِۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 13 | 14 | medium | false | نعم | لا | لا |
| 7:27 | تَرَوۡنَهُمۡ​ +[ؕ] | تَرَوۡنَهُمۡۗ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 22 | 23 | high | true | نعم | لا | لا |
| 7:38 | النَّارِ​ +[ؕ] | ٱلنَّارِۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 33 | 34 | medium | false | نعم | لا | لا |
| 7:43 | بِالۡحَـقِّ​ +[ؕ] | بِٱلۡحَقِّۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 27 | 28 | medium | false | نعم | لا | لا |
| 7:89 | عِلۡمًا​ؕ | عِلۡمًاۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 29 | 30 | high | false | نعم | لا | لا |
| 7:157 | عَلَيۡهِمۡ​ +[ؕ] | عَلَيۡهِمۡۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 29 | 30 | medium | false | نعم | لا | لا |
| 7:160 | مَّشۡرَبَهُمۡ​ؕ | مَّشۡرَبَهُمۡۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 24 | 25 | high | false | نعم | لا | لا |
| 7:176 | يَلۡهَث +[​ؕ] | يَلۡهَثۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 19 | 20 | medium | false | نعم | لا | لا |
| 7:187 | وَالۡاَرۡضِ​ؕ | وَٱلۡأَرۡضِۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 18 | 19 | high | false | نعم | لا | لا |
| 8:16 | جَهَـنَّمُ​ؕ | جَهَنَّمُۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 17 | 18 | medium | false | نعم | لا | لا |
| 8:40 | مَوۡلٰٮكُمۡ​ؕ | مَوۡلَىٰكُمۡۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 5 | 6 | medium | false | نعم | لا | لا |
| 8:43 | سَلَّمَ​ؕ | سَلَّمَۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 15 | 16 | high | false | نعم | لا | لا |
| 9:73 | جَهَـنَّمُ​ؕ | جَهَنَّمُۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 8 | 9 | medium | false | نعم | لا | لا |
| 9:111 | بِهٖ​ +[ؕ] | بِهِۦۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 32 | 33 | high | false | نعم | لا | لا |
| 9:115 | يَتَّقُوۡنَ​ؕ | يَتَّقُونَۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 12 | 13 | high | false | نعم | لا | لا |
| 9:127 | انْصَرَفُوۡا​ +[ؕ] | ٱنصَرَفُواْۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 13 | 14 | high | false | نعم | لا | لا |
| 10:16 | قَبۡلِهٖ +[ؕ] | قَبۡلِهِۦٓۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 15 | 16 | high | false | نعم | لا | لا |
| 10:23 | الۡحَـقِّ​ +[ؕ] | ٱلۡحَقِّۗ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 8 | 9 | medium | true | نعم | لا | لا |
| 10:24 | بِالۡاَمۡسِ​ +[ؕ] | بِٱلۡأَمۡسِۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 37 | 38 | high | false | نعم | لا | لا |
| 10:38 | افۡتَـرٰٮهُ​ +[ؕ] | ٱفۡتَرَىٰهُۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 2 | 3 | low | false | نعم | لا | لا |
| 10:83 | يَّفۡتِنَهُمۡ​ +[ؕ] | يَفۡتِنَهُمۡۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 13 | 14 | high | false | نعم | لا | لا |
| 11:13 | افۡتَـرٰٮهُ​ +[ؕ] | ٱفۡتَرَىٰهُۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 2 | 3 | low | false | نعم | لا | لا |
| 11:28 | عَلَيۡكُمۡؕ | عَلَيۡكُمۡ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 14 | 15 | high | false | نعم | لا | لا |
| 11:35 | افۡتَـرٰٮهُ​ +[ؕ] | ٱفۡتَرَىٰهُۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 2 | 3 | low | false | نعم | لا | لا |
| 11:41 | وَمُرۡسٰٮهَا +[​ؕ] | وَمُرۡسَىٰهَآۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 6 | 7 | medium | false | نعم | لا | لا |
| 11:54 | بِسُوۡٓءٍ​ +[ؕ] | بِسُوٓءٖۗ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 6 | 7 | high | true | نعم | لا | لا |
| 11:88 | عَنۡهُ​ +[ؕ] | عَنۡهُۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 20 | 21 | high | false | نعم | لا | لا |
| 12:21 | الۡاَحَادِيۡثِ​ؕ | ٱلۡأَحَادِيثِۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 22 | 23 | high | false | نعم | لا | لا |
| 12:30 | حُبًّا​ +[ؕ] | حُبًّاۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 12 | 13 | high | false | نعم | لا | لا |
| 12:36 | مِنۡهُ​ +[ؕ] | مِنۡهُۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 20 | 21 | high | false | نعم | لا | لا |
| 12:68 | قَضٰٮهَا​ؕ | قَضَىٰهَاۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 19 | 20 | low | false | نعم | لا | لا |
| 12:88 | عَلَيۡنَاؕ | عَلَيۡنَآۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 16 | 17 | high | false | نعم | لا | لا |
| 12:96 | ؕۚ | — | alignment-failed: empty-letters | — | — | low | false | آية أخرى | لا | نعم |
| 13:18 | جَهَـنَّمُ​ؕ | جَهَنَّمُۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 24 | 25 | medium | false | نعم | لا | لا |
| 14:5 | اللّٰهِ​ؕ | ٱللَّهِۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 13 | 14 | medium | false | نعم | لا | لا |
| 14:6 | نِسَآءَكُمۡ​ +[ؕ] | نِسَآءَكُمۡۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 19 | 20 | high | false | نعم | لا | لا |
| 14:12 | سُبُلَنَا​ؕ | سُبُلَنَاۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 8 | 9 | high | false | نعم | لا | لا |
| 14:21 | لَهَدَيۡنٰكُمۡ​ؕ | لَهَدَيۡنَٰكُمۡۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 24 | 25 | high | false | نعم | لا | لا |
| 14:34 | تُحۡصُوۡهَا +[ؕ] | تُحۡصُوهَآۗ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 10 | 11 | high | true | نعم | لا | لا |
| 16:28 | سُوۡۤءٍؕ | سُوٓءِۭۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 11 | 12 | high | false | نعم | لا | لا |
| 16:70 | شَيۡــًٔا​ؕ | شَيۡـًٔاۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 15 | 16 | medium | false | نعم | لا | لا |
| 16:76 | بِخَيۡرٍ​ؕ | بِخَيۡرٍ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 18 | 19 | high | false | نعم | لا | لا |
| 17:5 | الدِّيَارِ +[​ؕ] | ٱلدِّيَارِۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 13 | 14 | high | false | نعم | لا | لا |
| 17:40 | اِنَاثًا​ +[ؕ] | إِنَٰثًاۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 6 | 7 | low | false | نعم | لا | لا |
| 17:67 | اَعۡرَضۡتُمۡ​ +[ؕ] | أَعۡرَضۡتُمۡۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 14 | 15 | high | false | نعم | لا | لا |
| 17:97 | جَهَـنَّمُ​ +[ؕ] | جَهَنَّمُۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 22 | 23 | medium | false | نعم | لا | لا |
| 18:37 | رَجُلًاؕ‏ | رَجُلٗا | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 15 | 16 | high | false | نعم | لا | لا |
| 18:49 | حَاضِرًا​ +[ؕ] | حَاضِرٗاۗ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 22 | 23 | high | true | نعم | لا | لا |
| 20:11 | يٰمُوۡسٰىؕ‏ | يَٰمُوسَىٰٓ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 3 | 4 | medium | false | نعم | لا | لا |
| 21:103 | الۡمَلٰٓٮِٕكَةُ +[ؕ] | ٱلۡمَلَـٰٓئِكَةُ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 5 | 6 | low | false | نعم | لا | لا |
| 22:37 | هَدٰٮكُمۡ​ؕ | وَبَشِّرِ | alignment-failed: no-confident-align | 18 | 19 | low | false | آية أخرى | لا | نعم |
| 22:78 | حَرَجٍ​ؕ | حَرَجٖۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 13 | 14 | high | false | نعم | لا | لا |
| 24:33 | الدُّنۡيَا​ +[ؕ] | ٱلدُّنۡيَاۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 38 | 39 | high | false | نعم | لا | لا |
| 24:39 | حِسَابَهٗ​ +[ؕ] | حِسَابَهُۥۗ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 18 | 19 | high | true | نعم | لا | لا |
| 24:40 | سَحَابٌ​ؕ | سَحَابٞۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 12 | 13 | high | false | نعم | لا | لا |
| 24:57 | النَّارُ​ؕ | ٱلنَّارُۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 8 | 9 | high | false | نعم | لا | لا |
| 25:43 | هَوٰٮهُ +[ؕ] | هَوَىٰهُ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 4 | 5 | low | false | نعم | لا | لا |
| 28:25 | لَـنَا​ +[ؕ] | لَنَاۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 13 | 14 | medium | false | نعم | لا | لا |
| 28:32 | وَمَلَا۟ٮِٕهٖؕ | وَمَلَإِيْهِۦٓۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 20 | 21 | low | false | نعم | لا | لا |
| 28:50 | اللّٰهِ​ +[ؕ] | ٱللَّهِۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 16 | 17 | medium | false | نعم | لا | لا |
| 28:77 | الۡاَرۡضِ​ؕ | ٱلۡأَرۡضِۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 20 | 21 | high | false | نعم | لا | لا |
| 29:24 | النَّارِ +[​ؕ] | ٱلنَّارِۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 13 | 14 | high | false | نعم | لا | لا |
| 31:32 | مُّقۡتَصِدٌ +[​ؕ] | مُّقۡتَصِدٞۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 14 | 15 | high | false | نعم | لا | لا |
| 32:9 | ؕ | — | alignment-failed: empty-letters | — | — | low | false | آية أخرى | لا | نعم |
| 32:20 | النَّارُ​ؕ | ٱلنَّارُۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 4 | 5 | medium | false | نعم | لا | لا |
| 33:4 | اَبۡنَآءَكُمۡ​ +[ؕ] | أَبۡنَآءَكُمۡۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 18 | 19 | high | false | نعم | لا | لا |
| 33:37 | وَطَرًا +[ؕ] | وَطَرٗاۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 43 | 44 | medium | false | نعم | لا | لا |
| 33:48 | اللّٰهِ +[ؕ] | ٱللَّهِۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 8 | 9 | medium | false | نعم | لا | لا |
| 33:53 | حِجَابٍ +[ؕ] | حِجَابٖۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 44 | 45 | high | false | نعم | لا | لا |
| 35:2 | بَعۡدِه +[ؕ] | بَعۡدِهِۦۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 15 | 16 | high | false | نعم | لا | لا |
| 35:11 | بِعِلۡمِهؕ | بِعِلۡمِهِۦۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 17 | 18 | high | false | نعم | لا | لا |
| 35:43 | بِاَهۡلِهٖ +[ؕ] | بِأَهۡلِهِۦۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 10 | 11 | high | false | نعم | لا | لا |
| 39:21 | ؕ | — | alignment-failed: empty-letters | — | — | low | false | آية أخرى | لا | نعم |
| 40:35 | اَتٰٮهُمۡ +[ؕ] | أَتَىٰهُمۡۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 7 | 8 | low | false | نعم | لا | لا |
| 40:56 | بِبَالِغِيۡهِؕ | بِبَٰلِغِيهِۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 16 | 17 | medium | false | نعم | لا | لا |
| 41:12 | اَمۡرَهَا​ +[ؕ] | أَمۡرَهَاۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 9 | 10 | high | false | نعم | لا | لا |
| 42:45 | خَفِىٍّ​ +[ؕ] | خَفِيّٖۗ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 9 | 10 | high | true | نعم | لا | لا |
| 42:51 | يَشَآءُ​ؕ | يَشَآءُۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 18 | 19 | high | false | نعم | لا | لا |
| 43:80 | وَنَجۡوٰٮهُمۡ​ؕ | وَنَجۡوَىٰهُمۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 6 | 7 | medium | false | نعم | لا | لا |
| 45:23 | غِشٰوَةً +[ؕ] | غِشَٰوَةٗ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 16 | 17 | high | false | نعم | لا | لا |
| 46:8 | فِيۡهِ​ؕ | فِيهِۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 16 | 17 | high | false | نعم | لا | لا |
| 46:15 | ؕ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 48:29 | السُّجُوۡدِ​ +[ؕ] | ٱلسُّجُودِۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 23 | 24 | high | false | نعم | لا | لا |
| 49:9 | وَاَقۡسِطُوۡا +[ؕ​] | وَأَقۡسِطُوٓاْۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 25 | 26 | high | false | نعم | لا | لا |
| 49:13 | تۡقٰٮكُمۡ​ +[ؕ] | أَتۡقَىٰكُمۡۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 15 | 16 | low | false | نعم | لا | لا |
| 51:16 | رَبُّهُمۡ​ؕ | رَبُّهُمۡۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 3 | 4 | high | false | نعم | لا | لا |
| 57:12 | فِيۡهَا​ؕ | فِيهَاۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 17 | 18 | high | false | نعم | لا | لا |
| 57:15 | النَّارُ​ؕ | ٱلنَّارُۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 10 | 11 | high | false | نعم | لا | لا |
| 57:20 | حُطٰمًا​ؕ | حُطَٰمٗاۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 24 | 25 | high | false | نعم | لا | لا |
| 57:23 | اٰتٰٮكُمۡ​ؕ | ءَاتَىٰكُمۡۗ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 8 | 9 | low | true | نعم | لا | لا |
| 58:6 | وَنَسُوۡهُ​ +[ؕ] | وَنَسُوهُۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 9 | 10 | high | false | نعم | لا | لا |
| 58:12 | صَدَقَةً +[​ؕ] | صَدَقَةٗۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 10 | 11 | high | false | نعم | لا | لا |
| 58:13 | صَدَقٰتٍ​ +[ؕ] | صَدَقَٰتٖۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 6 | 7 | high | false | نعم | لا | لا |
| 58:19 | اللّٰهِ​ؕ | ٱللَّهِۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 5 | 6 | medium | false | نعم | لا | لا |
| 59:7 | اللّٰهَ +[​ؕ] | ٱللَّهَۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 32 | 33 | medium | false | نعم | لا | لا |
| 59:9 | ؕ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 59:19 | اَنۡفُسَهُمۡ​ؕ | أَنفُسَهُمۡۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 6 | 7 | high | false | نعم | لا | لا |
| 60:8 | اِلَيۡهِمۡ​ؕ | إِلَيۡهِمۡۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 16 | 17 | high | false | نعم | لا | لا |
| 61:6 | اَحۡمَدُ​ؕ | أَحۡمَدُۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 23 | 24 | high | false | نعم | لا | لا |
| 62:5 | اَسۡفَارًا​ +[ؕ] | أَسۡفَارَۢاۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 10 | 11 | high | false | نعم | لا | لا |
| 65:4 | يَحِضۡنَ​ +[ؕ] | يَحِضۡنَۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 13 | 14 | high | false | نعم | لا | لا |
| 65:7 | اللّٰهُ​ؕ | ٱللَّهُۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 12 | 13 | medium | false | نعم | لا | لا |
| 66:9 | جَهَنَّمُ​ؕ | جَهَنَّمُۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 8 | 9 | high | false | نعم | لا | لا |
| 69:3 | ؕ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 70:7 | ؕ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 74:27 | سَقَرُؕ‏ | سَقَرُ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 3 | 4 | high | false | نعم | لا | لا |
| 74:47 | الۡيَقِيۡنُؕ‏ | ٱلۡيَقِينُ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 2 | 3 | high | false | نعم | لا | لا |
| 77:14 | الۡفَصۡلِؕ‏ | ٱلۡفَصۡلِ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 4 | 5 | high | false | نعم | لا | لا |
| 79:30 | ؕ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 79:42 | ؕ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 79:43 | ذِكۡرٰٮهَاؕ‏ | ذِكۡرَىٰهَآ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 3 | 4 | medium | false | نعم | لا | لا |
| 79:44 | مُنۡتَهٰٮهَاؕ‏ | مُنتَهَىٰهَآ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 2 | 3 | medium | false | نعم | لا | لا |
| 79:45 | يَّخۡشٰٮهَاؕ‏ | يَخۡشَىٰهَا | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 4 | 5 | medium | false | نعم | لا | لا |
| 82:18 | الدِّيۡنِؕ‏ | ٱلدِّينِ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 5 | 6 | high | false | نعم | لا | لا |
| 83:8 | سِجِّيۡنٌؕ‏ | سِجِّينٞ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 3 | 4 | high | false | نعم | لا | لا |
| 83:19 | عِلِّيُّوۡنَؕ‏ | عِلِّيُّونَ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 3 | 4 | high | false | نعم | لا | لا |
| 88:1 | الۡغَاشِيَةِؕ‏ | ٱلۡغَٰشِيَةِ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 3 | 4 | medium | false | نعم | لا | لا |
| 89:15 | اَكۡرَمَنِؕ‏ | أَكۡرَمَنِ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 10 | 11 | high | false | نعم | لا | لا |
| 90:12 | ؕ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 91:10 | ؕ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 97:2 | الۡقَدۡرِؕ‏ | ٱلۡقَدۡرِ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 4 | 5 | high | false | نعم | لا | لا |
| 101:3 | ؕ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 101:10 | ؕ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 104:5 | ؕ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |

## WAQFA (2)

| سورة:آية | كلمة النسخ | كلمة المدينة | سبب فشل المحاذاة | اقتراح 0-based | اقتراح 1-based | الثقة | رمز في المدينة؟ | Manual؟ | تلقائي؟ | بشري؟ |
|---|---|---|---|---:|---:|---|---|---|---|---|
| 28:25 | تَخَفۡ​ | تَخَفۡۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 21 | 22 | high | other-waqf | لا | لا | لا |
| 79:27 | بَنٰٮهَا‏ | بَنَىٰهَا | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 5 | 6 | low | false | لا | لا | نعم |

## WAQF_LAZIM (9)

| سورة:آية | كلمة النسخ | كلمة المدينة | سبب فشل المحاذاة | اقتراح 0-based | اقتراح 1-based | الثقة | رمز في المدينة؟ | Manual؟ | تلقائي؟ | بشري؟ |
|---|---|---|---|---:|---:|---|---|---|---|---|
| 2:258 | الۡمُلۡكَ​ۘ | ٱلۡمُلۡكَ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 11 | 12 | high | false | لا | نعم | لا |
| 3:170 | يَحۡزَنُوۡنَ​ۘ‏ | يَحۡزَنُونَ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 18 | 19 | high | false | لا | نعم | لا |
| 4:171 | وَلَدٌ​ +[ۘ] | وَلَدٞۘ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 42 | 43 | high | true | نعم | لا | لا |
| 7:187 | هُوَۘ | هُوَۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 14 | 15 | high | false | لا | نعم | لا |
| 20:9 | مُوۡسٰى​ۘ‏ | مُوسَىٰٓ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 3 | 4 | low | false | لا | لا | نعم |
| 38:21 | الۡخَصۡمِ​ۘ | ٱلۡخَصۡمِ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 3 | 4 | high | false | لا | نعم | لا |
| 51:24 | الۡمُكۡرَمِيۡنَ​ۘ‏ | ٱلۡمُكۡرَمِينَ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 5 | 6 | high | false | لا | نعم | لا |
| 59:7 | الۡعِقَابِ​ۘ‏ | ٱلۡعِقَابِ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 36 | 37 | high | false | لا | نعم | لا |
| 79:15 | مُوۡسٰى​ۘ‏ | مُوسَىٰٓ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 3 | 4 | low | false | لا | لا | نعم |

## ZAY_JAWAZ (18)

| سورة:آية | كلمة النسخ | كلمة المدينة | سبب فشل المحاذاة | اقتراح 0-based | اقتراح 1-based | الثقة | رمز في المدينة؟ | Manual؟ | تلقائي؟ | بشري؟ |
|---|---|---|---|---:|---:|---|---|---|---|---|
| 4:121 | جَهَـنَّمُ | جَهَنَّمُ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 2 | 3 | medium | false | لا | لا | نعم |
| 4:142 | ۙ‏ | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 4:171 | مِّنۡهُ​ | مِّنۡهُۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 24 | 25 | high | other-waqf | نعم | لا | لا |
| 5:7 | وَاَطَعْنَا | وَأَطَعۡنَاۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 11 | 12 | high | other-waqf | نعم | لا | لا |
| 6:165 | الۡعِقَابِ | ٱلۡعِقَابِ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 17 | 18 | high | other-waqf | نعم | لا | لا |
| 7:157 | وَالۡاِنۡجِيۡلِ | وَٱلۡإِنجِيلِ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 11 | 12 | high | other-waqf | نعم | لا | لا |
| 10:16 |  | — | alignment-failed: empty-letters | — | — | low | false | لا | لا | نعم |
| 10:23 | الدُّنۡيَا​ | ٱلدُّنۡيَاۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 17 | 18 | high | other-waqf | نعم | لا | لا |
| 11:91 | لَرَجَمۡنٰكَ​ | لَرَجَمۡنَٰكَۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 13 | 14 | high | other-waqf | نعم | لا | لا |
| 12:21 | الۡاَرۡضِ | ٱلۡأَرۡضِ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 18 | 19 | high | other-waqf | نعم | لا | لا |
| 18:62 | غَدَآءَنَا | غَدَآءَنَا | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 5 | 6 | high | false | نعم | لا | لا |
| 20:121 | الۡجَـنَّةِ​ | ٱلۡجَنَّةِۚ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 10 | 11 | medium | other-waqf | نعم | لا | لا |
| 28:25 | اسۡتِحۡيَآءٍ +[] | ٱسۡتِحۡيَآءٖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 4 | 5 | high | other-waqf | نعم | لا | لا |
| 28:26 | اسْتَاْجِرۡهُ​ | ٱسۡتَـٔۡجِرۡهُۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 3 | 4 | medium | other-waqf | نعم | لا | لا |
| 33:53 | مِنۡكُمۡ | مِنكُمۡۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 32 | 33 | high | other-waqf | نعم | لا | لا |
| 37:75 | الۡمُجِيۡبُوۡنَ | ٱلۡمُجِيبُونَ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 4 | 5 | high | other-waqf | لا | نعم | لا |
| 48:29 | وَرِضۡوَانًا​ | وَرِضۡوَٰنٗاۖ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 17 | 18 | medium | other-waqf | نعم | لا | لا |
| 79:20 | الۡكُبۡرٰى | ٱلۡكُبۡرَىٰ | alignment-succeeds-now (extractor was stricter / multi-mark ayah partial failure) | 2 | 3 | medium | other-waqf | لا | لا | نعم |

## ملاحظات

1. `LA` / `MUANAQAH` / `WAQFA` ليست ضمن أنواع التلوين الافتراضي (`DEFAULT_MARK_TYPES`)؛ تظهر في REVIEW لكنها لا تنتج `has-default-*`.
2. «alignment-succeeds-now» يعني أن محاذاة الحروف الحالية تجد كلمة فريدة؛ المستخرِج الأصلي كان أشد أو فشل لجزء لاحق من الآية بعد انقطاع المحاذاة.
3. «all-hosts-already-in-WAQF_POSITIONS» يعني أن كل مضيفات الرمز في النسخ لها مدخل في POSITIONS؛ بقاء REVIEW قد يكون من محاولة علامة إضافية أو نسخة قديمة.
4. `4:171` / `WAQF_LAZIM` مغطى يدويًا في 1.0.190 عبر `4:171:43`.
