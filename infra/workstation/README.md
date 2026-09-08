# Trusted Workstation Images (F6)

Builds Asha session images that **trust the deployment's internal CA** and are
flagged **DLP-capable** — the enabler for browsing internal HTTPS services
(`*.persia.local`, internal apps) inside streamed sessions and for the geometric
DLP epics (F4/F5).

## What it does
- Copies every `certs/*.crt` into the OS trust store (`update-ca-certificates`).
- Enables Firefox **enterprise-root import** so the browser trusts the OS store.
- Sets `ASHA_DLP_ENABLED` (honoured by DLP-capable KasmVNC builds).

## Add your CA
Drop your root CA PEM into `certs/` (already includes `persia-root-ca.crt` —
the Persia Internal Root CA). Any number of `*.crt` files are trusted.

## Build
```bash
./build.sh                                   # → asha/firefox-trusted:1.16.0
./build.sh kasmweb/chrome:1.16.0             # → asha/chrome-trusted:1.16.0
./build.sh kasmweb/firefox:1.16.0 myimg:tag 1
```

## What live observation needs from the image
An administrator watching a session does not connect to it — they see the frame
the agent takes **inside the container**, so the capture runs with whatever the
workspace image happens to ship. It reaches for three helpers over `docker exec`,
and the display on `:1`:

| Helper | Missing it costs |
|---|---|
| `ffmpeg` (with the `x11grab` input) | the picture — the sample carries metadata only |
| `xprop` | the focused window's title and application name |
| `wmctrl` | the count of open windows |

Nothing fails without them: the agent degrades the sample and names the helper
it could not find, and the wall and the live view say so (*"No frame: the image
is missing ffmpeg"*). An image meant to be watched should carry all three — on a
Debian/Ubuntu base (`xprop` is in `x11-utils`):

```dockerfile
RUN apt-get update; \
    apt-get install -y --no-install-recommends ffmpeg x11-utils wmctrl; \
    rm -rf /var/lib/apt/lists/*
```

The image above does not add them, so a base without `ffmpeg` gives metadata-only
tiles. Add the line to your own derived image when you want the picture.

## Use
Set a Workspace's image (Admin → Workspaces → Images, or the registry install
`imageOverride`) to the built tag, e.g. `asha/firefox-trusted:1.16.0`. New
sessions on that workspace then trust the internal CA automatically.

> Push the tag to your registry (or build it on every agent host) so agents can pull it.
