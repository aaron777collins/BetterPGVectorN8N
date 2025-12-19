---
layout: default
title: Docker Guide
nav_order: 5
---

# Docker Installation Guide

How to install community nodes in Docker with persistence across rebuilds.

---

## The Problem

When you install community nodes via the n8n UI or `npm install` inside a container, they're stored in `/home/node/.n8n/nodes`. This works until:

- You rebuild the container (`docker compose build`)
- You pull a new n8n image
- The volume gets recreated

Then your community nodes disappear.

---

## The Solution

Use a custom Dockerfile that auto-installs community nodes on every container startup.

---

## Quick Start

### Option 1: Use the Installer

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/aaron777collins/BetterPGVectorN8N/main/install.sh)
```

Select the Docker option when prompted.

### Option 2: Use the Example Setup

```bash
git clone https://github.com/aaron777collins/BetterPGVectorN8N.git
cd BetterPGVectorN8N/examples/docker
docker compose up -d
```

---

## Manual Setup

### 1. Create Directory Structure

```
your-project/
├── docker-compose.yml
└── n8n/
    ├── Dockerfile
    └── init-nodes.sh
```

### 2. Create the Dockerfile

```dockerfile
FROM docker.n8n.io/n8nio/n8n:latest

USER root

# Copy initialization script with proper permissions
COPY init-nodes.sh /init-nodes.sh
RUN chmod 755 /init-nodes.sh && chown node:node /init-nodes.sh

USER node

# Override entrypoint to run init script first
ENTRYPOINT ["/bin/sh", "-c", "/init-nodes.sh && exec n8n \"$@\"", "--"]
```

### 3. Create the Init Script

```bash
#!/bin/sh
set -e

# =============================================================================
# n8n Community Nodes Auto-Installer
# Add packages to PACKAGES variable (space-separated) to auto-install on startup
# =============================================================================

PACKAGES="n8n-nodes-pgvector-advanced"
NODES_DIR="/home/node/.n8n/nodes"

mkdir -p "$NODES_DIR"
cd "$NODES_DIR"

# Initialize npm if package.json doesn't exist
if [ ! -f "package.json" ]; then
    npm init -y > /dev/null 2>&1
fi

# Install each package if not present
for pkg in $PACKAGES; do
    if [ ! -d "node_modules/$pkg" ]; then
        echo "[init-nodes] Installing: $pkg"
        npm install "$pkg" --save --loglevel=warn
        echo "[init-nodes] Installed: $pkg"
    else
        echo "[init-nodes] Already installed: $pkg"
    fi
done
```

Make it executable:
```bash
chmod +x n8n/init-nodes.sh
```

### 4. Update docker-compose.yml

Change from using an image to using a build:

**Before:**
```yaml
services:
  n8n:
    image: docker.n8n.io/n8nio/n8n:latest
    # ...
```

**After:**
```yaml
services:
  n8n:
    build: ./n8n
    # ...
```

### 5. Build and Run

```bash
docker compose build n8n
docker compose up -d
```

---

## Complete docker-compose.yml Example

```yaml
services:
  postgres:
    image: ankane/pgvector:latest
    restart: always
    environment:
      POSTGRES_DB: n8n
      POSTGRES_USER: n8n
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-changeme}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U n8n -d n8n"]
      interval: 5s
      timeout: 5s
      retries: 5

  n8n:
    build: ./n8n
    restart: always
    ports:
      - "${N8N_PORT:-5678}:5678"
    environment:
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: postgres
      DB_POSTGRESDB_PORT: 5432
      DB_POSTGRESDB_DATABASE: n8n
      DB_POSTGRESDB_USER: n8n
      DB_POSTGRESDB_PASSWORD: ${POSTGRES_PASSWORD:-changeme}
      DB_POSTGRESDB_SCHEMA: public
      GENERIC_TIMEZONE: ${TZ:-UTC}
      N8N_HOST: ${N8N_HOST:-localhost}
      N8N_PORT: 5678
      N8N_PROTOCOL: ${N8N_PROTOCOL:-http}
      WEBHOOK_URL: ${WEBHOOK_URL:-http://localhost:5678/}
    volumes:
      - n8n_data:/home/node/.n8n
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  n8n_data:
  pgdata:
```

---

## Adding More Community Nodes

Edit `n8n/init-nodes.sh` and add packages to the `PACKAGES` variable:

```bash
PACKAGES="n8n-nodes-pgvector-advanced n8n-nodes-another-package n8n-nodes-third"
```

Then rebuild:

```bash
docker compose build n8n
docker compose up -d
```

---

## How It Works

1. **On container start**, the custom entrypoint runs `init-nodes.sh` before starting n8n
2. **The script checks** if each package is already installed (in the persistent volume)
3. **If missing**, it installs the package via npm
4. **If present**, it skips installation (fast startup)
5. **Then n8n starts** normally with the community nodes available

This means:
- First startup: packages are installed (takes a minute)
- Subsequent startups: packages are already there (instant)
- After rebuild: packages are reinstalled automatically

---

## Troubleshooting

### Packages not installing

Check the logs:
```bash
docker compose logs n8n | grep init-nodes
```

You should see:
```
[init-nodes] Installing: n8n-nodes-pgvector-advanced
[init-nodes] Installed: n8n-nodes-pgvector-advanced
```

or:
```
[init-nodes] Already installed: n8n-nodes-pgvector-advanced
```

### Permission errors

Make sure the init script has proper permissions:
```bash
chmod +x n8n/init-nodes.sh
docker compose build n8n --no-cache
```

### Node not appearing in n8n

1. Check that n8n fully started: `docker compose logs n8n --tail 20`
2. Look for any npm errors in the logs
3. Try restarting: `docker compose restart n8n`

---

## Next Steps

- [Operations Reference](operations.md) - All operations in detail
- [Troubleshooting](troubleshooting.md) - More common issues
