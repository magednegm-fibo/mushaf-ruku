// Prayer: تاب «الصلاة» داخل دليل القارئ — مواقيت + قبلة.
//
// مستقل تمامًا عن audioManager.js و radio-player.js.
// reader-guide.js يملك فقط تبديل التاب وإظهار/إخفاء الـpanel.
//
// مواقيت الصلاة: حساب فلكي محلي بمنهج الهيئة المصرية العامة للمساحة
//   Fajr 19.5° · Isha 17.5° · Asr shadow factor 1 · Sunrise/Maghrib −0.833°
// تم التحقق مقابل نشرات ESA و AlAdhan method=5 (فروق ≤ ±1 دقيقة نموذجية).
//
// القبلة: True Qibla Bearing عبر great-circle initial bearing نحو الكعبة
//   (21.4225°N, 39.8262°E). اتجاه الجهاز منفصل (DeviceOrientation / Absolute).
//
// ملاحظة: قسم التنبيهات (رسائل + أذان) محذوف بالكامل من هذا الإصدار.
//
// Loaded before app.js. Call Prayer.init({els}) once.
// Exposed as window.Prayer.
(function(){
  'use strict';

  var els;

  // ---- Constants ----
  var KAABA_LAT = 21.4225;
  var KAABA_LNG = 39.8262;
  var FAJR_ANGLE = 19.5;
  var ISHA_ANGLE = 17.5;
  var ASR_FACTOR = 1; // Shafi'i / majority (Egypt default)
  var SUNRISE_ALT = -0.833;
  var STORAGE_KEY = (typeof MUSHAF_KEYS !== 'undefined' && MUSHAF_KEYS.PRAYER_KEY)
    ? MUSHAF_KEYS.PRAYER_KEY
    : 'quranRuku_prayer_v1';

  // Default saved locations (built-in; not deletable). Egypt-focused lat/lng.
  var CITIES = [
    { id: 'cairo', name: 'القاهرة', lat: 30.0444, lng: 31.2357, tz: 'Africa/Cairo' },
    { id: 'suez', name: 'السويس', lat: 29.9668, lng: 32.5498, tz: 'Africa/Cairo' },
    { id: 'port_said', name: 'بورسعيد', lat: 31.2653, lng: 32.3019, tz: 'Africa/Cairo' },
    { id: 'alexandria', name: 'الإسكندرية', lat: 31.2001, lng: 29.9187, tz: 'Africa/Cairo' },
    { id: 'matrouh', name: 'مرسى مطروح', lat: 31.3529, lng: 27.2373, tz: 'Africa/Cairo' },
    { id: 'asyut', name: 'أسيوط', lat: 27.1809, lng: 31.1837, tz: 'Africa/Cairo' },
    { id: 'luxor', name: 'الأقصر', lat: 25.6872, lng: 32.6396, tz: 'Africa/Cairo' },
    { id: 'aswan', name: 'أسوان', lat: 24.0889, lng: 32.8998, tz: 'Africa/Cairo' },
    { id: 'hurghada', name: 'الغردقة', lat: 27.2579, lng: 33.8116, tz: 'Africa/Cairo' },
    { id: 'sharm', name: 'شرم الشيخ', lat: 27.9158, lng: 34.3300, tz: 'Africa/Cairo' },
    { id: 'makkah', name: 'مكة المكرمة', lat: 21.4225, lng: 39.8262, tz: 'Asia/Riyadh' },
    { id: 'madinah', name: 'المدينة المنورة', lat: 24.4672, lng: 39.6111, tz: 'Asia/Riyadh' }
  ];

  var PRAYER_NAMES = {
    fajr: 'الفجر',
    sunrise: 'الشروق',
    dhuhr: 'الظهر',
    asr: 'العصر',
    maghrib: 'المغرب',
    isha: 'العشاء'
  };
  var PRAYER_ORDER = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

  // ---- State ----
  var locationState = {
    source: null, // 'gps' | 'manual'
    lat: null,
    lng: null,
    label: null,
    accuracy: null,
    tzOffsetHours: null // civil offset for the chosen date
  };
  var timesCache = null; // { dateKey, lat, lng, times }
  var settings = loadSettings();
  var orientationHandler = null;
  var compassActive = false;
  // ---- Countdown state ----
  // Tracks which prayer key is currently highlighted/rendered so the
  // per-second tick can tell when the highlighted row itself needs to
  // move (full re-render) vs. just refreshing the countdown text in place.
  var lastRenderedNextKey = null;

  // ---- Math helpers ----
  function dtr(d){ return d * Math.PI / 180; }
  function rtd(r){ return r * 180 / Math.PI; }

  function julianDay(y, m, d){
    if(m <= 2){ y -= 1; m += 12; }
    var A = Math.floor(y / 100);
    var B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
  }

  function sunPosition(jd){
    var D = jd - 2451545.0;
    var g = 357.529 + 0.98560028 * D;
    var q = 280.459 + 0.98564736 * D;
    var L = q + 1.915 * Math.sin(dtr(g)) + 0.020 * Math.sin(dtr(2 * g));
    var e = 23.439 - 0.00000036 * D;
    var RA = rtd(Math.atan2(Math.cos(dtr(e)) * Math.sin(dtr(L)), Math.cos(dtr(L)))) / 15;
    if(RA < 0) RA += 24;
    var decl = rtd(Math.asin(Math.sin(dtr(e)) * Math.sin(dtr(L))));
    var EqT = q / 15 - RA;
    return { decl: decl, eqt: EqT };
  }

  function hourAngle(lat, decl, angle){
    var cosH = (Math.sin(dtr(angle)) - Math.sin(dtr(lat)) * Math.sin(dtr(decl))) /
      (Math.cos(dtr(lat)) * Math.cos(dtr(decl)));
    if(cosH <= -1) return 12;
    if(cosH >= 1) return 0;
    return rtd(Math.acos(cosH)) / 15;
  }

  function asrAltitude(lat, decl, factor){
    return rtd(Math.atan(1 / (factor + Math.tan(Math.abs(dtr(lat - decl))))));
  }

  function formatHM(t){
    if(t == null || !isFinite(t)) return null;
    t = ((t % 24) + 24) % 24;
    var h = Math.floor(t);
    var mi = Math.round((t - h) * 60);
    if(mi === 60){ h = (h + 1) % 24; mi = 0; }
    return (h < 10 ? '0' : '') + h + ':' + (mi < 10 ? '0' : '') + mi;
  }

  /** Presentation only: convert "HH:MM" (24h internal) → "hh:MM AM|PM". */
  function formatDisplayTime(hm24){
    if(hm24 == null || hm24 === '') return '—';
    var parts = String(hm24).split(':');
    if(parts.length < 2) return String(hm24);
    var h = parseInt(parts[0], 10);
    var mi = parseInt(parts[1], 10);
    if(isNaN(h) || isNaN(mi)) return String(hm24);
    var ap = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12;
    if(h12 === 0) h12 = 12;
    return (h12 < 10 ? '0' : '') + h12 + ':' + (mi < 10 ? '0' : '') + mi + ' ' + ap;
  }

  /** Arabic count-noun agreement for the countdown string (1/2/3-10/11+ each take a different form). */
  function arabicCountWord(n, forms){
    // forms: { one, two, few, many } — few = 3..10, many = 11+
    if(n === 1) return forms.one;
    if(n === 2) return forms.two;
    if(n >= 3 && n <= 10) return n + ' ' + forms.few;
    return n + ' ' + forms.many;
  }

  var HOUR_FORMS = { one: 'ساعة', two: 'ساعتين', few: 'ساعات', many: 'ساعة' };
  var MINUTE_FORMS = { one: 'دقيقة', two: 'دقيقتين', few: 'دقائق', many: 'دقيقة' };
  var PRAYER_ARRIVED_TEXT = 'حان وقت الصلاة';

  /**
   * Live countdown text for the highlighted prayer row, e.g. "باقي 3 ساعات و 18 دقيقة".
   * `minutesUntil` is the same fractional-minutes value getNextPrayer() returns
   * (current time → next prayer time) — never a decrementing stored counter.
   */
  function formatCountdownText(minutesUntil){
    if(minutesUntil == null || !isFinite(minutesUntil)) return '';
    var totalSeconds = Math.round(minutesUntil * 60);
    if(totalSeconds <= 0) return PRAYER_ARRIVED_TEXT;
    var totalMinutes = Math.floor(totalSeconds / 60);
    var hours = Math.floor(totalMinutes / 60);
    var minutes = totalMinutes % 60;
    if(hours === 0 && minutes === 0) return 'باقي أقل من دقيقة';
    var segments = [];
    if(hours > 0) segments.push(arabicCountWord(hours, HOUR_FORMS));
    if(minutes > 0) segments.push(arabicCountWord(minutes, MINUTE_FORMS));
    return 'باقي ' + segments.join(' و ');
  }

  /** Compute prayer times for a civil date at lat/lng with known UTC offset hours. */
  function computePrayerTimes(lat, lng, tzOffsetHours, year, month, day){
    var jd = julianDay(year, month, day) - lng / (15 * 24);
    var sp = sunPosition(jd);
    var noon = 12 + tzOffsetHours - lng / 15 - sp.eqt;
    var haRise = hourAngle(lat, sp.decl, SUNRISE_ALT);
    var fajrHa = hourAngle(lat, sp.decl, -FAJR_ANGLE);
    var ishaHa = hourAngle(lat, sp.decl, -ISHA_ANGLE);
    var asrAlt = asrAltitude(lat, sp.decl, ASR_FACTOR);
    var asrHa = hourAngle(lat, sp.decl, asrAlt);
    return {
      fajr: formatHM(noon - fajrHa),
      sunrise: formatHM(noon - haRise),
      dhuhr: formatHM(noon),
      asr: formatHM(noon + asrHa),
      maghrib: formatHM(noon + haRise),
      isha: formatHM(noon + ishaHa)
    };
  }

  /** True Qibla bearing (degrees clockwise from true north), 0–360. */
  function computeQiblaBearing(lat, lng){
    if(Math.abs(lat - KAABA_LAT) < 1e-6 && Math.abs(lng - KAABA_LNG) < 1e-6){
      return 0;
    }
    var phi1 = dtr(lat), phi2 = dtr(KAABA_LAT);
    var dL = dtr(KAABA_LNG - lng);
    var y = Math.sin(dL) * Math.cos(phi2);
    var x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dL);
    return (rtd(Math.atan2(y, x)) + 360) % 360;
  }

  // ---- World Magnetic Model 2025 (NOAA/NCEI) — local, no network ----
  // Epoch 2025.0, valid ~2025–2030. Coefficients from official WMM2025 COF.
  // Algorithm: spherical harmonics degree 12 (same structure as NOAA reference /
  // magdec2). Declination in degrees, positive east of true north.
  var WMM_EPOCH = 2025.0;
  var WMM_NMAX = 12;
  var WMM_G = [
    0.0, -29351.8, -1410.8, -2556.6, 2951.1, 1649.3, 1361.0, -2404.1, 1243.8, 453.6,
    895.0, 799.5, 55.7, -281.1, 12.1, -233.2, 368.9, 187.2, -138.7, -142.0,
    20.9, 64.4, 63.8, 76.9, -115.7, -40.9, 14.9, -60.7, 79.5, -77.0,
    -8.8, 59.3, 15.8, 2.5, -11.1, 14.2, 23.2, 10.8, -17.5, 2.0,
    -21.7, 16.9, 15.0, -16.8, 0.9, 4.6, 7.8, 3.0, -0.2, -2.5,
    -13.1, 2.4, 8.6, -8.7, -12.9, -1.3, -6.4, 0.2, 2.0, -1.0,
    -0.6, -0.9, 1.5, 0.9, -2.7, -3.9, 2.9, -1.5, -2.5, 2.4,
    -0.6, -0.1, -0.6, -0.1, 1.1, -1.0, -0.2, 2.6, -2.0, -0.2,
    0.3, 1.2, -1.3, 0.6, 0.6, 0.5, -0.1, -0.4, -0.2, -1.3,
    -0.7
  ];
  var WMM_H = [
    0.0, 0.0, 4545.4, 0.0, -3133.6, -815.1, 0.0, -56.6, 237.5, -549.5,
    0.0, 278.6, -133.9, 212.0, -375.6, 0.0, 45.4, 220.2, -122.9, 43.0,
    106.1, 0.0, -18.4, 16.8, 48.8, -59.8, 10.9, 72.7, 0.0, -48.9,
    -14.4, -1.0, 23.4, -7.4, -25.1, -2.3, 0.0, 7.1, -12.6, 11.4,
    -9.7, 12.7, 0.7, -5.2, 3.9, 0.0, -24.8, 12.2, 8.3, -3.3,
    -5.2, 7.2, -0.6, 0.8, 10.0, 0.0, 3.3, 0.0, 2.4, 5.3,
    -9.1, 0.4, -4.2, -3.8, 0.9, -9.1, 0.0, 0.0, 2.9, -0.6,
    0.2, 0.5, -0.3, -1.2, -1.7, -2.9, -1.8, -2.3, 0.0, -1.3,
    0.7, 1.0, -1.4, 0.0, 0.6, -0.1, 0.8, 0.1, -1.0, 0.1,
    0.2
  ];
  var WMM_GT = [
    0.0, 12.0, 9.7, -11.6, -5.2, -8.0, -1.3, -4.2, 0.4, -15.6,
    -1.6, -2.4, -6.0, 5.6, -7.0, 0.6, 1.4, 0.0, 0.6, 2.2,
    0.9, -0.2, -0.4, 0.9, 1.2, -0.9, 0.3, 0.9, 0.0, -0.1,
    -0.1, 0.5, -0.1, -0.8, -0.8, 0.8, -0.1, 0.2, 0.0, 0.5,
    -0.1, 0.3, 0.2, 0.0, 0.2, 0.0, -0.1, 0.1, 0.3, -0.3,
    0.0, 0.3, -0.1, 0.1, -0.1, 0.1, 0.0, 0.1, 0.1, 0.0,
    -0.3, 0.0, -0.1, -0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
    0.0, -0.1, 0.0, 0.0, -0.1, -0.1, -0.1, -0.1, 0.0, 0.0,
    0.0, 0.0, 0.0, 0.0, 0.1, 0.0, 0.0, 0.0, -0.1, 0.0,
    -0.1
  ];
  var WMM_HT = [
    0.0, 0.0, -21.5, 0.0, -27.7, -12.1, 0.0, 4.0, -0.3, -4.1,
    0.0, -1.1, 4.1, 1.6, -4.4, 0.0, -0.5, 2.2, 0.4, 1.7,
    1.9, 0.0, 0.3, -1.6, -0.4, 0.9, 0.7, 0.9, 0.0, 0.6,
    0.5, -0.8, 0.0, -1.0, 0.6, -0.2, 0.0, -0.2, 0.5, -0.4,
    0.4, -0.5, -0.6, 0.3, 0.2, 0.0, -0.3, 0.3, -0.3, 0.3,
    0.2, -0.1, -0.2, 0.4, 0.1, 0.0, 0.0, 0.0, -0.2, 0.1,
    -0.1, 0.1, 0.0, -0.1, 0.2, 0.0, 0.0, 0.0, 0.1, 0.0,
    0.1, 0.0, 0.0, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
    0.0, -0.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
    -0.1
  ];
  var WMM_NCOEFF = 91;
  var WGS84_A = 6378.137;
  var WGS84_B = 6356.7523142;
  var WGS84_ESQ = 1.0 - (WGS84_B * WGS84_B) / (WGS84_A * WGS84_A);
  var EARTH_R_WMM = 6371.2;

  function wmmIdx(n, m){ return (n * (n + 1)) / 2 + m; }

  function decimalYearFromDate(d){
    var y = d.getUTCFullYear();
    var start = Date.UTC(y, 0, 1);
    var end = Date.UTC(y + 1, 0, 1);
    return y + (d.getTime() - start) / (end - start);
  }

  /**
   * Magnetic declination (degrees, +east) at geodetic lat/lng and optional altitude km.
   * Uses WMM2025. Cached per location+day so sensor loop stays local/fast.
   */
  var _declCache = { key: null, value: 0 };
  function computeDeclination(lat, lng, dateObj, altKm){
    altKm = altKm || 0;
    var dyear = decimalYearFromDate(dateObj || new Date());
    var key = lat.toFixed(4) + ',' + lng.toFixed(4) + ',' + dyear.toFixed(3) + ',' + (altKm||0);
    if(_declCache.key === key) return _declCache.value;
    var field = wmmDeclination(lat, lng, dyear, altKm);
    var val = (field && typeof field === 'object') ? field.decl : field;
    _declCache = { key: key, value: val };
    return val;
  }

  function wmmDeclination(latDeg, lonDeg, dyear, altKm){
    altKm = altKm || 0;
    var dt = dyear - WMM_EPOCH;
    var g = new Array(WMM_NCOEFF);
    var h = new Array(WMM_NCOEFF);
    var i, n, m;
    for(i = 0; i < WMM_NCOEFF; i++){
      g[i] = WMM_G[i] + WMM_GT[i] * dt;
      h[i] = WMM_H[i] + WMM_HT[i] * dt;
    }
    if(latDeg > 89.9999) latDeg = 89.9999;
    if(latDeg < -89.9999) latDeg = -89.9999;
    var latRad = dtr(latDeg);
    var lonRad = dtr(lonDeg);
    var sinLat = Math.sin(latRad);
    var cosLat = Math.cos(latRad);
    var rc = WGS84_A / Math.sqrt(1.0 - WGS84_ESQ * sinLat * sinLat);
    var xp = (rc + altKm) * cosLat;
    var zp = (rc * (1.0 - WGS84_ESQ) + altKm) * sinLat;
    var r = Math.sqrt(xp * xp + zp * zp);
    var gcLatRad = Math.asin(zp / r);
    var gcLatDeg = rtd(gcLatRad);
    var sinGc = Math.sin(gcLatRad);
    var cosGc = Math.cos(gcLatRad);
    var rr = new Array(WMM_NMAX + 1);
    var ratio = EARTH_R_WMM / r;
    rr[0] = ratio * ratio;
    for(n = 1; n <= WMM_NMAX; n++) rr[n] = rr[n - 1] * ratio;
    var cosMl = new Array(WMM_NMAX + 1);
    var sinMl = new Array(WMM_NMAX + 1);
    cosMl[0] = 1; sinMl[0] = 0;
    cosMl[1] = Math.cos(lonRad); sinMl[1] = Math.sin(lonRad);
    for(m = 2; m <= WMM_NMAX; m++){
      cosMl[m] = cosMl[m - 1] * cosMl[1] - sinMl[m - 1] * sinMl[1];
      sinMl[m] = sinMl[m - 1] * cosMl[1] + cosMl[m - 1] * sinMl[1];
    }
    var Pcup = new Array(WMM_NCOEFF);
    var dPcup = new Array(WMM_NCOEFF);
    for(i = 0; i < WMM_NCOEFF; i++){ Pcup[i] = 0; dPcup[i] = 0; }
    var x = sinGc, z = cosGc;
    Pcup[0] = 1; dPcup[0] = 0;
    Pcup[wmmIdx(1, 0)] = x; dPcup[wmmIdx(1, 0)] = -z;
    Pcup[wmmIdx(1, 1)] = z; dPcup[wmmIdx(1, 1)] = x;
    for(n = 2; n <= WMM_NMAX; n++){
      for(m = 0; m <= n; m++){
        var idx = wmmIdx(n, m);
        if(m === n){
          var i1 = wmmIdx(n - 1, m - 1);
          Pcup[idx] = z * Pcup[i1];
          dPcup[idx] = z * dPcup[i1] + x * Pcup[i1];
        }else{
          var i2 = wmmIdx(n - 1, m);
          if(m > n - 2){
            Pcup[idx] = x * Pcup[i2];
            dPcup[idx] = x * dPcup[i2] - z * Pcup[i2];
          }else{
            var i1b = wmmIdx(n - 2, m);
            var k = ((n - 1) * (n - 1) - m * m) / ((2 * n - 1) * (2 * n - 3));
            Pcup[idx] = x * Pcup[i2] - k * Pcup[i1b];
            dPcup[idx] = x * dPcup[i2] - z * Pcup[i2] - k * dPcup[i1b];
          }
        }
      }
    }
    var sqn = new Array(WMM_NCOEFF);
    sqn[0] = 1;
    for(n = 1; n <= WMM_NMAX; n++){
      sqn[wmmIdx(n, 0)] = sqn[wmmIdx(n - 1, 0)] * (2 * n - 1) / n;
      for(m = 1; m <= n; m++){
        sqn[wmmIdx(n, m)] = sqn[wmmIdx(n, m - 1)] *
          Math.sqrt((n - m + 1) * (m === 1 ? 2 : 1) / (n + m));
      }
    }
    for(n = 1; n <= WMM_NMAX; n++){
      for(m = 0; m <= n; m++){
        var id = wmmIdx(n, m);
        Pcup[id] *= sqn[id];
        dPcup[id] = -dPcup[id] * sqn[id];
      }
    }
    var Bx = 0, By = 0, Bz = 0;
    for(n = 1; n <= WMM_NMAX; n++){
      for(m = 0; m <= n; m++){
        var id2 = wmmIdx(n, m);
        var gcos = g[id2] * cosMl[m] + h[id2] * sinMl[m];
        var gsin = g[id2] * sinMl[m] - h[id2] * cosMl[m];
        Bz -= rr[n] * (n + 1) * gcos * Pcup[id2];
        By += rr[n] * m * gsin * Pcup[id2];
        Bx -= rr[n] * gcos * dPcup[id2];
      }
    }
    if(Math.abs(cosGc) > 1e-10) By /= cosGc;
    var psi = dtr(gcLatDeg - latDeg);
    var BxGeo = Bx * Math.cos(psi) - Bz * Math.sin(psi);
    var ByGeo = By;
    var BzGeo = Bx * Math.sin(psi) + Bz * Math.cos(psi);
    // Total intensity F in nT (WMM native unit). Declination unchanged.
    var F_nT = Math.sqrt(BxGeo * BxGeo + ByGeo * ByGeo + BzGeo * BzGeo);
    return { decl: rtd(Math.atan2(ByGeo, BxGeo)), F_nT: F_nT };
  }

  /**
   * Expected geomagnetic total intensity at lat/lng (µT), from WMM2025.
   * Used only for magnetometer reliability checks — never alters heading/Qibla.
   * Phone magnetometers are coarse; comparison uses wide relative tolerance.
   */
  var _intensityCache = { key: null, value: 0 };
  function computeExpectedIntensity_uT(lat, lng, dateObj, altKm){
    altKm = altKm || 0;
    if(lat == null || lng == null || isNaN(lat) || isNaN(lng)) return null;
    var dyear = decimalYearFromDate(dateObj || new Date());
    var key = lat.toFixed(4) + ',' + lng.toFixed(4) + ',' + dyear.toFixed(3) + ',' + (altKm||0);
    if(_intensityCache.key === key) return _intensityCache.value;
    var field = wmmDeclination(lat, lng, dyear, altKm);
    // wmmDeclination now returns {decl, F_nT}; keep backward-safe if ever numeric.
    var f_nT = (field && typeof field === 'object') ? field.F_nT : null;
    if(f_nT == null || !isFinite(f_nT) || f_nT <= 0) return null;
    var uT = f_nT / 1000; // nT → µT (Chrome Magnetometer unit)
    _intensityCache = { key: key, value: uT };
    return uT;
  }


  // ---- Timezone ----
  function getTimezoneOffsetHours(dateObj, timeZone){
    try{
      // Prefer Intl for Africa/Cairo etc.
      var fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: timeZone || 'Africa/Cairo',
        timeZoneName: 'shortOffset',
        hour: '2-digit', hourCycle: 'h23'
      });
      // Fallback: difference from UTC via formatted parts
      var dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: timeZone || 'Africa/Cairo',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hourCycle: 'h23'
      });
      var parts = dtf.formatToParts(dateObj);
      var map = {};
      parts.forEach(function(p){ if(p.type !== 'literal') map[p.type] = p.value; });
      var asUTC = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour, +map.minute, +map.second);
      return (asUTC - dateObj.getTime()) / 3600000;
    }catch(e){
      // Egypt: roughly +2 winter, +3 summer (DST late Apr–late Oct)
      var m = dateObj.getUTCMonth() + 1;
      return (m >= 5 && m <= 10) ? 3 : 2;
    }
  }

  function todayParts(tzOffsetHours){
    var now = new Date();
    // Approximate local Y-M-D using offset
    var localMs = now.getTime() + tzOffsetHours * 3600000;
    var ld = new Date(localMs);
    return {
      y: ld.getUTCFullYear(),
      m: ld.getUTCMonth() + 1,
      d: ld.getUTCDate(),
      dateKey: ld.getUTCFullYear() + '-' + pad2(ld.getUTCMonth() + 1) + '-' + pad2(ld.getUTCDate())
    };
  }

  function pad2(n){ return n < 10 ? '0' + n : '' + n; }

  function parseHMToMinutes(hm){
    if(!hm) return null;
    var p = hm.split(':');
    return (+p[0]) * 60 + (+p[1]);
  }

  // ---- Settings ----
  function loadSettings(){
    try{
      var raw = localStorage.getItem(STORAGE_KEY);
      if(raw){
        var o = JSON.parse(raw);
        return normalizeSettings(o);
      }
    }catch(e){}
    return defaultSettings();
  }

  function defaultSettings(){
    return {
      manualCityId: 'cairo',
      preferGps: true,
      customLocations: []
    };
  }

  function normalizeCustomLocations(list){
    var out = [];
    var seen = Object.create(null);
    if(!list || !list.length) return out;
    for(var i = 0; i < list.length; i++){
      var it = list[i];
      if(!it || typeof it !== 'object') continue;
      var id = typeof it.id === 'string' ? it.id : '';
      var name = typeof it.name === 'string' ? it.name.trim() : '';
      var lat = typeof it.lat === 'number' ? it.lat : parseFloat(it.lat);
      var lng = typeof it.lng === 'number' ? it.lng : parseFloat(it.lng);
      if(!id || !name || isNaN(lat) || isNaN(lng)) continue;
      if(seen[id]) continue;
      // Never shadow a built-in city id
      if(findDefaultLocation(id)) continue;
      seen[id] = true;
      out.push({ id: id, name: name, lat: lat, lng: lng });
    }
    return out;
  }

  function normalizeSettings(o){
    var d = defaultSettings();
    if(!o || typeof o !== 'object') return d;
    if(o.manualCityId) d.manualCityId = o.manualCityId;
    if(typeof o.preferGps === 'boolean') d.preferGps = o.preferGps;
    d.customLocations = normalizeCustomLocations(o.customLocations);
    return d;
  }

  function findDefaultLocation(id){
    for(var i = 0; i < CITIES.length; i++){
      if(CITIES[i].id === id) return CITIES[i];
    }
    return null;
  }

  function findCustomLocation(id){
    var list = settings.customLocations || [];
    for(var i = 0; i < list.length; i++){
      if(list[i].id === id) return list[i];
    }
    return null;
  }

  function findLocation(id){
    return findDefaultLocation(id) || findCustomLocation(id);
  }

  function isCustomLocationId(id){
    return !!findCustomLocation(id);
  }

  function allLocations(){
    var list = CITIES.slice();
    var custom = settings.customLocations || [];
    for(var i = 0; i < custom.length; i++) list.push(custom[i]);
    return list;
  }

  // بيدور على موقع (مدينة مدمجة أو محفوظ يدويًا) بنفس الإحداثيات تقريبًا
  // (فرق أقل من ~50 مترًا) عشان نمنع حفظ نفس الموقع مرتين باسمين مختلفين.
  function findLocationByCoords(lat, lng){
    if(lat == null || lng == null) return null;
    var TOLERANCE_DEG = 0.0005; // ~50 مترًا عند خط الاستواء تقريبًا
    var list = allLocations();
    for(var i = 0; i < list.length; i++){
      var loc = list[i];
      if(loc.lat == null || loc.lng == null) continue;
      if(Math.abs(loc.lat - lat) <= TOLERANCE_DEG && Math.abs(loc.lng - lng) <= TOLERANCE_DEG){
        return loc;
      }
    }
    return null;
  }

  function newCustomLocationId(){
    return 'custom_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36);
  }

  function saveSettings(){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }catch(e){}
  }

  // ---- Location ----
  function applyManualCity(cityId){
    var loc = findLocation(cityId);
    if(!loc) loc = CITIES[0];
    locationState.source = 'manual';
    locationState.lat = loc.lat;
    locationState.lng = loc.lng;
    locationState.label = loc.name;
    locationState.accuracy = null;
    locationState.timeZone = loc.tz || 'Africa/Cairo';
    settings.manualCityId = loc.id;
    settings.preferGps = false;
    saveSettings();
    refreshTimes();
  }

  var gpsPending = false;
  // After user agrees to open Location Settings, retry GPS when app is visible again.
  var gpsResumePending = false;
  var gpsResumeListenerBound = false;

  function openLocationSettingsBestEffort(){
    // Pure web/PWA cannot open Android Location Settings via a stable public API.
    // Best-effort paths for optional native wrappers (Capacitor / WebView intents).
    try{
      if(window.Capacitor && window.Capacitor.Plugins){
        var plugins = window.Capacitor.Plugins;
        if(plugins.NativeSettings && typeof plugins.NativeSettings.open === 'function'){
          plugins.NativeSettings.open({ optionAndroid: 'location', optionIOS: 'location' });
          return true;
        }
        if(plugins.App && typeof plugins.App.openUrl === 'function'){
          plugins.App.openUrl({ url: 'android.settings.LOCATION_SOURCE_SETTINGS' });
          return true;
        }
      }
    }catch(e){}
    try{
      // Works in some Android WebViews / TWA shells; ignored by standard Chrome tabs.
      var intent = 'intent:#Intent;action=android.settings.LOCATION_SOURCE_SETTINGS;end';
      window.location.href = intent;
      return true;
    }catch(e2){}
    return false;
  }

  function bindGpsResumeListener(){
    if(gpsResumeListenerBound) return;
    gpsResumeListenerBound = true;
    document.addEventListener('visibilitychange', function(){
      if(document.visibilityState !== 'visible') return;
      if(!gpsResumePending) return;
      gpsResumePending = false;
      // Resume after Settings: one silent GPS attempt. If still unavailable,
      // fall back to manual without re-showing the dialog (avoids loop).
      setTimeout(function(){ requestGps({ silent: true }); }, 400);
    });
  }

  var LOCATION_MODAL_COPY = {
    services: {
      title: 'خدمة الموقع غير مفعّلة',
      text: 'خدمة الموقع غير مفعّلة. هل تريد فتح إعدادات الموقع؟'
    },
    permission: {
      title: 'لا يمكن الوصول لموقعك',
      text: 'يرجى تفعيل الموقع ثم حاول مرة أخرى. هل تريد فتح إعدادات الموقع؟'
    }
  };

  function setLocationServicesModalCopy(kind){
    var copy = LOCATION_MODAL_COPY[kind] || LOCATION_MODAL_COPY.services;
    var box = els.locationServicesModal;
    var titleEl = box ? box.querySelector('h3') : null;
    if(titleEl) titleEl.textContent = copy.title;
    if(els.locationServicesModalText) els.locationServicesModalText.textContent = copy.text;
  }

  function promptLocationServicesDialog(kind){
    var Dialogs = window.Dialogs;
    if(!Dialogs || typeof Dialogs.openLocationServicesModal !== 'function'){
      updateLocationUI();
      return;
    }
    setLocationServicesModalCopy(kind || 'services');
    Dialogs.openLocationServicesModal(function onYes(){
      gpsResumePending = true;
      bindGpsResumeListener();
      openLocationSettingsBestEffort();
      updateLocationUI();
    }, function onNo(){
      gpsResumePending = false;
      updateLocationUI();
    });
  }

  // Android/Chrome often reports Location Services OFF as PERMISSION_DENIED (code 1).
  // Prefer Permissions API when available to choose dialog copy.
  // opts.silent: true after return from Settings — fallback to manual, NO dialog.
  function handleGpsFailure(err, opts){
    opts = opts || {};
    var code = err && typeof err.code === 'number' ? err.code : null;

    // Never change locationState.source / coords on GPS failure.
    // Never call applyManualCity() here — manual only when the user picks a city.
    // If the user already has a successful GPS source, keep the last valid fix.
    updateLocationUI();

    // Already on GPS (or silent retry after Settings / tab re-open): toast only.
    if(locationState.source === 'gps' || opts.silent){
      try{
        if(window.UI && typeof UI.showToast === 'function'){
          UI.showToast('تعذر تحديث موقعك حاليًا');
        }
      }catch(e){}
      return;
    }

    // POSITION_UNAVAILABLE (2) / TIMEOUT (3) on a first attempt (not yet gps):
    // toast only — do not open Settings dialog.
    if(code === 2 || code === 3){
      try{
        if(window.UI && typeof UI.showToast === 'function'){
          UI.showToast('تعذر تحديث موقعك حاليًا');
        }
      }catch(e){}
      return;
    }

    // First GPS attempt with services off / permission issues: offer Settings.
    function show(kind){
      promptLocationServicesDialog(kind);
    }

    if(navigator.permissions && typeof navigator.permissions.query === 'function'){
      try{
        var q = navigator.permissions.query({ name: 'geolocation' });
        if(q && typeof q.then === 'function'){
          q.then(function(status){
            if(status && status.state === 'denied'){
              show('permission');
            }else{
              show('services');
            }
          }).catch(function(){
            show('services');
          });
          return;
        }
      }catch(e){}
    }

    show('services');
  }

  // opts.silent: retry after Settings without dialog on failure (no loop).
  function requestGps(opts){
    opts = opts || {};
    var silent = !!opts.silent;

    if(!navigator.geolocation){
      updateLocationUI();
      if(!silent) promptLocationServicesDialog('services');
      return;
    }
    gpsPending = true;
    if(els.prayerLocationStatus){
      els.prayerLocationStatus.textContent = 'جاري تحديد الموقع…';
    }
    if(els.prayerGpsBtn){
      els.prayerGpsBtn.textContent = '…';
      els.prayerGpsBtn.disabled = true;
    }
    navigator.geolocation.getCurrentPosition(function(pos){
      gpsPending = false;
      gpsResumePending = false;
      if(els.prayerGpsBtn) els.prayerGpsBtn.disabled = false;
      // Only set source=gps after a successful fix
      locationState.source = 'gps';
      locationState.lat = pos.coords.latitude;
      locationState.lng = pos.coords.longitude;
      locationState.accuracy = pos.coords.accuracy;
      locationState.label = 'موقعي الحالي';
      locationState.timeZone = 'Africa/Cairo'; // default; offset computed via Intl if available
      settings.preferGps = true;
      saveSettings();
      refreshTimes();
      updateLocationUI();
    }, function(err){
      gpsPending = false;
      if(els.prayerGpsBtn) els.prayerGpsBtn.disabled = false;
      handleGpsFailure(err, { silent: silent });
    }, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    });
  }

  // ---- Times cache / refresh ----
  function refreshTimes(){
    if(locationState.lat == null) return;
    var now = new Date();
    var tzOff = getTimezoneOffsetHours(now, locationState.timeZone || 'Africa/Cairo');
    locationState.tzOffsetHours = tzOff;
    var parts = todayParts(tzOff);
    var times = computePrayerTimes(
      locationState.lat, locationState.lng, tzOff,
      parts.y, parts.m, parts.d
    );
    timesCache = {
      dateKey: parts.dateKey,
      lat: locationState.lat,
      lng: locationState.lng,
      times: times,
      tzOffsetHours: tzOff
    };
    renderTimes();
  }

  function ensureTimesFresh(){
    if(!timesCache || locationState.lat == null){
      refreshTimes();
      return;
    }
    var tzOff = getTimezoneOffsetHours(new Date(), locationState.timeZone || 'Africa/Cairo');
    var parts = todayParts(tzOff);
    if(timesCache.dateKey !== parts.dateKey ||
       timesCache.lat !== locationState.lat ||
       timesCache.lng !== locationState.lng ||
       timesCache.tzOffsetHours !== tzOff){
      refreshTimes();
    }
  }

  // ---- Next prayer key (for list highlight only) ----
  function getNextPrayer(){
    if(!timesCache) return null;
    var tzOff = timesCache.tzOffsetHours;
    var now = new Date();
    var localMs = now.getTime() + tzOff * 3600000;
    var ld = new Date(localMs);
    var nowMin = ld.getUTCHours() * 60 + ld.getUTCMinutes() + ld.getUTCSeconds() / 60;
    var times = timesCache.times;
    // Consider only the five prayers for "next" (skip sunrise for primary next)
    var order = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
    for(var i = 0; i < order.length; i++){
      var k = order[i];
      var tMin = parseHMToMinutes(times[k]);
      if(tMin != null && tMin > nowMin + 0.05){
        return { key: k, name: PRAYER_NAMES[k], time: times[k], minutesUntil: tMin - nowMin };
      }
    }
    // Next is tomorrow's Fajr
    var fajrMin = parseHMToMinutes(times.fajr);
    if(fajrMin == null) return null;
    return { key: 'fajr', name: PRAYER_NAMES.fajr, time: times.fajr, minutesUntil: (24 * 60 - nowMin) + fajrMin, tomorrow: true };
  }


  // بيحسب عدد الشرطات المطلوب عشان خط الفاصل يقرب من عرض صندوق الـ
  // <select> بتاعنا (المقاس اللي بنتحكم فيه فعلاً بالـ CSS)، باستخدام
  // canvas لقياس عرض حرف "─" بنفس خط الصندوق، بدل رقم ثابت.
  //
  // ملحوظة مهمة: قائمة الـ <select> المفتوحة نفسها widget من نظام
  // أندرويد، والصفحة مالهاش أي وصول لقياس عرضها الفعلي أو الخط اللي
  // بيترسم بيه (ده اللي خلانا محتاجين نظبط الرقم يدويًا قبل كده). اللي
  // بيتحسب هنا هو عرض الصندوق المغلق بس كأقرب تقريب متاح؛ لو نظام
  // التشغيل عندك بيكبّر خط القوائم عن حجم الصفحة (إعداد "حجم الخط" في
  // أندرويد مثلاً)، ممكن لسه يحتاج ضبط بسيط عن طريق DIVIDER_CALIBRATION
  // تحت.
  var DIVIDER_CALIBRATION = 1; // اضبط الرقم ده لو الطول لسه مش مظبوط
  function computeDividerLabel(selectEl, fallbackChars){
    try{
      if(!selectEl) return '─'.repeat(fallbackChars);
      var boxWidth = selectEl.getBoundingClientRect().width || selectEl.offsetWidth;
      if(!boxWidth) return '─'.repeat(fallbackChars);
      var cs = window.getComputedStyle(selectEl);
      var font = (cs.fontStyle || 'normal') + ' ' + (cs.fontWeight || '400') + ' ' +
                 (cs.fontSize || '13px') + ' ' + (cs.fontFamily || 'sans-serif');
      if(!computeDividerLabel._canvas) computeDividerLabel._canvas = document.createElement('canvas');
      var ctx = computeDividerLabel._canvas.getContext('2d');
      ctx.font = font;
      var dashWidth = ctx.measureText('─').width;
      if(!dashWidth) return '─'.repeat(fallbackChars);
      var count = Math.round((boxWidth / dashWidth) * DIVIDER_CALIBRATION);
      count = Math.max(6, Math.min(60, count));
      return '─'.repeat(count);
    }catch(e){
      return '─'.repeat(fallbackChars);
    }
  }

  // ---- UI render ----
  function rebuildLocationSelect(){
    if(!els.prayerCitySelect) return;
    var prev = settings.manualCityId || 'cairo';
    if(!findLocation(prev)) prev = 'cairo';
    els.prayerCitySelect.innerHTML = '';
    CITIES.forEach(function(loc){
      var opt = document.createElement('option');
      opt.value = loc.id;
      opt.textContent = loc.name;
      if(loc.id === prev) opt.selected = true;
      els.prayerCitySelect.appendChild(opt);
    });
    // مواقع المستخدم المحفوظة يدويًا تتحط في optgroup منفصل بعنوان عبارة
    // عن خط فاصل (بدون كلام) عشان تتميّز عن المدن المدمجة. الـ <select>
    // ده widget من نظام أندرويد مش بنتحكم في تصميمه بالـ CSS، فالخط ده
    // أقصى حاجة ممكنة كفاصل بصري جوه القائمة الأصلية.
    var custom = settings.customLocations || [];
    if(custom.length){
      var group = document.createElement('optgroup');
      group.label = computeDividerLabel(els.prayerCitySelect, 19);
      custom.forEach(function(loc){
        var opt = document.createElement('option');
        opt.value = loc.id;
        opt.textContent = loc.name;
        if(loc.id === prev) opt.selected = true;
        group.appendChild(opt);
      });
      els.prayerCitySelect.appendChild(group);
    }
    els.prayerCitySelect.value = prev;
  }

  function updateLocationUI(){
    if(!els.prayerSourceManual && !els.prayerLocationStatus) return;
    var isGps = locationState.source === 'gps';

    if(els.prayerSourceManual) els.prayerSourceManual.checked = !isGps;
    if(els.prayerSourceGps) els.prayerSourceGps.checked = !!isGps;
    if(els.prayerSourceManualCard) els.prayerSourceManualCard.classList.toggle('is-active', !isGps);
    if(els.prayerSourceGpsCard) els.prayerSourceGpsCard.classList.toggle('is-active', !!isGps);

    if(els.prayerCitySelect){
      els.prayerCitySelect.value = settings.manualCityId || 'cairo';
      els.prayerCitySelect.disabled = !!isGps;
      els.prayerCitySelect.classList.toggle('prayer-city-inactive', !!isGps);
    }

    // Delete only for user custom locations while on saved-locations mode
    if(els.prayerLocDeleteBtn){
      var showDel = !isGps && isCustomLocationId(settings.manualCityId);
      els.prayerLocDeleteBtn.classList.toggle('hidden', !showDel);
      els.prayerLocDeleteBtn.disabled = !!isGps;
    }

    // Save only when GPS is active with a valid fix
    if(els.prayerGpsSaveBtn){
      var canSave = isGps && locationState.lat != null && locationState.lng != null;
      els.prayerGpsSaveBtn.classList.toggle('hidden', !canSave);
    }

    if(els.prayerLocationStatus){
      els.prayerLocationStatus.textContent = isGps
        ? 'الحساب الحالي حسب موقع GPS'
        : 'الحساب الحالي حسب الموقع المحفوظ';
    }

    // لا نعرض إحداثيات/دقة GPS للمستخدم — الحالة النصية أعلاه كافية
    if(els.prayerLocationLabel){
      els.prayerLocationLabel.textContent = '';
      els.prayerLocationLabel.hidden = true;
    }

    if(els.prayerGpsBtn){
      els.prayerGpsBtn.textContent = 'تحديث';
    }
  }

  function openSaveLocationModal(){
    if(!els.prayerSaveLocModal) return;
    if(locationState.source !== 'gps' || locationState.lat == null || locationState.lng == null){
      try{ if(window.UI && UI.showToast) UI.showToast('لا يوجد موقع GPS صالح للحفظ'); }catch(e){}
      return;
    }
    var dupOnOpen = findLocationByCoords(locationState.lat, locationState.lng);
    if(dupOnOpen){
      try{ if(window.UI && UI.showToast) UI.showToast('الإحداثيات محفوظة بالفعل باسم «' + dupOnOpen.name + '»'); }catch(e){}
      return;
    }
    if(els.prayerSaveLocInput) els.prayerSaveLocInput.value = '';
    if(els.prayerSaveLocError){
      els.prayerSaveLocError.textContent = '';
      els.prayerSaveLocError.classList.add('hidden');
    }
    if(window.UI && typeof UI.openPanel === 'function'){
      UI.openPanel(els.prayerSaveLocModal);
    }else{
      els.prayerSaveLocModal.classList.remove('hidden');
    }
    setTimeout(function(){
      if(els.prayerSaveLocInput) els.prayerSaveLocInput.focus();
    }, 50);
  }

  function closeSaveLocationModal(){
    if(!els.prayerSaveLocModal) return;
    els.prayerSaveLocModal.classList.add('hidden');
    if(window.UI && typeof UI.backIfTag === 'function'){
      try{ UI.backIfTag('panel', function(){}); }catch(e){}
    }
  }

  // ---- 1.0.632: Qibla calibration-instructions info panel ----
  // Purely informational UI. Opening/closing it only toggles a modal's
  // hidden class and pushes/pops the shared history stack (identical
  // mechanism to openSaveLocationModal/closeSaveLocationModal above) — it
  // never touches compassActive, orientationHandler, lockedHeadingSource,
  // headingSamples, the rotation-recovery tracker, or any other sensor
  // state. No sensor restart, calibration API, or heading/Qibla
  // recalculation is triggered here.
  function openCalibInfoModal(){
    if(!els.prayerCalibModal) return;
    if(window.UI && typeof UI.openPanel === 'function'){
      UI.openPanel(els.prayerCalibModal);
    }else{
      els.prayerCalibModal.classList.remove('hidden');
    }
  }

  function closeCalibInfoModal(){
    if(!els.prayerCalibModal) return;
    els.prayerCalibModal.classList.add('hidden');
    if(window.UI && typeof UI.backIfTag === 'function'){
      try{ UI.backIfTag('panel', function(){}); }catch(e){}
    }
  }

  function confirmSaveLocation(){
    if(locationState.source !== 'gps' || locationState.lat == null || locationState.lng == null){
      try{ if(window.UI && UI.showToast) UI.showToast('لا يوجد موقع GPS صالح للحفظ'); }catch(e){}
      closeSaveLocationModal();
      return;
    }
    var name = els.prayerSaveLocInput ? String(els.prayerSaveLocInput.value || '').trim() : '';
    if(!name){
      if(els.prayerSaveLocError){
        els.prayerSaveLocError.textContent = 'أدخل اسمًا للموقع';
        els.prayerSaveLocError.classList.remove('hidden');
      }
      return;
    }
    if(name.length > 40) name = name.slice(0, 40);
    var dup = findLocationByCoords(locationState.lat, locationState.lng);
    if(dup){
      if(els.prayerSaveLocError){
        els.prayerSaveLocError.textContent = 'الإحداثيات محفوظة بالفعل باسم «' + dup.name + '»';
        els.prayerSaveLocError.classList.remove('hidden');
      }
      return;
    }
    var id = newCustomLocationId();
    if(!settings.customLocations) settings.customLocations = [];
    settings.customLocations.push({
      id: id,
      name: name,
      lat: locationState.lat,
      lng: locationState.lng
    });
    settings.manualCityId = id;
    saveSettings();
    rebuildLocationSelect();
    closeSaveLocationModal();
    try{ if(window.UI && UI.showToast) UI.showToast('تم حفظ الموقع'); }catch(e){}
    updateLocationUI();
  }

  function deleteSelectedCustomLocation(){
    var id = settings.manualCityId;
    if(!isCustomLocationId(id)) return;
    settings.customLocations = (settings.customLocations || []).filter(function(x){ return x.id !== id; });
    settings.manualCityId = 'cairo';
    saveSettings();
    rebuildLocationSelect();
    applyManualCity('cairo');
    updateLocationUI();
    try{ if(window.UI && UI.showToast) UI.showToast('تم حذف الموقع'); }catch(e){}
  }

  function renderTimes(){
    if(!timesCache || !els.prayerTimesList) return;
    var next = getNextPrayer();
    var nextKey = next ? next.key : null;
    lastRenderedNextKey = nextKey;
    var html = '';
    PRAYER_ORDER.forEach(function(k){
      var t = timesCache.times[k];
      var isNext = (k === nextKey);
      html += '<div class="prayer-time-row' + (isNext ? ' prayer-time-next' : '') + '">' +
        '<div class="prayer-time-main">' +
          '<span class="prayer-time-name">' + PRAYER_NAMES[k] + '</span>' +
          '<span class="prayer-time-value" dir="ltr">' + formatDisplayTime(t) + '</span>' +
        '</div>' +
        (isNext ? '<div class="prayer-countdown" id="prayerCountdownText">' + formatCountdownText(next.minutesUntil) + '</div>' : '') +
        '</div>';
    });
    els.prayerTimesList.innerHTML = html;
  }

  /**
   * Per-second tick (see startCountdownLoop). Cheap path: if the highlighted
   * prayer hasn't changed since the last render, just update the countdown
   * text node in place. If it has (time crossed into the next prayer),
   * re-render the whole list immediately so the highlighted row moves
   * without waiting for the 30s refresh loop.
   */
  function updateCountdownTick(){
    if(!timesCache || !els.prayerTimesList) return;
    var next = getNextPrayer();
    var nextKey = next ? next.key : null;
    if(nextKey !== lastRenderedNextKey){
      renderTimes();
      return;
    }
    var node = document.getElementById('prayerCountdownText');
    if(node && next){
      node.textContent = formatCountdownText(next.minutesUntil);
    }
  }


  function renderQiblaStatic(){
    if(locationState.lat == null || !els.prayerQiblaAngle) return;
    var bearing = computeQiblaBearing(locationState.lat, locationState.lng);
    var txt = Math.round(bearing) + '°';
    els.prayerQiblaAngle.textContent = txt;
    if(els.prayerQiblaAngle2) els.prayerQiblaAngle2.textContent = txt;
    if(els.prayerQiblaNeedle){
      els.prayerQiblaNeedle.style.transform = 'rotate(' + bearing + 'deg)';
    }
  }

  var refreshTimer = null;
  function startRefreshLoop(){
    if(refreshTimer) clearInterval(refreshTimer);
    // إعادة حساب المواقيت (تغيّر اليوم/الموقع) وتحديث تظليل الصلاة الحالية.
    refreshTimer = setInterval(function(){
      ensureTimesFresh();
      renderTimes();
    }, 30000);
  }

  var countdownTimer = null;
  function startCountdownLoop(){
    if(countdownTimer) clearInterval(countdownTimer);
    // العد التنازلي داخل الصف المظلل فقط — يُحسب كل ثانية من
    // (الوقت الحالي → وقت الصلاة القادمة) الفعلي، وليس عدّاد تنازلي مخزّن.
    countdownTimer = setInterval(updateCountdownTick, 1000);
  }


  function sensorSupport(){
    return typeof window.DeviceOrientationEvent !== 'undefined';
  }

  function requestOrientationPermission(cb){
    if(typeof DeviceOrientationEvent !== 'undefined' &&
       typeof DeviceOrientationEvent.requestPermission === 'function'){
      DeviceOrientationEvent.requestPermission().then(function(state){
        cb(state === 'granted');
      }).catch(function(){ cb(false); });
    }else{
      cb(true);
    }
  }


  // ---- Device heading (True heading preferred) ----
  // Pipeline (Android/PWA):
  //   1. Prefer deviceorientationabsolute (Chrome: magnetometer rotation vector
  //      → horizontal heading is MAGNETIC in practice).

// Qibla compass reliability requires the phone to be physically flat
// (screen facing upward), not merely rotated to landscape on screen.
// beta/gamma are device tilt angles; a small tolerance avoids flicker.
function isQiblaPhoneFlat(beta, gamma){
  if(typeof beta !== 'number' || isNaN(beta)) return false;
  if(typeof gamma !== 'number' || isNaN(gamma)) return false;
  return Math.abs(beta) <= 15 && Math.abs(gamma) <= 15;
}

/* Safety UI: while phone orientation is invalid, never freeze on the last
   real heading and never display a stale qibla direction. */
function setQiblaCompassNeutralState(active) {
  // The actual compass markup uses #prayerCompassRose / #prayerQiblaMarker.
  // When orientation is invalid, explicitly reset the rose to a neutral,
  // non-directional state instead of leaving the last rendered transform.
  var rose = document.getElementById('prayerCompassRose');
  var marker = document.getElementById('prayerQiblaMarker');
  if (!rose) return;

  rose.classList.toggle('qibla-compass-frozen', !!active);

  if (active) {
    rose.style.transform = 'none';
    if (marker) {
      marker.style.visibility = 'hidden';
      marker.style.transform = 'none';
    }

    var neutral = rose.querySelector('.qibla-neutral-indicator');
    if (!neutral) {
      neutral = document.createElement('div');
      neutral.className = 'qibla-neutral-indicator';
      neutral.setAttribute('aria-hidden', 'true');
      neutral.textContent = '↑';
      rose.appendChild(neutral);
    }
    neutral.style.display = 'block';
  } else {
    var existing = rose.querySelector('.qibla-neutral-indicator');
    if (existing) existing.style.display = 'none';
    if (marker) {
      marker.style.visibility = '';
      // leave transform for live heading updates to set
    }
  }
}
  //   2. iOS: webkitCompassHeading is MAGNETIC (CW from magnetic north).
  //   3. Heading from alpha/beta/gamma via rotation matrix (not empirical
  //      -(alpha+beta*gamma/90)).
  //   4. Compensate screen.orientation.angle when present.
  //   5. Apply WMM ONCE only when frame is magnetic → True heading.
  //   6. Circular EMA; compare to True Qibla Bearing.

  var headingSamples = [];
  var smoothedTrueHeading = null;
  var SMOOTH_ALPHA = 0.32;
  // Hysteresis so "في اتجاه القبلة" does not flicker near the threshold
  var qiblaAlignedLatched = false;
  // Compass reliability: RELIABLE | UNRELIABLE | UNKNOWN
  // Never uses Qibla offset. Latches warning after sustained UNRELIABLE.
  // Without Magnetometer X/Y/Z, quiet constant bias cannot be proven (UNKNOWN).
  var magInterferenceLatched = false;
  var magBadStreak = 0;
  var magGoodStreak = 0;
  var MAG_BAD_ENTER = 5;
  var MAG_GOOD_EXIT = 6;
  var MAG_INTERFER_MSG = 'لضبط البوصلة، حرّك الهاتف بشكل 8';
  var magnetometerSensor = null;
  var magVectorSamples = []; // {x,y,z,mag,t} Chrome Magnetometer µT
  var lastMagVector = null;
  var lastMagFieldTs = 0;
  // Motion proxy from orientation deltas (deg/s) — false-positive guard only.
  var lastOrientMotion = null;
  var recentAngularRates = [];
  var DEVICE_STILL_RATE_DPS = 30;
  var lastSensorMeta = {
    source: null, frame: null, absolute: false, accuracy: null, appliedDecl: false
  };
  // Single active heading source for the session (never mix frames in EMA):
  //   'absolute-event'          → deviceorientationabsolute
  //   'orientation-absolute'    → deviceorientation with absolute===true
  //   'webkit'                  → webkitCompassHeading (iOS)
  // null until first valid reading locks the source.
  var lockedHeadingSource = null;

  // ---- 1.0.629: initialization confidence gate ----
  // Purpose (see PART 3 of the change spec): prevent a transient/uninitialized
  // sensor reading from immediately becoming the trusted heading. This does
  // NOT determine whether the heading points to true North — a wrong magnetic
  // reference can be perfectly stable. It only withholds acceptance into the
  // existing (unmodified) smoothing pipeline below until several consecutive
  // readings agree over a short window. Once STABLE, this gate never runs
  // again for the session (until a reset event) and every subsequent sample
  // flows through the exact same 628 math as before.
  var COMPASS_STATE_ACQUIRING = 'ACQUIRING';
  var COMPASS_STATE_STABLE = 'STABLE';
  var compassInitState = COMPASS_STATE_ACQUIRING;
  var acquisitionSamples = []; // { h: trueHeading, t: timestamp } pre-acceptance buffer
  var ACQUIRE_MIN_SAMPLES = 5;      // smallest reasonable sample requirement
  var ACQUIRE_MIN_WINDOW_MS = 350;  // smallest reasonable time requirement
  var ACQUIRE_MAX_STD_DEG = 8;      // circular std-dev considered "stable enough"
  var ACQUIRE_MAX_BUFFER = 10;      // cap buffer growth

  function resetCompassInitGate(){
    compassInitState = COMPASS_STATE_ACQUIRING;
    acquisitionSamples = [];
  }

  // ---- 1.0.630/631: rotation-based recovery window ----
  // A significant physical rotation of the phone can give Android's own
  // absolute-orientation sensor fusion a chance to re-lock onto a fresh
  // magnetic reference (see the "RECOVERY LOGIC" section of the change
  // spec). This block does NOT compute North itself, does NOT replace the
  // absolute heading with a relative one, and does NOT add/subtract any
  // correction angle. It only detects that the phone physically rotated
  // and, when the rotation is significant, re-arms the EXISTING
  // initialization confidence gate above — the exact same reset already
  // performed by onScreenOrientationChange() below on a screen-rotation
  // event. Once re-armed, every subsequent sample flows through the
  // unmodified acquisition → stability → EMA pipeline exactly as before;
  // this block never decides what the "correct" heading is.
  //
  // 1.0.631 change: the rotation-detection *input* changed from the derived
  // rawHeading (which mixes alpha, beta, and gamma via the rotation matrix)
  // to the RAW alpha sample straight from the orientation event. alpha is
  // used ONLY to measure physical yaw movement for this trigger — it is
  // never used as a heading and never feeds computeQiblaBearing() or
  // headingFromOrientation(). Trigger/min-step/gap constants and the
  // recovery action are unchanged from 630.
  var rotationRecoveryLastAlpha = null; // last RAW alpha seen (0-360, pre-WMM, pre-screen-correction)
  var rotationRecoveryLastTs = null;
  var rotationRecoveryAccumDeg = 0;
  var ROTATION_RECOVERY_TRIGGER_DEG = 150; // cumulative physical yaw required before recovery
  var ROTATION_RECOVERY_MIN_STEP_DEG = 2;  // ignore per-sample jitter below this (small hand movement guard)
  var ROTATION_RECOVERY_GAP_MS = 2500;     // a pause this long starts a fresh burst (no slow-drift accumulation)

  function resetRotationRecoveryTracking(){
    rotationRecoveryLastAlpha = null;
    rotationRecoveryLastTs = null;
    rotationRecoveryAccumDeg = 0;
  }

  /**
   * Feed the latest RAW alpha sample in (straight from the orientation
   * event, 0-360, before any heading math). Uses it ONLY to measure how far
   * the phone has physically rotated since the last sample — never as a
   * North reference, never to compute or offset a heading. Handles the
   * 0/360 wraparound via the shortest signed angular difference (angleDiff),
   * so e.g. 359°→1° counts as 2° of movement, not 358°. When cumulative
   * movement crosses ROTATION_RECOVERY_TRIGGER_DEG, re-arms the existing
   * confidence gate so the existing (unmodified) pipeline can naturally
   * re-acquire a stable heading, and returns true for that call.
   */
  function trackRotationForRecovery(alphaNow){
    var now = Date.now();
    var triggered = false;

    if(rotationRecoveryLastAlpha != null){
      if(rotationRecoveryLastTs != null && (now - rotationRecoveryLastTs) > ROTATION_RECOVERY_GAP_MS){
        // Long pause since the last sample: start a fresh burst rather than
        // letting slow drift accumulate across an entire session.
        rotationRecoveryAccumDeg = 0;
      }
      // Shortest signed angular difference correctly handles 0/360 wraparound.
      var step = Math.abs(angleDiff(rotationRecoveryLastAlpha, alphaNow));
      if(step >= ROTATION_RECOVERY_MIN_STEP_DEG){
        rotationRecoveryAccumDeg += step;
      }
      if(rotationRecoveryAccumDeg >= ROTATION_RECOVERY_TRIGGER_DEG){
        rotationRecoveryAccumDeg = 0;
        // Re-arm the existing gate only (identical to onScreenOrientationChange):
        // does not touch lockedHeadingSource, WMM, declination, or Qibla bearing.
        headingSamples = [];
        smoothedTrueHeading = null;
        resetCompassInitGate();
        magInterferenceLatched = false;
        magBadStreak = 0;
        magGoodStreak = 0;
        triggered = true;
      }
    }

    rotationRecoveryLastAlpha = alphaNow;
    rotationRecoveryLastTs = now;
    return triggered;
  }

  function angleDiff(a, b){
    return ((b - a + 540) % 360) - 180;
  }

  function normalizeDeg(a){
    return ((a % 360) + 360) % 360;
  }

  /**
   * Screen orientation angle (0 / 90 / 180 / 270).
   * DeviceOrientation is in the device frame; the visible "top of the UI"
   * rotates with screen.orientation.angle. Compensate so the rose matches
   * what the user sees on screen (documented in comments/docs; was missing
   * in the live pipeline).
   */
  function getScreenOrientationAngle(){
    try{
      if(typeof screen !== 'undefined' && screen.orientation &&
         typeof screen.orientation.angle === 'number' && !isNaN(screen.orientation.angle)){
        return screen.orientation.angle;
      }
    }catch(e){}
    try{
      if(typeof window.orientation === 'number' && !isNaN(window.orientation)){
        return window.orientation;
      }
    }catch(e2){}
    return 0;
  }

  /**
   * Compass heading = direction of the device +Y axis (top of screen)
   * projected onto the Earth horizontal plane.
   *
   * Uses W3C Device Orientation rotation R = ZXY (alpha, beta, gamma).
   * Body +Y in the Earth frame is the second column of R:
   *   [ -cos(beta)*sin(alpha),  cos(alpha)*cos(beta),  sin(beta) ]
   * Horizontal heading (CW from frame north):
   *   atan2(east, north) = atan2(-cos(beta)*sin(alpha), cos(alpha)*cos(beta))
   *
   * When beta ≈ 0 this reduces to (360 − alpha), matching the W3C flat-device
   * example (top pointing West ⇒ alpha=90 ⇒ heading 270).
   * gamma does not change the +Y body axis direction (rotation about Y).
   *
   * Returns null when the phone is nearly vertical (|beta| ≳ 85°) so the top
   * points skyward and has no reliable horizontal heading — caller must show
   * an appropriate sensor status (not invent a correction).
   *
   * This is NOT the W3C vertical-screen "facing" example (vector out the back
   * of the screen, [0,0,−1]), which is for AR "user facing" not "top of phone".
   */
  function headingFromOrientation(alpha, beta, gamma){
    if(alpha == null || isNaN(alpha)) return null;
    if(beta == null || isNaN(beta)) beta = 0;
    // gamma unused for +Y axis direction (kept in signature for API stability)
    void gamma;

    var betaRad = dtr(beta);
    var cosB = Math.cos(betaRad);
    // Near-vertical: top of device has no stable horizontal projection
    if(Math.abs(cosB) < 0.08){
      return null;
    }

    var alphaRad = dtr(alpha);
    var east = -cosB * Math.sin(alphaRad);
    var north = Math.cos(alphaRad) * cosB;
    return normalizeDeg(rtd(Math.atan2(east, north)));
  }



  function circularEma(prev, sample, alpha){
    if(prev == null || isNaN(prev)) return sample;
    return normalizeDeg(prev + alpha * angleDiff(prev, sample));
  }

  function headingVariance(samples){
    if(samples.length < 3) return 999;
    var sx = 0, sy = 0;
    samples.forEach(function(a){
      sx += Math.cos(dtr(a));
      sy += Math.sin(dtr(a));
    });
    var mean = rtd(Math.atan2(sy, sx));
    var sum = 0;
    samples.forEach(function(a){
      var d = angleDiff(mean, a);
      sum += d * d;
    });
    return Math.sqrt(sum / samples.length);
  }

  function magMags(samples){
    var out = [];
    for(var i = 0; i < samples.length; i++) out.push(samples[i].mag);
    return out;
  }

  function magStd(values){
    if(!values || values.length < 3) return 0;
    var sum = 0, i;
    for(i = 0; i < values.length; i++) sum += values[i];
    var mean = sum / values.length;
    var acc = 0;
    for(i = 0; i < values.length; i++){
      var d = values[i] - mean;
      acc += d * d;
    }
    return Math.sqrt(acc / values.length);
  }

  function vecAngleDeg(a, b){
    var na = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z) || 1;
    var nb = Math.sqrt(b.x * b.x + b.y * b.y + b.z * b.z) || 1;
    var c = (a.x * b.x + a.y * b.y + a.z * b.z) / (na * nb);
    if(c > 1) c = 1;
    if(c < -1) c = -1;
    return rtd(Math.acos(c));
  }

  function updateDeviceMotionProxy(alpha, beta, gamma){
    var now = Date.now();
    if(lastOrientMotion){
      var dt = (now - lastOrientMotion.t) / 1000;
      if(dt > 0.03 && dt < 1.2){
        var da = Math.abs(angleDiff(lastOrientMotion.a, alpha || 0));
        var db = Math.abs((beta || 0) - lastOrientMotion.b);
        var dg = Math.abs((gamma || 0) - lastOrientMotion.g);
        var rate = (da + db + dg) / dt;
        if(isFinite(rate)){
          recentAngularRates.push(rate);
          if(recentAngularRates.length > 10) recentAngularRates.shift();
        }
      }
    }
    lastOrientMotion = { a: alpha || 0, b: beta || 0, g: gamma || 0, t: now };
  }

  function isDeviceLikelyStill(){
    if(recentAngularRates.length < 4) return false;
    var sum = 0;
    for(var i = 0; i < recentAngularRates.length; i++) sum += recentAngularRates[i];
    return (sum / recentAngularRates.length) < DEVICE_STILL_RATE_DPS;
  }

  /**
   * Simple reliability verdict for the current compass direction.
   * Returns 'RELIABLE' | 'UNRELIABLE' | 'UNKNOWN'.
   * Never uses Qibla. Does not invent certainty without magnetometer for quiet bias.
   */
  function evaluateCompassReliability(accuracy, variance) {
  // Diagnostic only. Never changes heading, smoothing, WMM, or Qibla math.
  if (headingSamples.length < 4) return 'UNKNOWN';

  var headingStd = Math.sqrt(Math.max(0, Number(variance) || 0));
  var accuracyBad = Number.isFinite(accuracy) && accuracy > 30;
  var headingTooNoisy = headingStd > 16;

  if (accuracyBad || headingTooNoisy) return 'UNRELIABLE';
  return 'RELIABLE';
}

  function stopMagnetometer(){
    if(magnetometerSensor){
      try{ magnetometerSensor.stop(); }catch(e){}
      try{
        magnetometerSensor.onreading = null;
        magnetometerSensor.onerror = null;
      }catch(e2){}
      magnetometerSensor = null;
    }
    magVectorSamples = [];
    lastMagVector = null;
    lastMagFieldTs = 0;
  }

  function pushMagVector(x, y, z){
    var mag = Math.sqrt(x * x + y * y + z * z);
    if(!isFinite(mag)) return;
    var sample = { x: x, y: y, z: z, mag: mag, t: Date.now() };
    lastMagVector = sample;
    lastMagFieldTs = sample.t;
    magVectorSamples.push(sample);
    if(magVectorSamples.length > 16) magVectorSamples.shift();
  }

  function attachMagnetometerSensor(){
    if(typeof window.Magnetometer !== 'function') return;
    try{
      var sensor = new window.Magnetometer({ frequency: 10 });
      sensor.onreading = function(){
        try{
          var x = sensor.x, y = sensor.y, z = sensor.z;
          if(x == null || y == null || z == null) return;
          pushMagVector(x, y, z);
        }catch(e){}
      };
      sensor.onerror = function(){ stopMagnetometer(); };
      sensor.start();
      magnetometerSensor = sensor;
    }catch(e){
      magnetometerSensor = null;
    }
  }

  function startMagnetometer(){
    stopMagnetometer();
    if(typeof window.Magnetometer !== 'function') return;
    try{
      if(navigator.permissions && typeof navigator.permissions.query === 'function'){
        var q = navigator.permissions.query({ name: 'magnetometer' });
        if(q && typeof q.then === 'function'){
          q.then(function(status){
            if(status && status.state === 'denied') return;
            if(!compassActive) return;
            attachMagnetometerSensor();
          }).catch(function(){
            if(compassActive) attachMagnetometerSensor();
          });
          return;
        }
      }
    }catch(e){}
    attachMagnetometerSensor();
  }

  function onOrientation(ev){
    // ---- Identify what this event can provide ----
    var hasWebkit = typeof ev.webkitCompassHeading === 'number' && !isNaN(ev.webkitCompassHeading);
    var isAbsoluteEvent = (ev.type === 'deviceorientationabsolute');
    var isOrientationAbsolute = (ev.type === 'deviceorientation' && ev.absolute === true &&
                                 typeof ev.alpha === 'number' && !isNaN(ev.alpha));
    var isRelativeOnly = (ev.type === 'deviceorientation' && ev.absolute !== true && !hasWebkit);

    // Relative-only orientation is never a compass source
    if(isRelativeOnly){
      if(lockedHeadingSource == null && lastSensorMeta.source == null){
        setSensorStatus('unreliable', 'الاتجاه نسبي فقط — لا يمكن الاعتماد عليه كبوصلة');
      }
      return;
    }

    // ---- Source lock: one source per session ----
    // Priority when unlocked: absolute-event > webkit > orientation-absolute
    var candidate = null;
    if(isAbsoluteEvent && typeof ev.alpha === 'number' && !isNaN(ev.alpha)){
      candidate = 'absolute-event';
    }else if(hasWebkit){
      candidate = 'webkit';
    }else if(isOrientationAbsolute){
      candidate = 'orientation-absolute';
    }else{
      return;
    }

    if(lockedHeadingSource != null && candidate !== lockedHeadingSource){
      // Different source while one is already locked → ignore (no dual processing)
      return;
    }

    if(lockedHeadingSource == null){
      // Prefer absolute-event over others: if we are still probing and this is
      // webkit/orientation-absolute, only lock if absolute-event listener is absent.
      if(candidate !== 'absolute-event' && compassSourcePrefs.absoluteListenerAttached){
        // Absolute listener is attached; wait for it unless probe window elapsed
        if(!compassSourcePrefs.absoluteGaveUp){
          return;
        }
      }
      lockedHeadingSource = candidate;
      // Fresh EMA / samples for the locked source (never mix frames)
      headingSamples = [];
      smoothedTrueHeading = null;
      // Absolute won: drop the orientation fallback listener immediately
      if(candidate === 'absolute-event'){
        compassSourcePrefs.absoluteDelivered = true;
        detachOrientationFallback();
        clearCompassProbe();
      }
    }

    // Physical orientation gate: the compass is only trustworthy when the
    // phone is held approximately horizontal (screen facing upward).
    // A portrait/tilted phone can still produce a numerically stable heading,
    // but that heading is not acceptable for Qibla guidance.
    if(!isQiblaPhoneFlat(ev.beta, ev.gamma)){
      setSensorStatus('unreliable', 'أمسك الهاتف بشكل أفقي لتحديد الاتجاه بدقة');
      setQiblaCompassNeutralState(true);
      qiblaAlignedLatched = false;
      if(els.prayerAlignedBadge) els.prayerAlignedBadge.classList.add('hidden');
      if(els.prayerDeviceHeading) els.prayerDeviceHeading.textContent = '—';
      if(els.prayerHeadingDiff) els.prayerHeadingDiff.textContent = '—';
      return;
    }

    setQiblaCompassNeutralState(false);

    // ---- Extract raw heading from the locked source only ----
    var rawHeading = null;
    var frame = 'magnetic'; // Android rotation-vector / webkit → geomagnetic north
    var source = lockedHeadingSource;
    var accuracy = null;

    if(lockedHeadingSource === 'webkit'){
      rawHeading = normalizeDeg(ev.webkitCompassHeading);
      if(typeof ev.webkitCompassAccuracy === 'number') accuracy = ev.webkitCompassAccuracy;
    }else if(lockedHeadingSource === 'absolute-event' || lockedHeadingSource === 'orientation-absolute'){
      // Android Sensor.TYPE_ROTATION_VECTOR is geomagnetic-north referenced
      // (Android docs); treat as magnetic → apply WMM once for True heading.
      rawHeading = headingFromOrientation(ev.alpha, ev.beta, ev.gamma);
    }

    if(rawHeading == null || isNaN(rawHeading)){
      setQiblaCompassNeutralState(true);
      if(ev.absolute === true || typeof ev.alpha === 'number'){
        setSensorStatus('unreliable', 'أمسك الهاتف بشكل أفقي لتحديد الاتجاه بدقة');
      }else{
        setSensorStatus('unavailable', 'المستشعر غير متاح');
      }
      if(els.prayerDeviceHeading) els.prayerDeviceHeading.textContent = '—';
      if(els.prayerHeadingDiff) els.prayerHeadingDiff.textContent = '—';
      return;
    }

    // Screen frame: device +Y vs on-screen "top" (see getScreenOrientationAngle).
    // Not a Qibla offset — only maps heading to the visible UI axis.
    var screenAngle = getScreenOrientationAngle();
    if(screenAngle){
      rawHeading = normalizeDeg(rawHeading - screenAngle);
    }

    // Mark absolute path as delivering so probe can stop
    if(lockedHeadingSource === 'absolute-event'){
      compassSourcePrefs.absoluteDelivered = true;
    }

    // 1.0.631: feed the RAW alpha sample (not the derived rawHeading) to the
    // rotation-recovery tracker. rawHeading is explicitly derived from BOTH
    // alpha and beta (atan2(east, north) above), so it conflates yaw with
    // tilt. alpha alone is a simpler, more direct motion proxy — NOT a
    // guaranteed pure/isolated yaw signal: it is still one angle of the same
    // Euler (Z-X'-Y'') decomposition, and under combined tilt+rotation
    // motion — especially near gimbal-lock (beta approaching ±90°) — alpha
    // and gamma can couple, degrading alpha as a yaw-only indicator. In
    // practice this call site is only ever reached while isQiblaPhoneFlat
    // holds (beta/gamma within ±15°, see the early-return above), which
    // keeps us far from gimbal-lock and limits (but does not formally prove
    // away) that coupling. ev.alpha is used here ONLY to detect physical
    // rotation — never as a heading. When significant, it re-arms the
    // confidence gate above — see trackRotationForRecovery(). Not reached at
    // all when not flat, matching 630's existing behavior of not
    // accumulating (no reset/decay needed since the accumulator was never
    // advanced).
    if(typeof ev.alpha === 'number' && !isNaN(ev.alpha)){
      trackRotationForRecovery(normalizeDeg(ev.alpha));
    }

    // WMM once: magnetic frame only (never double-apply)
    var decl = 0;
    var appliedDecl = false;
    if(frame === 'magnetic' && locationState.lat != null){
      decl = computeDeclination(locationState.lat, locationState.lng, new Date(), 0);
      appliedDecl = true;
    }
    var trueHeading = appliedDecl ? normalizeDeg(rawHeading + decl) : rawHeading;

    lastSensorMeta = {
      source: source, frame: frame, absolute: !!ev.absolute,
      accuracy: accuracy, appliedDecl: appliedDecl, eventType: ev.type
    };

    // Motion proxy for reliability only — does not affect heading math.
    updateDeviceMotionProxy(ev.alpha, ev.beta, ev.gamma);

    if(typeof window !== 'undefined' && window.__PRAYER_HEADING_DEBUG){
      try{
        console.log('[prayer-heading]', {
          source: source,
          eventType: ev.type,
          absolute: ev.absolute,
          alpha: ev.alpha, beta: ev.beta, gamma: ev.gamma,
          webkit: hasWebkit ? ev.webkitCompassHeading : null,
          rawHeading: rawHeading,
          frame: frame,
          declination: decl,
          appliedDecl: appliedDecl,
          trueHeading: trueHeading
        });
      }catch(e){}
    }

    // ---- 1.0.629: initialization confidence gate (PART 3) ----
    // Withhold acceptance until several consecutive readings agree over a
    // short window. Nothing below this block is modified from 628: once
    // STABLE, this sample (and every one after it) falls straight through
    // to the exact same circularEma/headingSamples/Qibla-comparison code
    // that 628 always ran. STABILITY IS NOT PROOF OF TRUE NORTH (PART 4) —
    // this only rejects transient/uninitialized readings, never "corrects"
    // a heading or applies any offset.
    if(compassInitState !== COMPASS_STATE_STABLE){
      acquisitionSamples.push({ h: trueHeading, t: Date.now() });
      if(acquisitionSamples.length > ACQUIRE_MAX_BUFFER) acquisitionSamples.shift();

      var acquiredEnough = acquisitionSamples.length >= ACQUIRE_MIN_SAMPLES;
      var acquiredLongEnough = acquiredEnough &&
        (Date.now() - acquisitionSamples[0].t) >= ACQUIRE_MIN_WINDOW_MS;
      var acquiredStable = acquiredEnough &&
        headingVariance(acquisitionSamples.map(function(s){ return s.h; })) <= ACQUIRE_MAX_STD_DEG;

      if(acquiredLongEnough && acquiredStable){
        // Confidence reached on this sample — let it (and only it, going
        // forward) fall through to the unmodified 628 pipeline below.
        compassInitState = COMPASS_STATE_STABLE;
      }else{
        setQiblaCompassNeutralState(true);
        setSensorStatus('warming', 'جاري استقرار القراءة…');
        if(els.prayerDeviceHeading) els.prayerDeviceHeading.textContent = '—';
        if(els.prayerHeadingDiff) els.prayerHeadingDiff.textContent = '—';
        return;
      }
    }

    smoothedTrueHeading = circularEma(smoothedTrueHeading, trueHeading, SMOOTH_ALPHA);
    headingSamples.push(trueHeading);
    if(headingSamples.length > 12) headingSamples.shift();

    var qibla = locationState.lat != null
      ? computeQiblaBearing(locationState.lat, locationState.lng) : 0;
    var diff = angleDiff(smoothedTrueHeading, qibla);
    var absDiff = Math.abs(diff);

    if(els.prayerDeviceHeading) els.prayerDeviceHeading.textContent = Math.round(smoothedTrueHeading) + '°';
    if(els.prayerHeadingDiff) els.prayerHeadingDiff.textContent = Math.round(absDiff) + '°';
    if(els.prayerDeclination){
      els.prayerDeclination.textContent = appliedDecl
        ? ((decl >= 0 ? '+' : '') + decl.toFixed(1) + '°')
        : 'غير مطبّق';
    }

    if(els.prayerCompassRose){
      els.prayerCompassRose.style.transform = 'rotate(' + (-smoothedTrueHeading) + 'deg)';
    }
    if(els.prayerQiblaMarker){
      els.prayerQiblaMarker.style.transform = 'rotate(' + qibla + 'deg)';
    }

    if(els.prayerAlignedBadge){
      // Enter ≤5°, leave >8° — stops badge from popping in/out on noise
      var wasAligned = qiblaAlignedLatched;
      if(qiblaAlignedLatched){
        if(absDiff > 8) qiblaAlignedLatched = false;
      }else{
        if(absDiff <= 5) qiblaAlignedLatched = true;
      }
      els.prayerAlignedBadge.classList.toggle('hidden', !qiblaAlignedLatched);
      // Light haptic tick exactly on the false→true transition (entering
      // Qibla alignment), never while remaining aligned or on re-renders —
      // reuses UI.haptic's own debounce/feature-detection, just a touch
      // longer than the default button tick so it reads as a distinct cue.
      if(qiblaAlignedLatched && !wasAligned && window.UI && typeof UI.haptic === 'function'){
        UI.haptic(20);
      }
    }

    var variance = headingVariance(headingSamples);
    // Reliability: RELIABLE / UNRELIABLE / UNKNOWN → hysteresis → warning.
    // Independent of Qibla. Does not alter heading values.
    if(headingSamples.length < 4){
      setSensorStatus('warming', 'جاري استقرار القراءة…');
    }else{
      var verdict = evaluateCompassReliability(accuracy, variance);

      if(verdict === 'UNRELIABLE'){
        magBadStreak++;
        magGoodStreak = 0;
        if(magBadStreak >= MAG_BAD_ENTER) magInterferenceLatched = true;
      }else if(verdict === 'RELIABLE'){
        magGoodStreak++;
        magBadStreak = 0;
        // Once the sensor is confirmed reliable again, remove the recovery
        // guidance immediately instead of keeping stale warning state visible.
        magInterferenceLatched = false;
      }else{
        // UNKNOWN: do not push toward warning or recovery
        magBadStreak = 0;
        magGoodStreak = 0;
      }

      if(magInterferenceLatched){
        setSensorStatus('unreliable', MAG_INTERFER_MSG);
      }else if(accuracy != null && accuracy < 0){
        setSensorStatus('calibrate', 'يحتاج معايرة — حرّك الجهاز على شكل ∞');
      }else if(accuracy != null && accuracy > 25){
        setSensorStatus('poor', 'قراءة غير موثوقة (دقة المستشعر ضعيفة)');
      }else if(variance > 14 && isDeviceLikelyStill()){
        setSensorStatus('unstable', 'قراءة غير مستقرة — ابتعد عن المعادن والأجهزة الكهربائية');
      }else if(variance > 6){
        setSensorStatus('fair', 'القراءة غير مستقرة — لا تعتمد على الاتجاه');
      }else if(verdict === 'RELIABLE'){
        var noteOk = appliedDecl
          ? ('مغناطيسي + WMM ' + (decl >= 0 ? '+' : '') + decl.toFixed(1) + '°')
          : 'بدون تصحيح مغناطيسي';
        setSensorStatus('good', accuracy != null
          ? ('قراءة مستقرة · ' + source + ' · ' + noteOk)
          : 'قراءة مستقرة');
      }else{
        setSensorStatus('fair', 'جاري التحقق من استقرار القراءة — لا تعتمد على الاتجاه');
      }
    }
  }

  function setSensorStatus(code, msg){
    if(els.prayerSensorStatus){
      els.prayerSensorStatus.textContent = msg;
      els.prayerSensorStatus.setAttribute('data-status', code);
    }
  }

  // Probe prefs for absolute-event delivery (no long user-visible delay)
  var compassSourcePrefs = {
    absoluteListenerAttached: false,
    absoluteDelivered: false,
    absoluteGaveUp: false,
    probeTimer: null
  };

  function clearCompassProbe(){
    if(compassSourcePrefs.probeTimer){
      clearTimeout(compassSourcePrefs.probeTimer);
      compassSourcePrefs.probeTimer = null;
    }
  }

  function detachOrientationFallback(){
    if(orientationHandler){
      window.removeEventListener('deviceorientation', orientationHandler, true);
    }
  }

  function startCompass(){
    if(!sensorSupport()){
      setSensorStatus('unavailable', 'المستشعر غير متاح على هذا الجهاز/المتصفح');
      return;
    }
    requestOrientationPermission(function(ok){
      if(!ok){
        setSensorStatus('denied', 'صلاحية المستشعر مرفوضة');
        return;
      }
      if(orientationHandler) return;

      orientationHandler = onOrientation;
      headingSamples = [];
      smoothedTrueHeading = null;
      lockedHeadingSource = null;
      resetCompassInitGate();
      resetRotationRecoveryTracking();
      magInterferenceLatched = false;
      magBadStreak = 0;
      magGoodStreak = 0;
      lastOrientMotion = null;
      recentAngularRates = [];
      lastSensorMeta = { source: null, frame: null, absolute: false, accuracy: null, appliedDecl: false };
      compassSourcePrefs.absoluteListenerAttached = false;
      compassSourcePrefs.absoluteDelivered = false;
      compassSourcePrefs.absoluteGaveUp = false;
      clearCompassProbe();

      var hasAbsoluteApi = ('ondeviceorientationabsolute' in window);

      if(hasAbsoluteApi){
        // Primary: absolute event only. Fallback orientation is attached briefly
        // until absolute delivers, or until a short probe timeout.
        window.addEventListener('deviceorientationabsolute', orientationHandler, true);
        compassSourcePrefs.absoluteListenerAttached = true;
        // Fallback for iOS webkit / rare absolute API present but silent
        window.addEventListener('deviceorientation', orientationHandler, true);
        // After 400ms without absolute delivery, allow fallback sources to lock
        compassSourcePrefs.probeTimer = setTimeout(function(){
          compassSourcePrefs.probeTimer = null;
          if(!compassSourcePrefs.absoluteDelivered){
            compassSourcePrefs.absoluteGaveUp = true;
            // If we already locked absolute, keep it; else fallback may lock now
            if(lockedHeadingSource === 'absolute-event'){
              detachOrientationFallback();
            }
          }else{
            // Absolute is working — drop orientation listener to guarantee single source
            detachOrientationFallback();
          }
        }, 400);
      }else{
        // No absolute API: deviceorientation only (webkit or absolute===true)
        window.addEventListener('deviceorientation', orientationHandler, true);
      }

      compassActive = true;
      // Best-effort |B| monitor for stable-but-biased interference cases.
      // No-op when Magnetometer is missing or permission is denied.
      startMagnetometer();
      setSensorStatus('warming', 'جاري استقرار القراءة…');
      if(els.prayerCompassPanel) els.prayerCompassPanel.classList.remove('hidden');
      if(els.prayerOpenCompassBtn) els.prayerOpenCompassBtn.textContent = 'إغلاق البوصلة';
      renderQiblaStatic();
      // When the user rotates the screen, reset smoothing so old headings
      // (pre-compensation) do not linger in the EMA window.
      try{
        if(screen.orientation && typeof screen.orientation.addEventListener === 'function'){
          screen.orientation.addEventListener('change', onScreenOrientationChange);
        }else{
          window.addEventListener('orientationchange', onScreenOrientationChange);
        }
      }catch(e){}
    });
  }

  function onScreenOrientationChange(){
    if(!compassActive) return;
    headingSamples = [];
    smoothedTrueHeading = null;
    resetCompassInitGate();
    resetRotationRecoveryTracking();
    magInterferenceLatched = false;
    magBadStreak = 0;
    magGoodStreak = 0;
    lastOrientMotion = null;
    recentAngularRates = [];
    setSensorStatus('warming', 'جاري استقرار القراءة…');
  }

  function stopCompass(){
    clearCompassProbe();
    stopMagnetometer();
    if(orientationHandler){
      window.removeEventListener('deviceorientationabsolute', orientationHandler, true);
      window.removeEventListener('deviceorientation', orientationHandler, true);
      orientationHandler = null;
    }
    try{
      if(screen.orientation && typeof screen.orientation.removeEventListener === 'function'){
        screen.orientation.removeEventListener('change', onScreenOrientationChange);
      }
      window.removeEventListener('orientationchange', onScreenOrientationChange);
    }catch(e){}
    compassActive = false;
    headingSamples = [];
    smoothedTrueHeading = null;
    resetCompassInitGate();
    resetRotationRecoveryTracking();
    qiblaAlignedLatched = false;
    magInterferenceLatched = false;
    magBadStreak = 0;
    magGoodStreak = 0;
    lastOrientMotion = null;
    recentAngularRates = [];
    lockedHeadingSource = null;
    compassSourcePrefs.absoluteListenerAttached = false;
    compassSourcePrefs.absoluteDelivered = false;
    compassSourcePrefs.absoluteGaveUp = false;
    if(els.prayerCompassPanel) els.prayerCompassPanel.classList.add('hidden');
    if(els.prayerOpenCompassBtn) els.prayerOpenCompassBtn.textContent = 'فتح البوصلة';
  }

  // ---- Wire UI ----
  function wire(){
    if(els.prayerSourceManual){
      els.prayerSourceManual.addEventListener('change', function(){
        if(els.prayerSourceManual.checked){
          applyManualCity((els.prayerCitySelect && els.prayerCitySelect.value) || settings.manualCityId || 'cairo');
          updateLocationUI();
        }
      });
    }
    if(els.prayerSourceGps){
      els.prayerSourceGps.addEventListener('change', function(){
        if(els.prayerSourceGps.checked){
          requestGps();
        }
      });
    }
    // النقر على بطاقة GPS (حتى خارج الـradio) يطلب GPS
    if(els.prayerSourceGpsCard){
      els.prayerSourceGpsCard.addEventListener('click', function(e){
        if(e.target && (e.target.id === 'prayerGpsBtn' || e.target.closest('#prayerGpsBtn'))) return;
        if(locationState.source === 'gps') return;
        if(els.prayerSourceGps) els.prayerSourceGps.checked = true;
        requestGps();
      });
    }
    if(els.prayerGpsBtn){
      els.prayerGpsBtn.addEventListener('click', function(e){
        e.preventDefault();
        e.stopPropagation();
        requestGps();
      });
    }
    if(els.prayerCitySelect){
      rebuildLocationSelect();
      els.prayerCitySelect.addEventListener('change', function(){
        applyManualCity(els.prayerCitySelect.value);
        updateLocationUI();
      });
      // النقر على القائمة يفعّل الوضع اليدوي (مواقع محفوظة) إن كان GPS نشطًا
      els.prayerCitySelect.addEventListener('focus', function(){
        if(locationState.source === 'gps'){
          applyManualCity(els.prayerCitySelect.value || settings.manualCityId || 'cairo');
          updateLocationUI();
        }
      });
    }
    if(els.prayerGpsSaveBtn){
      els.prayerGpsSaveBtn.addEventListener('click', function(e){
        e.preventDefault();
        e.stopPropagation();
        openSaveLocationModal();
      });
    }
    if(els.prayerLocDeleteBtn){
      els.prayerLocDeleteBtn.addEventListener('click', function(e){
        e.preventDefault();
        e.stopPropagation();
        deleteSelectedCustomLocation();
      });
    }
    if(els.prayerSaveLocCancel){
      els.prayerSaveLocCancel.addEventListener('click', function(){ closeSaveLocationModal(); });
    }
    if(els.prayerSaveLocConfirm){
      els.prayerSaveLocConfirm.addEventListener('click', function(){ confirmSaveLocation(); });
    }
    if(els.prayerSaveLocInput){
      els.prayerSaveLocInput.addEventListener('keydown', function(e){
        if(e.key === 'Enter'){ e.preventDefault(); confirmSaveLocation(); }
      });
    }
    if(els.prayerOpenCompassBtn){
      els.prayerOpenCompassBtn.addEventListener('click', function(){
        if(compassActive){
          stopCompass();
        }else{
          startCompass();
        }
      });
    }
    if(els.prayerCalibHintBtn){
      els.prayerCalibHintBtn.addEventListener('click', function(e){
        e.preventDefault();
        openCalibInfoModal();
      });
    }
    if(els.prayerCalibModalClose){
      els.prayerCalibModalClose.addEventListener('click', function(){ closeCalibInfoModal(); });
    }
  }

  function onTabHidden(){
    // The compass is an on-demand sensor session. Stop it as soon as the
    // prayer tab is no longer visible to avoid unnecessary battery use.
    if(compassActive){
      stopCompass();
    }
  }

  function onTabShown(){
    ensureTimesFresh();
    updateLocationUI();
    renderTimes();
    renderQiblaStatic();
    startRefreshLoop();
    startCountdownLoop();
    // GPS can be turned off at the OS level without any event reaching this
    // page — there's no failed geolocation call to detect it, so locationState
    // just keeps the last successful fix and the UI still shows "GPS" as the
    // active source. Re-verify silently whenever the tab is reopened while
    // GPS is the active source: on success nothing visibly changes; on
    // failure it falls back to the manual city and the radio updates to
    // match, instead of staying stuck on a GPS selection that's no longer live.
    if(locationState.source === 'gps' && !gpsPending){
      requestGps({ silent: true });
    }
  }

  // Called after backup restore / factory paths that rewrite localStorage
  // so in-memory settings + UI match the stored prayer payload.
  function reloadFromStorage(){
    settings = loadSettings();
    rebuildLocationSelect();
    applyManualCity(settings.manualCityId || 'cairo');
    updateLocationUI();
    // Prefer GPS when the restored settings say so (silent: no dialogs)
    if(settings.preferGps){
      try{ requestGps({ silent: true }); }catch(e){}
    }
  }

  function init(deps){
    els = deps.els || {};
    wire();
    // Initial location: prefer last manual; attempt GPS only when user opens tab / presses button
    applyManualCity(settings.manualCityId || 'cairo');
    updateLocationUI();
  }

  // Expose for tests / external
  window.Prayer = {
    init: init,
    onTabShown: onTabShown,
    onTabHidden: onTabHidden,
    reloadFromStorage: reloadFromStorage,
    getCustomLocations: function(){ return (settings.customLocations || []).slice(); },
    mergeCustomLocations: function(list){
      var incoming = normalizeCustomLocations(list);
      if(!settings.customLocations) settings.customLocations = [];
      var byId = Object.create(null);
      settings.customLocations.forEach(function(x){ byId[x.id] = x; });
      incoming.forEach(function(x){
        if(byId[x.id]){
          byId[x.id].name = x.name;
          byId[x.id].lat = x.lat;
          byId[x.id].lng = x.lng;
        }else{
          settings.customLocations.push(x);
          byId[x.id] = x;
        }
      });
      saveSettings();
      rebuildLocationSelect();
      updateLocationUI();
    },
    computePrayerTimes: computePrayerTimes,
    computeQiblaBearing: computeQiblaBearing,
    KAABA_LAT: KAABA_LAT,
    KAABA_LNG: KAABA_LNG,
    FAJR_ANGLE: FAJR_ANGLE,
    ISHA_ANGLE: ISHA_ANGLE,
    ASR_FACTOR: ASR_FACTOR,
    CITIES: CITIES,
    computeDeclination: computeDeclination,
    computeExpectedIntensity_uT: computeExpectedIntensity_uT,
    wmmDeclination: wmmDeclination,
    angleDiff: angleDiff,
    headingFromOrientation: headingFromOrientation,
    formatDisplayTime: formatDisplayTime
  };
})();
