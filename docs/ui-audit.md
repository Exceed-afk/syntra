# UI audit — 2026-11-07 (audit only, no changes made)

> **Update (2026-11-08):** the preview harness now renders **every page** in a
> plain browser with deterministic sample data (`npm run preview`,
> `npm run shots` — see README). The "only the Calculator could be reached"
> note below describes the first pass and no longer applies; a fresh screenshot
> pass at 1440 / 1024 / 700 in light and dark now exists for all 20 pages in
> `.ui-audit/` (each file name carries a run id). The findings below were
> written before that pass and should be re-checked against the new shots.

Purpose: find which pages need layout work before anything is changed. This is
a snapshot, not a redesign proposal beyond the "proposed shared rules" section
at the end.

## How this audit was done

- The registry was read from `src/renderer/src/tools.ts` (20 pages).
- Screenshots were taken with the existing patchright harness (the one
  `tests/calc-ui.ts` uses) from `.calch/`, served locally, at 1440×900,
  1024×800 and 700×900, in light and dark, with sample history data.
- **Only the Calculator could be reached this way.** The harness
  (`vite.calch.config.ts` → `calcPreview.html`) builds exactly one page —
  the calculator — with the `LocalStorageCalculatorAdapter`, no sidebar and
  no `window.api`. Every other page calls `window.api.*` on mount and would
  throw in a plain browser, so no screenshot exists for them.
- The other 19 pages were therefore audited by **reading their rendered
  markup** (the JSX in `src/renderer/src/modules/`, plus the shared
  `PageHeader` / `EmptyState` / `styles.css` classes). Each finding below is
  tied to code that was read, not guessed. The dark-theme check for every
  non-calculator page is *not verified* and is listed at the end.

Screenshots: `.ui-audit/calc-{1440,1024,700}-{light,dark}.png` (`.ui-audit/`
is in `.gitignore`).

---

## Calculator (`/calculator`)

Screenshotted at all three widths. Findings below are from the images and
`Calculator.tsx` / `CalculatorTool.tsx`.

- **Medium** — At 1440px the header row (title left, History + Help icons
  right) and the mode tab strip are clean, but the tab strip is a separate
  visual language from the `.seg` segmented control every other page uses
  (`calc-modes` with an underline vs `.seg` pills). Consistency issue, not a
  breakage.
- **Medium** — At 700px the two scientific keypad blocks stack (as
  documented), which pushes the display far down; on a 700×900 viewport the
  `=` key is below the fold. The main action needs scrolling at the narrow
  width.
- **Medium** — The history panel (`showHistory` default true) sits beside the
  keypad on wide screens but at 700px it stacks under the keypad, adding a
  lot of vertical bulk before the help/actions.
- **Low** — The small text in history rows is `text-xs` (12px) and the empty
  history hint is `text-[11px]`; small but not unreadable.
- **Low** — The calculator does not use `PageHeader` or `EmptyState`: it
  builds its own `calc-head` header (title + two icon buttons + tab strip)
  and its own `calc-history-empty` empty state. Deliberate, but it is the one
  page that diverges from the shared header.
- **Accessibility (verified in code, looks right in the shots)** — this page
  is actually the *best* audited page for a11y: icon buttons have
  `aria-label` + `title` (History/Help, copy, LaTeX, pin, delete), the help
  modal is a proper focus-trapped `role="dialog"`, keypad keys have
  aria-labels for symbols. Low risk.
- **Low** — Dark theme in the screenshots: the harness's own theme toggle
  works, but my programmatic `dark` class injection produced visually
  identical shots, so dark-mode audit is limited to what the code shows
  (all colours come from theme tokens; low risk, but not visually verified).

## Dashboard (`/dashboard`)

Not reachable in the harness (needs `window.api`). Read from `Dashboard.tsx`.

- **Medium** — The header is `PageHeader` (good), but in edit mode a second
  full-width bar appears under it containing: a "Layout" label, a `.seg` with
  four presets, an "Add widget" label + select + a separate icon-only Add
  button, and a long hint paragraph. Four controls of three different kinds
  in one row; at ~700px it will wrap into a tall multi-row block (it is
  `flex-wrap`, so it degrades rather than breaks).
- **Medium** — Two "add a widget" paths exist at once: the select + plus
  button in the edit bar *and* an "Available widgets" button list at the
  bottom of the page. Duplicate affordances for the same action.
- **Low** — The per-widget edit bar (Move label, up, down, S/M/L size seg,
  remove bin) is 5–6 controls above each card; on an S-size (3-column) card
  at 700px the bar alone can be wider than the card.
- **Low** — Widget cards are the shared `.card` with `dash-widget-*`
  classes; consistent with the rest of the app.
- **Accessibility** — good: drag handle is a real button with `aria-label`,
  Alt+arrows documented, live-region announce exists. Low risk.

## Review (`/review`)

Not reachable in the harness. Read from `Review.tsx`.

- **Medium** — The header packs a lot into `PageHeader`: a seg (Week/Month),
  `PeriodArrows`, and a conditional "This week/month" button that stays
  rendered but `invisible` when on the current period. The invisible button
  keeps layout stable (documented) but reads as an empty gap.
- **Low** — The subtitle carries a badge ("In progress"/"Complete") inside
  the subtitle element — fine, but it is one of only two pages doing this
  (Calendar is the other), so the pattern is not uniform.
- **Low** — Long page: stats, charts, per-section cards and a reflection box
  stack vertically; no in-page navigation. Not broken, just long.
- **Accessibility** — buttons labelled, `aria-busy` used. Low risk.

## Daily briefing (`/briefing`)

Not reachable in the harness. Read from `Briefing.tsx`.

- **Low** — Uses `PageHeader` with a decorative icon as the only action
  child; the header has no real action (fine for a read-only page).
- **Low** — All content is stacked `card card-pad` sections with an
  "Open X →" link each; consistent and simple. No problems found.

## Insights (`/insights`)

Not reachable in the harness. Read from `Insights.tsx`.

- **Low** — Standard `PageHeader` + stacked insight cards. Consistent.
- **Medium (a11y)** — The dismiss "hide" button is an unlabelled-text
  `btn-icon` with an X glyph — it *does* have `aria-label`
  ("Hide this insight until restored"), so this is fine; the real issue is
  the **"Snooze N weeks"** button has only a `title` tooltip, no visible
  label context until hovered (low).
- **Low** — The bar pairs in `GroupBars` are `role="img"` with a full
  aria-label — good.

## Assistant (`/assistant`)

Not reachable in the harness. Read from `Assistant.tsx`.

- **Medium** — The subtitle is a long conditional sentence (up to ~200 chars
  about providers/URLs) that will wrap to 3–4 lines in the header at narrow
  widths, pushing the page down.
- **Low** — The "try these" example buttons (`flex-wrap`) can wrap into a
  tall block when there are many examples.
- **Low** — Uses `EmptyState` and shared `.card`; consistent.
- **Accessibility** — good: labelled input, `aria-live` regions, disclosure
  `<details>` for what was sent. Low risk.

## Calendar (`/calendar`)

Not reachable in the harness. Read from `Calendar.tsx`.

- **Medium** — Three control rows before the grid: header (title + arrows +
  Today), a Summary `<dl>`, then the "Show" layer chips row. At 700px that is
  a lot of chrome before any calendar content.
- **Medium** — The day panel (`20rem` column on `lg`) drops *below* the grid
  at narrow widths, so clicking a day then requires scrolling to see the
  detail — the main follow-up action is off-screen at 700px.
- **Low** — Layer chips are bespoke `rounded-lg border px-2.5 py-1 text-xs`
  buttons, not the shared `.seg` — another one-off control style.
- **Accessibility** — the grid is a proper `role="grid"` with roving
  tabindex and aria-labels; layer chips have `aria-pressed`. Good.
- **Low** — Cell content is `text-[11px]` (11px) — the smallest text in the
  app; borderline.

## Logbook (`/logbook`)

Not reachable in the harness. Read from `Logbook.tsx`.

- **Low** — Filter row (search + tag select + two date inputs + Clear) wraps
  cleanly (`flex-wrap`); at 700px it becomes two rows. Acceptable.
- **Low** — Uses `PageHeader`, `EmptyState`, `.card`, `TagChip` throughout.
  One of the most consistent pages.
- **Medium (a11y)** — Entry cards are clickable `<article tabIndex=0>` with
  `onClick` + Enter — keyboard accessible, but no focus style is added
  beyond the default, and the whole card is one stop with no inner links.

## Trades (`/trades`)

Not reachable in the harness. Read from `Trades.tsx`.

- **Medium** — The filter row has five fixed-width controls (`w-32`, `w-40`
  ×3) plus a flexible search; at 700px it wraps into 2–3 ragged rows with
  mixed widths. Not broken, but untidy.
- **Low** — The stats cards use `card card-pad-sm` with `stat-*` classes;
  the table uses the shared `.tbl` with a wrapper. Consistent.
- **Medium (a11y)** — Table rows are clickable (`tr onClick tabIndex=0`) —
  keyboard reachable, but the click target semantics are odd and no visual
  focus ring is added for rows.

## Savings (`/savings`)

Not reachable in the harness. Read from `Savings.tsx` and `GoalDetail.tsx`.

- **Low** — Goal grid uses shared cards; header and empty state standard.
- **Medium** — The goal detail drawer is a custom right-side `aside` over a
  `.scrim`, not the shared `Dialog`. It has its own header, its own
  deposit/withdrawal pill toggle (hand-rolled `rounded-xl border p-1`
  instead of `.seg`), and its own forms. The largest one-off layout piece in
  the app.
- **Medium (a11y)** — The deposit/withdrawal pill buttons change meaning by
  colour (`bg-pos` / `bg-neg`) — okay — but the drawer closes on
  `onMouseDown` of the scrim and has no focus trap or `role="dialog"`.

## Expenses (`/expenses`)

Not reachable in the harness. Read from `src/modules/expenses/ui/*`.

- **Low** — Uses `PageHeader`, a proper `role="tablist"` tab strip with
  arrow-key handling, `EmptyState`, `StatTile`, shared `.card`/`.tbl`.
  The most disciplined page after Habits.
- **Low** — The month picker + "All transactions" row sits between the tabs
  and content on every tab; at 700px it wraps to two rows. Fine.
- **No significant problems found.**

## Habits (`/habits`)

Not reachable in the harness. Read from `Habits.tsx`.

- **Medium** — Two control rows under the header: the today-progress card,
  then a row with week arrows + "This week" + "Group by time". At 700px the
  week-strip inside every habit card (7 dots + chevrons) plus the stats line
  ("X day streak · Best · 30-day rate · reminder · schedule") is a lot of
  horizontal content in one row; it wraps but makes tall cards.
- **Low** — Uses `PageHeader`, `EmptyState`, `.card`, `btn-icon` with
  aria-labels. Very consistent.
- **Low** — The archived list toggle is a bare text button, not a `.btn`.

## Tasks (`/tasks`)

Not reachable in the harness. Read from `Tasks.tsx`.

- **High** — This page has the heaviest chrome of any page: header (Select +
  New task), then a row of two segs (views ×7 with counts, layout toggle),
  then a filter row with up to 6 controls (date, search, priority, project,
  tag, sort) + Clear + "Save view", then optionally a saved-views strip,
  then optionally a bulk-action bar with 6+ buttons and a date input. At
  700px this is easily 5 stacked rows of controls before any task list.
- **Medium** — The bulk bar uses `ml-auto` to push actions right, which
  wraps awkwardly when there are 6 buttons + a date input.
- **Medium (a11y)** — "Save view" uses `window.prompt` (blocking, not
  themed). Rows are clickable div-like elements; select-mode checkboxes are
  fine.

## Focus (`/focus`)

Not reachable in the harness. Read from `Focus.tsx`.

- **Medium** — Header holds two actions (Log time + a settings `btn-icon`),
  then a 4-item tab strip, then the timer view. The timer card's action row
  changes between 1 / 3 buttons depending on state, and the running state
  mixes `btn px-4 py-2`, `btn-primary px-4 py-2` and a `btn-danger btn-sm`
  icon-only Discard — three different button sizes in one row.
- **Medium** — The right sidebar (Context & Task card) is `20rem` on `lg`
  and stacks below at narrow widths, pushing "Today's Focus" off-screen.
- **Low** — Reports tab: stat tiles are consistent; heatmap squares are
  `title`-tooltip only (no keyboard access to a day's value) — minor a11y.
- **Medium (a11y)** — `alert()` is used for delete errors in the sessions
  and projects managers (jarring, unthemed).

## Tools (`/tools`)

Not reachable in the harness. Read from `ToolsHub.tsx`.

- **Medium** — The pin control is a separate row under the tab strip ("Pin
  this tool" + hint). It duplicates a state already visible as a pin icon in
  the tabs. Also, the Loan tab alone contains: the loan form card, 4 stat
  cards, a copy button row, an amortisation table, and then a 3-card grid of
  Percentage / Bill split / Dates — a very long page with no anchoring.
- **Low** — Stopwatch/scratchpad/snippets all reuse shared pieces well.
- **Low** — Stopwatch keyboard shortcuts (Space/L/R) are global while the
  tab is mounted; not a layout issue but worth noting.

## Content (`/content`)

Not reachable in the harness. Read from `Content.tsx`.

- **Medium** — The board is a horizontal `overflow-x-auto` flex of six
  `w-60` columns; on a 700px window only ~2 columns are visible and the rest
  are reached by horizontal scrolling, which is invisible (no scrollbar
  affordance besides the native one).
- **Low** — Card arrows are `btn-icon` with aria-labels. Good.
- **Low** — The search row carries a hint paragraph ("Drag a card…") inline;
  at narrow widths it wraps under the input.

## Intelligence (`/intelligence`)

Not reachable in the harness. Read from `Intelligence.tsx`.

- **Medium** — Very long page: Features card, Automations card (7 toggles +
  conditional numeric inputs), Activity card, Privacy card, AI provider card
  (provider seg, disclosure, confirm flow, address/model fields, API key
  block). No tabs or anchors; the AI provider section is below several
  screens of scrolling.
- **Low** — Conditional inputs inside the automations card use `pl-9`
  indentation; at narrow widths the labels wrap.
- **Low** — Feature cards are clickable `<label class="card">` wrapping a
  checkbox — accessible, slightly unusual semantics.

## Notes (`/notes`)

Not reachable in the harness. Read from `Notes.tsx`.

- **Medium** — The header holds a 3-button seg (Split/Write/Read) *and* the
  New note button; at 700px the seg + button compete for space in
  `page-actions` and wrap.
- **Medium** — The two-pane layout (`18rem` list + editor) collapses to a
  stacked list-then-editor at <`lg`, so on 700px the editor is below the
  whole note list (which itself is `max-h-[calc(100vh-19rem)]` scrollable) —
  you scroll past the list to reach the text.
- **Medium** — The note list rows are hand-rolled
  `rounded-xl border px-3 py-2` buttons instead of `.row-link` or `.card`,
  another one-off style.
- **Low** — The editor card's title row (input + pin/archive/delete icons)
  is tight but wraps correctly.
- **Accessibility** — good labels throughout; title input has aria-label.

## Tags (`/tags`)

Not reachable in the harness. Read from `TagsPage.tsx`.

- **Low** — Two-card master/detail grid (`22rem` + flexible); collapses to
  stacked at narrow widths (detail below the full tag list — same pattern as
  Notes).
- **Low** — Rename/Merge/Delete action row is fine; delete confirmation is
  inline. Consistent use of `.card`, `.btn`, `EmptyState`.
- **Low (a11y)** — The tag list buttons show selection with `bg-accent/10`
  only — no `aria-current` issue (they have it), but the selected state
  contrast is subtle.

## Search (`/search`)

Not reachable in the harness. Read from `Search.tsx`.

- **Low** — One big search field, results grouped with "more" links. Clean,
  uses shared classes. The `.empty` reuse for the tips block is slightly
  off-label but looks fine.
- **No significant problems found.**

## Trash (`/trash`)

Not reachable in the harness. Read from `Trash.tsx`.

- **Low** — Simple stacked batch cards with Restore / Delete forever. Uses
  shared pieces. A rare honest comment in the code even documents a busy-
  state pitfall. No problems found.

## Settings (`/settings`)

Not reachable in the harness. Read from `SettingsPage.tsx`.

- **Medium** — Seven tabs in one `.seg` strip ("Appearance Modules Templates
  Quick capture Tags Data Shortcuts"); at 700px the strip overflows/wraps —
  unlike the calculator's tab row, there is no sideways-scroll handling.
- **Medium** — The Data tab stacks four large cards (retention, data
  folder, export/import, plus Templates and Capture tabs are separate heavy
  pages). Long but organised.
- **Low** — Tag colour swatch rows (`flex-wrap`) handle narrow widths fine.
- **Accessibility** — module toggles are proper `role="switch"` with
  `aria-checked` and labels; colour swatches have aria-labels. Good.

---

## Ranking: pages that need work most

| Rank | Page | Why | Worst severity |
|---|---|---|---|
| 1 | **Tasks** | 4–5 stacked control rows (views, layout, 6 filters, saved views, bulk bar) before any task; `window.prompt`; crowded at every width | high |
| 2 | **Notes** | seg + button fight in the header; editor below a full scrolling list at 700px; hand-rolled list rows | medium |
| 3 | **Intelligence** | five stacked sections, AI provider below multiple screens; no anchors/tabs | medium |
| 4 | Calendar | day panel below the grid at 700px; three chrome rows; one-off chip style | medium |
| 5 | Content | horizontal board with hidden overflow at 700px | medium |
| 6 | Focus | three button sizes in one action row; sidebar pushed off-screen; `alert()` | medium |
| 7 | Dashboard | edit bar with 3 control kinds + duplicate add-widget paths; widget bar wider than small cards | medium |
| 8 | Savings | bespoke detail drawer (no dialog semantics, hand-rolled toggle) | medium |
| 9 | Trades | 5 fixed-width filters wrap ragged; clickable table rows | medium |
| 10 | Settings | 7-tab seg overflows at 700px (no sideways scroll) | medium |
| 11 | Assistant | very long subtitle wraps 3–4 lines | medium |
| 12 | Calculator | action below fold at 700px in scientific mode; own header/tab language | medium |
| 13 | Habits | dense habit rows wrap tall at 700px | medium/low |
| 14 | Review | invisible-button gap; long page | low |
| 15 | Tools | duplicate pin control; very long Loan tab | low |
| 16 | Logbook | filter row wraps; clickable cards | low |
| 17 | Tags | detail below list at narrow widths | low |
| 18 | Insights | snooze button tooltip-only | low |
| 19 | Briefing | none found | low |
| 20 | Expenses / Search / Trash | none found | low |

## Proposed shared layout rules (to discuss before any change)

1. **Page header**: keep `PageHeader` as the only header. Rule: at most one
   `.seg` plus one primary button in `page-actions`; long subtitles cap at
   one line with truncation (Assistant/Review break this today). The
   Calculator's `calc-head` either adopts `PageHeader` or the header rule
   documents the exception.
2. **Toolbar row**: one standard "filter bar" pattern — flexible search
   first, then fixed selects, then Clear — collapsing to a single
   "Filters" disclosure below ~900px. Tasks (6+ controls), Trades and
   Logbook would all adopt it instead of inventing their own wrap order.
   Tab strips (Settings, Tasks) get the calculator's sideways-scroll
   behaviour instead of wrapping.
3. **Side detail panel**: one shared component for Notes' editor, Calendar's
   day panel, Savings' goal drawer and Focus' context card: a `role="dialog"`
   aside that docks right on wide screens and *floats above* content (not
   below it) below 900px, so the main action is never scrolled out of view.
   Savings' hand-rolled drawer and deposit/withdrawal toggle fold into it
   (and into `.seg`).
4. **Settings placement**: long single-page settings (Intelligence, Settings
   Data tab) get a left nav / sticky section list, or Intelligence's AI
   provider section becomes a tab of Settings instead of a page-bottom
   section. Per-card edit toolbars (Dashboard) collapse to a single handle
   + overflow menu on small cards.
5. **Buttons**: one size per row (Focus mixes three today); icon-only
   buttons always `.btn-icon` with aria-label (most pages already comply);
   no `window.prompt`/`alert()` (Tasks, Focus).

## Things I could not check

- **Dark theme for all pages except the Calculator**: only the calculator
  page can be rendered in the browser harness, and even there my scripted
  `dark`-class injection produced light-identical screenshots (the
  harness's own toggle button works, but that is one frame at one width).
  All dark-mode statements above come from the code (theme tokens), not
  from pixels.
- **Real data states for the 19 non-calculator pages**: every finding for
  them is from the JSX, not from a rendered page with sample data. Empty,
  loading, error and long-content states are unverified visually.
- **The Electron app itself**: I did not launch the real app (audit only);
  window chrome, sidebar behaviour at narrow widths and zoom levels were
  not observed.
- **`.calch` was built fresh for this audit** with
  `npx vite build --config vite.calch.config.ts`; it is gitignored.

---

## .gitignore check (audit-only; nothing deleted)

`.gitignore` already covers `node_modules`, `out`, `dist`, `.preview`,
`.tooling/`, `.freebuff/`, `.cloud-attachments/`, `err.log`, `out.log`.
I added two entries during the audit: `.calch` (the harness build output,
which was previously *tracked* in git — the docs/tree.md comment "not
committed" was wrong) and `.ui-audit/` (this audit's screenshots).

Files that should not be committed but currently are (tracked by git):

- `.calch/**` — 15 built harness assets + `calcPreview.html` (build output,
  hashed filenames change on every build).
- `build/config.gypi` — Electron builder's generated native build config.
- `scripts/qa-result.json` — QA harness output.

Files on disk that are junk-ish but currently ignored or untracked (fine,
listed for completeness):

- `scripts/tmp-*` throwaway scripts (mentioned in tree.md as "safe to delete
  once stale") — none currently tracked.
- `.ui-audit/` — this audit's screenshots and the two helper scripts
  (`shoot.mjs`, `debug.mjs`); gitignored now.
- `.vscode/settings.json` **is tracked** and contains only a CodeGPT API key
  name (`"CodeGPT.apiKey": "CodeGPT Plus Beta"`) — no secret value, but
  editor-personal settings usually do not belong in the repo. Listed, not
  changed.
