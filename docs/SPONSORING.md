<div align="center">

<img src="../apps/web/public/asha-logo.svg" alt="ASHA" width="96" height="96" />

# Sponsoring Asha

**How the GitHub Sponsor button works, which platforms are supported, and how to add more.**
A [Naiemi Group](https://github.com/Kalin0x0) product.

</div>

---

## How GitHub shows the “Sponsor” button

GitHub renders a **Sponsor** button — at the top of the repository and in the repo
sidebar — as soon as it finds a valid [`FUNDING.yml`](../.github/FUNDING.yml). A few
things worth knowing:

- The file **must live at `.github/FUNDING.yml`** and be on the repository's
  **default branch** (`main`). GitHub does not read it from feature branches.
- Only entries with a **valid value** are shown. An empty key, a commented-out line,
  or a handle GitHub can't resolve is silently skipped — so the button never renders
  broken.
- The **GitHub Sponsors** entry only appears once that account/org has an **active
  Sponsors profile**. Until then the rest of the entries still show; the GitHub one
  simply stays hidden.
- GitHub caches the parsed file, so a change can take **a minute or two** (and a hard
  refresh) to appear after it lands on `main`.
- The button reads config only — **no code, tokens, or secrets** are involved.

Full reference:
[Displaying a sponsor button in your repository](https://docs.github.com/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/displaying-a-sponsor-button-in-your-repository).

## Supported platforms

`FUNDING.yml` maps a **platform key** to the **account/slug** used in that platform's
URL (never a full URL — except `custom:`).

| Key | Platform | Value = | Resulting link |
| --- | --- | --- | --- |
| `github` | GitHub Sponsors | username(s) / org — up to 4, as a list | `github.com/sponsors/<name>` |
| `ko_fi` | Ko-fi | page slug | `ko-fi.com/<slug>` |
| `buy_me_a_coffee` | Buy Me a Coffee | username | `buymeacoffee.com/<username>` |
| `patreon` | Patreon | username | `patreon.com/<username>` |
| `open_collective` | Open Collective | collective slug | `opencollective.com/<slug>` |
| `custom` | Any URL(s) | up to 4 **full URLs** | the URL as given |

### PayPal

`FUNDING.yml` has **no dedicated `paypal:` key** — this is the common gotcha. PayPal is
added under **`custom:`** as a full URL:

```yaml
custom:
  - "https://www.paypal.me/your-handle"                          # PayPal.Me
  - "https://www.paypal.com/donate/?hosted_button_id=XXXXXXXXX"  # hosted donate button
```

> GitHub also supports a few keys this project doesn't pre-list —
> `liberapay`, `tidelift`, `polar`, `issuehunt`, `community_bridge`, `lfx_membership`,
> `thanks_dev`. Add any of them the same way (key + value).

## Activating a platform

1. Open [`.github/FUNDING.yml`](../.github/FUNDING.yml).
2. **Uncomment** the platform's line and replace the placeholder with your real handle
   (e.g. `ko_fi: naiemi`). For PayPal / arbitrary pages, add a URL under `custom:`.
3. Commit to **`main`** (the default branch). The button updates within a minute or two.
4. *(Optional but recommended)* Surface it in the README too: open the
   **“Other ways to donate”** block in [`README.md`](../README.md) and **uncomment** the
   matching [Shields.io](https://shields.io) badge, replacing the `YOUR_…` handle. The
   badge markup is already there — one edit lights it up.

That keeps the two sources in sync: `FUNDING.yml` drives GitHub's button, the README
badges give visitors the same links inline.

## Adding a brand-new platform later

- **Has a FUNDING.yml key?** (see the table / GitHub's list) → add `key: value` and, if
  you like, a README badge. Done.
- **No native key?** → add its URL under `custom:` (up to 4) and add a
  `https://img.shields.io/badge/...` badge to the README linking to it.
- Keep everything on **`main`**, and never store secrets here — funding config is public
  by design.

---

<div align="center">

Thank you for supporting Asha 💛 — built by **Naiemi Group**.

</div>
