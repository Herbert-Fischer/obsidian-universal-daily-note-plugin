# Dev Container: Obsidian Plugin Dev

Image name in Docker: **`obsidian-plugin-dev:1`** (OCI label `Obsidian_Plugin_Dev`).

## Vault (Denkarium Development)

By default the host path

`/home/hfx/KnowledgeHub/Denkarium_Development`

is bind-mounted to **`/vault`** inside the container. Obsidian on your machine should use that folder as the vault root.

Override on the host before opening the dev container, e.g.:

```bash
export OBSIDIAN_VAULT_HOST_PATH="$HOME/Obsidian/MyOtherVault"
```

Or create `.devcontainer/.env` (see `.env.example`) — `docker-compose` loads it when present.

## One repo per plugin

This repository is mounted at **`/workspace/plugin`**. Each Obsidian plugin stays its own git clone; only this repo is the Dev Container **workspace folder**.

## Same Docker stack for every plugin repo

Copy the entire **`.devcontainer/`** directory **unchanged** into each Obsidian plugin repository (same `docker-compose.yml`, `Dockerfile`, `devcontainer.json`, and preferably the same **`.devcontainer/.env`** values for vault and `PLUGIN_DEV_HOST_ROOT`).

All clones then share:

- **Compose project** `obsidian-plugin-dev` (top-level `name:` in `docker-compose.yml`, and **`COMPOSE_PROJECT_NAME`** in `.env.example` / your `.env`).
- **Container name** `obsidian_plugin_dev`.
- **Image** `obsidian-plugin-dev:1` (built from the same `Dockerfile`; Docker layer cache is shared after the first build).

When you **Reopen in Container** from another plugin folder, Compose recreates the `dev` service so **`..` is that repo** mounted at **`/workspace/plugin`**. Vault and **`/workspaces/SoftwareEntwicklung`** stay the same as long as your `.env` (or defaults) match.

**One running dev container at a time** is normal: `/workspace/plugin` cannot bind two different clones at once. To edit another plugin **without** switching the opened repo, use **`/workspaces/SoftwareEntwicklung/<plugin-folder>/`** (and add that path to the workspace for the AI if needed).

## Sibling plugin repos (shared mount)

By default the host directory

**`/home/hfx/SoftwareEntwicklung`**

is bind-mounted to **`/workspaces/SoftwareEntwicklung`** in the container (note **`workspaces`** with an **`s`** — not **`/workspace/...`**). The image also provides a symlink **`/workspace/SoftwareEntwicklung`** → that path so it sits next to **`/workspace/plugin`**. Rebuild the dev container image after this Dockerfile change; until then, use **`cd /workspaces/SoftwareEntwicklung`** directly.

Every plugin repo under that path (for example `obsidian-universal-tasks-plugin/`) appears next to each other inside the container, without merging git histories.

Override the host path in **`.devcontainer/.env`** (see `.env.example`):

```bash
PLUGIN_DEV_HOST_ROOT=/your/other/parent
```

Inside the container, **`PLUGIN_DEV_HOST_ROOT_MOUNT`** is set to **`/workspaces/SoftwareEntwicklung`** (the mount point, not the host path).

### Cursor / KI

The AI sees what is in the **workspace**. To browse or reuse code from other clones under `SoftwareEntwicklung`, add that path as a folder to the workspace: **File → Add Folder to Workspace…** and choose **`/workspaces/SoftwareEntwicklung`** (after the container is running). Save as a **`.code-workspace`** file if you want to reopen the same multi-root layout.

## Extra mounts (optional)

For additional host paths, create **`docker-compose.override.yml`** next to **`docker-compose.yml`** and list more volumes, then add **`docker-compose.override.yml`** to the `dockerComposeFile` array in **`devcontainer.json`** immediately after `docker-compose.yml`.

## Build → vault export

Shared tooling lives in **`../obsidian-platform`** (`@denkarium/export-to-vault`, `@denkarium/esbuild-vault-export`). In the Dev Container, `/workspace/obsidian-platform` is symlinked to `/workspaces/SoftwareEntwicklung/obsidian-platform` (see `post-create.sh`).

- `npm run build` runs TypeScript, writes `main.js`, then runs `export-to-vault` (skipped with a log line if the vault directory is missing).
- `npm run export:vault` runs only the copy step (expects a fresh `main.js` from `npm run build`).
- Files copied into `$OBSIDIAN_VAULT_PATH/.obsidian/plugins/finanzen/`: `main.js`, `manifest.json`, and `styles.css` when it exists in the repo root (same set as manual testing in AGENTS.md). `versions.json` is for GitHub releases only and is not copied into the vault plugin folder.
- `npm run dev` runs the same export after each successful esbuild rebuild unless `OBSIDIAN_VAULT_EXPORT=0`.

Environment inside the container: `OBSIDIAN_VAULT_PATH=/vault` and `OBSIDIAN_VAULT_EXPORT=1` (compose / `devcontainer.json`). You can also set `VAULT_PATH` instead of `OBSIDIAN_VAULT_PATH`.
