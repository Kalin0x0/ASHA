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
    version: '1.1.24',
    date: '2026-07-04',
    title: { en: 'One-click updates', de: 'Ein-Klick-Updates' },
    changes: [
      {
        type: 'added',
        text: {
          en: 'Developer → Updates now has an "Update now" button. Click it and Asha runs the platform update through its stages — fetching the release, building images, migrating the database and restarting services — with a live progress bar and a per-stage checklist, then offers a reload to load the new version.',
          de: 'Developer → Updates hat jetzt eine Schaltfläche „Jetzt aktualisieren". Ein Klick führt das Plattform-Update durch alle Phasen aus — Release laden, Images bauen, Datenbank migrieren und Dienste neu starten — mit Live-Fortschrittsbalken und einer Phasen-Checkliste, danach kann die App neu geladen werden.',
        },
      },
    ],
  },
  {
    version: '1.1.23',
    date: '2026-07-04',
    title: { en: 'Choose your desktop style', de: 'Wähle deinen Desktop-Stil' },
    changes: [
      {
        type: 'added',
        text: {
          en: 'The launcher personalization panel (the wallpaper button) now lets you switch the whole desktop between three styles — Windows, macOS and Classic — plus a light/dark theme toggle, alongside the wallpaper picker. Your choice is remembered per browser.',
          de: 'Das Personalisierungs-Panel des Launchers (die Hintergrund-Schaltfläche) lässt dich jetzt den gesamten Desktop zwischen drei Stilen umschalten — Windows, macOS und Klassisch — plus einen Hell-/Dunkel-Umschalter, neben der Hintergrundauswahl. Deine Wahl wird pro Browser gespeichert.',
        },
      },
    ],
  },
  {
    version: '1.1.22',
    date: '2026-07-04',
    title: { en: 'Windows-style desktop', de: 'Desktop im Windows-Stil' },
    changes: [
      {
        type: 'changed',
        text: {
          en: 'The end-user portal is now a Windows-12-style desktop: a floating glass taskbar with a Start button, pinned + running workspaces (with a running underline) and a system tray with a live clock; a Start menu (⌘K) with search, a Pinned grid and a Recommended row of your open sessions; and open sessions as windows with Windows caption buttons (minimize = pause, maximize = open, close = end).',
          de: 'Das Endnutzer-Portal ist jetzt ein Desktop im Windows-12-Stil: eine schwebende Glas-Taskleiste mit Start-Schaltfläche, angehefteten + laufenden Workspaces (mit Lauf-Unterstrich) und einer Taskleisten-Info mit Live-Uhr; ein Startmenü (⌘K) mit Suche, einem Angeheftet-Raster und einer Empfohlen-Reihe deiner offenen Sitzungen; offene Sitzungen als Fenster mit Windows-Titelleisten-Schaltflächen (Minimieren = pausieren, Maximieren = öffnen, Schließen = beenden).',
        },
      },
      {
        type: 'added',
        text: {
          en: 'Pin a workspace and it now appears as an icon on the desktop — double-click (or Enter) to launch it, just like a real OS.',
          de: 'Hefte einen Workspace an und er erscheint jetzt als Symbol auf dem Desktop — per Doppelklick (oder Eingabetaste) startest du ihn, wie in einem echten Betriebssystem.',
        },
      },
    ],
  },
  {
    version: '1.1.21',
    date: '2026-07-04',
    title: { en: 'Liquid glass', de: 'Liquid Glass' },
    changes: [
      {
        type: 'changed',
        text: {
          en: 'The OS desktop now uses Apple-style liquid glass: the dock, session windows and the Launchpad search field are layered frosted-glass surfaces — a blurred, refracted wallpaper behind a frost tint, a beveled "liquid" edge rim and a slow specular sheen that sweeps across. Fully theme-aware (light + dark) and RTL-correct.',
          de: 'Der OS-Desktop nutzt jetzt Liquid Glass im Apple-Stil: Dock, Sitzungsfenster und das Launchpad-Suchfeld sind mehrschichtige Milchglas-Flächen — ein unscharf gebrochenes Hintergrundbild unter einer Frost-Tönung, ein abgeschrägter „flüssiger" Rand und ein langsamer Glanz, der darüber wandert. Vollständig theme-fähig (hell + dunkel) und RTL-korrekt.',
        },
      },
    ],
  },
  {
    version: '1.1.20',
    date: '2026-07-04',
    title: { en: 'The OS desktop', de: 'Der OS-Desktop' },
    changes: [
      {
        type: 'changed',
        text: {
          en: 'The end-user portal is now a macOS-style OS desktop: a thin translucent menu bar with a live clock, your open sessions as windows with working traffic lights (close / pause / open), a magnifying dock with running-app dots and a launch bounce, and a full-screen Launchpad (⌘K) with search and category filters. An empty desktop greets you with a lock-screen clock.',
          de: 'Das Endnutzer-Portal ist jetzt ein OS-Desktop im macOS-Stil: eine schmale transluzente Menüleiste mit Live-Uhr, offene Sitzungen als Fenster mit funktionierenden Ampel-Knöpfen (Schließen / Pausieren / Öffnen), ein vergrößerndes Dock mit Punkten für laufende Apps und Start-Bounce sowie ein Vollbild-Launchpad (⌘K) mit Suche und Kategorie-Filtern. Ein leerer Desktop begrüßt mit einer Sperrbildschirm-Uhr.',
        },
      },
    ],
  },
  {
    version: '1.1.19',
    date: '2026-06-16',
    title: { en: 'New brand logo', de: 'Neues Markenlogo' },
    changes: [
      {
        type: 'changed',
        text: {
          en: 'New Asha emblem — a gold-on-anthracite badge with a monitor, a shield + container cube and city window-panels. It now appears across the app (sidebar, login, browser tab / favicon and the installed-app icon) and as the README cover. Authored as a crisp vector, so it stays sharp at every size.',
          de: 'Neues Asha-Emblem — ein Gold-auf-Anthrazit-Badge mit Monitor, Schild + Container-Würfel und Fenster-Panels. Es erscheint jetzt überall in der App (Seitenleiste, Login, Browser-Tab / Favicon und Symbol der installierten App) sowie als README-Titelbild. Als sauberer Vektor umgesetzt, bleibt es in jeder Größe scharf.',
        },
      },
    ],
  },
  {
    version: '1.1.18',
    date: '2026-06-16',
    title: { en: 'Edit servers + delete confirmation', de: 'Server bearbeiten + Löschbestätigung' },
    changes: [
      {
        type: 'added',
        text: {
          en: 'Registered servers can now be edited from the Servers page — a pencil button opens a dialog to update the address, connection type, max sessions and (optionally) the credentials and RDP security. Leaving username / password blank keeps the sealed credentials unchanged.',
          de: 'Registrierte Server lassen sich jetzt auf der Server-Seite bearbeiten — eine Stift-Schaltfläche öffnet einen Dialog, um Adresse, Verbindungstyp, max. Sitzungen und (optional) die Anmeldedaten sowie die RDP-Sicherheit zu ändern. Bleiben Benutzername / Passwort leer, bleiben die versiegelten Anmeldedaten unverändert.',
        },
      },
      {
        type: 'changed',
        text: {
          en: 'Deleting a server now always asks for confirmation first — the trash button opens an "Are you sure?" dialog naming the host instead of removing it immediately.',
          de: 'Das Löschen eines Servers fragt jetzt immer zuerst nach einer Bestätigung — die Papierkorb-Schaltfläche öffnet einen „Sind Sie sicher?“-Dialog mit dem Hostnamen, statt den Server sofort zu entfernen.',
        },
      },
    ],
  },
  {
    version: '1.1.17',
    date: '2026-06-16',
    title: { en: 'Full control toolbar for RDP sessions', de: 'Vollständige Steuerleiste für RDP-Sitzungen' },
    changes: [
      {
        type: 'added',
        text: {
          en: 'RDP / VNC / SSH sessions now have the same rich control toolbar as the browser desktops — workspace name + status, and working buttons: paste, Ctrl+Alt+Del, screenshot, resolution selector, quality toggle, a view-only share link, fullscreen, reconnect and end. Every button acts on the live session.',
          de: 'RDP-/VNC-/SSH-Sitzungen haben jetzt dieselbe umfangreiche Steuerleiste wie die Browser-Desktops — Workspace-Name + Status und funktionierende Schaltflächen: Einfügen, Strg+Alt+Entf, Screenshot, Auflösungsauswahl, Qualitätsumschalter, ein Nur-Ansehen-Link, Vollbild, Neu verbinden und Beenden. Jede Schaltfläche wirkt auf die laufende Sitzung.',
        },
      },
    ],
  },
  {
    version: '1.1.16',
    date: '2026-06-15',
    title: { en: 'Manage installed images + install progress', de: 'Installierte Images verwalten + Installationsfortschritt' },
    changes: [
      {
        type: 'added',
        text: {
          en: 'Installing from the marketplace now shows a progress bar with a percentage that turns green when done.',
          de: 'Die Installation aus dem Marktplatz zeigt jetzt einen Fortschrittsbalken mit Prozentanzeige, der bei Fertigstellung grün wird.',
        },
      },
      {
        type: 'added',
        text: {
          en: 'Workspaces → Images now manages installed images: see each one’s CPU / RAM / GPU, edit those limits, set the pull policy, and uninstall (removes the image + its workspaces).',
          de: 'Workspaces → Images verwaltet jetzt installierte Images: CPU / RAM / GPU jedes Images sehen, diese Limits bearbeiten, die Pull-Policy setzen und deinstallieren (entfernt das Image + seine Workspaces).',
        },
      },
    ],
  },
  {
    version: '1.1.15',
    date: '2026-06-15',
    title: { en: 'Reverse tunnel for hosts behind NAT', de: 'Reverse-Tunnel für Hosts hinter NAT' },
    changes: [
      {
        type: 'added',
        text: {
          en: 'Reachability for Windows hosts behind NAT/firewall: run the agent with -Tunnel and it joins a Asha WireGuard network over an OUTBOUND connection (no port-forwarding). Asha issues the tunnel config + IP and repoints the server at it, so sessions reach the desktop over the tunnel. Requires a WireGuard server (env-gated).',
          de: 'Erreichbarkeit für Windows-Hosts hinter NAT/Firewall: Der Agent mit -Tunnel tritt über eine AUSGEHENDE Verbindung einem Asha-WireGuard-Netz bei (keine Portweiterleitung). Asha vergibt Tunnel-Konfiguration + IP und leitet den Server darauf um, sodass Sitzungen den Desktop über den Tunnel erreichen. Erfordert einen WireGuard-Server (per Env aktiviert).',
        },
      },
    ],
  },
  {
    version: '1.1.14',
    date: '2026-06-15',
    title: { en: 'Deploy the agent to hosts by IP', de: 'Agent per IP auf Hosts verteilen' },
    changes: [
      {
        type: 'added',
        text: {
          en: 'A "Deploy to hosts by IP" dialog on Infrastructure → Servers: list target IPs, and Asha mints a registration token and builds the ready-to-run WinRM remote-deploy command — so you install the agent on many Windows hosts from the panel without RDP-ing into each.',
          de: 'Ein Dialog „Per IP auf Hosts verteilen" unter Infrastruktur → Server: Ziel-IPs auflisten, und Asha erzeugt ein Registrierungs-Token und baut den fertigen WinRM-Remote-Deploy-Befehl — so installierst du den Agenten auf vielen Windows-Hosts aus dem Panel, ohne dich per RDP auf jedem anzumelden.',
        },
      },
    ],
  },
  {
    version: '1.1.13',
    date: '2026-06-15',
    title: { en: 'Download the agent from the admin panel', de: 'Agent aus dem Admin-Panel herunterladen' },
    changes: [
      {
        type: 'added',
        text: {
          en: 'The Windows agent scripts are now downloadable directly from Infrastructure → Servers — download buttons for install.ps1, the agent, and the remote-install (by IP) script, alongside the ready-made install command.',
          de: 'Die Windows-Agent-Skripte sind jetzt direkt unter Infrastruktur → Server herunterladbar — Schaltflächen für install.ps1, den Agenten und das Remote-Installationsskript (per IP), neben dem fertigen Installationsbefehl.',
        },
      },
    ],
  },
  {
    version: '1.1.12',
    date: '2026-06-15',
    title: { en: 'Remote agent deploy by IP', de: 'Agent-Fernverteilung per IP' },
    changes: [
      {
        type: 'added',
        text: {
          en: 'Deploy the Windows host agent remotely by IP — a remote-install script (PowerShell Remoting / WinRM) installs it on one or many hosts without RDP-ing into each. Docs also cover baking the agent into VM golden templates (the VMware/Parallels-style path).',
          de: 'Den Windows-Host-Agent per IP aus der Ferne verteilen — ein Remote-Installationsskript (PowerShell Remoting / WinRM) installiert ihn auf einem oder vielen Hosts, ohne sich per RDP auf jedem anzumelden. Die Doku beschreibt auch das Einbacken des Agents in VM-Golden-Templates (der VMware/Parallels-Weg).',
        },
      },
    ],
  },
  {
    version: '1.1.11',
    date: '2026-06-15',
    title: { en: 'Windows host agent (availability)', de: 'Windows-Host-Agent (Verfügbarkeit)' },
    changes: [
      {
        type: 'added',
        text: {
          en: 'A lightweight Windows agent you install on a desktop/server: it auto-registers the host with Asha and heartbeats so it shows Online/available (and flips Offline when it goes away). Optionally enables Remote Desktop. The Servers page shows a ready-made install command.',
          de: 'Ein schlanker Windows-Agent zum Installieren auf einem Desktop/Server: er registriert den Host automatisch bei Asha und sendet Heartbeats, sodass er Online/verfügbar erscheint (und Offline geht, wenn er verschwindet). Aktiviert optional Remote Desktop. Die Server-Seite zeigt einen fertigen Installationsbefehl.',
        },
      },
    ],
  },
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
          en: 'The Image Registry now ships with default sources (Kasm, LinuxServer.io, Asha) and a starter catalog, so it is no longer empty on a fresh deployment.',
          de: 'Die Image-Registry wird jetzt mit Standardquellen (Kasm, LinuxServer.io, Asha) und einem Startkatalog ausgeliefert und ist bei einer frischen Installation nicht mehr leer.',
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
          en: 'Install Asha as a desktop app — an "Install app" button appears in supported browsers, and it launches in its own window.',
          de: 'Asha als Desktop-App installieren — in unterstützten Browsern erscheint eine Schaltfläche „App installieren", und Asha startet in einem eigenen Fenster.',
        },
      },
      {
        type: 'added',
        text: {
          en: 'Offline support: the app shell is cached so Asha keeps loading without a connection, with an offline indicator and a friendly offline page.',
          de: 'Offline-Unterstützung: die App-Hülle wird zwischengespeichert, sodass Asha auch ohne Verbindung lädt — mit Offline-Anzeige und einer freundlichen Offline-Seite.',
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
