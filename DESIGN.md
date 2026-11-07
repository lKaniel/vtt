---
name: VTT
description: A browser tabletop for D&D 5e in a Baldur's Gate 3 look, bronze and iron over a dark table.
colors:
  background: '#12110f'
  ink: '#0b0a09'
  panel-top: '#24221e'
  panel-glass: 'rgba(18, 17, 15, 0.9)'
  card: '#1b1a17'
  accent: '#34302a'
  border: '#3d362c'
  input: '#4a4134'
  text: '#e6dcc8'
  muted: '#9b9182'
  gold: '#a88a5e'
  gold-bright: '#e8d3a6'
  gold-dim: '#5e4d36'
  good: '#6fa86a'
  warn: '#c98f3a'
  bad: '#b5413a'
  action: '#5fae4f'
  bonus: '#d9822b'
  reaction: '#a07ad6'
  move: '#d4b25a'
  slot: '#5b8fd6'
typography:
  display:
    fontFamily: "'IM Fell English SC', 'Trajan Pro', Georgia, serif"
    fontWeight: 400
    letterSpacing: '0.04em'
  body:
    fontFamily: "'Alegreya', Georgia, serif"
    fontSize: '14px'
    lineHeight: 1.45
rounded:
  sm: '4px'
  md: '6px'
  lg: '8px'
spacing:
  hairline: '4px'
  tight: '6px'
  base: '8px'
  panel: '12px'
components:
  button-primary:
    textColor: '{colors.gold-bright}'
    typography: '{typography.display}'
    height: '32px'
  button-outline:
    textColor: '{colors.gold-bright}'
    typography: '{typography.display}'
    height: '28px'
  panel:
    backgroundColor: '{colors.panel-glass}'
    textColor: '{colors.text}'
    padding: '8px 12px'
---

# DESIGN.md

The look of the table, written down so new screens stay in it. Tokens live in
`packages/client/src/index.css` (`--ui-*`, Tailwind theme) and the older
`style.css` `:root`; the painted art is in `public/art/ui` and reached through
the `art-*` utilities. Components come from `packages/client/src/ui/kit`
(see CLAUDE.md, "UI components").

## Overview

A working game screen (Operate mode): the map is the content and everything
else is a frame around it. The world is Baldur's Gate 3's: dark iron and
glass panels with bronze rims, small-caps serif lettering, warm gold for what
matters. Since the minimal pass the frames are thin and quiet; the one place
that keeps the full painted weight is the action bar (`.ab-*`, `.tile`), which
stays as it is.

Players sit at the table for hours in a dim room: dark ground, low glare,
gold only where the eye should go.

## Colors

- **Ground:** `background` and `ink` behind everything; panels are
  `panel-glass` (slightly see-through, 3 px blur) so the map shows faintly.
- **Gold is the accent.** `gold-bright` for titles, lit text and the current
  selection; `gold` for labels and rims; `gold-dim` for idle rules and
  hairlines. Never a saturated gold on something inactive.
- **Text:** `text` for reading, `muted` for secondary words. No grey on gold.
- **States:** `good` (healthy, success), `warn` (bloodied, caution), `bad`
  (damage, delete, errors).
- **Action economy** (BG3): `action` green, `bonus` orange, `reaction`
  purple, `move` yellow, `slot` blue. Use these only for those meanings.
- A player's own colour (seat `color`) marks their chat, cursor, targets.

## Typography

- **Display:** IM Fell English SC for titles, buttons, tab labels, names on
  tokens and panels. Small caps carry the voice; never set long text in it.
- **Body:** Alegreya for everything read: chat, sheets, descriptions,
  inputs. 13 to 14 px in panels.
- Numbers that change (HP, initiative, feet) keep a steady width where they
  line up.

## Layout

- The map fills the screen. Fixed parts keep their own places and never lie
  over each other (`e2e/specs/layout.spec.ts` checks):
  - **Top strip** (top left): the top bar, then the GM's fight controls or the
    initiative order in what is left of the row up to the side panel; on
    screens under 1500 px they take a row of their own, right of the party.
  - **Party** portraits down the left under the top bar.
  - **Map tools** bottom left; rarely used tool groups fold behind a button.
  - **Side panel** full height on the right (320 px), foldable to its icons.
  - **Action bar** bottom centre.
- Anything that floats over the table is a kit `Window` or `Dialog`
  (drag, roll up, resize, place remembered), never a fixed panel of its own.
- A selection shows its controls where they are asked for (right-click menu,
  token HUD, sheet), not as a panel that pops up on every click.

## Elevation & Depth

- Panels: `--slim-rim` (the painted panel rim at 6 px) over `--slim-fill`, a
  soft drop shadow `0 6px 22px rgba(0,0,0,.5)`.
- Popovers and menus sit one step above, with the same rim.
- The map edge is darkened by a vignette so panels sit on it.

## Shapes

Small radii (4 to 8 px) on fields and buttons; portraits are arched
(`28px 28px 4px 4px`) or round on the map. Painted frames come from the art,
not from CSS borders.

## Components

- **Button** `default`: the lit painted plate. One per area, for the main thing
  to do (Start combat, Join, Enter the game).
- **Button** `outline`: the bronze hairline. Most buttons.
- **Button** `ghost` + `icon-sm`: icon buttons in bars, always with a
  `title` and `aria-label`.
- **Toggle** `plate`: on/off switches that read as buttons.
- **Popover** for a short choice off a button (Rest, Request check).
- **Separator** before destructive entries in a menu.
- Icons are lucide, one stroke weight; never emoji or Unicode glyphs as icons.

## Do's and Don'ts

- Do put every word through `t()`.
- Do fold rarely used controls behind one button instead of showing them all.
- Do keep primary actions as the only lit plate in their group.
- Don't add one-off CSS for buttons, inputs or selects; use the kit.
- Don't restyle the action bar, its tooltips or the initiative frames.
- Don't use a kicker above every heading; the menu screens' one is the
  house style, don't spread it.
- Don't rely on `margin: auto` in legacy CSS for an element with a
  `data-slot`: the kit's reset sets its margin to 0; use Tailwind's `mx-auto`.
