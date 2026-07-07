# Obsidian community plugin — Universal Daily Note

## Project overview

- **Plugin id:** `universal-daily-note` (never change after release).
- **Entry:** `src/main.ts` → bundled `main.js`.
- **Domain:** Daily notes — open/create via Core plugin or configurable fallback path.
- **Family:** Denkarium „Universal“ plugins (`universal-calendar`, `universal-tasks`, …).

## Platform monorepo

Shared code lives in sibling **`obsidian-platform`** (`../obsidian-platform` or `/workspaces/SoftwareEntwicklung/obsidian-platform` in the dev container).

| Package | Use in this plugin |
|---------|-------------------|
| `@denkarium/obsidian-lib-ui` | CSS merge pipeline |
| `@denkarium/obsidian-lib-vault` | Vault / Metadata Menu conventions |
| `@denkarium/export-to-vault` | Deploy to vault |
| `@denkarium/esbuild-vault-export` | Watch → vault |

Details: `../obsidian-platform/README.md`.

## Tooling

```bash
npm install          # after platform symlink / sibling checkout
npm run dev          # watch + optional vault export (esbuild plugin)
npm run build        # CSS merge + production bundle + vault deploy
npm run test         # path helpers
npm run export:vault # copy artifacts to vault (see README)
npm run export:plugin # build + export/ staging + vault
```

Do **not** commit `main.js`, `node_modules/`, `export/`, or `data.json`.

## Source conventions

- `src/main.ts` — lifecycle and commands only.
- `src/settings.ts` — defaults and types (single source of truth).
- `src/notes/` — daily note open/create logic (adapted from Universal Calendar).
- Keep modules focused; move reusable logic to platform libs when shared across plugins.

## Tests

```bash
npm test   # src/**/*.test.ts — fallback path helpers
```

## Releases

1. Bump `manifest.json` + `versions.json` (or `npm version`).
2. Git tag = version (no `v` prefix).
3. Attach `manifest.json`, `main.js`, `styles.css`, `versions.json` to GitHub release.

## References

- [Obsidian plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
- [Obsidian API](https://docs.obsidian.md)
- User-facing docs: `README.md`
- Vault docs (Garmin/CalDAV/Thunderbird, geplant): `Atlas/Technologien/Obsidian Plugins/Universal Daily Note/Plugin — Detail Garmin Sync CalDAV und Thunderbird.md`
