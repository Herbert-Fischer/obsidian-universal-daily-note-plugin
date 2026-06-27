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
| `tracks/gpxImport.ts` | GPX/TCX-Import für Reise-Etappen und Wander-Tracks |

## Composer-Vorlagen

Im **Tages-Composer** (Vorlage-Menü) hängen die Angebote vom aktiven Abschnitt ab:

| Abschnitt | Bulk-Vorlage | Einzel-Vorlagen |
|-----------|--------------|-----------------|
| **Tagebuch** | Typischer Tag (Wetter, Aufstehen, Mittagessen, Spaziergang, Kalender) | Aufstehen, Mahlzeiten, Termin, … |
| **Reisen** | Typischer Reisetag (Standort, Etappen, Highlights, optional Foto + GPX) | Abfahrt, Etappe, Highlight, Ankunft, … |
| **Wandern** | Typische Wanderung (Standort, Start, Kurz-/Beschreibung, optional Foto + GPX) | Start, Kurzbeschreibung, Beschreibung, Gipfel, Track, Foto, … |
| **Sonstige** | — | Termin, Besuch, Notiz |

Bestehende Einträge: Bulk-Vorlagen ergänzen nur **fehlende** Prefixe (Bestätigungsdialog).

## Kalender-Termine (Universal Calendar)

- Termine landen **immer** in `## Tagebuch` — unabhängig vom aktiven Composer-Abschnitt (Reisen, …).
- Übernommen werden nur **CalDAV-Einträge mit konkreter Uhrzeit** (keine Ganztages-Termine).
- **Vault-Notizen** aus Universal Calendar (Dateien nach Erstellungsdatum) sind standardmäßig ausgeschlossen; optional in den Einstellungen aktivierbar.
- Bereinigung: Kommando **„Kalender-Termine aus Reisen bereinigen“** entfernt falsch platzierte Sync-Zeilen aus `## Reisen` und übernimmt fehlende ins Tagebuch (Zeitraum = Outline-Tage).

## GPS-Tracks (Garmin / Google Timeline)

Live-Abruf von Garmin Connect oder Google Maps ist im Plugin nicht möglich. Stattdessen GPX/TCX-Dateien im Vault ablegen:

| Quelle | Workflow | Ablage (Beispiel) |
|--------|----------|-------------------|
| **Garmin** | Aktivität als GPX exportieren (Connect, `garmin-connect-export`, …) | `Calendar/Tracks/Garmin/2026-06-24-Wanderung.gpx` |
| **Google Timeline** | Android: Einstellungen → Standort → Timeline → Export JSON → Konverter zu Tages-GPX ([Timeline-GPX-Exporter](https://github.com/pe1hvh/Timeline-GPX-Exporter), [Dawarich](https://dawarich.app/tools/google-timeline-converter/)) | `Calendar/Tracks/Google/2026-06-24.gpx` |

Der Dateiname muss das Datum `YYYY-MM-DD` enthalten. Bei **Typischer Reisetag** wird der Track in die Etappe-Zeile übernommen; bei **Typische Wanderung** in die Track-Zeile (Distanz, Dauer, Wiki-Link). Kartenansicht: Community-Plugin [Map View](https://github.com/esm7/obsidian-map-view).

Einstellungen: **Track-Ordner** unter Plugin-Einstellungen.


Siehe **[`.devcontainer/README.md`](.devcontainer/README.md)**. Repo-Mount: **`/workspace/universal-daily-note-plugin`**.
