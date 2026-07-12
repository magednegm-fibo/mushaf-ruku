// ReaderBookmark: علامة القراءة — a single saved reading spot shared
// between both script modes, separate from favorites. Tapping the
// bookmark button always saves/moves it to the ruku currently open.
// Tapping the home-screen bookmark card jumps back to that same saved
// spot, regardless of which script is active when you tap it.
// Loaded before app.js (see index.html). Call ReaderBookmark.init(deps)
// once; deps: els, state, PAGES, UI, openReaderAt(pageIdx)
// Exposed as window.ReaderBookmark.
(function(){
  'use strict';

  var els, state, PAGES, UI, openReaderAt;

  var bookmark = {shared: null};

  // The saved reading bookmark is a single spot shared between both
  // script modes — saving it while reading Uthmani and then opening it
  // from Indopak (or vice versa) jumps to the same ruku. Kept as a
  // function (not a bare constant) to match the shape StorageManager
  // expects and leave room for a future per-script bookmark if needed.
  function currentBookmarkKey(){ return 'shared'; }

  function loadBookmark(){ return StorageManager.loadBookmarks(); }
  function saveBookmarkToStorage(){ StorageManager.saveBookmark(bookmark); }

  function updateBookmarkButton(){
    if(!els.btnBookmark) return;
    var b = bookmark[currentBookmarkKey()];
    els.btnBookmark.classList.toggle('active', !!b && b.page === state.page);
  }
  // Returns {page, surahName, pageData} for the home-screen bookmark
  // card, or null if there's no valid saved bookmark. Home picks
  // p.ruku vs p.rukuInJuz from pageData depending on JUZ_INFO — kept
  // out of this module since JUZ_INFO belongs to Home/app.js.
  function getBookmarkInfo(){
    var b = bookmark[currentBookmarkKey()];
    if(!b || !PAGES[b.page]) return null;
    var p = PAGES[b.page];
    return {page: b.page, surahName: p.ayahs[0].surahName, pageData: p};
  }

  function init(deps){
    els = deps.els;
    state = deps.state;
    PAGES = deps.PAGES;
    UI = deps.UI;
    openReaderAt = deps.openReaderAt;

    bookmark = loadBookmark();

    els.btnBookmark && els.btnBookmark.addEventListener('click', function(){
      bookmark[currentBookmarkKey()] = {page: state.page, ts: Date.now()};
      saveBookmarkToStorage();
      updateBookmarkButton();
      UI.showToast('تم حفظ علامة القراءة هنا');
    });
    els.bookmarkCard && els.bookmarkCard.addEventListener('click', function(){
      var b = bookmark[currentBookmarkKey()];
      if(!b) return;
      openReaderAt(b.page);
    });
  }

  window.ReaderBookmark = {
    init: init,
    updateBookmarkButton: updateBookmarkButton,
    getBookmarkInfo: getBookmarkInfo
  };
})();
