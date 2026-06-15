import type { Locale } from '@/i18n/locales';

export type ChangeType = 'added' | 'fixed' | 'changed';

/** A user-visible note: a plain string (English) or per-locale variants. */
export type LocalizedText = string | Partial<Record<Locale, string>>;

export interface ChangeItem {
  type: ChangeType;
  text: LocalizedText;
}

export interface Release {
  /** Semantic-ish product version, e.g. "1.0.9". */
  version: string;
  /** Release date, ISO `YYYY-MM-DD`. */
  date: string;
  /** Optional short headline for the release. */
  title?: LocalizedText;
  /** Change notes, in display order. */
  changes: ChangeItem[];
}

/** Resolve a {@link LocalizedText} for a locale, falling back to English. */
export function localize(text: LocalizedText, locale: string): string {
  if (typeof text === 'string') return text;
  return text[locale as Locale] ?? text.en ?? Object.values(text)[0] ?? '';
}

/**
 * Release history — NEWEST FIRST.
 *
 * Versioning convention (do not break): the product version starts at 1.0.9 and
 * is bumped with **every merged update** — 1.0.9 → 1.1.0 → 1.1.1 → 1.1.2 → …
 * For each merge, add a new entry at the TOP of this array with the next version
 * and its added / fixed / changed notes. `CURRENT_VERSION` is derived from the
 * head, so the whole UI (sidebar badge, Updates page) tracks it automatically.
 */
export const CHANGELOG: Release[] = [
  {
    version: '1.1.10',
    date: '2026-06-15',
    title: { en: 'Live desktop preview in the session switcher', de: 'Live-Desktop-Vorschau im Sitzungs-Umschalter' },
    changes: [
      {
        type: 'added',
        text: {
          en: 'The "My Sessions" switcher now shows a real, periodically-refreshed preview of each running remote desktop (snapshotted from the live session), so you can see what each one looks like before switching back.',
          de: 'Der „Meine Sitzungen"-Umschalter zeigt jetzt eine echte, regelmäßig aktualisierte Vorschau jedes laufenden Remote-Desktops (aus der Live-Sitzung erfasst) — so siehst du, wie jeder aussieht, bevor du zurückwechselst.',
        },
      },
      {
        type: 'changed',
        text: {
          en: 'Leaving a desktop keeps it running in the background — switch between running sessions from the switcher without reconnecting from scratch.',
          de: 'Wenn du einen Desktop verlässt, läuft er im Hintergrund weiter — wechsle über den Umschalter zwischen laufenden Sitzungen, ohne dich neu verbinden zu müssen.',
        },
      },
    ],
  },
  {
    version: '1.1.9',
    date: '2026-06-15',
    title: { en: 'Check for updates', de: 'Auf Updates prüfen' },
    changes: [
      {
        type: 'added',
        text: {
          en: 'Developer → Updates now has a "Check for updates" button: it compares your running version against a configurable release feed (NEXT_PUBLIC_UPDATE_FEED_URL) and shows an "Update available" banner with release notes when a newer version exists.',
          de: 'Entwickler → Updates hat jetzt eine Schaltfläche „Auf Updates prüfen": sie vergleicht deine laufende Version mit einem konfigurierbaren Release-Feed (NEXT_PUBLIC_UPDATE_FEED_URL) und zeigt einen Hinweis „Update verfügbar" mit Versionshinweisen, wenn eine neuere Version existiert.',
        },
      },
    ],
  },
  {
    version: '1.1.8',
    date: '2026-06-15',
    title: { en: 'Session viewer polish', de: 'Sitzungs-Viewer verbessert' },
    changes: [
      {
        type: 'fixed',
        text: {
          en: 'The session viewer is now truly full-screen — the "My Workspaces" header no longer paints over it — and its title bar shows the workspace name with the description beneath.',
          de: 'Der Sitzungs-Viewer ist jetzt wirklich im Vollbild — die Kopfzeile „Meine Workspaces" überdeckt ihn nicht mehr — und seine Titelleiste zeigt den Workspace-Namen mit der Beschreibung darunter.',
        },
      },
      {
        type: 'added',
        text: {
          en: 'A "Back to Workspaces" button leaves a session without ending it, so you can minimize it and switch to another desktop (it keeps running).',
          de: 'Eine Schaltfläche „Zurück zu Arbeitsbereichen" verlässt eine Sitzung, ohne sie zu beenden — du kannst sie minimieren und zu einem anderen Desktop wechseln (sie läuft weiter).',
        },
      },
      {
        type: 'fixed',
        text: {
          en: "Suppressed a benign error dialog that KasmVNC's own client could pop up over a running desktop.",
          de: 'Ein harmloses Fehlerdialogfeld unterdrückt, das der KasmVNC-Client über einem laufenden Desktop anzeigen konnte.',
        },
      },
    ],
  },
  {
    version: '1.1.7',
    date: '2026-06-15',
    title: { en: 'Live activity feed + LinuxServer.io catalog', de: 'Live-Aktivität + LinuxServer.io-Katalog' },
    changes: [
      {
        type: 'fixed',
        text: {
          en: 'The dashboard "Live activity" feed now shows recent actions (launches, terminations, syncs, …) from the audit log, instead of staying empty.',
          de: 'Der Dashboard-Feed „Live-Aktivität" zeigt jetzt aktuelle Aktionen (Starts, Beendigungen, Synchronisierungen, …) aus dem Audit-Log, statt leer zu bleiben.',
        },
      },
      {
        type: 'added',
        text: {
          en: 'The Image Registry can sync the real LinuxServer.io catalog: the default LinuxServer source points at their fleet API and imports its images (pulled from lscr.io).',
          de: 'Die Image-Registry kann den echten LinuxServer.io-Katalog synchronisieren: die Standard-LinuxServer-Quelle nutzt deren Fleet-API und importiert deren Images (von lscr.io).',
        },
      },
    ],
  },
  {
    version: '1.1.6',
    date: '2026-06-15',
    title: { en: 'Live session monitoring + seeded registry', de: 'Live-Sitzungsüberwachung + befüllte Registry' },
    changes: [
      {
        type: 'added',
        text: {
          en: 'Watch a running desktop live in view-only mode — admins can see exactly what a user is doing without sending any input, so the user is never interrupted. The session page also shows a live preview thumbnail.',
          de: 'Einen laufenden Desktop live im Nur-Ansehen-Modus beobachten — Admins sehen genau, was ein Nutzer tut, ohne Eingaben zu senden, sodass der Nutzer nie gestört wird. Die Sitzungsseite zeigt zudem ein Live-Vorschaubild.',
        },
      },
      {
        type: 'fixed',
        text: {
          en: 'The Image Registry now ships with default sources (Kasm, LinuxServer.io, Chista) and a starter catalog, so it is no longer empty on a fresh deployment.',
          de: 'Die Image-Registry wird jetzt mit Standardquellen (Kasm, LinuxServer.io, Chista) und einem Startkatalog ausgeliefert und ist bei einer frischen Installation nicht mehr leer.',
        },
      },
    ],
  },
  {
    version: '1.1.5',
    date: '2026-06-15',
    title: { en: 'Image marketplace', de: 'Image-Marktplatz' },
    changes: [
      {
        type: 'added',
        text: {
          en: 'A Kasm-style workspace registry: browse the newest images by category, see size and source, and install them with one click — across Available / Installed / Registries tabs.',
          de: 'Eine Arbeitsbereichs-Registrierung im Kasm-Stil: die neuesten Images nach Kategorie durchsuchen, Größe und Quelle sehen und mit einem Klick installieren — über die Tabs Verfügbar / Installiert / Registrierungen.',
        },
      },
      {
        type: 'added',
        text: {
          en: 'Admins can connect multiple registry sources (e.g. Kasm, LinuxServer.io, a custom index URL) and sync their catalogs.',
          de: 'Admins können mehrere Registrierungsquellen verbinden (z. B. Kasm, LinuxServer.io, eine eigene Index-URL) und deren Kataloge synchronisieren.',
        },
      },
    ],
  },
  {
    version: '1.1.4',
    date: '2026-06-15',
    title: { en: 'Image digest pinning + pull policy', de: 'Image-Digest-Pinning + Pull-Policy' },
    changes: [
      {
        type: 'added',
        text: {
          en: 'Pin a workspace image to its exact content digest (sha256) for reproducible launches, and set a per-image pull policy (Always / If-Not-Present / Never). Resolved live from the Docker Registry v2 API (incl. Docker Hub token auth).',
          de: 'Ein Workspace-Image auf seinen exakten Inhalts-Digest (sha256) festsetzen für reproduzierbare Starts, und eine Pull-Policy pro Image setzen (Immer / Wenn nicht vorhanden / Nie). Live über die Docker-Registry-v2-API aufgelöst (inkl. Docker-Hub-Token-Auth).',
        },
      },
    ],
  },
  {
    version: '1.1.3',
    date: '2026-06-15',
    title: { en: 'Fix rate-limit 429s + RDP viewer routing', de: 'Fix: 429-Ratenlimit + RDP-Viewer-Routing' },
    changes: [
      {
        type: 'fixed',
        text: {
          en: 'Eliminated spurious 429 "too many requests" errors for good — the strict login rate limit was being applied to every endpoint, throttling the dashboard. Login brute-force protection is unchanged.',
          de: 'Fehlerhafte 429-„Zu viele Anfragen"-Fehler endgültig beseitigt — das strenge Login-Ratenlimit wurde auf jeden Endpunkt angewendet und drosselte das Dashboard. Der Brute-Force-Schutz beim Login bleibt unverändert.',
        },
      },
      {
        type: 'fixed',
        text: {
          en: 'Opening a Windows/RDP session from the sessions list now loads the desktop correctly (it routes to the remote-desktop canvas instead of an iframe that was blocked).',
          de: 'Das Öffnen einer Windows-/RDP-Sitzung aus der Sitzungsliste lädt den Desktop jetzt korrekt (Weiterleitung zur Remotedesktop-Ansicht statt eines blockierten iframes).',
        },
      },
    ],
  },
  {
    version: '1.1.2',
    date: '2026-06-14',
    title: { en: 'One-click app updates', de: 'Ein-Klick-App-Updates' },
    changes: [
      {
        type: 'added',
        text: {
          en: 'When a new version is deployed, the installed app shows an "Update available" prompt — one click reloads into the latest version.',
          de: 'Wenn eine neue Version bereitgestellt wird, zeigt die installierte App einen Hinweis „Update verfügbar" — ein Klick lädt die neueste Version.',
        },
      },
    ],
  },
  {
    version: '1.1.1',
    date: '2026-06-14',
    title: { en: 'Installable app (PWA) + offline', de: 'Installierbare App (PWA) + Offline' },
    changes: [
      {
        type: 'added',
        text: {
          en: 'Install Chista as a desktop app — an "Install app" button appears in supported browsers, and it launches in its own window.',
          de: 'Chista als Desktop-App installieren — in unterstützten Browsern erscheint eine Schaltfläche „App installieren", und Chista startet in einem eigenen Fenster.',
        },
      },
      {
        type: 'added',
        text: {
          en: 'Offline support: the app shell is cached so Chista keeps loading without a connection, with an offline indicator and a friendly offline page.',
          de: 'Offline-Unterstützung: die App-Hülle wird zwischengespeichert, sodass Chista auch ohne Verbindung lädt — mit Offline-Anzeige und einer freundlichen Offline-Seite.',
        },
      },
      {
        type: 'added',
        text: {
          en: 'Web app manifest, maskable icons and service worker — installable and launchable from the desktop / start menu.',
          de: 'Web-App-Manifest, maskierbare Symbole und Service Worker — installierbar und vom Desktop / Startmenü aus startbar.',
        },
      },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-06-14',
    title: { en: 'Native RDP client + multi-monitor', de: 'Nativer RDP-Client + Mehrere Monitore' },
    changes: [
      {
        type: 'added',
        text: {
          en: 'Launch desktops with "Open Session In → RDP Client": download an .rdp file and connect with the native Remote Desktop client.',
          de: 'Desktops mit „Sitzung öffnen in → RDP-Client" starten: eine .rdp-Datei herunterladen und mit dem nativen Remotedesktop-Client verbinden.',
        },
      },
      {
        type: 'added',
        text: {
          en: 'Native RDP sessions support multi-monitor (use all your screens), clipboard copy/paste, local drive access and printer redirection.',
          de: 'Native RDP-Sitzungen unterstützen mehrere Monitore (alle Bildschirme nutzen), Zwischenablage (Kopieren/Einfügen), Zugriff auf lokale Laufwerke und Druckerumleitung.',
        },
      },
      {
        type: 'added',
        text: {
          en: 'A launch chooser lets you pick "Web Native" (in-browser) or "RDP Client" per desktop, with toggles for each redirection.',
          de: 'Ein Start-Dialog lässt dich pro Desktop „Web Native" (im Browser) oder „RDP-Client" wählen — mit Schaltern für jede Umleitung.',
        },
      },
    ],
  },
  {
    version: '1.0.9',
    date: '2026-06-14',
    title: { en: 'Updates area + version system', de: 'Update-Bereich + Versionssystem' },
    changes: [
      {
        type: 'added',
        text: {
          en: 'Developer → Updates: an in-app changelog showing what was added, fixed and changed in every release, and the current version.',
          de: 'Entwickler → Updates: ein In-App-Änderungsprotokoll, das zeigt, was in jeder Version hinzugefügt, behoben und geändert wurde — samt aktueller Version.',
        },
      },
      {
        type: 'added',
        text: {
          en: 'In-app feedback & bug-report widget with a shared triage board where admins and automated agents collaborate, including screenshot uploads.',
          de: 'In-App-Feedback- und Fehlerbericht-Widget mit gemeinsamem Triage-Board, auf dem Admins und automatische Agenten zusammenarbeiten — inklusive Screenshot-Upload.',
        },
      },
      {
        type: 'added',
        text: {
          en: 'Running-desktop switcher with live thumbnails and Stop / Resume / Delete, so users no longer reconnect from scratch.',
          de: 'Desktop-Umschalter mit Live-Vorschaubildern und Stoppen / Fortsetzen / Löschen — Nutzer müssen sich nicht mehr jedes Mal neu verbinden.',
        },
      },
      {
        type: 'added',
        text: {
          en: 'Edit and delete workspaces directly from the catalog.',
          de: 'Arbeitsbereiche direkt aus dem Katalog bearbeiten und löschen.',
        },
      },
      {
        type: 'fixed',
        text: {
          en: 'App catalog icons now render correctly for every workspace.',
          de: 'Katalog-Symbole werden jetzt für jeden Arbeitsbereich korrekt angezeigt.',
        },
      },
      {
        type: 'fixed',
        text: {
          en: 'Eliminated spurious 429 “too many requests” errors by trusting the reverse proxy and tuning per-client rate limits.',
          de: 'Fehlerhafte 429-„Zu viele Anfragen“-Fehler beseitigt: Reverse-Proxy wird vertraut und Ratenlimits pro Client angepasst.',
        },
      },
      {
        type: 'changed',
        text: {
          en: 'Adopted a clean version system, starting at 1.0.9 and bumping with every update.',
          de: 'Sauberes Versionssystem eingeführt, beginnend bei 1.0.9 und mit jedem Update erhöht.',
        },
      },
    ],
  },
];

/** The product version currently running — the head of {@link CHANGELOG}. */
export const CURRENT_VERSION = CHANGELOG[0]!.version;
