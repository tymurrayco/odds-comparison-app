# Design pass log

A running list of UI/design changes shipped as **one commit per principle** so
any single one can be undone without touching the others:

```
git revert <hash>      # undo one change, keeps the rest
git push
```

Inspiration: the "perfect iOS app" thread (Inter Tight, tight-tracked headings,
CSS-variable colors, borderless cards, radius hierarchy, dense spacing).

| # | Commit | Change | Revert notes |
|---|--------|--------|--------------|
| 1 | f8cc76f | **Inter Tight** loaded via `next/font` and set as the body font (site was rendering in Arial — the old Geist variable was never loaded) | Reverting returns to Arial/Helvetica |
| 2 | d87f641 | **Type scale + tracking**: site title 26px/-0.8px, game-card team names 18px/-0.45px desktop (15px/-0.3px mobile), ratings page titles 22px/-0.7px, ratings section headers 16px/-0.3px | Independent of #1; sizes only |
| 3 | 3cb42a2 | **Tabular numerals** site-wide (`font-variant-numeric: tabular-nums`) so odds/spreads/ratings align in columns | One CSS line |

## Not done yet (candidates, in suggested order)

- **Color tokens + dark mode**: only `--background`/`--foreground` exist; accent is
  scattered (blue-600 ×12, `#0052ff` ×9, purple tabs) across 22 files; body has a
  dark-scheme rule but zero `dark:` component styles, so dark phones get a black
  page with white cards. Move accent/surface/text/border/track to CSS variables,
  pick one accent, fix dark mode once.
- **Cards**: drop the visible `border-gray-200` borders for a soft shadow + 1px
  low-opacity ring; radius hierarchy 18px cards / 10px chips & rows / full for
  icon buttons (today: `rounded-lg` ×41, `rounded-md` ×12, `rounded-xl` ×7 with
  no rule behind the choice).
- **Spacing**: gap between card groups drifts 8–24px; standardize.
- Not applicable: 54px device frame, App Store screenshots, paid creatives.
