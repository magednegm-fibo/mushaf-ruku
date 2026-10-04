// lazy-loader.js — تحميل سكربتات اختيارية عند أول استخدام فقط.
// يقلّل زمن التشغيل الأول (parse + compile + execute) للميزات غير
// المستخدمة في الشاشة الأولى: الإذاعة، مواقيت الصلاة، التفسير وقاموس التشكيل.
//
// الاستخدام:
//   LazyLoader.load('radio-player.js').then(...)
//   LazyLoader.loadMany(['a.js','b.js']).then(...)
//
// كل مسار يُحمَّل مرة واحدة فقط؛ الطلبات المتزامنة لنفس الملف تتشارك نفس Promise.
(function (global) {
  'use strict';

  var pending = Object.create(null);
  var loaded = Object.create(null);

  function normalize(src) {
    if (!src) return src;
    // اقبل 'foo.js' أو './foo.js'
    if (src.charAt(0) === '/' || /^https?:/i.test(src)) return src;
    if (src.indexOf('./') === 0) return src;
    return './' + src;
  }

  // مسار مطلق بالنسبة لصفحة التطبيق — أوثق مع Service Worker و nested routes
  function resolveUrl(src) {
    src = normalize(src);
    try {
      if (typeof document !== 'undefined' && document.baseURI) {
        return new URL(src, document.baseURI).href;
      }
      if (typeof location !== 'undefined' && location.href) {
        return new URL(src, location.href).href;
      }
    } catch (e) { /* keep relative */ }
    return src;
  }

  function load(src) {
    var key = normalize(src);
    if (loaded[key]) return Promise.resolve(key);
    if (pending[key]) return pending[key];

    pending[key] = new Promise(function (resolve, reject) {
      // إن وُجد وسم script مسبق بنفس المسار (مثلاً من تحميل سابق فاشل جزئيًا)
      var existing = document.querySelector('script[data-lazy-src="' + key + '"]');
      if (existing && existing.dataset.lazyDone === '1') {
        loaded[key] = true;
        delete pending[key];
        resolve(key);
        return;
      }

      var href = resolveUrl(key);
      var s = document.createElement('script');
      s.async = true;
      s.dataset.lazySrc = key;
      s.src = href;
      s.onload = function () {
        s.dataset.lazyDone = '1';
        loaded[key] = true;
        delete pending[key];
        resolve(key);
      };
      s.onerror = function () {
        delete pending[key];
        // أزل الوسم الفاشل حتى يمكن إعادة المحاولة لاحقًا
        if (s.parentNode) s.parentNode.removeChild(s);
        reject(new Error('فشل تحميل السكربت: ' + href));
      };
      (document.head || document.documentElement).appendChild(s);
    });

    return pending[key];
  }

  function loadMany(srcs) {
    return Promise.all((srcs || []).map(load));
  }

  function isLoaded(src) {
    return !!loaded[normalize(src)];
  }

  global.LazyLoader = {
    load: load,
    loadMany: loadMany,
    isLoaded: isLoaded
  };
})(typeof self !== 'undefined' ? self : this);
