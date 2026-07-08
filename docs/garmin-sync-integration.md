# Garmin sync integration

The **Universal Daily Note** plugin imports Garmin activities from vault files written by the separate Python tool **[universal-garmin-sync](https://github.com/denkarium/universal-garmin-sync)**.

## Split of responsibilities

| Component | Repo | Runs on |
|-----------|------|---------|
| Cron: Garmin → GPX + `pending.json` + CalDAV | `universal-garmin-sync` | Linux host (not dev container) |
| Import into daily notes | `universal-daily-note-plugin` | Obsidian desktop |

## Vault contract

- Manifest: `Calendar/.garmin/pending.json` (default, configurable in plugin `garminSync.pendingManifestPath`)
- GPX: `Calendar/Anhänge/GPX/` (default)
- JSON schema: [pending-manifest.schema.json](https://github.com/denkarium/universal-garmin-sync/blob/main/docs/pending-manifest.schema.json) in `universal-garmin-sync`

## Plugin modules

- `src/integrations/garminPendingImport.ts` — reads manifest, calls importer
- `src/integrations/garminSync.ts` — writes `## Tagebuch` + Wandern/Spaziergang sections
- `src/integrations/garminCalendarFilter.ts` — excludes CalDAV UIDs `garmin-*@denkarium` from calendar sync

## Host setup

```bash
cd ~/SoftwareEntwicklung/universal-garmin-sync
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
# OBSIDIAN_VAULT_PATH = host path to vault
universal-garmin-sync
```

Vault documentation: *Plugin — Detail Garmin Sync CalDAV und Thunderbird*.
