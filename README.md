# Universal Daily Note (Obsidian-Plugin)

Daily-Note-Verwaltung für Obsidian: **Öffnen und Erstellen** von Tagesnotizen über das Core-Plugin „Daily notes“ oder einen konfigurierbaren Fallback-Pfad. Basiert auf den Denkarium-Konventionen und der Daily-Note-Logik aus Universal Calendar.

## Architektur & Wiederaufbau (kanonische Vault-Doku)

- **Hub:** [[Atlas/Technologien/Obsidian Plugins/Universal Daily Note|Universal Daily Note]]
- **Architektur & Rebuild:** [[Atlas/Technologien/Obsidian Plugins/Universal Daily Note/Plugin — Architektur und Rebuild|Plugin — Architektur und Rebuild]]

Kurzfassung im Repo: dieses **README** und die Tabelle **Quellcode** unten.

## Anforderungen

- Obsidian **1.6.0** oder neuer (`minAppVersion` in `manifest.json`)

## NPM-Skripte

| Skript | Wirkung |
|--------|---------|
| `npm run dev` | CSS-Merge + esbuild Watch → `main.js` (optional Vault-Export) |
| `npm run build` | Einmaliger Build + Vault-Deploy |
| `npm run test` | Vitest (Pfad-Helfer) |
| `npm run export:plugin` | Build + `export/` + ZIP + Vault unter `$OBSIDIAN_VAULT_PATH` (Default `/vault`) |
| `npm run export:vault` | Nur Vault-Deploy (nach Build) |

## Entwicklung

```bash
npm install
npm run dev
```

Im Dev Container: Platform-Symlink `../obsidian-platform` (siehe `.devcontainer/README.md`).

## Abhängigkeiten (Platform)

| Paket | Rolle |
|-------|--------|
| `@denkarium/obsidian-lib-ui` | Gemeinsame UI-CSS (Merge → `styles.css`) |
| `@denkarium/obsidian-lib-vault` | Vault-/Metadata-Konventionen |
| `@denkarium/export-to-vault` | Vault-Deploy (`export:plugin`) |
| `@denkarium/esbuild-vault-export` | Watch → Vault während `npm run dev` |

Plugin-spezifisch: `obsidian-daily-notes-interface`.

## Quellcode (`src/`)

| Pfad | Aufgabe |
|------|---------|
| `main.ts` | Plugin-Lifecycle, Commands |
| `settings.ts` / `settingsTab.ts` | Einstellungen + UI |
| `notes/dailyNote.ts` | Öffnen/Erstellen (Core oder Fallback) |
| `notes/dailyNotesCore.ts` | `obsidian-daily-notes-interface` Adapter |
| `notes/dailyNoteFallbackPaths.ts` | Fallback-Pfad und Dateinamen |
| `notes/composerTemplates.ts` | Kontext-Vorlagen (Typischer Tag / Reisetag / Wanderung) |
| `notes/*Composer.ts` | Profil-Sync (Reisen, Wandern, Heizung, Lüftung, Gedanken, Sonstiges) |
| `tracks/gpxImport.ts` | GPX/TCX-Import für Reise-Etappen und Wander-/Spaziergang-Tracks |
| `integrations/garminCalendarFilter.ts` | Garmin-CalDAV-Termine vom Kalender-Sync ausschließen |
| `integrations/garminSync.ts` | Garmin-Import + Entfernen doppelter `Termin:`-Zeilen |
| `integrations/garminPendingImport.ts` | Import aus `Calendar/.garmin/pending.json` |

## Composer-Vorlagen

Im **Tages-Composer** (Vorlage-Menü) hängen die Angebote vom aktiven Abschnitt ab. **Profil-Integration:** Reisen, Heizung, Lüftung, Gedanken und Wandern als expandierbare Felder am Tagebuch-Eintrag; **Sonstiges** als eigener Composer-Abschnitt (Heading „Sonstiges“).

### Wandern mit optionaler Reise-Zuordnung (ab 1.2.6)

Ein Tagebuch-Eintrag mit Profil **Wandern** hat zwei unabhängige Gruppenfelder:

| Feld | Bedeutung | Ziel-Abschnitt |
|------|-----------|----------------|
| **Wanderung** (`context` in `udn-entry`) | Name der Tour (Callout-Titel) | `## Wandern` (Mountain-Callout, GPX, Fotos) |
| **Reise (optional)** (`reise` in `udn-entry`) | Zuordnung zu einer Reise | zusätzlich `## Reisen` (Compass-Callout) |

Die **Beschreibung** der Wanderung erscheint in `## Wandern` und — bei gesetzter Reise — auch als Erläuterung unter `## Reisen` (für das [[Reise-Tagebuch]]-Dataview).

Beispiel Meta am Bullet:

```markdown
- 09:45 Wandern: Bläsis Mühle <!-- udn-entry:{"id":"knvh","profile":"wandern","context":"Wandern: Bläsis Mühle","reise":"Mamas 90ter Geburtstag","callout":"knvh"} -->
```

| Abschnitt | Bulk-Vorlage | Einzel-Vorlagen |
|-----------|--------------|-----------------|
| **Tagebuch** | Typischer Tag (Wetter, Aufstehen, Mittagessen, Spaziergang, Kalender) | Aufstehen, Mahlzeiten, Termin, … |
| **Reisen** | Typischer Reisetag (Standort, Etappen, Highlights, optional Foto + GPX) | Abfahrt, Etappe, Highlight, Ankunft, … |
| **Wandern** | Typische Wanderung (Standort, Start, Beschreibung, optional Foto + GPX) | Start, Beschreibung, Gipfel, Track, Foto, … |
| **Sonstiges** | — | Notiz, Geschenk, Besuch, Erledigt, … |
| **Heizung / Lüftung / Gedanken** | — | profilspezifische Chips (Störung, Wartung, Einfall, …) |

Bestehende Einträge: Bulk-Vorlagen ergänzen nur **fehlende** Prefixe (Bestätigungsdialog).

## Kalender-Termine (Universal Calendar)

- Termine landen **immer** in `## Tagebuch` — unabhängig vom aktiven Composer-Abschnitt (Reisen, …).
- Übernommen werden nur **CalDAV-Einträge mit konkreter Uhrzeit** (keine Ganztages-Termine).
- **Vault-Notizen** aus Universal Calendar (Dateien nach Erstellungsdatum) sind standardmäßig ausgeschlossen; optional in den Einstellungen aktivierbar.
- Bereinigung: Kommando **„Kalender-Termine aus Reisen bereinigen“** entfernt falsch platzierte Sync-Zeilen aus `## Reisen` und übernimmt fehlende ins Tagebuch (Zeitraum = Outline-Tage).

## GPS-Tracks (Garmin / Google Timeline)

### Heute (manuell)

Live-Abruf von Garmin Connect oder Google Maps ist **im Plugin nicht möglich**. GPX/TCX-Dateien im Vault ablegen und im Tages-Composer verknüpfen („Track wählen“):

| Quelle | Workflow | Ablage (Beispiel) |
|--------|----------|-------------------|
| **Garmin** | Aktivität als GPX exportieren (Connect, `garmin-connect-export`, …) | `Calendar/Anhänge/GPX/2026-06-24-Wanderung.gpx` |
| **Google Timeline** | Android: Einstellungen → Standort → Timeline → Export JSON → Konverter zu Tages-GPX ([Timeline-GPX-Exporter](https://github.com/pe1hvh/Timeline-GPX-Exporter), [Dawarich](https://dawarich.app/tools/google-timeline-converter/)) | `Calendar/Tracks/Google/2026-06-24.gpx` |

Der Dateiname muss das Datum `YYYY-MM-DD` enthalten. Bei **Typischer Reisetag** wird der Track in die Etappe-Zeile übernommen; bei **Typische Wanderung** / **Typischer Spaziergang** in die Track-Zeile (Distanz, Dauer, Wiki-Link). Kartenansicht im Plugin: `udn-track-3d`; optional Community-Plugin [Map View](https://github.com/esm7/obsidian-map-view).

Einstellungen: **Track-Ordner** (`tracks.folder`, Default `Calendar/Tracks`) und **Wandern/Spaziergang GPX-Ordner** (`wandernLayout.tracksFolder`, Default `Calendar/Anhänge/GPX`).

Vault-Doku: [[Atlas/Technologien/Obsidian Plugins/Universal Daily Note/Plugin — Detail Garmin Sync CalDAV und Thunderbird|Garmin Sync — CalDAV & Thunderbird]].

### Garmin vollautomatisch + Thunderbird-Kalender

Drei-Stufen-Architektur:

1. **Lokaler Cron** ([**universal-garmin-sync**](https://github.com/denkarium/universal-garmin-sync)) — Host-Repo `~/SoftwareEntwicklung/universal-garmin-sync`; holt Garmin-Aktivitäten (Wandern/Spaziergang), GPX ins Vault, `Calendar/.garmin/pending.json`, optional CalDAV auf All-INKL „Aktivitäten“. Siehe [`docs/garmin-sync-integration.md`](docs/garmin-sync-integration.md).
2. **All-INKL CalDAV** — zeitgebundene VEVENTs (`UID: garmin-{id}@denkarium`) für **Thunderbird** (CalDAV-Abo).
3. **Plugin-Importer** ([`src/integrations/garminSync.ts`](src/integrations/garminSync.ts) + [`garminPendingImport.ts`](src/integrations/garminPendingImport.ts)) — liest `pending.json`, schreibt `## Tagebuch` + `## Wandern` / `## Spaziergang` inkl. Track (Marker `<!-- udn-garmin:{id} -->`).

Der bestehende **Kalender-Sync** (Hauptkalender → `Termin:`-Zeilen) **importiert keine Garmin-Aktivitäten** (`garmin-*@denkarium` UID oder Kategorien Wandern/Spaziergang werden in [`calendarAppointments.ts`](src/integrations/calendarAppointments.ts) ausgeschlossen). Daily Notes für Wanderungen/Spaziergänge kommen über `garminSync.ts` + `pending.json` — der entfernt vor dem Import passende `Termin:`-Duplikate.

**Wichtig:** Den All-INKL-Kalender **„Aktivitäten“** nur in **Thunderbird** abonnieren — **nicht** in Universal Calendar eintragen (sonst erscheinen Termine in der Monatsansicht, werden aber nicht mehr als `Termin:` importiert).

| System | Rolle |
|--------|--------|
| Garmin Uhr | Quelle (GPS, Zeit, Distanz) |
| Cron-Script | **universal-garmin-sync** (eigenes Repo, Host-only) |
| All-INKL „Aktivitäten“ | Thunderbird-Kalenderansicht |
| Obsidian Vault | Tagebuch, GPX, 3D-Track, Composer-Nachbearbeitung |

## API für Integrationen (ab 1.2.6)

Andere Plugins und Dataview-Views können den Composer mit Eintrags-Fokus öffnen:

```javascript
const plug = app.plugins.plugins["universal-daily-note"];
plug.openComposerForDate(new Date(2026, 5, 14), {
  focusEntryId: "knvh",       // stabile udn-entry-id (optional)
  focusEntryLine: 42,         // Vault-Zeilennummer (optional)
  onSaved: (date) => { /* … */ },
});
```

`focusEntryId` hat Vorrang vor `focusEntryLine`. Wird u. a. vom **Reise-Tagebuch**-Dataview genutzt (Klick auf Zeit oder Titel eines Eintrags).


Siehe **[`.devcontainer/README.md`](.devcontainer/README.md)**. Repo-Mount: **`/workspace/universal-daily-note-plugin`**.
