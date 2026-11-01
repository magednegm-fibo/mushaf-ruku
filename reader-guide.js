// ReaderGuide: دليل القارئ — the reference panel with tabs: علامات
// الوقف, قصر المنفصل, دعاء ختم القرآن, الإذاعة, الصلاة.
// This file only owns tab switching; prayer logic lives in prayer.js,
// radio in radio-player.js. "علامات الوقف" is always the tab shown first
// when the guide is opened from the home screen.
// Loaded before app.js (see index.html). Call ReaderGuide.init(deps)
// once; deps: els, UI
// Exposed as window.ReaderGuide.
(function(){
  'use strict';

  var els, UI;
  // DOM/visual order of the tabs, right to left (matches the flex row
  // under dir="rtl": tabWaqfMarks renders rightmost) — also the order
  // swiping moves through.
  var TAB_ORDER = ['waqf', 'tajweed', 'khatm', 'salah', 'radio'];
  var currentTab = 'waqf';

  function tabButtonFor(tab){
    if(tab === 'waqf') return els.tabWaqfMarks;
    if(tab === 'tajweed') return els.tabTajweedRules;
    if(tab === 'khatm') return els.tabKhatmDua;
    if(tab === 'radio') return els.tabRadio;
    if(tab === 'salah') return els.tabSalah;
    return null;
  }

  /** Keep the active tab label visible inside the horizontally scrollable .guide-tabs bar. */
  function ensureActiveTabVisible(tab){
    var btn = tabButtonFor(tab);
    var tabsBar = els.waqfGuidePanel && els.waqfGuidePanel.querySelector('.guide-tabs');
    if(!btn || !tabsBar) return;
    // Prefer native scrollIntoView (handles RTL scroll metrics across browsers).
    try{
      if(typeof btn.scrollIntoView === 'function'){
        btn.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
        return;
      }
    }catch(e){}
    // Fallback: manual horizontal scroll
    var btnLeft = btn.offsetLeft;
    var btnRight = btnLeft + btn.offsetWidth;
    var viewLeft = tabsBar.scrollLeft;
    var viewRight = viewLeft + tabsBar.clientWidth;
    if(btnLeft < viewLeft){
      tabsBar.scrollLeft = btnLeft - 8;
    }else if(btnRight > viewRight){
      tabsBar.scrollLeft = btnRight - tabsBar.clientWidth + 8;
    }
  }

  // ---- Tajweed: fetch HTML and inject into a div (no iframe) ----
  // iframe + SW on Android WebView repeatedly failed even online.
  // Injecting the same-origin document body avoids nested browsing contexts.
  var tajweedLoadState = 'idle'; // idle | loading | loaded | error
  function tajweedHost(){
    return document.getElementById('tajweedContentHost') ||
      (els && els.tajweedRulesTab && els.tajweedRulesTab.querySelector('.tajweed-content-host'));
  }
  function tajweedErrorEl(){
    return document.getElementById('tajweedLoadError');
  }
  function setTajweedErrorVisible(show){
    var err = tajweedErrorEl();
    var host = tajweedHost();
    if(err) err.classList.toggle('hidden', !show);
    if(host) host.classList.toggle('hidden', !!show);
  }
  function extractTajweedParts(html){
    var style = '';
    var reStyle = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    var m;
    while((m = reStyle.exec(html))){
      style += m[1] + '\n';
    }
    var body = html;
    var bm = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
    if(bm) body = bm[1];
    // Drop scripts — interaction is re-wired on the host in the parent page.
    body = body.replace(/<script\b[\s\S]*?<\/script>/gi, '');
    // Absolute font URLs (page origin), not relative to a vanished document base.
    var base;
    try{ base = new URL('./', window.location.href).href; }
    catch(e){ base = ''; }
    style = style.replace(/url\((['"]?)\.\/fonts\//g, 'url($1' + base + 'fonts/');
    body = body.replace(/url\((['"]?)\.\/fonts\//g, 'url($1' + base + 'fonts/');

    // CRITICAL: scope every rule under .tajweed-injected-root so global
    // selectors from the standalone page (body, *, h2, .card, …) cannot
    // leak into the home screen / reader after the guide is closed.
    style = scopeTajweedCss(style, '.tajweed-injected-root');
    return { style: style, body: body };
  }

  function scopeTajweedCss(cssText, scope){
    // Strip document-level rules that must not touch the app shell.
    cssText = cssText.replace(/@font-face\s*\{[\s\S]*?\}/gi, function(block){
      // Keep @font-face global (needed to load the face) — return as-is with marker
      return '/*__FONT_FACE__*/' + block + '/*__/FONT_FACE__*/';
    });
    // Remove html/body/:root resets — remap useful bits onto the scope later.
    cssText = cssText.replace(/(?:^|})\s*(?:html|body|:root)\s*\{[\s\S]*?\}/gi, '}');
    // Universal selector → scoped
    cssText = cssText.replace(/(?:^|})\s*\*\s*\{/g, '}' + scope + ' *{');

    var fonts = [];
    cssText = cssText.replace(/\/\*__FONT_FACE__\*\/([\s\S]*?)\/\*__\/FONT_FACE__\*\//g, function(_, block){
      fonts.push(block);
      return '';
    });

    // Prefix remaining selectors. Handles comma-separated lists and @media blocks lightly.
    function prefixBlock(block){
      // Don't touch at-rules content recursively beyond one level of @media
      return block.replace(/(^|})\s*([^@}/\s][^{]*?)\s*\{/g, function(full, brace, selectors){
        var trimmed = selectors.trim();
        if(!trimmed || trimmed.indexOf(scope) === 0) return full;
        var parts = trimmed.split(',');
        var out = parts.map(function(sel){
          sel = sel.trim();
          if(!sel) return sel;
          if(sel.indexOf(scope) === 0) return sel;
          // body/html leftovers
          if(sel === 'body' || sel === 'html' || sel === ':root') return scope;
          return scope + ' ' + sel;
        }).join(', ');
        return brace + ' ' + out + '{';
      });
    }

    // Process @media blocks as a unit then the rest
    var result = '';
    var pos = 0;
    var mediaRe = /@media[^{]+\{/gi;
    var mm;
    var work = cssText;
    // Simple pass: prefix non-at-rule selector lists
    work = prefixBlock(work);
    // Nested rules inside @media also need prefix — prefixBlock already hits them if format is standard

    // Re-attach font faces (global by necessity)
    return fonts.join('\n') + '\n' + work;
  }

  function wireTajweedInjectedUI(root){
    if(!root || root.getAttribute('data-tajweed-wired') === '1') return;
    root.setAttribute('data-tajweed-wired', '1');

    function haptic(){
      try{
        if(window.UI && typeof window.UI.haptic === 'function') window.UI.haptic();
      }catch(e){}
    }

    function toggleVerse(verse){
      var card = verse.closest('.card');
      if(!card || !card.querySelector('.verse')) return;
      var isOpen = card.classList.toggle('is-open');
      verse.setAttribute('aria-expanded', String(isOpen));
      haptic();
    }

    function toggleSummaryTable(heading){
      var next = heading.nextElementSibling;
      while(next && !(next.classList && next.classList.contains('card'))){
        next = next.nextElementSibling;
      }
      if(!next || !next.querySelector('table')) return;
      var isOpen = next.classList.contains('summary-table-open');
      next.classList.toggle('summary-table-open', !isOpen);
      next.classList.toggle('summary-table-collapsed', isOpen);
      heading.setAttribute('aria-expanded', String(!isOpen));
      var icon = heading.querySelector('.table-toggle-icon');
      if(icon) icon.textContent = isOpen ? '＋' : '−';
    }

    function toggleDoor(title){
      var section = title.closest('.door-section');
      if(!section) return;
      var isOpen = section.classList.toggle('is-open');
      title.setAttribute('aria-expanded', String(isOpen));
      haptic();
    }

    root.addEventListener('click', function(event){
      var verse = event.target.closest && event.target.closest('.verse[role="button"]');
      if(verse){ toggleVerse(verse); return; }
      var heading = event.target.closest && event.target.closest('h2.table-toggle');
      if(heading){ toggleSummaryTable(heading); return; }
      var door = event.target.closest && event.target.closest('h2.door-title');
      if(door){ toggleDoor(door); }
    });

    root.addEventListener('keydown', function(event){
      if(event.key !== 'Enter' && event.key !== ' ') return;
      var verse = event.target.closest && event.target.closest('.verse[role="button"]');
      if(verse){ event.preventDefault(); toggleVerse(verse); return; }
      var heading = event.target.closest && event.target.closest('h2.table-toggle');
      if(heading){ event.preventDefault(); toggleSummaryTable(heading); return; }
      var door = event.target.closest && event.target.closest('h2.door-title');
      if(door){ event.preventDefault(); toggleDoor(door); }
    });

    root.querySelectorAll('h2.table-toggle').forEach(function(heading){
      var next = heading.nextElementSibling;
      while(next && !(next.classList && next.classList.contains('card'))){
        next = next.nextElementSibling;
      }
      if(next && next.querySelector('table')) next.classList.add('summary-table-collapsed');
    });
  }
  function loadTajweedHtml(force){
    var host = tajweedHost();
    if(!host) return;
    if(!force && (tajweedLoadState === 'loaded' || tajweedLoadState === 'loading')) return;
    tajweedLoadState = 'loading';
    setTajweedErrorVisible(false);
    var abs;
    try{ abs = new URL('ahkam-altajweed.html', window.location.href).href; }
    catch(e){ abs = 'ahkam-altajweed.html'; }
    var url = force ? (abs + (abs.indexOf('?') >= 0 ? '&' : '?') + 'v=' + Date.now()) : abs;

    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function(){ try{ ctrl && ctrl.abort(); }catch(e){} }, 12000);

    fetch(url, {
      credentials: 'same-origin',
      cache: force ? 'no-store' : 'default',
      signal: ctrl ? ctrl.signal : undefined
    }).then(function(res){
      if(!res || !res.ok) throw new Error('tajweed-http-' + (res && res.status));
      return res.text();
    }).then(function(html){
      clearTimeout(timer);
      if(!html || html.length < 500) throw new Error('tajweed-empty');
      var parts = extractTajweedParts(html);
      host.innerHTML = '';
      // Remove any previous global leak from older builds that injected unscoped CSS.
      try{
        document.querySelectorAll('style[data-tajweed-style]').forEach(function(n){ n.parentNode && n.parentNode.removeChild(n); });
      }catch(e){}
      if(parts.style){
        var st = document.createElement('style');
        st.setAttribute('data-tajweed-style', '1');
        st.textContent = parts.style;
        host.appendChild(st);
      }
      var wrap = document.createElement('div');
      wrap.className = 'tajweed-injected-root';
      wrap.innerHTML = parts.body;
      host.appendChild(wrap);
      wireTajweedInjectedUI(wrap);
      tajweedLoadState = 'loaded';
      setTajweedErrorVisible(false);
    }).catch(function(err){
      clearTimeout(timer);
      tajweedLoadState = 'error';
      setTajweedErrorVisible(true);
      try{ console.warn('[tajweed]', err && err.message ? err.message : err); }catch(e){}
    });
  }
  function preloadTajweedHtml(){
    loadTajweedHtml(false);
  }

  function switchGuideTab(tab){
    // Leaving the prayer tab must stop the compass immediately so sensor
    // listeners do not keep running while another guide tab is visible.
    if(currentTab === 'salah' && tab !== 'salah' && window.Prayer && typeof window.Prayer.onTabHidden === 'function'){
      window.Prayer.onTabHidden();
    }
    currentTab = tab;
    els.tabWaqfMarks && els.tabWaqfMarks.classList.toggle('active', tab === 'waqf');
    els.tabTajweedRules && els.tabTajweedRules.classList.toggle('active', tab === 'tajweed');
    els.tabKhatmDua && els.tabKhatmDua.classList.toggle('active', tab === 'khatm');
    els.tabRadio && els.tabRadio.classList.toggle('active', tab === 'radio');
    els.tabSalah && els.tabSalah.classList.toggle('active', tab === 'salah');
    els.waqfMarksTab && els.waqfMarksTab.classList.toggle('hidden', tab !== 'waqf');
    els.tajweedRulesTab && els.tajweedRulesTab.classList.toggle('hidden', tab !== 'tajweed');
    if(tab === 'tajweed'){
      loadTajweedHtml(tajweedLoadState === 'error');
    }
    els.khatmDuaTab && els.khatmDuaTab.classList.toggle('hidden', tab !== 'khatm');
    els.radioTab && els.radioTab.classList.toggle('hidden', tab !== 'radio');
    els.salahTab && els.salahTab.classList.toggle('hidden', tab !== 'salah');

    // تحميل كسول: لا تُحمَّل وحدات الإذاعة/الصلاة إلا عند فتح تبويبها أول مرة
    if(tab === 'radio' && typeof window.ensureRadioPlayer === 'function'){
      window.ensureRadioPlayer().catch(function(){ /* مُسجَّل في app.js */ });
    }
    if(tab === 'salah'){
      if(typeof window.ensurePrayer === 'function'){
        window.ensurePrayer().then(function(){
          if(currentTab === 'salah' && window.Prayer && typeof window.Prayer.onTabShown === 'function'){
            window.Prayer.onTabShown();
          }
        }).catch(function(){ /* مُسجَّل في app.js */ });
      }else if(window.Prayer && typeof window.Prayer.onTabShown === 'function'){
        window.Prayer.onTabShown();
      }
    }

    // After class toggles, bring the active tab chip into the visible strip
    // (fixes: swipe from الصلاة back to علامات الوقف while the bar stayed scrolled left).
    requestAnimationFrame(function(){ ensureActiveTabVisible(tab); });
  }

  // Swipe left/right inside the guide panel moves to the next/previous
  // tab. Same RTL convention used for turning pages in the reader and
  // for the tafsir panel (see wireSwipeAndPinch in navigation.js and
  // wireSwipe in reader-tafsir.js): dragging the finger right (dx > 0)
  // advances forward (toward the next tab in TAB_ORDER), left goes
  // back. Swiping past the first/last tab does nothing (no wraparound,
  // no toast — this is a lightweight tab switcher, not page navigation).
  // Uses the shared Gestures.swipe helper (gestures.js).
  function wireSwipe(){
    if(!els.waqfGuidePanel) return;
    Gestures.swipe({
      root: els.waqfGuidePanel,
      // شريط الـTabs قابل للتمرير أفقيًا — استثنِه من كاشف السحب حتى لا
      // يتنازع مع تمريره الأصلي (native) ويكسر سلاسته بـ preventDefault.
      // تبويب الصلاة (#salahTab) لم يعد مستثنى: السحب الأفقي داخله يبدّل
      // التبويب كباقي الدليل (مطلوب للوصول من/إلى مواقيت الصلاة بالسحب).
      // سحب الصفحة الأصلي للمتصفح كان يُعالَج سابقًا باستثناء JS كامل؛
      // الآن يُمنَع عبر CSS فقط: #salahTab { touch-action: pan-y } في
      // style.css — التمرير العمودي يعمل، والسحب الأفقي للمتصفح لا يحرّك
      // الصفحة، بينما Gestures.swipe ما زال يلتقط تبديل التبويب.
      ignoreTarget: function(el){
        return !!(el && el.closest && el.closest('.guide-tabs'));
      },
      onSwipe: function(dx){
        var idx = TAB_ORDER.indexOf(currentTab);
        var nextIdx = dx > 0 ? idx + 1 : idx - 1;
        if(nextIdx < 0 || nextIdx >= TAB_ORDER.length) return;
        switchGuideTab(TAB_ORDER[nextIdx]);
      }
    });
  }

  // The Tajweed content lives in a same-origin iframe. Touch events inside
  // an iframe do not bubble to the parent guide panel, so wire the same
  // horizontal tab-swipe behavior inside the iframe document as well.
  // Keep vertical scrolling native and reuse the shared swipe recognizer.
  var tajweedSwipeDocument = null;
  function wireTajweedIframeSwipe(){
    // No-op: Tajweed is injected into a div, not an iframe.
    // Horizontal tab swipe is already handled on the guide panel root.
  }


  function init(deps){
    els = deps.els;
    UI = deps.UI;

    els.tileWaqfGuide && els.tileWaqfGuide.addEventListener('click', function(){
      // Warm the Tajweed iframe in parallel with opening the guide panel.
      preloadTajweedHtml();
      switchGuideTab('waqf');
      UI.openPanel(els.waqfGuidePanel);
      // شريط الـTabs قابل للتمرير أفقيًا. إعادة الموضع يجب أن تتم بعد
      // إظهار اللوحة: أثناء display:none يتجاهل المتصفح scrollLeft ويُبقي
      // موضع التمرير السابق عند الظهور. في RTL على Chrome/Android القيمة
      // 0 = الحافة اليسرى، والقيمة العظمى = البداية المنطقية
      // (علامات الوقف على اليمين).
      requestAnimationFrame(function(){
        var tabsBar = els.waqfGuidePanel && els.waqfGuidePanel.querySelector('.guide-tabs');
        if(!tabsBar) return;
        tabsBar.scrollLeft = tabsBar.scrollWidth;
      });
    });
    els.btnCloseWaqfGuide && els.btnCloseWaqfGuide.addEventListener('click', function(){
      if(currentTab === 'salah' && window.Prayer && typeof window.Prayer.onTabHidden === 'function'){
        window.Prayer.onTabHidden();
      }
      UI.closePanel(els.waqfGuidePanel);
    });
    els.tabWaqfMarks && els.tabWaqfMarks.addEventListener('click', function(){ switchGuideTab('waqf'); });
    els.tabTajweedRules && els.tabTajweedRules.addEventListener('click', function(){ loadTajweedHtml(tajweedLoadState === 'error'); switchGuideTab('tajweed'); });
    els.tabKhatmDua && els.tabKhatmDua.addEventListener('click', function(){ switchGuideTab('khatm'); });
    els.tabRadio && els.tabRadio.addEventListener('click', function(){ switchGuideTab('radio'); });
    els.tabSalah && els.tabSalah.addEventListener('click', function(){ switchGuideTab('salah'); });
    wireSwipe();
    wireTajweedIframeSwipe();

    // Closing the guide via Android/system back (or any path that only
    // toggles .hidden through UI.closeTopmostOverlay) never hits the
    // btnCloseWaqfGuide handler above — sensors would keep running and
    // the compass panel would still be "open" when the user returns to
    // الصلاة. Mirror the tafsir panel pattern: observe the guide panel
    // and stop the compass whenever it becomes hidden while الصلاة is
    // the active tab. onTabHidden is idempotent (early-returns when
    // compassActive is already false), so double-calls from the close
    // button + observer are safe.
    if(typeof MutationObserver !== 'undefined' && els.waqfGuidePanel){
      var mo = new MutationObserver(function(){
        if(!els.waqfGuidePanel.classList.contains('hidden')) return;
        if(currentTab !== 'salah') return;
        if(window.Prayer && typeof window.Prayer.onTabHidden === 'function'){
          window.Prayer.onTabHidden();
        }
      });
      mo.observe(els.waqfGuidePanel, { attributes: true, attributeFilter: ['class'] });
    }

    UI.registerOverlayPanels([els.waqfGuidePanel].filter(Boolean));
  }

  window.ReaderGuide = {
    init: init
  };
})();
