#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

npm run build --silent

VERSION="$(node -p "require('./manifest.json').version")"
PLUGIN_ID="$(node -p "require('./manifest.json').id")"
OUT="${ROOT}/export/${PLUGIN_ID}"
ZIP="${ROOT}/export/${PLUGIN_ID}-${VERSION}.zip"
VAULT="${OBSIDIAN_VAULT_PATH:-${VAULT_PATH:-/vault}}"
VAULT_DEST="${VAULT}/.obsidian/plugins/${PLUGIN_ID}"

mkdir -p "${OUT}"
cp -f main.js manifest.json styles.css versions.json "${OUT}/"

rm -f "${ZIP}"
(cd "${ROOT}/export" && zip -qr "$(basename "${ZIP}")" "${PLUGIN_ID}")

echo "Ordner: ${OUT}"
echo "ZIP:    ${ZIP}"

export PLUGIN_ROOT="${ROOT}"
export OBSIDIAN_PLUGIN_ID_EXPECT="${PLUGIN_ID}"
if [[ -x "${ROOT}/node_modules/.bin/export-to-vault" ]]; then
  "${ROOT}/node_modules/.bin/export-to-vault"
else
  node "${ROOT}/../obsidian-platform/packages/export-to-vault/export-to-vault.mjs"
fi

echo "Vault:  ${VAULT_DEST}"
