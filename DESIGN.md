---
name: ZEBRA · Prompt Studio
description: A dark, hairline-drawn instrument panel for designing and stress-testing conversational prompts.
colors:
  bg: "#0a0a0a"
  surface: "#141414"
  surface2: "#1c1c1c"
  border: "#262626"
  border2: "#3a3a3a"
  fg: "#f5f5f5"
  muted: "#8a8a8a"
  faint: "#5a5a5a"
  accent: "#ffd602"
  danger: "#e24b4a"
  danger-soft: "#f87171"
  warn: "#fbbf24"
  bg-light: "#fafaf7"
  surface-light: "#ffffff"
  surface2-light: "#f4f3ee"
  border-light: "#e5e4de"
  border2-light: "#c8c7c0"
  fg-light: "#0a0a0a"
  muted-light: "#6b6b66"
  faint-light: "#a8a7a0"
  danger-light: "#c2342f"
  danger-soft-light: "#cf4b46"
  warn-light: "#b45309"
typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  body-small:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.18em"
  micro:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "9px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.16em"
rounded:
  chip: "6px"
  item: "9px"
  panel: "12px"
  card: "14px"
  pill: "100px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  card: "22px"
  section: "28px"
  page: "36px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.bg}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "10px 18px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.fg}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "10px 18px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.danger}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "10px 18px"
  button-danger-hover:
    backgroundColor: "{colors.danger}"
    textColor: "#ffffff"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "6px 10px"
  button-ghost-hover:
    textColor: "{colors.fg}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.card}"
    padding: "22px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.fg}"
    typography: "{typography.body}"
    rounded: "0px"
    padding: "12px 0"
  badge-new:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.bg}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "3px 9px"
  badge-legacy:
    backgroundColor: "{colors.surface2}"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    padding: "3px 9px"
  chat-msg-bot:
    backgroundColor: "{colors.surface2}"
    textColor: "{colors.fg}"
    typography: "{typography.body-small}"
    rounded: "{rounded.card}"
    padding: "10px 16px"
  chat-msg-lead:
    backgroundColor: "{colors.fg}"
    textColor: "{colors.bg}"
    typography: "{typography.body-small}"
    rounded: "{rounded.card}"
    padding: "10px 16px"
  modal:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.card}"
    padding: "26px"
    width: "480px"
---

# Design System: ZEBRA · Prompt Studio

## Overview

**Creative North Star: "La Mesa de Instrumentos"**

This is an instrument panel, not a website. Everything on screen is drawn with
the thinnest line that still reads: hairline borders at 0.5px, a near-black
ground, one signal color. Nothing is decorated, because every mark on an
instrument is supposed to mean something, and a mark that means nothing makes
the panel harder to read. The operator is a professional who looks at this tool
for hours; the design's job is to stay legible and stay out of the way.

The density is deliberate and calm. Type is small (14px body) but generously
led (1.6), section labels are set in tracked capitals like the etched legends
on a control surface, and the one place the type goes large is a version
number, in tabular figures, because a number is the reading you came for. The
palette is a monochrome gray ramp with a single yellow that appears only where
something is live, current, or about to be committed. The interface is
**discreet but tactile**: at rest nothing moves and nothing floats, but a
control you can press acknowledges you, and the pressable surfaces are the only
ones that ever do.

The system has an explicit border. Everything above describes the Studio, the
internal tool. The one client-facing route, `/prueba/<token>`, runs a different
world on purpose (see **The Guest World Rule** in Do's and Don'ts). Confirmed
anti-reference for the Studio: the generic SaaS dashboard look, boxed inputs
with heavy 1px borders on filled fields, and drop-shadowed cards floating on a
gray page.

**Key Characteristics:**
- Hairlines (0.5px), never full-weight borders, in the Studio.
- One accent (`#ffd602`), used only for live, current, or committed state.
- Two font weights (400/500). No 600 in the Studio.
- Uppercase tracked labels (0.18em) as the system's structural voice.
- Flat by default; depth comes from tonal layering, not shadow.
- Pill (100px) for anything pressable, 14px for anything containing.
- Dark is the default theme and the one the system was drawn in.

## Colors

A monochrome gray ramp from near-black to near-white, interrupted by exactly
one saturated color. Light mode is a warm-paper inversion of the same ramp, not
a second palette.

### Primary
- **Amarillo Zebra** (`{colors.accent}`): the only saturated hue in the Studio,
  and identical in both themes. It marks state that is live or committed:
  the primary button, the active nav underline, the NEW and NEW VERSION
  badges, the n8n binding badge, the checked toggle, focus rings. It is also
  the color of every nav icon, active or not, which is a deliberate part of
  the look. It is never a background for reading text and never a decorative
  fill.

### Neutral
- **Fondo Casi Negro** (`{colors.bg}`): the page ground. Also the text color
  laid on top of yellow and on top of the lead's chat bubble.
- **Superficie** (`{colors.surface}`): cards, panels, popovers, modals. One
  step up from the ground.
- **Superficie Anidada** (`{colors.surface2}`): the second step, for surfaces
  sitting inside a surface: bot chat bubbles, toasts, the toggle track, the
  LEGACY badge, hovered list rows.
- **Borde** (`{colors.border}`): the default hairline. Dividers, card edges at
  rest.
- **Borde Activo** (`{colors.border2}`): the hairline when something is
  hovered, focused, elevated, or is a modal edge. Also the input's bottom rule.
- **Texto Primario** (`{colors.fg}`): body copy and headings. Doubles as a
  *surface* in one place, the lead's chat bubble, where the ramp is inverted so
  the human's turn reads as the loud one.
- **Texto Secundario** (`{colors.muted}`): labels, metadata, inactive nav,
  hints.
- **Texto Terciario** (`{colors.faint}`): placeholders, timestamps, the
  "(opcional)" tag, the toggle knob at rest. Never body text.

### Tertiary (status)
- **Rojo Peligro** (`{colors.danger}`): destructive actions and their
  confirmations, the notification count.
- **Rojo Alerta** (`{colors.danger-soft}`): error status and `crítico`
  severity in judge reports. Brighter than Peligro so a finding reads louder
  than a button.
- **Ámbar Advertencia** (`{colors.warn}`): `medio` severity only.

### Named Rules

**The One Signal Rule.** Yellow means *live, current, or committed*. If an
element is not in one of those three states, it is gray. Adding yellow for
emphasis, for decoration, or to make a screen "less flat" breaks the only
color-coding the tool has.

**The Two-Step Surface Rule.** Depth is exactly three tones deep: ground,
surface, nested surface. There is no fourth step. A panel that needs to sit
inside a nested surface changes its border, not its fill.

**The Severity Ladder Rule.** `crítico` is `{colors.danger-soft}`, `medio` is
`{colors.warn}`, `bajo` is `{colors.muted}`. Severity is never communicated by
size, weight, or icon alone.

## Typography

**Display / Body / Label Font:** Inter (via `next/font/google`), with the
system sans stack as fallback. One family for the whole Studio.

**Mono Font:** JetBrains Mono, loaded **only** on `/prueba` as `--font-mono`.
The Studio has no mono face.

**Character:** Inter set small, tight, and tracked. Headings pull their
tracking in (`-0.02em`) so they read as one compact object; labels push theirs
out (`0.18em`) and go uppercase so they read as etched legends rather than
words. The tension between those two is the type system.

### Hierarchy
- **Display** (500, 28px, tabular figures): version numbers and the few
  headline figures. The one place type is allowed to be large.
- **Headline** (500, 18px, `-0.02em`): modal titles, page headings.
- **Body** (400, 14px, 1.6): all reading text. This is also the base
  `font-size` on `body`.
- **Body Small** (400, 13px, 1.6): chat message content, dense panels.
- **Label** (500, 11px, `0.18em`, uppercase): section labels, badges, the
  header pill logo. Buttons use the same size at `0.15em`; field labels at
  `0.12em`.
- **Micro** (400, 9-11px, `0.16em`, uppercase): the BOT / LEAD role tags above
  chat turns, notification section titles.

### Named Rules

**The Two Weights Rule.** 400 and 500. That is the whole scale. There is one
sanctioned exception in the Studio, the emphasized team name in the
Editor/Creator welcome greeting, which loads 700 and is the only 700 on any
Studio screen. Do not add a third weight to create hierarchy; use size, color,
or tracking.

**The Tracked Capitals Rule.** Anything that names or classifies rather than
reads (label, badge, button, role tag, field label) is uppercase and tracked.
Anything a person reads as a sentence is sentence case and untracked. There is
no middle category.

**The Tabular Figures Rule.** Any number that will be compared against another
number (versions, counts, durations) sets `font-feature-settings: "tnum"`.

## Layout

A single centered column: `.app-shell` is `max-width: 1100px`, `margin: 0
auto`, `padding: 36px 28px`, dropping to `24px 20px` at ≤600px. There is no
sidebar; navigation is a pill in the header row.

Spacing is a coarse rhythm rather than a strict scale: 4 / 8 / 16 for
intra-component gaps, 22px for card padding, 28px for the gap under the header
and between sections, 36px for page padding. Field groups stack at 4px with
16px between them.

Content grids are explicit column counts, not `auto-fill`: card grids run 3
columns at ≥900px, 2 between 600 and 900, 1 below. The two-pane screens
(Playground chat + notes, Demo chat + reports) are CSS grid with a fixed side
column around `22rem` / `minmax(240px, 22rem)`, collapsing to a single column
on narrow viewports.

Breakpoints in use: 600, 700, 720, 760, 800, 900, 999px. They are
component-local rather than a global set; a component breaks at the width its
own content stops fitting.

`prefers-reduced-motion: reduce` is honored: the collapsible transitions and
button press transforms are disabled under it.

### Named Rules

**The One Column Rule.** The Studio never grows a persistent sidebar. Everything
lives in one 1100px column under one header row. A screen that needs a second
pane makes it a grid *inside* the column, and that pane collapses first.

## Elevation & Depth

The Studio is **flat**. Cards, panels, inputs and chat bubbles carry no shadow
at any state; depth comes from the three-tone surface ramp and from hairlines.
A card at rest has a `0.5px` border in `{colors.border}`; on hover the border
moves to `{colors.border2}` and nothing else changes, no lift, no fill change,
no shadow.

Shadow exists in exactly one role: **detachment**. An element that has left the
document plane, a popover or a floating panel, gets one. Everything else does
not.

### Shadow Vocabulary
- **Detached panel** (`box-shadow: 0 16px 36px rgba(0, 0, 0, 0.38)`): the
  notifications panel and other panels anchored to a trigger.
- **Detached tooltip** (`box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35)`): the
  `InfoHint` tooltip.
- **Modal**: no shadow. The overlay is `rgba(0, 0, 0, 0.5)` plus
  `backdrop-filter: blur(6px)`, so what is behind stays recognizable as the
  screen you came from without competing for reading. The blur is the depth
  cue; the modal itself is a flat surface with a `border2` hairline.

### Named Rules

**The Flat-Unless-Detached Rule.** If an element is part of the page, it has no
shadow. If it has left the page (popover, tooltip, floating panel), it has
exactly one of the two shadows above. There is no third shadow and no
"elevation scale".

**The Hairline Rule.** Borders in the Studio are `0.5px`. A border never
thickens to show state; it changes color. (On `/prueba` the same rule holds at
`1px`; see the Guest World Rule.)

## Shapes

Two radii carry almost the whole system, and which one you use is decided by
what the element *is*, not by how big it is.

- **Pill (`100px`)** for anything pressable or anything that is a token: all
  buttons, the header logo, the nav pill, badges, toasts, the toggle track, the
  notification count, the theme switch, the icon buttons.
- **Card (`14px`)** for anything that contains: cards, modals, panels, chat
  bubbles, popovers. `16px` appears on a few larger landing cards; `12px` and
  `9px` on dense inner items (list rows, notification items).
- **Chip (`6px`)** is the one deliberately square-ish shape, reserved for the
  LEGACY badge, where the squarer corner is what says "this one is not like the
  others".

Borders are `0.5px` everywhere, including the transparent one on `.btn`, so a
button never changes size when it gains a visible border.

Chat bubbles use an asymmetric corner as the WhatsApp-style tail: the bot's
bottom-left and the lead's bottom-right drop to `5px`, and only the last bubble
in a run keeps the full `14px`, so a multi-bubble turn reads as one utterance.

### Named Rules

**The Pill-or-Card Rule.** Pressable and token-like is a pill. Containing is a
card. There is no third shape and no intermediate radius invented per screen.

## Components

### Buttons
Discreet but tactile: a control states what it is in tracked capitals and
acknowledges the press, but never lifts off the page at rest.

- **Shape:** full pill (`100px`), `0.5px` transparent border by default so
  variants that add a border do not shift layout.
- **Metrics:** `padding: 10px 18px`, 11px, weight 500, `letter-spacing:
  0.15em`, uppercase, `gap: 8px` for an optional 14-16px Tabler icon on the
  left. `.btn-sm` drops to `6px 12px` / 10px.
- **Primary:** yellow fill, near-black text. No hover change; the fill is
  already the loudest thing on the screen.
- **Secondary:** transparent with a `border2` hairline and primary text.
- **Danger:** transparent with a `danger` hairline and `danger` text; on hover
  the fill becomes `danger` and the text white. This is the one variant that
  inverts on hover, which is the point.
- **Ghost:** no border, `muted` text, `6px 10px`; hover raises the text to
  `fg`.
- **Disabled:** `opacity: 0.4`, `cursor: not-allowed`. Never hidden.
- **Transitions:** `background / border-color / color` at `0.15s`.

### Cards / Containers
- **Corner:** `14px`.
- **Background:** `{colors.surface}` on the page ground.
- **Border:** `0.5px solid {colors.border}`, to `{colors.border2}` on hover.
- **Shadow:** none (see Elevation).
- **Padding:** `22px`.

### Inputs / Fields
The most distinctive primitive in the system: **no box**. A field is a bottom
rule and nothing else.

- **Style:** transparent background, no border except `border-bottom: 0.5px
  solid {colors.border2}`, `padding: 12px 0`, 14px, `outline: none`.
  Placeholders are `{colors.faint}`.
- **Field label:** 11px uppercase tracked `0.12em` in `{colors.muted}`, 4px
  above the control; `(opcional)` inside a label drops to lowercase, untracked,
  `{colors.faint}`.
- **Hint:** 12px `{colors.muted}` under the control.
- **Textarea:** same rule, `resize: vertical`, `min-height: 80px`.
- **Select:** same rule, `appearance: none`.
- **Disabled:** `opacity: 0.5`.

### Navigation
- **Style:** an opaque pill (`surface` fill, `border` hairline, `8px 22px`)
  enclosing the links, so labels stay legible over the dotted background on the
  Editor/Creator landing.
- **Links:** 11px uppercase tracked `0.15em`, `{colors.muted}` at rest,
  `{colors.fg}` when active; the active tab takes a `2px` yellow bottom border.
- **Icons:** every nav icon is yellow regardless of active state. This is
  intentional, not a bug.
- **Mobile (≤600px):** the header stacks, the nav scrolls horizontally rather
  than wrapping, and the theme toggle pins right.

### Badges
- **NEW:** yellow fill, near-black text, pill.
- **NEW VERSION / n8n:** transparent, yellow hairline, yellow text, pill.
- **LEGACY:** `surface2` fill, `muted` text, `6px` corner, tracking dropped to
  `0.1em`. The square corner is the signal.

### Modals
- **Container:** `surface`, `0.5px border2`, `14px`, `padding: 26px`,
  `max-width: 480px`, `max-height: 90vh`.
- **Overlay:** `rgba(0,0,0,0.5)` + `backdrop-filter: blur(6px)`.
- **Title:** 18px, 20px below it. **Footer:** right-aligned, `gap: 12px`,
  24px above.
- **Two-step destructive pattern:** step 1 warns in yellow (`IconAlertTriangle`)
  and offers archive as an alternative; step 2 confirms in red (`IconTrash`),
  lists the consequences as bullets, and requires typing the client's name
  exactly before the confirm button enables. The phrase to type is rendered
  verbatim in real case, not uppercased.

### Chat transcript (signature component)
The tool's most-looked-at surface, and the one place the color ramp inverts.

- **Turn:** a column of one or more bubbles, max-width 92%, bot left, lead
  right, with a 9px uppercase tracked role tag above.
- **Bot bubble:** `surface2` fill, `fg` text, `border` hairline, `10px 16px`,
  `14px` radius with the bottom-left tail at `5px`.
- **Lead bubble:** inverted, `fg` fill and `bg` text, so the human's turn is
  the loud one against the dark ground. Tail bottom-right.
- **Splitting:** a bot reply is split into one bubble per line break, matching
  how n8n delivers it to WhatsApp. Only the last bubble in a run keeps its full
  corner. The `estado` JSON hangs off the last bubble.
- **Selection (Playground/Demo only):** the ring is drawn on each bubble
  individually, not around the whole turn, and the role label stays
  unhighlighted. Tagging is per turn, not per bubble.

### Toggle switch
`38×20px` track, `surface2` fill with a `border2` hairline, `100px`; a `14px`
`faint` knob that turns near-black and slides `18px` when the track goes
yellow. `0.15s`.

## Do's and Don'ts

### Do:
- **Do** use `0.5px` hairlines and change their *color* to show state, never
  their width.
- **Do** keep the accent at `#ffd602` and spend it only on live, current, or
  committed state.
- **Do** write every label, badge and button in uppercase with tracking
  (`0.18em` labels, `0.15em` buttons, `0.12em` field labels).
- **Do** give both themes a real value for anything you add. Tokens are declared
  on `body[data-theme="dark"|"light"]` in `app/globals.css`; a literal color in
  a component is a bug in one of the two themes.
- **Do** use pill for pressable, `14px` for containing.
- **Do** honor `prefers-reduced-motion: reduce` on anything that moves.
- **Do** keep transitions at `0.15s` in the Studio and limited to
  `background`, `border-color`, `color`.

### Don't:
- **Don't** add a drop shadow to anything that has not left the page plane.
  Cards, inputs, modals and bubbles are flat.
- **Don't** put a box around an input. Bottom rule only.
- **Don't** introduce a third font weight in the Studio. 400 and 500, plus the
  one sanctioned 700 in the Editor/Creator welcome greeting.
- **Don't** add a fourth surface tone. Ground, surface, nested surface.
- **Don't** use yellow as a decorative accent, a large fill, or a background
  for reading text.
- **Don't** use an em dash (—) anywhere, including UI strings. This is a
  project-wide rule, not only a visual one.
- **Don't** ship English UI copy. Visible strings are Spanish; code, comments
  and class names are English.
- **Don't** invent a new radius, tracking value, or breakpoint for one screen.

### Named Rules

**The Guest World Rule.** `/prueba/<token>` is not the Studio. It is the one
client-facing route and it runs the Zebra corporate system (Virtual Stripes 26)
scoped entirely to the `.zebra-ds` wrapper in `app/prueba/zebra-ds.css`. It
works by reassigning the *same* CSS variable names inside that scope, so the
shared component CSS re-skins itself. Inside `.zebra-ds`, and only there:

- the accent is **white**, not yellow (the Studio's yellow is internal chrome
  and means nothing to a client);
- hairlines are `1px`, not `0.5px`;
- buttons are **not** pills: `10px` radius, sentence case, 14px semibold, with a
  `translateY(-2px)` lift and a shadow on hover that snaps back on press;
- radii come from the DS scale: chip 6, control 8, input/button 10, card 12;
- 600 is the bold weight, and 700+ is reserved for figures;
- eyebrows are JetBrains Mono at `0.22em`;
- focus is an animated `0 0 0 1px` ring on pressable elements only, never a
  hard 2px outline;
- base reading size is 15px, and fields go to 16px under 900px so iOS does not
  zoom;
- icons are normalized to `stroke-width: 1.5`;
- under 900px the route is a fixed-viewport chat, not a narrower desktop.

Two deliberate deviations are already recorded in that file and should be
preserved: the client-name chip keeps the Studio's `100px` pill, and the
`.zebra-ds` wrapper draws no motif because the page is a working tool.

**Do** style `/prueba` by adding rules to `app/prueba/zebra-ds.css`.
**Don't** let a corporate-DS value leak into `app/globals.css`, and **don't**
apply a Studio rule from this document to that route without checking it there
first.
