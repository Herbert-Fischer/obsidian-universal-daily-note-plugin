# Obsidian_Plugin_Dev — shared image for Obsidian plugin development (Node 20, Debian Bookworm).
# Image name (compose): obsidian-plugin-dev:1
# See: https://github.com/devcontainers/images/tree/main/src/javascript-node
FROM mcr.microsoft.com/devcontainers/javascript-node:1-20-bookworm

LABEL org.opencontainers.image.title="Obsidian_Plugin_Dev" \
      org.opencontainers.image.description="Dev container for Obsidian community plugins (TypeScript, esbuild, vault export)"

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    rsync \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Default working directory when opening a terminal (repo is bind-mounted here).
WORKDIR /workspace/universal-daily-note-plugin

# Convenience: same sibling mount as compose (`/workspaces/SoftwareEntwicklung`) under `/workspace/…`.
RUN mkdir -p /workspace /workspaces && \
    ln -sfn /workspaces/SoftwareEntwicklung /workspace/SoftwareEntwicklung
