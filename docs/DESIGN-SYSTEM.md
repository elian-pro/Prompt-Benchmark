# Design System

Visual language: monochromatic with a single Zebra-yellow accent (`#FFD602`).
"Lujo silencioso" — minimal, weighted typography, lots of negative space.
Reference: ZEBRA · COTI AUTO (sibling product).

## Theme tokens

Defined as CSS variables on `body[data-theme="dark|light"]`. Default theme
is dark.

### Dark mode (default)

```css
--bg:        #0A0A0A   /* almost-black, primary background */
--surface:   #141414   /* cards, panels */
--surface2:  #1C1C1C   /* nested surfaces, chat bubbles */
--border:    #262626   /* subtle dividers */
--border2:   #3A3A3A   /* active borders, modal edges */
--fg:        #F5F5F5   /* primary text */
--muted:     #8A8A8A   /* secondary text */
--faint:     #5A5A5A   /* tertiary, placeholders, hints */
--accent:    #FFD602   /* Zebra yellow */
--danger:    #E24B4A
```

### Light mode

```css
--bg:        #FAFAF7
--surface:   #FFFFFF
--surface2:  #F4F3EE
--border:    #E5E4DE
--border2:   #C8C7C0
--fg:        #0A0A0A
--muted:     #6B6B66
--faint:     #A8A7A0
--accent:    #FFD602  /* same in both modes */
--danger:    #C2342F
```

## Typography

- **Family**: Inter (via `next/font/google`).
- **Two weights only**: 400 regular, 500 medium. Never 600 or 700.
- **Headings**: tight tracking, `letter-spacing: -0.02em`.
- **Section labels**: MAYÚSCULAS, `letter-spacing: 0.18em`, `font-size: 11px`.
- **Body**: 14px, `line-height: 1.6`.
- **Big version numbers**: 28px, weight 500, `font-feature-settings: "tnum"`.

## Component patterns

### Buttons

| Variant | Style |
|---|---|
| Primary | bg `--accent`, text `#0A0A0A`, weight 500, rounded pill |
| Secondary | transparent bg, border 0.5px `--border2`, text `--fg` |
| Danger | transparent bg, border 0.5px `--danger`, text `--danger`; on hover, bg becomes `--danger` and text white |

All buttons: padding `10px 18px`, font-size 11px, `letter-spacing: 0.15em`,
UPPERCASE label, with optional Tabler icon to the left. Border-radius 100px
(full pill).

### Cards

```css
background: var(--surface);
border: 0.5px solid var(--border);
border-radius: 14px;
padding: 22px;
transition: border-color 0.15s;
```

Hover: `border-color: var(--border2)`. No transform, no shadow.

### Badges

- **NEW**: yellow filled pill, black text, UPPERCASE, 11px tracked 0.18em.
- **NEW VERSION**: transparent with yellow border + yellow text, same shape.
- **LEGACY**: gray tag — square corners (`border-radius: 6px`),
  `background: var(--surface2)`, `color: var(--muted)`, font-mono-ish.

### Inputs

No box. Bottom border only.

```css
background: transparent;
border: none;
border-bottom: 0.5px solid var(--border2);
padding: 12px 0;
font-size: 14px;
outline: none;
color: var(--fg);
```

Placeholder uses `--faint`.

### Chat bubbles (Adversarial Lab)

- **Bot bubble**: anchored left. `background: var(--surface2)`,
  `color: var(--fg)`, `border-bottom-left-radius: 4px` (cola).
- **Lead bubble**: anchored right. `background: var(--accent)`,
  `color: #0A0A0A`, `border-bottom-right-radius: 4px` (cola), weight 500.
- Both: max-width 82%, padding `11px 15px`, border-radius 14px (except
  the anchor corner).
- Above each bubble: small label `BOT` / `LEAD` in 9-11px UPPERCASE
  tracked, `color: var(--muted)`.

### Modals

Two-step delete pattern:

**Step 1 — soft warning**
- Icon: `ti-alert-triangle` in `--accent`.
- Title: "Eliminar '{nombre}'?"
- Body: explains the action, suggests archive as alternative.
- Buttons: CANCELAR · ARCHIVAR · CONTINUAR (danger).

**Step 2 — destructive confirmation**
- Icon: `ti-trash` in `--danger`.
- Title: "¿Estás seguro?"
- Body: bullet list of consequences ("se perderán N versiones", "se
  borrarán los chats…", "esta acción no se puede deshacer").
- Typed confirmation: user must type the client name exactly. The
  SÍ, ELIMINAR button is disabled until the input matches.
- Buttons: CANCELAR · SÍ, ELIMINAR.

### Nav tabs

Underline style. Active tab gets `border-bottom: 2px solid var(--accent)`
and text `var(--fg)`. Inactive tabs have `color: var(--muted)`. All tab
icons are `color: var(--accent)` regardless of active state (this is part
of the look).

## Layout

- Page max-width: 1100px, centered.
- Main content padding: 36px 28px (mobile: 24px 20px).
- Card grid: 3 columns at ≥900px, 2 at 600-900px, 1 below 600px.
- Header pill logo: `background: var(--fg)`, `color: var(--bg)`,
  `padding: 8px 16px`, letter-spacing 0.18em, font-size 11px.

## Icons

Use `@tabler/icons-react` outline icons. Common icons:

- `IconEdit`, `IconCopy`, `IconTrash` — card actions
- `IconUpload`, `IconPlus` — buttons
- `IconSettings`, `IconTarget`, `IconSparkles`, `IconMessages` — section nav
- `IconAlertTriangle`, `IconArchive`, `IconCheck` — modals
- `IconMoon`, `IconSun`, `IconContrast` — theme toggle
- `IconFileText`, `IconPhoto`, `IconTable` — upload chips

Icon size: 14-16px inline, 18-20px in headers, 24px max decorative.

## Empty states (placeholder spec — full design in Sprint 5)

For now: simple centered text in `--muted`, 14px, with an action button
below. Example for Library empty:

```
NO HAY CLIENTES TODAVÍA
Importa uno existente o crea uno nuevo para empezar.
[+ NUEVO CLIENTE]
```

## Loading states (placeholder spec — full design in Sprint 5)

For now: skeleton cards with `background: var(--surface)` and pulsing
opacity 0.4 → 0.7 → 0.4 at 2s intervals.
