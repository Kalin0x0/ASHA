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

## Use
Set a Workspace's image (Admin → Workspaces → Images, or the registry install
`imageOverride`) to the built tag, e.g. `asha/firefox-trusted:1.16.0`. New
sessions on that workspace then trust the internal CA automatically.

> Push the tag to your registry (or build it on every agent host) so agents can pull it.
