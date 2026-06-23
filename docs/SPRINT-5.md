# Sprint 5 — Visual polish

**Goal**: Apply the full Zebra design system across the app and add the polish
intentionally deferred through Sprints 1–4: theming, badges, safer destructive
actions, and the empty/loading/responsive/animation states that earlier
sprints skipped (they explicitly punted visual niceties to here).

This is the final planned sprint. It is cross-cutting: instead of new product
surfaces, it refines the four existing sections (Library, Editor, Creator,
Adversarial Lab) and Settings.

**Out of scope**: new features or behavior changes. If a polish item reveals a
functional bug, fix it, but don't expand scope.

> Source: `docs/ROADMAP.md` (Sprint 5) and `docs/DESIGN-SYSTEM.md`. The scope
> below is the contract; the ticket-by-ticket breakdown is **to be planned**
> (see "Tickets") before implementation starts.

---

## Includes

- **Full Zebra design system** applied per `docs/DESIGN-SYSTEM.md` (colors,
  typography, spacing, component patterns) — replacing any ad-hoc inline styles
  accumulated in earlier sprints.
- **Dark/light mode toggle**.
- **Badges**: `NEW` and `NEW VERSION`. (Note: a `NEW` badge already exists in
  `components/library/ClientCard.tsx`, derived from `created_at <= 15 days`, and
  `NEW VERSION` from `latest_version_created_at <= 5 days` — planning should
  audit what's already implemented and finish the rest rather than redo it.)
- **Two-step delete with typed-confirmation** for destructive actions (audit
  the existing `DeleteClientModal` first).
- **Empty states** and **loading states** across all sections.
- **Mobile responsive** layout.
- **Animation polish** (transitions, micro-interactions).

## Definition of done

- The app visually matches the Zebra design system; no leftover ad-hoc styling.
- Theme toggle works and persists.
- Badges, empty states, loading states, and destructive-action confirmations
  are consistent across Library, Editor, Creator, Adversarial Lab and Settings.
- The app is usable on mobile widths.

## Tickets

**To be planned.** Break the scope above into one-ticket-at-a-time units
(Conventional Commits, branch `sprint-5/ticket-X-short-name`) following the
same shape as `docs/SPRINT-4-archive.md`. Because this sprint is cross-cutting,
prefer slicing by concern (theming, badges, destructive actions, empty/loading
states, responsive, animation) rather than by section, and start each with an
audit of what earlier sprints already shipped to avoid rework.

Open questions to resolve during planning: how the theme is stored (CSS
variables + `localStorage` vs. a provider); which inline styles are worth
extracting into the design system vs. leaving; and whether mobile responsive
needs layout changes deep enough to touch component structure.

This is the last sprint in the current roadmap. When Sprint 5 is done, there is
no Sprint 6 to point to — update the "Active sprint" line in `CLAUDE.md` to
reflect that the roadmap is complete, archive this file, and revisit
`docs/ROADMAP.md` "Future (not in current scope)" for what comes next.
