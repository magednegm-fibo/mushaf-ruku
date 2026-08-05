// Smart Placement Engine — geometric collision avoidance for the star
// marks drawn above words (.waqf-mark): both personal reminder stars
// and the default Sajawandi stop-mark stars share this exact same span,
// so one engine covers both at once (طلب مباشر 2026-07-31).
//
// ABSOLUTE RULE (unchanged from the rest of this project): this file
// never reads or writes waqf-positions.js or data.js, and never changes
// the *default* CSS position a mark is drawn at. It only measures the
// already-rendered DOM with getBoundingClientRect() and, if — and only
// if — the mark's rendered box actually collides with something, nudges
// it by the smallest offset that clears the collision, using a CSS
// custom property (--mark-dx/--mark-dy) layered on top of the existing
// transform in style.css. No coordinates are hand-picked.
//
// PROXIMITY SEARCH (طلب مباشر 2026-07-31 — replaces an earlier version
// that only checked DOM previous/next siblings): before placing a mark,
// every element of the types below whose rendered box falls inside a
// small radius around the mark's own default position is collected —
// regardless of its position in the DOM — and tested for actual pixel
// overlap. This is real visual proximity, not document order.
//
//   • Qur'an letters + all tashkeel — a single word's bounding rect
//     (.quran-word) covers its own letters+tashkeel, but the HOST word
//     itself is excluded from the obstacle set (see below).
//   • Madinah Sajawandi stop glyphs that live in their own span:
//       - .waqf-sign — the normal wrap from wrapWaqfSigns() for
//         ۖۗۘۙۚۛۜ etc. These sit *inside* the host .quran-word, so they
//         would be invisible to the engine if we only checked sibling
//         words; they MUST be listed here so a star on the same word
//         (e.g. صه on khilaf نٓۚ) can collide-avoid against the
//         Madinah mark without any per-position special case.
//       - dedicated lifts that can float slightly outside the host box:
//         .waqf-sila-lift / .waqf-sakta-lift / .waqf-mark-lower /
//         .waqf-mark-lower-mutlaq / .sajdah-mark /
//         .waqf-ruku-mark-noon-lift (see readerManager.js).
//   • ayah-number badges (.ayah-num)
//   • the page's ruku-mark badge (.ruku-mark)
//   • other visible star marks (.waqf-mark / .non-kufi-mark) so two
//     stars never land on top of each other
//
// The host word itself is EXCLUDED from the obstacle set (طلب مباشر —
// "استبعاد الكلمة المضيفة نفسها لأنها معروفة"): the mark is expected to
// sit close to it by design, so proximity to its own word is never
// treated as a collision. Child spans inside the host (.waqf-sign and
// the lift classes above) are still obstacles — collectNearby only
// skips the host element by identity, not its descendants.
//
// Candidate positions tried in order, first collision-free one wins,
// current/default position always tried first, nothing changes if it's
// already clear:
//   0) current position (no offset)
//   1) fine up 4px, then up 8px (prefer vertical separation from
//      Madinah marks that sit above the letter)
//   2) other fine axes ±4px, then coarse ±8px
//   3) fine then coarse diagonals
// Cap stays ~11px (diagonal 8,8 ≈ 11.3px) so a nudged mark never reads
// as detached from its word. CLEARANCE (3px) is applied only in the
// overlap test — not as a blanket extra offset.
//
// POSITION CACHE (طلب مباشر 2026-07-31): once a mark's placement is
// resolved, its chosen offset is cached per word (keyed by the word's
// stable data-key, e.g. "2:255:14") together with a signature of
// everything that could change the answer — page font size, the
// mark's own font-size (so a future 120%/160% mark-size setting
// invalidates it automatically), viewport dimensions, and script mode
// (Uthmani/Indopak). A cache hit skips the whole geometric search and
// just re-applies the stored offset; a signature mismatch is treated
// as a miss and the search re-runs (and re-caches). This is an
// in-memory cache only (module-level, not persisted) — it exists to
// avoid re-searching every time the same page is revisited in one
// session, not across app restarts.
window.MarkPlacementEngine = (function(){
  'use strict';

  var SEARCH_RADIUS = 50;   // px — proximity box half-margin around the mark's default position (within the requested 40–60px range)
  var STEP_FINE = 4;         // px — small nudge (comfortable gap without a large jump)
  var STEP = 8;              // px — coarse displacement
  // Minimum visual gap between a star and any obstacle (including
  // .waqf-sign on the same word). Applied only in the collision test:
  // positions already farther apart than CLEARANCE stay pixel-identical.
  // Kept modest on purpose — visual comfort comes from finer candidates
  // (STEP_FINE / preferring "up") rather than a larger clearance that
  // would re-nudge already-good placements across the mushaf.
  var CLEARANCE = 3;         // px
  // Order matters: first collision-free candidate wins.
  //   • 0 always first → pixel-identical when already clear
  //   • fine "up" next → natural separation from Madinah marks that
  //     sit above the letter (ۚۗۖ…) without a large horizontal jump
  //   • then other fine axes, then the original 8px set + diagonals
  // Cap stays ~11px (diagonal 8,8); fine diagonals are ~5.7px.
  var CANDIDATES = [
    { dx: 0,          dy: 0           },  // current — no move if clear
    { dx: 0,          dy: -STEP_FINE  },  // up 4
    { dx: 0,          dy: -STEP       },  // up 8
    { dx: STEP_FINE,  dy: 0           },  // right 4
    { dx: -STEP_FINE, dy: 0           },  // left 4
    { dx: 0,          dy: STEP_FINE   },  // down 4
    { dx: STEP,       dy: 0           },  // right 8
    { dx: -STEP,      dy: 0           },  // left 8
    { dx: 0,          dy: STEP        },  // down 8
    { dx: STEP_FINE,  dy: -STEP_FINE  },  // fine top-right
    { dx: -STEP_FINE, dy: -STEP_FINE  },  // fine top-left
    { dx: STEP,       dy: -STEP       },  // top-right 8
    { dx: -STEP,      dy: -STEP       },  // top-left 8
    { dx: STEP_FINE,  dy: STEP_FINE   },  // fine bottom-right
    { dx: -STEP_FINE, dy: STEP_FINE   },  // fine bottom-left
    { dx: STEP,       dy: STEP        },  // bottom-right 8
    { dx: -STEP,      dy: STEP        }   // bottom-left 8
  ];

  // Every element type that can legitimately collide with a star mark.
  // See the file header for what each class represents.
  var OBSTACLE_SELECTOR = [
    '.quran-word',
    '.ayah-num',
    '.ruku-mark',
    '.sajdah-mark',
    '.waqf-sign',
    '.waqf-sila-lift',
    '.waqf-sakta-lift',
    '.waqf-mark-lower',
    '.waqf-mark-lower-mutlaq',
    '.waqf-ruku-mark-noon-lift',
    '.non-kufi-mark',
    '.waqf-mark'
  ].join(', ');

  function inflate(r, m){
    return { left: r.left - m, right: r.right + m, top: r.top - m, bottom: r.bottom + m };
  }
  function overlaps(a, b){
    return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  }

  // Real spatial proximity: every OBSTACLE_SELECTOR element whose
  // rendered rect falls inside searchBox, wherever it happens to sit in
  // the DOM — not just the mark's DOM-adjacent siblings.
  function collectNearby(markEl, hostWord, searchBox){
    var candidates = document.querySelectorAll(OBSTACLE_SELECTOR);
    var obstacles = [];
    for(var i = 0; i < candidates.length; i++){
      var el = candidates[i];
      if(el === markEl || el === hostWord) continue; // host word excluded per explicit request
      var r = el.getBoundingClientRect();
      if(r.width === 0 && r.height === 0) continue; // not actually rendered (display:none)
      if(overlaps(searchBox, r)) obstacles.push(r);
    }
    return obstacles;
  }

  // ---- Position cache -------------------------------------------------
  var placementCache = Object.create(null);

  function currentSignature(markEl){
    var ayahSize = getComputedStyle(document.documentElement).getPropertyValue('--ayah-size').trim();
    var markFontPx = getComputedStyle(markEl).fontSize;
    var script = document.body.classList.contains('uthmani-font') ? 'u' : 'i';
    return ayahSize + '|' + markFontPx + '|' + window.innerWidth + '|' + window.innerHeight + '|' + script;
  }

  function applyOffset(markEl, dx, dy){
    if(dx === 0 && dy === 0){
      markEl.style.removeProperty('--mark-dx');
      markEl.style.removeProperty('--mark-dy');
    } else {
      markEl.style.setProperty('--mark-dx', dx + 'px');
      markEl.style.setProperty('--mark-dy', dy + 'px');
    }
  }

  function resolveOne(markEl){
    var hostWord = markEl.closest('.quran-word');
    if(!hostWord) return;
    if(getComputedStyle(markEl).display === 'none') return;

    var key = hostWord.getAttribute('data-key');
    var sig = currentSignature(markEl);

    if(key){
      var cached = placementCache[key];
      if(cached && cached.sig === sig){
        applyOffset(markEl, cached.dx, cached.dy);
        return;
      }
    }

    // Reset to the default CSS position before measuring, so the search
    // starts from the true baseline rather than a stale offset.
    applyOffset(markEl, 0, 0);
    var baseRect = markEl.getBoundingClientRect();
    var searchBox = inflate(baseRect, SEARCH_RADIUS);
    var obstacles = collectNearby(markEl, hostWord, searchBox);

    var chosen = null;
    for(var i = 0; i < CANDIDATES.length; i++){
      var c = CANDIDATES[i];
      applyOffset(markEl, c.dx, c.dy);
      var markRect = markEl.getBoundingClientRect();
      var collision = false;
      for(var j = 0; j < obstacles.length; j++){
        // Inflate the obstacle by CLEARANCE so a "clear" placement keeps
        // a small visual margin — not edge-to-edge contact.
        if(overlaps(markRect, inflate(obstacles[j], CLEARANCE))){ collision = true; break; }
      }
      if(!collision){ chosen = c; break; }
    }

    // No candidate within the bounded search cleared every collision —
    // fall back to the original CSS-defined position rather than leaving
    // the mark at the last (still-colliding) offset tried.
    if(!chosen) chosen = CANDIDATES[0];
    applyOffset(markEl, chosen.dx, chosen.dy);

    if(key) placementCache[key] = { dx: chosen.dx, dy: chosen.dy, sig: sig };
  }

  function resolveAll(container){
    var root = container || document;
    var marks = root.querySelectorAll('.waqf-mark');
    for(var i = 0; i < marks.length; i++) resolveOne(marks[i]);
  }

  function resolveWord(wordEl){
    if(!wordEl) return;
    var mark = wordEl.querySelector('.waqf-mark');
    if(mark) resolveOne(mark);
  }

  // Layout needs one frame to apply and one more to paint before a
  // getBoundingClientRect() read is trustworthy — the same double-rAF
  // pattern already used elsewhere in this project (readerManager.js's
  // resetScrollToTop/openAyah). A pending call is coalesced.
  var pending = null;
  function scheduleResolveAll(container){
    if(pending !== null) return;
    pending = true;
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        pending = null;
        resolveAll(container);
      });
    });
  }

  // Debounced resize/orientation listener — the cache's own signature
  // check would already catch a viewport-size change on the next
  // resolveOne() call, but this makes sure resolveOne() actually runs
  // again soon after a resize/orientation change instead of waiting for
  // the next unrelated re-render.
  var resizeTimer = null;
  window.addEventListener('resize', function(){
    if(resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function(){
      var flow = document.getElementById('ayahFlow');
      scheduleResolveAll(flow || document);
    }, 150);
  });

  return {
    resolveAll: resolveAll,
    resolveWord: resolveWord,
    scheduleResolveAll: scheduleResolveAll
  };
})();
