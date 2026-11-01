# CSS guide (short)

**Why:** the stylesheet grew to 125 files; several rules fight over the same element (chat bubbles live in 5 files), so
a change in one place used to break another. These rules stop the pile from growing.

1. **Tokens first.** Use `variables.css` + `tokens-extra.css` (`--ui-radius-ctl`, `--ui-ctl-h`, `--ui-shadow-card`, `--ui-tint-*`…) — no new literals for radius / control height / card shadow.
2. **Use the kit.** `ui-kit.css` has the shared card / toolbar / chip / segmented / badge / KPI / table (→ cards on phones) / empty state. Build new screens from `.ui-*`; add a page class only for what is truly unique.
3. **Specificity budget.** New selectors: at most 2 classes (+ an element). Never `html body …` chains, never `!important`.
4. **One owner per component.** Before styling a component, search for its class across `src/styles` and edit THE existing owner; don't add an override at the bottom of another file.
5. **Mobile is part of the component.** If a list is wider than a phone it must either become cards (`.ui-table` + `data-label`) or one swipeable row (`.ui-chips--scroll`). Pinned full-screen pages need an inner scroller (`.ui-scroll-y`).
6. **`!important` guard.** `npm run css:guard` fails if the count grows past the baseline (473). `npm run css:audit:report` regenerates `CSS-IMPORTANT-AUDIT.md`
   (every flag classified: set-from-js / set-inline-in-jsx = defends against inline styles, legit-context, broad-selector reset, redundant).
   Lower the baseline in `package.json` whenever you remove some.

Finding from the audit: most existing `!important` are **intentional** (they beat inline styles set by React/JS or are "reset everything" rules), so they can't be mass-deleted without moving those inline styles into classes first. Only 4 are provably redundant.
