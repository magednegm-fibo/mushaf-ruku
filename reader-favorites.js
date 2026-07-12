// ReaderFavorites: المفضلة — saving/removing a ruku as a favorite, the
// star button on the reader screen, and the المفضلة panel/list.
// Loaded before app.js (see index.html). Call ReaderFavorites.init(deps)
// once; deps: els, state, PAGES, UI, Dialogs, openReaderAt(pageIdx)
// Exposed as window.ReaderFavorites.
(function(){
  'use strict';

  var els, state, PAGES, UI, Dialogs, openReaderAt;

  var favorites = [];
  // Membership lookup (isFavorited) runs on every single page render via
  // updateFavButton() — scanning the whole favorites array each time
  // (favorites.some()) redoes the same linear search on every ruku turn.
  // A Set gives O(1) membership checks instead; kept in sync by hand at
  // every point that mutates `favorites` (add/remove).
  var favoritePages = new Set();
  var pendingFavPage = null;

  function loadFavorites(){ return StorageManager.loadFavorites(); }
  function saveFavorites(){ StorageManager.saveFavorites(favorites); }

  function isFavorited(pageIdx){
    return favoritePages.has(pageIdx);
  }
  function updateFavButton(){
    if(!els.btnFavorite) return;
    els.btnFavorite.classList.toggle('active', isFavorited(state.page));
  }
  function removeFavorite(pageIdx){
    favorites = favorites.filter(function(f){ return f.page !== pageIdx; });
    favoritePages.delete(pageIdx);
    saveFavorites();
  }
  function addFavorite(pageIdx, label){
    favorites.push({page: pageIdx, label: label, ts: Date.now()});
    favoritePages.add(pageIdx);
    saveFavorites();
  }
  function renderFavorites(){
    if(!favorites.length){
      els.favoritesList.innerHTML = '<div class="empty-state">لا توجد عناصر في المفضلة بعد.<br>اضغط على النجمة أثناء القراءة لإضافة ركوع.</div>';
      return;
    }
    var sorted = favorites.slice().sort(function(a,b){ return b.ts - a.ts; });
    els.favoritesList.innerHTML = sorted.map(function(f){
      var p = PAGES[f.page];
      var surahName = p ? p.ayahs[0].surahName : '';
      var ayahNum = p ? p.ayahs[0].ayah : '';
      return '<div class="fav-item" data-page="'+f.page+'">' +
        '<div class="fav-info">' +
          '<div class="fav-title">' + (f.label || surahName) + '</div>' +
          '<div class="fav-sub">' + surahName + ' \u2022 آية ' + UI.toArabicDigits(ayahNum) + '</div>' +
        '</div>' +
        '<button class="fav-remove" data-remove="'+f.page+'">' +
          '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6l-12 12"/></svg>' +
        '</button>' +
      '</div>';
    }).join('');
  }

  function init(deps){
    els = deps.els;
    state = deps.state;
    PAGES = deps.PAGES;
    UI = deps.UI;
    Dialogs = deps.Dialogs;
    openReaderAt = deps.openReaderAt;

    favorites = loadFavorites();
    favoritePages = new Set(favorites.map(function(f){ return f.page; }));

    els.favoritesList.addEventListener('click', function(e){
      var removeBtn = e.target.closest('.fav-remove');
      if(removeBtn && els.favoritesList.contains(removeBtn)){
        e.stopPropagation();
        removeFavorite(parseInt(removeBtn.getAttribute('data-remove'), 10));
        renderFavorites();
        updateFavButton();
        return;
      }
      var infoEl = e.target.closest('.fav-info');
      if(infoEl && els.favoritesList.contains(infoEl)){
        var page = parseInt(infoEl.parentElement.getAttribute('data-page'), 10);
        openReaderAt(page);
        UI.closePanel(els.favoritesPanel);
      }
    });
    els.tileFavorites.addEventListener('click', function(){
      renderFavorites();
      UI.openPanel(els.favoritesPanel);
    });
    els.btnCloseFavorites.addEventListener('click', function(){ UI.closePanel(els.favoritesPanel); });
    els.btnFavorite.addEventListener('click', function(){
      if(isFavorited(state.page)){
        removeFavorite(state.page);
        updateFavButton();
        return;
      }
      pendingFavPage = state.page;
      Dialogs.openFavModal(function(label){
        addFavorite(pendingFavPage, label);
        updateFavButton();
        pendingFavPage = null;
      });
    });

    UI.registerOverlayPanels([els.favoritesPanel].filter(Boolean));
  }

  window.ReaderFavorites = {
    init: init,
    isFavorited: isFavorited,
    updateFavButton: updateFavButton
  };
})();
