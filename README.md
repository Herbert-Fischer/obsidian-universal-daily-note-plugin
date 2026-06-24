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

## Dev Container

Siehe **[`.devcontainer/README.md`](.devcontainer/README.md)**. Repo-Mount: **`/workspace/obsidian-universal-daily-note-plugin`**.
