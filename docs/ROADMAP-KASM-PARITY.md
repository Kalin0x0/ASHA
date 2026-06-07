# Chista — Kasm-Parität & darüber hinaus

> Master-Roadmap · Stand 2026-06-07 · Head of Product
> Ziel: **alles was Kasm Workspaces kann — und mehr.** Konsolidiert aus einer 8-Bereiche-Gap-Analyse gegen docs.kasm.com.

---

## 0. Umsetzungsstatus (Stand 2026-06-07)

**Phase 1 — 10 / 16 P0 geshippt & verifiziert** (PR #6 `fix/deployment-and-streaming`, live auf chista.naiemi.com, jede Stufe deployt + verifiziert):

| Epic | Status |
|---|---|
| D2-MVP — Session-Ownership/Org-Scope (Security-Leck) | ✅ |
| A5 — Docker-Run-Override + Launch-Token-Resolver | ✅ |
| B7 — Pause-Reaper | ✅ |
| D1-Core — Agent-RegistrationTokens | ✅ |
| C1 — Users + Roles + Groups CRUD | ✅ |
| G4 — Audit-Backbone (@Audit-Interceptor + Facetten-Filter) | ✅ |
| C2 — User-Impersonation (RFC-8693 act-claim, auditiert) | ✅ |
| H1 — Developer-API (ApiKeyGuard + Scopes) | ✅ |
| A2 — Registry-Reifegrad (Preview + edit-before-install) | ✅ (build-verifiziert) |
| G2 — Ed25519-Offline-Lizenz | ✅ |
| 🐞 2× adversariale Bug-Hunts | ✅ 18+ Bugs gefixt (4 CRIT/HIGH-Security, 2 runtime-bewiesen) |

**Offen — 6 P0 (schwere Greenfield, brauchen DLP-Image / RDP-Host / Web-Viewer / OAuth-Provider → auf einem Single-VM nur teil-verifizierbar):** F6→F4 (KasmVNC-DLP geometrisch), F5 (RDP-HTTPS-Gateway), B1 (In-Session Stream-Control), B5 (Recording-Pipeline-Tiefe), E1/E2 (Storage-OAuth + SSE-C). Danach Phase 2/3 (P1/P2) + die „über Kasm hinaus"-Differentiatoren (§5).

---

## 1. Executive Summary

Chista soll **alles können, was Kasm Workspaces bietet — und mehr**. Dieses Dokument konsolidiert 8 Bereichs-Backlogs zu **47 Parität-Epics** (davon **16 P0 = echte Lücken zuerst**) plus **8 neuen Differentiatoren** in einer einzigen, ausführungsreifen Roadmap. Strategie: zuerst die harten Kasm-Lücken schließen (Windows RemoteApp/RDS + RDP-HTTPS-Gateway, AD-Sync & Computer-Join, Image-Lifecycle & Commit-to-Image, Direct-to-Agent + Offline-Install, Multi-Monitor, Server-DLP-Tiefe), parallel die vorhandenen Chista-Vorteile (Neko-WebRTC, SCIM+JIT, Passkey, HMAC-Webhooks, Postgres-RLS-Multi-Tenancy, 11 VM-Provider) festigen — und Chista in Phase 3+ mit 8 Differentiatoren (KI-Copilot, Aurora-Glass-UX, Public-API+SDK, Realtime-Collaboration, FinOps, Policy-as-Code, Terraform-Provider, mobile PWA) klar über Kasm heben. **3 Hauptphasen** + Querschnitts-Enabler; Aufwand grob ~14× XL, ~16× L, ~9× M (≈ 18–24 Monate bei 2–3 Squads).

---

## 2. Legende

**Status:** `[FEHLT]` = existiert im Code gar nicht (Greenfield) · `[TEILWEISE]` = Substrat/Modell da, aber unvollständig/nicht verdrahtet · `[ENABLER]` = Querschnitts-Baustein, den mehrere Epics voraussetzen.
**Priorität:** **P0** = echte Lücke / Fundament / Security-kritisch · **P1** = wichtige Parität · **P2** = Abrundung / Nische.
**Aufwand (T-Shirt):** `M` ≈ 2–4 Wo · `L` ≈ 4–8 Wo · `XL` ≈ 8–14 Wo (1 Squad).
**Querschnitts-Konventionen (für ALLE Epics):** additive Migrationen (NEVER break schema), jedes Modell `orgId` + Postgres-RLS, RBAC-Guard + Audit auf jede Mutation, Secrets via `packages/crypto` (envelope-encrypted), zod-DTOs in `packages/contracts`, UI = Aurora-Glass (Anthracite #1a1a2e + Gold #d4af37).

---

## 3. Backlog nach Bereich

### Bereich A — Workspaces, Images & Registry
| ID | Epic | Status | Aufwand | Prio |
|---|---|---|---|---|
| A1 | **Windows RemoteApp / RDS-Integration** — `RdsFarm`/`RdsSessionHost`, Broker (least-loaded, drainMode), RDWeb-Feed-Discovery + Bulk-Import, guacd-RDP-RemoteApp (`||alias`), RD-Gateway-Tunneling (443), Token-Auflösung. | FEHLT | XL | P1 |
| A2 | **Workspace-Registry-Reifegrad** — Channel-/Tag-Wahl beim Install, Edit-before-install, Space-Estimation, Compatibility-Array (Protokoll/GPU/Arch), Security-Flags (runAsRoot/CVE/Signatur), Registry-Auth/Priority, 3rd-party-Index-Parser. | TEILWEISE | L | **P0** |
| A3 | **Image-CI/CD & Rolling-Tags** — `ImagePullPolicy`/`ImagePullRun`, Scheduler (Bull/Redis), Auto-Pull, `maxConcurrentPulls`, Zero-Downtime-Tag-Switch via Digest-Pinning, Promote/Rollback. | FEHLT | L | P1 |
| A4 | **Create Docker Image from Session** — Commit-to-Image (`docker commit` + Config) → Push → Auto-Workspace-Anlage; `ImageBuildJob`, Live-Logs, K8s-BuildKit-Fallback, `IMAGE_BUILD`-Permission. | FEHLT | L | P2 |
| A5 | **Docker-Run-Config-Override + Lifecycle + Tokens** — `CapAdd/CapDrop/SecurityOpt/Privileged/Labels/RestartPolicy`; Lifecycle-Hooks (`firstLaunch/go/assign`); Token-Interpolation (`{username}`, `{custom_attribute_n}`); Privileged-Policy-Guard; K8s-securityContext. | TEILWEISE | M | **P0** |
| A6 | **Single-App-Container-Build-Toolkit** — `Dockerfile.single-app`, `maximize_window.sh`, `desktop_ready`-Signal, App-Restart-Loop, `custom_startup.sh`, `chista-image build`-CLI. | TEILWEISE | M | P1 |
| A7 | **Per-Image-VPN-Sidecar-Pattern** — `VpnProfile` (wireguard/openvpn), Config-Templating, Kill-Switch (Default-Deny außer Tunnel), Health-Gating, shared netns Docker+K8s. | TEILWEISE | M | P2 |

### Bereich B — Sessions & Streaming
| ID | Epic | Status | Aufwand | Prio |
|---|---|---|---|---|
| B1 | **In-Session Control Panel: Streaming-Tiefe** — `StreamProfile` (Quality-Preset Static→Extreme, Scaling, max-FPS, Game-Mode, IME, OSK, Webcam, Perf-Stats); Live-Update via `SessionControlEvent` + Socket.IO; `streamState`-Persistenz. | TEILWEISE | L | **P0** |
| B2 | **Multi-Monitor / Multi-Display** — `Session.displays`, `maxDisplays`, Auto-Placement, Native-Resolution; Multi-Head-X/RandR; Pop-out pro Display; KasmVNC-Multi-Monitor/WebRTC-Multi-Track. | FEHLT | XL | P1 |
| B3 | **Gamepad-Passthrough** — bis 4 Controller, Port-Mapping, `/dev/uinput`-Mount nur bei `dlp.gamepad`, Test-Visualizer. | TEILWEISE | M | P2 |
| B4 | **RDP-Thick-Client-Peripherie** — WebAuthn/Yubikey-Passthrough, Drive-/Printer-/Smartcard-Redirection-Matrix über guacd; Policy-Maske pro Workspace. | FEHLT | XL | P1 |
| B5 | **Session-Recording-Pipeline-Tiefe** — Bitrate/FPS/Größe/Codec; `RetentionPolicy` + Storage-Thresholds; In-Browser-HLS-Playback + Thumbnails-Timeline; Batch-Download (presigned). | TEILWEISE | L | **P0** |
| B6 | **Standby / Pre-Warm-Ressourcen für Pools** — `standbyCores/Mem/GPU`, `minAvailableSessions`, Aggressive-Scaling, Downscale-Backoff; `StandbyInstance` (WARMING/READY/CLAIMED); Claim statt Cold-Start. | TEILWEISE | L | P1 |
| B7 | **Pause-Session (RAM-State-erhaltend)** — CRIU-Checkpoint / VM-Suspend / K8s-Pod-Checkpoint; Disconnect/Reconnect; Reaper-`maxPausedMinutes`; reduzierte Quota. | TEILWEISE | M | **P0** |

### Bereich C — Identity & Access
| ID | Epic | Status | Aufwand | Prio |
|---|---|---|---|---|
| C1 | **RBAC-Permission-Matrix-Breite + scoped Permissions** — ~90+ atomare Permissions, Scope-Modifier (GLOBAL/IF_MEMBER/SELF), System-Roles, Impersonation (`act`-Claim, ≤30 min), Auth-Session-Verwaltung anderer User. | TEILWEISE | XL | **P0** |
| C2 | **Bulk-User-CSV-Import** — `BulkImportJob`/`BulkImportRow`, async Streaming-Validierung (≤10k), All-or-Nothing-Commit, maschinenlesbarer Error-Report, Idempotenz. | FEHLT | M | P1 |
| C3 | **Active Directory Sync & Computer-Record-Creation** — LDAPS (CA-Pinning), inkrementeller Sync über `objectGUID`, Disable statt Delete; Computer-Account-Creation + Domain-Join (agent-seitig, `djoin`-Blob), Teardown-Cleanup. | FEHLT | XL | P1 |
| C4 | **Physische TOTP-Hardware-Token** — PSKC/CSV verschlüsselter Seed-Import, Self-Register (Serial+OTP), Drift-Window, Resync, Replay-Schutz. | FEHLT | M | P2 |
| C5 | **SAML Advanced-Security-Flags** — signed/encrypted assertions, NameID-Encrypt, ADFS-Mode, Algo-Wahl, SP-x509+Key (verschlüsselt), SP-Metadata-Gen, Clock-Skew. | TEILWEISE | L | P1 |
| C6 | **OIDC Frontchannel + Backchannel SLO** — `end_session_endpoint`, Front-/Backchannel-Logout (terminiert aktive Sessions), RP-initiated Logout, Auto-Login, per-Hostname-Config. | TEILWEISE | L | P1 |
| C7 | **API-Key: per-Key-Permissions, Read-Only-Override, Impersonation-Scoping** — effektive Perms = `intersection(key, owner)`, Read-Only hart, Hash-Speicherung + Prefix-Lookup, IP-Allowlist, Rotate. | TEILWEISE | M | P1 |

### Bereich D — Deployment & Infrastruktur
| ID | Epic | Status | Aufwand | Prio |
|---|---|---|---|---|
| D1 | **Multi-Server Role-Split Install + Registration-Token + Healthcheck** — `ServerNode`/`RegistrationToken`/`ConnectionProxyNode`, Role-Split-Enroll (DB/APP/AGENT/GUAC/PROXY), `/healthz`+`/readyz`+`/healthz/deep`. | TEILWEISE | L | **P0** |
| D2 | **Direct-to-Agent Connection-Modell** — Rendering-Bypass der Web-App, HMAC-Connect-Ticket, forward-auth-Edge-Validator am Agent (ersetzt Basic-Auth-Stopgap); löst zugleich die offene Session-Auth-Lücke. | FEHLT | XL | **P0** |
| D3 | **Offline / Air-Gapped Install + Offline-Aktivierung** — signiertes Activation-File, lokale Registry (`registry:2`), Offline-Bundle (`docker save`), Helm-Registry-Prefix, Grace-Degrade. | FEHLT | L | P1 |
| D4 | **Agent-Oversubscription & Lifecycle** — Resource-Override + `oversubscriptionRatio`, Drain/Cordon/Rotate/Retire, Pre-Warm-Replacement, Auto-Prune, Register-DNS (OPNsense/Unbound-Adapter). | TEILWEISE | L | P1 |
| D5 | **AutoScale-Scheduling** — kalenderbasiert (Cron+TZ+DST), mehrere Configs/Pool via `priority`, Session-Preservation-on-Downscale, Dry-Run, Leader-Elected Singleton. | TEILWEISE | L | P1 |
| D6 | **AutoScale Server-Pool AD-Join** — `AdJoinProfile` (OU/DC/Service-Account), Auto-Pre-Create + Join nach scaleUp (LDAPS), `AdComputerRecord`-Audit, Delete-on-Retire. | FEHLT | M | P2 |
| D7 | **Zone-Load-Balancing-Strategien** — Least/Most-Load, Least-Sessions, Prioritize-Static, Search-Alternate-Zones, Zone-Labels + Workspace-Label-Selector. | TEILWEISE | M | P1 |
| D8 | **DB-HA / Managed-DB** — RDS/Aurora/CloudNativePG, VIP/DNS-Failover, Read-Replica-Routing, Backup/Restore + Cross-Server-Restore (Org-scoped via RLS), Helm `database.provider`-Switch. | TEILWEISE | XL | P1 |

### Bereich E — Storage
| ID | Epic | Status | Aufwand | Prio |
|---|---|---|---|---|
| E1 | **Storage-Provider OAuth + rclone-Driver + Self-Enrollment** — OAuth-PKCE (Dropbox/GDrive/OneDrive), `packages/storage-driver` (rclone), WebDAV/SFTP/Azure/SMB/GCS, **rclone-Mount-Sidecar (FUSE)** = die fehlende Mount-Materialisierung, Token-Refresh-Worker. | TEILWEISE | XL | **P0** |
| E2 | **Persistent-Profile SSE-C + STS + Quota + Migration** — per-User-SSE-C-Key (HKDF), STS-Short-Lived-Token (≤1h, prefix-scoped), Quota-Enforcement, include/exclude-Globs, Backend-Migration mit Live-Progress. | TEILWEISE | XL | **P0** |
| E3 | **Multi-Server Shared-Storage (NFS/SMB/SSHFS/GFS/HDFS/CephFS)** — org-weite `SharedStorageBackend`-Config, Agent-`ensureSharedMount` (refcounted), Health-Probe, K8s-CSI. | TEILWEISE | L | P1 |
| E4 | **File-Mappings-Tiefe** — Precedence Workspace<Group<User, `writable`/`executable`-Flags, Inline-Editor vs. Upload vs. Host-Path, Windows-HOMEPATH-Expansion, `/resolved`-Preview. | TEILWEISE | M | P1 |

### Bereich F — Connectivity & Security
| ID | Epic | Status | Aufwand | Prio |
|---|---|---|---|---|
| F1 | **Squid Web-Filtering-Tiefe** — Deny-by-Default, Safe-Search-Rewrite, lizenzierte Kategorisierung+Cache, SSL-Bump (peek/splice/bump + Bypass), gebrandete Blocked-Page + geloggter Override. | TEILWEISE | XL | P1 |
| F2 | **3rd-Party Browser-Isolation** — Forward-Proxy-302-Gateway, Vendor-Templates (BlueCoat/F5/Palo-Alto), „Open In Isolation"-MV3-Extension, Root-CA-Trust-Flow. | TEILWEISE | L | P2 |
| F3 | **Egress: OpenVPN + Managed PureVPN + Per-Credential-Limits + Diagnostics** — `gluetun`/openvpn-Sidecar, PureVPN-Auto-Provision, `maxSessions`/`maxBandwidth`/Usage-Telemetrie, Health-Samples. | TEILWEISE | L | P1 |
| F4 | **KasmVNC DLP geometrisch** — visible/concealed_region (+allow_click), Clipboard-MIME-Whitelist+Size+Rate-Limit, Keyboard-Rate-Limit, Watermark location/tint/repeat, **DLP_PROCESS_FAIL_SECURE + RAM-Purge**; visueller Region-Editor; heute ungenutztes Modell verdrahten. | TEILWEISE | XL | **P0** |
| F5 | **RDP-HTTPS-Gateway (RDP über 443) + DLP-over-RDP + Restrict-Client-IP** — `RdpGateway`/`RdpTarget`/`RdpClientIpRule`/`RdpDlpProfile`, WSS-443 via guacd (kein offener 3389), Clipboard/Drive/Printer/Audio-DLP, echte Client-IP via XFF-Trust, Watermark. | FEHLT | XL | **P0** |
| F6 | **[ENABLER] Root-CA-Trust + DLP-fähige Workstation-Images** — Image-Build nimmt Chista-/Bump-/Neko-/Vendor-Root-CAs in System-Truststore + NSS-DB; KasmVNC-Build mit DLP-Env-Support. Voraussetzung für F1/F2/F4. | TEILWEISE | M | **P0** |

### Bereich G — Admin & Operations
| ID | Epic | Status | Aufwand | Prio |
|---|---|---|---|---|
| G1 | **Versioniertes Config Import/Export + Slip-Stream-Provisioning** — `ConfigBundle` (versioniert, signiert, secret-by-ref), Dry-Run-Diff + Konflikt-Resolver, atomarer MERGE/REPLACE, Rollback, Helm-Bootstrap-Seeder. | TEILWEISE | XL | P1 |
| G2 | **Lizenz-Modell-Tiefe** — Activation- vs. License-Key, Air-Gap-Offline-Verifikation (Ed25519), `installationId`, Seat-Splitting über Deployments, API-Seat-Allocation, Grace-Read-Only. | TEILWEISE | L | **P0** |
| G3 | **Branding-Granularität** — per-Hostname-Profile, getrennte Asset-Slots (Favicon/Admin/User/Login/Wallpaper), Session-State-Texte, Theme-Tokens, public cache-barer `branding/resolve`. | TEILWEISE | L | P1 |
| G4 | **Reporting/Logging-Dashboard-Tiefe (+ Audit-Backbone)** — `AuditEvent`/`MetricSample`, Real-Time-WS-Refresh, Advanced-Facetten-Filter, AES-256-GCM-verschlüsselter Log-Export, `metric_name`-Tags, `@Audit()`-Interceptor (Querschnitt). | TEILWEISE | XL | **P0** |

### Bereich H — Developer & Extras
| ID | Epic | Status | Aufwand | Prio |
|---|---|---|---|---|
| H1 | **Developer-API-Tiefe & Programmatic Session Control** — `/api/dev/v1` mit `ApiKeyGuard` (argon2id, scopes, RLS-Context, Rate-Limit); `request_session` (ENV/Egress/Profile-Injection), `exec_command`, `get_screenshot`, frame/bottleneck-stats, passwordless `login-link`; Swagger + SDK. | TEILWEISE | XL | **P0** |
| H2 | **Session Casting / RemoteApp-Reife** — `CastConfig`/`CastSessionLink`, regex-`value_pattern` mit ReDoS-Linter + Command-Injection-Schutz (argv-only), Error-URL, PWA/Direct-Install-Manifest, Allow-Resume. | TEILWEISE | L | P1 |
| H3 | **„Open In Isolation" Browser-Extension** — MV3, Refang-Engine (`hxxp→http`, `[.]→.`), Go-/Cast-Modus, Server-side Re-Refang + Schema-Allowlist, signierte CI-Artefakte, `IsolationOpenAudit`. | FEHLT | L | P2 |
| H4 | **Experimental-Features-Framework** — `ExperimentalFeature`/`OrgFeatureFlag`, Toggle + Accept-Risk-Gate, versionierter Index (`sinceVersion`/stage), Preview/develop-Channel-Gate, `@RequireFeature`-Guard. | FEHLT | M | P1 |

---

## 4. Phasenplan

### Phase 0 — Querschnitts-Enabler (vorgezogen, blockiert vieles)
| Enabler | Genutzt von | Aufwand |
|---|---|---|
| **Audit-Backbone** (`@Audit()`-Interceptor + Crypto) → in **G4** | G1, G2, G3, C*, alle Mutationen | (Teil G4) |
| **Token-Resolver** `packages/tokens` (`{username}`, `{custom_attribute_n}`) | A1, A5, A7, F (RDP-Creds) | S (in A5) |
| **Storage-Mount-Materialisierung** (rclone-Sidecar) → in **E1** | E2, E3, E4 | (Teil E1) |
| **`packages/crypto` envelope + KMS-Key, BullMQ/Redis-Worker** | C2, C3, C4, A3, G* | M |
| **Root-CA-Trust + DLP-Image (F6)** | F1, F2, F4 | M · **P0** |

### Phase 1 — P0: echte Lücken & Fundament zuerst
F5 RDP-HTTPS-Gateway (XL) · F4 KasmVNC-DLP geometrisch (XL) · F6 Root-CA/DLP-Image (M) · D2 Direct-to-Agent + Session-Auth (XL) · D1 Multi-Server-Roles + Healthcheck (L) · C1 RBAC-Breite + Impersonation (XL) · A5 Docker-Run-Override + Tokens (M) · A2 Registry-Reifegrad (L) · B1 Stream-Control-Panel (L) · B7 Pause-Session (M) · B5 Recording-Pipeline (L) · E1 Storage-OAuth + rclone-Mount (XL) · E2 Profile-SSE-C + STS (XL) · G4 Reporting/Audit-Backbone (XL) · G2 Lizenz-Tiefe (L) · H1 Developer-API (XL).

### Phase 2 — P1: Parität ausbauen
A1 RemoteApp/RDS · A3 Image-CI/CD · A6 Single-App-Toolkit · B2 Multi-Monitor · B4 RDP-Thick-Client-Peripherie · B6 Standby/Pre-Warm · C2 Bulk-CSV · C3 AD-Sync+Computer-Join · C5 SAML-Flags · C6 OIDC-SLO · C7 API-Key-Scoping · D3 Offline-Install · D4 Agent-Lifecycle · D5 AutoScale-Scheduling · D7 Zone-LB · D8 DB-HA · E3 Shared-Storage · E4 File-Mappings-Tiefe · F1 Squid-Tiefe · F3 Egress-OpenVPN/PureVPN · G1 Config-Import/Export · G3 Branding-Granularität · H2 Casting/RemoteApp-Reife · H4 Experimental-Framework.

### Phase 3 — P2: Abrundung & Nische
A4 Commit-to-Image · A7 VPN-Sidecar · B3 Gamepad · C4 Hardware-TOTP · D6 AutoScale-AD-Join · F2 3rd-Party-BI · H3 „Open in Isolation"-Extension.

---

## 5. Über Kasm hinaus („und mehr")

### 5a. Schon heute besser — BEHALTEN & ausbauen
- **Neko WebRTC** (niedrigere Latenz, Audio, Multi-User) → WebRTC v2 als Default, getStats-Overlay (B1), Multi-Track-Multi-Monitor (B2).
- **SCIM + JIT** → an RBAC-Breite (C1) koppeln; Deprovision → Session-Kill.
- **Passkey/WebAuthn-Login** → Step-up-Auth für High-Risk (Impersonation, Privileged-Workspaces).
- **HMAC-Webhooks** → Event-Katalog erweitern (storage.expired, license.grace, autoscale.event, dlp.violation).
- **Breiteres Log-Forwarding** → an Audit-Backbone (G4) andocken (OTel/Splunk/Elastic/Loki).
- **Postgres-RLS-Multi-Tenancy** (Kasm = app-level) → Verkaufsargument für regulierte Märkte; RLS-Negativtests in CI.
- **11 VM-Provider** → Terraform-Provider + AutoScale-Scheduling als Cross-Provider-Layer.

### 5b. Neue Differentiatoren — über Kasm heben
| # | Differentiator | Kurz | Aufwand | Prio |
|---|---|---|---|---|
| 1 | **KI-Copilot „ChistaGPT"** | In-Console-Assistent: Troubleshooting, NL→Admin-Action (RBAC-gated), Recording-Summaries, Audit-Anomalie-Erklärung. Nutzt Claude/ChatGPT-OAuth (Hermes-Pattern). | XL | P1 (nach H1/G4) |
| 2 | **Aurora-Glass-UX** | Konsequentes Design-System, Command-Palette (⌘K), Live-Dashboards, In-Session-Floating-Dock — sichtbares Differenzierungsmerkmal ggü. Kasm. | L | P1 |
| 3 | **Public-API + offizielles SDK** | Versionierte `/api/dev/v1` + generierte TS/Python/Go-SDKs, Postman-Collection, Sandbox-Org. | L | P1 (nach H1) |
| 4 | **Terraform-Provider + Policy-as-Code** | `terraform-provider-chista` (HCL) + OPA/Rego-Policies für DLP/Egress/RBAC — versionierbar, PR-reviewbar, CI-gated. | XL | P2 |
| 5 | **Realtime-Collaboration in Sessions** | Mehrere User live (Neko-nativ), Cursor-Presence, Rollen (Viewer/Controller), In-Session-Chat + Annotation, Control-Handover. | L | P2 |
| 6 | **Cost-Dashboard / FinOps** | Kosten pro Org/Pool/User/Workspace, Idle-Alerts, Right-Sizing, Budget-Caps + Auto-Drain, Showback/Chargeback. | L | P1 |
| 7 | **Mobile PWA** | Installierbares End-User-Portal: Start/Resume, Touch-Viewer, OSK, Push (Session-ready), Offline-Shell. | M | P2 |
| 8 | **Self-Healing & Predictive Autoscaling** | Auto-Remediation (Agent-Rotate bei Degradation), ML-Last-Vorhersage für Pre-Warm, Auto-Incidents aus Audit-Anomalien. | L | P2 |

---

## 6. Zusammenfassung
| Bereich | # Epics | # P0 |
|---|---|---|
| A — Workspaces, Images & Registry | 7 | 2 (A2, A5) |
| B — Sessions & Streaming | 7 | 3 (B1, B5, B7) |
| C — Identity & Access | 7 | 1 (C1) |
| D — Deployment & Infrastruktur | 8 | 2 (D1, D2) |
| E — Storage | 4 | 2 (E1, E2) |
| F — Connectivity & Security | 6 | 3 (F4, F5, F6) |
| G — Admin & Operations | 4 | 2 (G2, G4) |
| H — Developer & Extras | 4 | 1 (H1) |
| **Summe Parität** | **47** | **16** |
| Differentiatoren (5b) | 8 | — |
| **Gesamt** | **55** | **16** |

> Quelle der Lücken: `chista-kasm-gap-analysis` (8-Bereiche-Doku-Recherche gegen docs.kasm.com). Vergleich basiert auf Admin-Nav + README; [TEILWEISE]-Items vor Implementierung im Code gegenprüfen.
