# ASHA — Calm Workspace (proposal, not applied)

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

No logo, CSS tokens or live branding were changed. A company-wide color choice
still requires the owner's selection.

Calculated opaque sRGB contrast ratios: ivory on Deep Teal 11.34:1; Night Slate
text on mint 8.72:1; ivory on Night Slate 14.61:1. These specific pairs have ample
text contrast; they do not certify an entire interface or its interactive states.
