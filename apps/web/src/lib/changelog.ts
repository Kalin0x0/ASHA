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
