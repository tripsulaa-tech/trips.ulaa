# Ulaa colour guide

Colours live in one place: the `@theme` block in `src/styles/globals.css`. Use token classes (`bg-primary-600`, `text-neutral-800`), never raw hex codes. `npm run check:contrast` (also part of `npm run build`) enforces the rules below.

## Palette

| Scale | Anchor | Use |
|---|---|---|
| `primary-50…900` | `primary-600` `#A85A2A` | Brand terracotta: buttons, links, headings |
| `amber-50…900` | `amber-500` `#D98A3A` | Secondary accent. Fills with white text need `amber-700` or darker |
| `gold-50…900` | `gold-500` `#C8962A` | Premium and highlight accents |
| `neutral-50…900` | `neutral-800` `#2D2118` | Warm text, backgrounds, borders |
| `success`, `danger`, `warning`, `info` | `-fg`, `-bg`, `-border` | Status messages, e.g. `text-danger-fg bg-danger-bg border-danger-border` |

Old names still work as aliases: `primary`, `primary-light`, `primary-dark`, `secondary`, `dark`, `dark-muted`, `background`, `background-warm`, `cream`, `gold-deep`, `footer`. Two extras exist for the games: `peach` and `gold-soft`.

## Safe pairings

| Text | On | Ratio |
|---|---|---|
| `dark` | `background`, `background-warm` | 14.3 / 12.6 |
| `dark-muted` | `background` | 10.3 |
| `primary` | `background`, white | 4.6 / 5.1 |
| white | `primary`, `amber-700`, `gold-700` | 5.1 / 5.5 / 5.3 |
| `gold-700` (`gold-deep`) | `cream`, `background` | 5.0 / 4.9 |
| `gold-300` | `neutral-900` (games) | 12.1 |
| `cream` | `footer` | 15.3 |
| `*-fg` status colours | their own `*-bg` | 5.4 or higher |

## Rules

1. **Gold is decoration unless it is `gold-700`.** `gold-500` and `gold-600` fail as text on light backgrounds (2.4 and 3.0). Use `text-gold-700`, or `text-gold-300` on dark.
2. **White text needs a dark fill.** `bg-secondary` and `bg-gold` fail with white text. Use `bg-amber-700` and `bg-gold-700`.
3. **Do not fade text with opacity.** Minimum for readable text: `dark/70`, `dark-muted/75`, `cream/55` on dark. Faded `primary` never passes, so use `text-primary` and `hover:text-primary-dark`. Decorative separators and disabled controls are exempt.
4. **Hover gets darker, not lighter.**
5. **Never rely on colour alone.** Pair status colours with an icon or words.
6. **Terracotta on `background-warm` is handled for you.** `text-primary` inside a warm section automatically uses `primary-650` (4.55:1) via a rule in `globals.css`. Do not set `primary` text on a warm background any other way.
7. **Brand logos are exempt**, e.g. the white WhatsApp glyph on its brand green.
8. **Focus rings must be solid.** Use `focus-visible:ring-2 focus-visible:ring-primary` (add `ring-offset-2` next to a primary fill). Translucent rings are about 2:1 and fail.

## Thresholds

Text 4.5:1, large text (18px, or 14px bold) and UI parts such as icons and borders 3:1. Mark intentional exceptions with `contrast-ok` on the line.
