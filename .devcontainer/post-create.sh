#!/usr/bin/env bash
set -euo pipefail

PLATFORM="/workspaces/SoftwareEntwicklung/obsidian-platform"
PLUGIN_ROOT="/workspace/obsidian-universal-daily-note-plugin"

if [[ -d "$PLATFORM" ]]; then
  sudo ln -sfn "$PLATFORM" /workspace/obsidian-platform
  echo "[post-create] Linked /workspace/obsidian-platform → obsidian-platform"
  (cd "$PLATFORM" && npm install)
fi

cd "$PLUGIN_ROOT"
if [[ ! -d "$PLUGIN_ROOT/.git" ]]; then
  git init "$PLUGIN_ROOT"
  echo "[post-create] Initialized git repository in $PLUGIN_ROOT"
fi
if [[ ! -f .env ]] && [[ -f .devcontainer/.env.example ]]; then
  echo "[post-create] No .env — copy .devcontainer/.env.example to repo root .env if you need host-specific paths."
fi
npm install
npm run build
