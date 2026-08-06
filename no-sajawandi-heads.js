// no-sajawandi-heads.js — طبقة تحميل واستعلام فقط، لا بيانات مضمَّنة هنا.
//
// المصدر الوحيد للبيانات هو data/no-sajawandi-heads.json (Single Source of
// Truth): قائمة بمواضع (surah, ayah) التي آخر كلمة في آيتها في مصحف النسخ
// لا تحمل أي علامة وقف سجاوندي إطلاقًا (تحقَّق من الشروط الثلاثة لكل موضع:
// رأس آية صحيح، تطابق نص data.js حرفيًا، وخلوّ آخر كلمة من كل الأنواع
// الثمانية م/لا/ج/قلى/صلى/قف/ز/ص عبر WAQF_POSITIONS + رموز يونيكود
// المباشرة). تحديث هذه القائمة مستقبلًا لا يتطلب أي تعديل في هذا الملف
// ولا في readerManager.js — استبدال data/no-sajawandi-heads.json وحده كافٍ.
//
// يُحمَّل الملف مرة واحدة فقط عند بدء التطبيق (استدعاء load() من app.js
// ضمن تسلسل safeInit)، ويُبنى منه Set لبحث بزمن O(1) عبر has(surah, ayah).
window.NoSajawandiHeads = (function () {
  'use strict';

  var set = null;         // null = لم يكتمل التحميل بعد
  var loadPromise = null;

  function key(surah, ayah) {
    return surah + ':' + ayah;
  }

  function load() {
    if (loadPromise) return loadPromise;
    loadPromise = fetch('data/no-sajawandi-heads.json')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (list) {
        var s = new Set();
        for (var i = 0; i < list.length; i++) {
          s.add(key(list[i].surah, list[i].ayah));
        }
        set = s;
      })
      .catch(function () {
        // فشل التحميل (بلا اتصال أول مرة، أو خطأ شبكة): نتعامل معه كقائمة
        // فارغة بدل رمي الخطأ للأعلى — رؤوس الآيات تستمر بالنجمة الحالية
        // كما هي، بلا أي كسر في عرض الصفحة.
        set = new Set();
      });
    return loadPromise;
  }

  function has(surah, ayah) {
    // لو النداء حصل قبل اكتمال load() (سباق نادر)، نرجّع false بأمان —
    // نفس سلوك "فشل التحميل": الاستمرار بالنجمة الحالية بدل الانتظار.
    if (!set) return false;
    return set.has(key(surah, ayah));
  }

  return { load: load, has: has };
})();
