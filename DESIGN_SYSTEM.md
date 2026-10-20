# CSPC SpaceHub — Design System

All styling lives in **one file**: `public/css/app.css`. It replaces the four
stacked stylesheets (`style.css`, `final-polish.css`, `professional-campus.css`,
`spacehub-professional-system.css`) that previously overrode each other with `!important`.
Earlier build notes are kept in `docs/archive/`.

## Rules
1. Change a color, radius or spacing in the **tokens** at the top of `app.css` (`:root`), never inline.
2. No `!important` and no inline `style=""` in views. If a rule needs to win, fix the selector.
3. Reuse a component class before inventing a new one.

## Components
| Need | Class |
|---|---|
| Page title block | `.page-heading` (+ `.eyebrow`, `h1`, `p`) |
| Surface | `.card`, `.form-card`, `.stat-card`, `.room-card` |
| Buttons | `.primary`, `.secondary` / `.button-link-dark`, `.danger`, `.danger-outline`, `.text-button` |
| Status pill | `.badge.pending / approved / rejected / cancelled / completed / available / maintenance / active / inactive` |
| Type tag | `.facility-type` |
| Data table | `.card > .table-wrap > table` |
| Message | `.flash.success / .error`, `.notice`, `.rejection-note` |
| Empty state | `.empty` |

## Conventions
- Page order: eyebrow (small caps) → H1 → one-line description → primary action on the right.
- Button labels are plain verbs ("Make Reservation", "Approve Reservation") — no `+`, `✓` or emoji.
- Sidebar is grouped identically for every role: MAIN → ADMINISTRATION (admin only) → ACCOUNT.
- Colors: navy = primary action/navigation, gold = accent/attention, blue = links and focus.
- Sidebar icons are pure CSS (mask images keyed to each link href), so new nav links need one `--ico` rule.
- The campus photo is `public/images/cspc-campus-bg.jpg` (compressed from a 2.1 MB PNG to ~190 KB).

## Tables & charts
- Rows get a colored left accent from the status badge in that row (pending = amber, approved/completed = green, rejected/cancelled = red, maintenance = orange).
- Right-align numeric columns with `class="num"`.
- Charts are pure CSS (no libraries, no network): `.donut` (set `--a-end`, `--c-end`, `--r-end` as cumulative percentages), `.bar-list` / `.bar-track > .bar-fill` (set `--pct`). Those CSS variables are the only inline styles allowed, because they carry data.

## Interactive tables
Add `data-table` to a `<table>` inside `.table-wrap` to get a search box, a record count and click-to-sort headers (`public/js/tables.js`). To sort a column by something other than its visible text (e.g. a timestamp), put `data-sort="..."` on the cells. Used on: My Reservations, Reservation Requests, Manage Facilities, Manage Users, Audit Trail. Row buttons use `.row-action` (and `.row-action.danger`).

## Animations
All in section 25 of `app.css`, CSS-only, and fully disabled under `prefers-reduced-motion`. Use `animation-fill-mode: backwards` (never `both`/`forwards`) so a finished animation can't override hover transforms. Stagger lists with `animation-delay` rather than JS.

## Gradients
Section 26 of `app.css`. Palette tokens: `--grad-primary` (buttons, active tabs), `--grad-brand` (avatars, step numbers), `--grad-gold` (accents, badges), `--grad-canvas` (page background). Headings and big numbers use gradient text with automatic solid-color fallbacks for unsupported browsers and Windows high-contrast mode.
