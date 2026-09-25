# ASHA — Calm Workspace (applied 2026-09-25)

Intent: a clear, calm professional workspace identity for remote desktops,
browser isolation and secure access. Color preference is subjective; positive
feelings or trust cannot be guaranteed by a palette. Validate with users.

| Role | Color | Hex |
| --- | --- | --- |
| Primary company color | Deep Teal | `#103B3F` |
| Main action / focus accent on dark | Aurora Mint | `#3DD6C6` |
| Light workspace background | Cloud Ivory | `#F5F7F4` |
| Dark workspace background | Night Slate | `#11262A` |
| Optional small brand accent | Champagne Gold | `#C6A45A` |

Use Deep Teal for the wordmark, navigation and company materials; ivory for
light work surfaces. In dark mode use Night Slate backgrounds, ivory text and
mint actions with dark text. On light mode use Deep Teal buttons with ivory
text; do not use white text on mint. Gold is optional for a small symbol/detail,
not the dominant interface color. Do not recolor remote desktop content.

Keep success, warning and error semantic tokens separate from brand colors;
combine colors with icons and text. Verify focus states, disabled controls,
charts and contrast in both themes before applying this proposal.

## What was applied

`apps/web/src/app/globals.css` carries the palette. The neutral scale is a cool
slate ramp anchored on Night Slate at 900 and Cloud Ivory at 50; the brand scale
is one teal ramp holding Aurora Mint at 500 for actions on dark and Deep Teal at
800 for the primary on light. Both are interpolated through OKLab. The old
`gold-*` and `anthracite-*` names remain as aliases over the new scales, because
roughly 580 call sites still use them and renaming those is a separate mechanical
change with no visual effect.

The logo was not touched: it is a raster asset, and the wordmark reads
`text-foreground`, so it follows the theme on its own. It is still gold-toned,
which is now a deliberate contrast against a teal interface rather than a match —
worth an owner decision, not a silent edit.

Two measurements changed the design rather than confirming it. Champagne Gold
reaches only 2.20:1 on Cloud Ivory, missing even the 3:1 floor for non-text
controls, so light surfaces use a darker twin at `#8A6B28`. And `brand-600`
measures 2.99:1 on ivory, so the light focus ring sits a step deeper at
`brand-700` (5.80:1). Chart tones are theme-scoped for the same reason: a ramp
tuned for Night Slate is unreadable on a white card, and Aurora Mint is 8.72:1 on
one and 1.68:1 on the other.

Calculated opaque sRGB contrast ratios: ivory on Deep Teal 11.34:1; Night Slate
text on mint 8.72:1; ivory on Night Slate 14.61:1. These specific pairs have ample
text contrast; they do not certify an entire interface or its interactive states.
The interface was checked in a real browser against mock data across both themes,
three locales including Persian RTL, and a 390px viewport; it has not been checked
against a live API, a running desktop stream, or by a user.
