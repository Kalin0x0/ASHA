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
    version: '1.1.34',
    date: '2026-09-01',
    title: { en: 'Take one desktop away from one person', de: 'Einer Person einen Desktop wegnehmen' },
    changes: [
      {
        type: 'added',
        text: {
          en: 'You can now switch a desktop off for a single person even when a group gives it to them. Previously that switch was greyed out and the only advice was to remove them from the group — impossible when the group is “All Users” — or to take the group off the desktop, which changes it for everybody. The row tells you where the access would have come from, so an off switch is never unexplained, and switching it back on hands the person back to their group.',
          de: 'Sie können einen Desktop jetzt für eine einzelne Person abschalten, auch wenn eine Gruppe ihn ihr gibt. Bisher war dieser Schalter ausgegraut, und der einzige Rat lautete, die Person aus der Gruppe zu nehmen — bei „All Users“ unmöglich — oder die Gruppe vom Desktop zu lösen, was ihn für alle ändert. Die Zeile nennt jetzt, woher der Zugriff gekommen wäre, damit ein abgeschalteter Schalter nie unerklärt bleibt; beim Wiedereinschalten gilt wieder die Gruppe.',
        },
      },
      {
        type: 'changed',
        text: {
          en: 'A person switched off this way loses the desktop everywhere, not just from their list: the check that decides what you see and the check that decides what you may start are now one and the same. Saving a workspace in the older edit dialog also no longer clears these exceptions.',
          de: 'Wer so abgeschaltet wird, verliert den Desktop überall — nicht nur aus der Liste: Die Prüfung, was jemand sieht, und die Prüfung, was jemand starten darf, sind jetzt dieselbe. Das Speichern eines Workspace im älteren Bearbeiten-Dialog löscht diese Ausnahmen zudem nicht mehr.',
        },
      },
    ],
  },
  {
    version: '1.1.33',
    date: '2026-08-31',
    title: { en: 'One-click assignments, and End really ends', de: 'Zuweisungen mit einem Klick, und Beenden beendet wirklich' },
    changes: [
      {
        type: 'added',
        text: {
          en: 'A new Assignments screen under Access answers "who may open what" from either side: pick a person and switch on the desktops, services and containers they should have, or pick one and see who holds it. Both sides are searchable and filterable by kind, and each switch saves the moment you flip it — no form, no Save button. It is also reachable straight from a person\u2019s row menu and from a workspace card.',
          de: 'Ein neuer Bereich „Zuweisungen" unter Zugriff beantwortet „wer darf was öffnen" von beiden Seiten: Person auswählen und die Desktops, Dienste und Container einschalten, die sie haben soll — oder umgekehrt sehen, wer einen bestimmten Desktop hat. Beide Seiten sind durchsuchbar und nach Art filterbar, und jeder Schalter speichert sofort beim Umlegen — kein Formular, kein Speichern-Knopf. Erreichbar auch direkt aus dem Zeilenmenü einer Person und von einer Workspace-Kachel.',
        },
      },
      {
        type: 'added',
        text: {
          en: 'Where access comes from is now visible: a desktop someone has through a group names that group, and says so instead of offering a switch that could not remove it anyway.',
          de: 'Woher ein Zugriff stammt, ist jetzt sichtbar: Ein Desktop, den jemand über eine Gruppe hat, nennt diese Gruppe — statt einen Schalter anzubieten, der ihn ohnehin nicht entfernen könnte.',
        },
      },
      {
        type: 'fixed',
        text: {
          en: 'Ending a session works again. The confirmation dialog was rendering behind the full-screen viewer, so pressing End opened a prompt nobody could see: the session was never ended, and the invisible dialog also froze the viewer, which is why Back stopped returning to the workspace list.',
          de: 'Das Beenden einer Sitzung funktioniert wieder. Der Bestätigungsdialog wurde hinter dem Vollbild-Viewer gezeichnet — „Beenden" öffnete also eine Abfrage, die niemand sehen konnte: Die Sitzung wurde nie beendet, und der unsichtbare Dialog blockierte zusätzlich den Viewer, weshalb auch „Zurück" nicht mehr zur Workspace-Liste führte.',
        },
      },
      {
        type: 'fixed',
        text: {
          en: 'A session that failed to start is no longer quietly still connectable, and now stays listed in the portal so you can end it. Previously it could keep streaming while its status already said Error.',
          de: 'Eine Sitzung, deren Start fehlgeschlagen ist, bleibt nicht mehr stillschweigend verbindbar und wird jetzt im Portal weiter angezeigt, damit man sie beenden kann. Vorher konnte sie weiterlaufen, obwohl ihr Status bereits „Fehler" lautete.',
        },
      },
      {
        type: 'fixed',
        text: {
          en: 'Buttons that talk to the server no longer hang forever when it cannot be reached. A request now gives up after a short wait and tells you what went wrong, instead of leaving the button disabled with nothing happening.',
          de: 'Schaltflächen, die mit dem Server sprechen, hängen nicht mehr endlos, wenn er nicht erreichbar ist. Eine Anfrage bricht jetzt nach kurzer Zeit ab und meldet den Fehler, statt die Schaltfläche deaktiviert und ohne Reaktion zurückzulassen.',
        },
      },
      {
        type: 'fixed',
        text: {
          en: 'Demo accounts: two people signing up at the same moment can no longer leave a broken half-created account behind or hit an error, and a time-boxed demo no longer had its time budget quietly refilled every minute — which made the limit meaningless.',
          de: 'Demo-Konten: Zwei gleichzeitige Anmeldungen hinterlassen kein halb angelegtes, defektes Konto mehr und laufen nicht in einen Fehler; und ein befristetes Demo bekam sein Zeitbudget nicht länger jede Minute stillschweigend wieder aufgefüllt — was die Begrenzung wirkungslos machte.',
        },
      },
      {
        type: 'changed',
        text: {
          en: 'Administrators now need a confirmed authenticator app before they can sign in as another user. Impersonation is the one action that hands over someone else\u2019s session, so it is the one that asks for a second factor.',
          de: 'Administratorinnen und Administratoren brauchen jetzt eine bestätigte Authenticator-App, bevor sie sich als anderer Nutzer anmelden können. Das Übernehmen einer fremden Identität ist die eine Aktion, die eine fremde Sitzung aushändigt — also die eine, die einen zweiten Faktor verlangt.',
        },
      },
      {
        type: 'changed',
        text: {
          en: 'Uploads are capped per purpose rather than globally: only bug reports and feedback may carry a screenshot-sized payload, everything else is limited to a small request. Persian screens also read correctly right-to-left in more places.',
          de: 'Uploads sind jetzt zweckgebunden begrenzt statt global: Nur Fehlerberichte und Feedback dürfen ein Bild in Screenshot-Größe mitführen, alles andere ist auf kleine Anfragen beschränkt. Persische Ansichten laufen zudem an mehr Stellen korrekt von rechts nach links.',
        },
      },
    ],
  },
  {
    version: '1.1.32',
    date: '2026-07-23',
    title: { en: 'Sign-up requests, access fixes and one language', de: 'Zugangsanfragen, Zugriffs-Fixes und eine Sprache' },
    changes: [
      {
        type: 'added',
        text: {
          en: 'Visitors can request a demo or test account from the login screen. Nothing is created until an administrator approves it under Access → Access requests, where each request can be given a time limit and a group on approval. The feature stays off until you switch it on.',
          de: 'Besucher können über die Anmeldeseite ein Demo- oder Testkonto anfragen. Es entsteht nichts, bevor eine Administratorin oder ein Administrator unter Zugriff → Zugangsanfragen freigibt — dort lässt sich pro Anfrage eine Befristung und eine Gruppe vergeben. Die Funktion bleibt aus, bis Sie sie einschalten.',
        },
      },
      {
        type: 'added',
        text: {
          en: 'A guided Windows installer sets Asha up on a Windows host, with a written walkthrough alongside it.',
          de: 'Ein geführter Windows-Installer richtet Asha auf einem Windows-Host ein, samt schriftlicher Anleitung.',
        },
      },
      {
        type: 'fixed',
        text: {
          en: 'Assigning a workspace to a person now actually shows it to them. New accounts joined no group, and permissions come only from groups, so they signed in to an empty app and even a directly assigned workspace stayed invisible.',
          de: 'Wird eine Person einem Arbeitsbereich zugewiesen, sieht sie ihn jetzt auch. Neue Konten landeten in keiner Gruppe, und Rechte kommen ausschließlich über Gruppen — die App blieb leer, und selbst ein direkt zugewiesener Arbeitsbereich war unsichtbar.',
        },
      },
      {
        type: 'fixed',
        text: {
          en: 'A workspace can no longer be launched by anyone who knows its id, and the catalogue no longer hands its full contents — including who each workspace is assigned to — to every signed-in user.',
          de: 'Ein Arbeitsbereich lässt sich nicht mehr allein durch Kenntnis seiner ID starten, und der Katalog gibt seinen vollständigen Inhalt — samt Zuweisungen — nicht mehr an jede angemeldete Person heraus.',
        },
      },
      {
        type: 'fixed',
        text: {
          en: 'Signing out clears the cached view of your data, so the next person to sign in on a shared browser no longer sees the previous account’s users, sessions and activity.',
          de: 'Beim Abmelden wird die zwischengespeicherte Ansicht geleert — wer sich danach an einem geteilten Browser anmeldet, sieht nicht mehr Nutzer, Sitzungen und Aktivitäten des vorigen Kontos.',
        },
      },
      {
        type: 'fixed',
        text: {
          en: 'Long dialogs scroll instead of running off the top and bottom of the window. The New workspace form was unusable below the fold; every dialog in the app was affected.',
          de: 'Lange Dialoge lassen sich scrollen, statt oben und unten aus dem Fenster zu laufen. Das Formular „Neuer Arbeitsbereich“ war unterhalb des sichtbaren Bereichs nicht bedienbar; betroffen war jeder Dialog der App.',
        },
      },
      {
        type: 'fixed',
        text: {
          en: 'The interface no longer mixes languages. Parts of the session viewer and the whole Servers page were written in a fixed language and ignored your choice.',
          de: 'Die Oberfläche mischt keine Sprachen mehr. Teile des Sitzungs-Viewers und die gesamte Server-Seite waren fest in einer Sprache verdrahtet und ignorierten Ihre Auswahl.',
        },
      },
      {
        type: 'fixed',
        text: {
          en: 'A time budget now ends every one of that person’s sessions when it runs out, not just the one that happened to use up the last minute.',
          de: 'Ist ein Zeitbudget aufgebraucht, werden jetzt alle Sitzungen der betreffenden Person beendet — nicht nur jene, die zufällig die letzte Minute verbraucht hat.',
        },
      },
      {
        type: 'changed',
        text: {
          en: 'Hardening: keys and tokens stop working once the account behind them is disabled, group membership can no longer hand out permissions the granter lacks, a host agent can only act on its own organisation, disabling a directory provider stops logins through it, and the server refuses to start on the example secrets published in the repository.',
          de: 'Härtung: Schlüssel und Token verlieren ihre Wirkung, sobald das dahinterliegende Konto deaktiviert wird; über Gruppen lassen sich keine Rechte mehr vergeben, die man selbst nicht hat; ein Host-Agent kann nur noch in seiner eigenen Organisation wirken; ein abgeschalteter Verzeichnisdienst erlaubt keine Anmeldung mehr; und der Server startet nicht mehr mit den im Repository veröffentlichten Beispiel-Geheimnissen.',
        },
      },
      {
        type: 'changed',
        text: {
          en: 'Upgrades run versioned database migrations instead of force-syncing the schema on every start, so an update can no longer quietly drop data. Existing installations are adopted automatically on the next start.',
          de: 'Aktualisierungen führen versionierte Datenbank-Migrationen aus, statt das Schema bei jedem Start zu erzwingen — ein Update kann so keine Daten mehr stillschweigend verwerfen. Bestehende Installationen werden beim nächsten Start automatisch übernommen.',
        },
      },
    ],
  },
  {
    version: '1.1.31',
    date: '2026-07-06',
    title: { en: 'User profile', de: 'Benutzerprofil' },
    changes: [
      {
        type: 'added',
        text: {
          en: 'A full self-service profile, opened from the desktop menu bar or Start menu: upload a photo, change your display name, e-mail and language, change your password, and manage two-factor authentication. A Plan & usage tab shows your tariff, remaining time and what your plan allows.',
          de: 'Ein vollständiges Selbstbedienungs-Profil, aufrufbar über die Desktop-Menüleiste oder das Startmenü: Foto hochladen, Anzeigename, E-Mail und Sprache ändern, Passwort ändern und Zwei-Faktor-Authentifizierung verwalten. Ein Tab „Tarif & Nutzung" zeigt deinen Tarif, die Restzeit und was dein Plan erlaubt.',
        },
      },
      {
        type: 'changed',
        text: {
          en: 'The desktop top-bar user area is now larger and clickable, showing your name and photo.',
          de: 'Der Nutzerbereich in der Desktop-Leiste ist jetzt größer und anklickbar und zeigt deinen Namen und dein Foto.',
        },
      },
    ],
  },
  {
    version: '1.1.30',
    date: '2026-07-06',
    title: { en: '10-minute demo accounts', de: '10-Minuten-Demokonten' },
    changes: [
      {
        type: 'added',
        text: {
          en: 'A "Start 10-minute test" button on the login page mints an instant, isolated demo workspace. Each demo is one-shot — allowed only once per e-mail and once per device (best-effort browser fingerprint, backed by IP recording); a repeat attempt is rejected and logged. The demo user only sees the workspaces flagged for demo, is time-boxed by a 10-minute tariff, and is pruned automatically when it expires.',
          de: 'Ein Knopf „10-Minuten-Test starten" auf der Anmeldeseite erzeugt sofort einen isolierten Demo-Workspace. Jede Demo ist einmalig — nur einmal pro E-Mail und pro Gerät erlaubt (bestmöglicher Browser-Fingerabdruck, ergänzt durch IP-Aufzeichnung); ein wiederholter Versuch wird abgelehnt und protokolliert. Der Demo-Benutzer sieht nur die als Demo markierten Workspaces, ist durch einen 10-Minuten-Tarif zeitlich begrenzt und wird nach Ablauf automatisch entfernt.',
        },
      },
      {
        type: 'added',
        text: {
          en: 'Security events (like demo abuse attempts) are now written to both the audit trail and a structured log stream that the Fluent Bit forwarder ships to your SIEM.',
          de: 'Sicherheitsereignisse (z. B. Demo-Missbrauchsversuche) werden jetzt sowohl in das Audit-Protokoll als auch in einen strukturierten Log-Stream geschrieben, den der Fluent-Bit-Forwarder an Ihr SIEM weiterleitet.',
        },
      },
    ],
  },
  {
    version: '1.1.29',
    date: '2026-07-06',
    title: { en: 'Tariff management console', de: 'Tarif-Verwaltungskonsole' },
    changes: [
      {
        type: 'added',
        text: {
          en: 'A Settings → Tariffs admin page to create, edit and delete time plans, mark one as the organization default, and assign a plan to an individual user or a group. The default plan now backs an org-wide assignment so it actually applies to everyone without a more specific plan.',
          de: 'Eine Admin-Seite unter Einstellungen → Tarife zum Erstellen, Bearbeiten und Löschen von Zeit-Tarifen, zum Festlegen eines Organisations-Standards und zum Zuweisen eines Tarifs an einen einzelnen Benutzer oder eine Gruppe. Der Standard-Tarif hinterlegt jetzt eine organisationsweite Zuweisung, sodass er tatsächlich für alle ohne spezifischeren Tarif gilt.',
        },
      },
    ],
  },
  {
    version: '1.1.28',
    date: '2026-07-05',
    title: { en: 'Time-based tariffs', de: 'Zeitbasierte Tarife' },
    changes: [
      {
        type: 'added',
        text: {
          en: 'Time plans (per-minute, per-hour or monthly) that meter and limit usage — not billing. A tariff gives a user a time budget plus caps (max session length, max concurrent sessions); it can be set as the org default or assigned to a group or individual user. Launching is refused when the budget is exhausted, session duration is capped to what is left (weighted by a per-workspace cost factor), the reaper meters usage down while sessions run, and budgets renew each period. The taskbar/menu bar now shows your remaining time.',
          de: 'Zeit-Tarife (pro Minute, pro Stunde oder monatlich), die die Nutzung messen und begrenzen — keine Abrechnung. Ein Tarif gibt einem Benutzer ein Zeit-Budget plus Obergrenzen (max. Sitzungsdauer, max. gleichzeitige Sitzungen); er kann als Organisations-Standard gesetzt oder einer Gruppe bzw. einem einzelnen Benutzer zugewiesen werden. Ein Start wird verweigert, wenn das Budget aufgebraucht ist, die Sitzungsdauer wird auf die Restzeit begrenzt (gewichtet mit einem Workspace-Kostenfaktor), der Reaper zählt die Nutzung während laufender Sitzungen herunter, und Budgets erneuern sich pro Periode. Taskleiste/Menüleiste zeigen jetzt deine Restzeit.',
        },
      },
    ],
  },
  {
    version: '1.1.27',
    date: '2026-07-05',
    title: { en: 'Strict user isolation', de: 'Strikte Benutzer-Isolation' },
    changes: [
      {
        type: 'changed',
        text: {
          en: 'End users are now isolated by default: a normal user only sees the workspaces and server-backed services explicitly assigned to them (directly or via a group) — no longer the whole catalog. Admins can revert to the open model via the org setting "isolation.denyByDefault". The portal also fetches only your own sessions from a new server-enforced endpoint, instead of filtering a full list client-side.',
          de: 'Endbenutzer sind jetzt standardmäßig isoliert: Ein normaler Benutzer sieht nur die Workspaces und server-basierten Dienste, die ihm ausdrücklich (direkt oder über eine Gruppe) zugewiesen sind — nicht mehr den gesamten Katalog. Admins können über die Organisations-Einstellung „isolation.denyByDefault" zum offenen Modell zurückkehren. Das Portal lädt zudem nur noch die eigenen Sitzungen über einen serverseitig erzwungenen Endpunkt, statt eine vollständige Liste clientseitig zu filtern.',
        },
      },
    ],
  },
  {
    version: '1.1.26',
    date: '2026-07-04',
    title: { en: 'Arrange desktop icons freely', de: 'Desktop-Symbole frei anordnen' },
    changes: [
      {
        type: 'added',
        text: {
          en: 'On the Windows desktop you can now drag your pinned workspace icons anywhere on the desktop — they snap to a tidy grid, stay within view, and their positions are remembered per browser. Unmoved icons still flow into the top-start column automatically.',
          de: 'Auf dem Windows-Desktop kannst du deine angehefteten Workspace-Symbole jetzt überall auf dem Desktop platzieren — sie rasten an einem sauberen Raster ein, bleiben im sichtbaren Bereich und ihre Positionen werden pro Browser gespeichert. Nicht verschobene Symbole ordnen sich weiterhin automatisch in der Startspalte an.',
        },
      },
    ],
  },
  {
    version: '1.1.25',
    date: '2026-07-04',
    title: { en: 'Smooth theme & session animations', de: 'Sanfte Design- & Sitzungs-Animationen' },
    changes: [
      {
        type: 'added',
        text: {
          en: 'Switching light/dark theme now sweeps the new theme across the screen as a circle expanding from where you clicked (View Transitions). Opening or resuming a session plays a frosted overlay with the app icon springing up under a gold pulse while the viewer loads behind it. Both respect "reduce motion" and fall back to an instant switch where unsupported.',
          de: 'Der Wechsel zwischen hellem/dunklem Design breitet das neue Design jetzt als Kreis vom Klickpunkt über den Bildschirm aus (View Transitions). Beim Öffnen oder Fortsetzen einer Sitzung erscheint ein Milchglas-Overlay, bei dem das App-Symbol unter einem Gold-Puls aufspringt, während der Viewer dahinter lädt. Beides berücksichtigt „Bewegung reduzieren" und wechselt sonst sofort.',
        },
      },
    ],
  },
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
