# Prototype: iOS waqf word scale via `transform` (not shipped)

**Status:** experimental CSS only. Stable baseline remains **1.0.395**.  
**No release / no ZIP** until real-device review accepts or rejects this path.

## Goal

Keep the visual emphasis of Sajawandi default words (~1.1em look) on iPhone without WebKit letter-joining breakage caused by `font-size: 1.1em` on `.quran-word.has-default-*`.

## Approach (B, prototype)

| Platform | Behavior |
|----------|----------|
| Android (Blink) | Unchanged: `style.css` → `font-size: 1.1em` |
| iOS WebKit | This file: `font-size: 1em` + `transform: scale(1.1)` + small `margin-inline` |

Same QCF font, same DOM, no per-word overrides.

## Enable (local only)

In `index.html` `<head>`, **after** `style.css`:

```html
<link rel="stylesheet" href="prototype-ios-waqf-scale.css">
```

Remove before any release.

## Device checklist (iPhone required)

Run with **مصحف المدينة**, marks **visible**.

### Letter joining (must pass)

- [ ] قلوبهم (and similar default-colored words on the same page type)
- [ ] مثلكم
- [ ] Other words with the same class of default Sajawandi mark
- [ ] No disconnected / isolated letters mid-word

### Layout (must not regress unacceptably)

- [ ] Gap to previous word
- [ ] Gap to next word
- [ ] No overlap / collision of glyphs
- [ ] Word at **start** of line
- [ ] Word in **middle** of line
- [ ] Word at **end** of line
- [ ] Line wrap still sensible
- [ ] Page alignment / column feel still acceptable

### Controls

- [ ] Toggle «إظهار علامات التذكير والوقف» off → size emphasis gone (no residual scale)
- [ ] Android device (no prototype link, or with link but Blink path): still pure 1.0.395 `1.1em`

## Known risks (why this is not auto-merged)

1. **`transform` does not expand the layout box** — only paint. Neighbors may feel tighter; `margin-inline: 0.05em` is a guess, not a perfect reservation for every word width.
2. **`display: inline-block`** on `.quran-word` can change wrap opportunities vs pure `inline`.
3. **Desktop Safari** may match the `@supports` gate; tighten later if needed.
4. Joining may improve while layout still fails the product bar — in that case **reject B**, do not ship.

## Decision rule

| Result | Action |
|--------|--------|
| Joining OK + layout acceptable on iPhone | Consider minimal merge (WebKit-only) in a later version |
| Joining OK but layout bad | Reject B; explore other directions |
| Joining still broken | Reject B |

Do **not** change production `style.css` or bump version until that decision.
