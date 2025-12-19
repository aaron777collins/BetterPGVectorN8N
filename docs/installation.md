---
layout: default
title: Installation
nav_order: 2
---

# Installation

Multiple ways to install depending on your setup.

---

## One-Line Installer (Recommended)

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/aaron777collins/BetterPGVectorN8N/main/install.sh)
```

The installer auto-detects your n8n environment and offers the best option:

| Your Setup | What It Does |
|------------|--------------|
| Docker Compose | Creates persistent setup that survives rebuilds |
| Running Container | Installs directly into the container |
| npm/Local Install | Adds to ~/.n8n/nodes |
| Nothing Found | Creates fresh n8n + pgvector stack |

### Installer Options

```bash
# Download first
curl -fsSL https://raw.githubusercontent.com/aaron777collins/BetterPGVectorN8N/main/install.sh -o install.sh
chmod +x install.sh

# Pick your method:
./install.sh --standalone   # New n8n + pgvector Docker setup
./install.sh --docker       # Add to existing Docker Compose
./install.sh --direct       # Install into running container
./install.sh --npm          # Install to ~/.n8n/nodes
./install.sh --help         # Show all options
```

---

## Via n8n UI

1. Open n8n
2. Go to **Settings** → **Community Nodes**
3. Click **Install**
4. Enter: `n8n-nodes-pgvector-advanced`
5. Click **Install**

> Note: UI-installed nodes may not persist across Docker rebuilds. See [Docker Guide](docker.md) for persistent installation.

---

## Via npm

### Install to n8n's custom nodes directory

```bash
mkdir -p ~/.n8n/nodes
cd ~/.n8n/nodes
npm init -y
npm install n8n-nodes-pgvector-advanced
```

Then restart n8n.

### Install globally (if n8n is installed globally)

```bash
npm install -g n8n-nodes-pgvector-advanced
```

---

## From Source

```bash
git clone https://github.com/aaron777collins/BetterPGVectorN8N.git
cd BetterPGVectorN8N
npm install
npm run build
```

### Link for development

```bash
# In the package directory
npm link

# In your n8n directory or ~/.n8n/nodes
npm link n8n-nodes-pgvector-advanced
```

---

## Docker Installation

For Docker deployments, community nodes need special handling to persist across container rebuilds.

**Quick start with examples:**

```bash
git clone https://github.com/aaron777collins/BetterPGVectorN8N.git
cd BetterPGVectorN8N/examples/docker
docker compose up -d
```

For detailed Docker setup, see the [Docker Guide](docker.md).

---

## Prerequisites

### PostgreSQL with pgvector

You need PostgreSQL 12+ with the pgvector extension.

**Option 1: Docker (easiest)**

```bash
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=password ankane/pgvector
```

**Option 2: Install extension manually**

```sql
-- Connect to your database
CREATE EXTENSION IF NOT EXISTS vector;
```

See [pgvector installation guide](https://github.com/pgvector/pgvector#installation) for more options.

---

## Verify Installation

After installation, the **PGVector Advanced** node should appear in n8n's node panel.

1. Open n8n
2. Create a new workflow
3. Search for "PGVector Advanced"
4. The node should appear in results

If not found, check:
- n8n was restarted after installation
- No errors in n8n startup logs
- Package is in the correct location

---

## Next Steps

- [Quick Start Guide](quick-start.md) - Get up and running
- [Operations Reference](operations.md) - See all available operations
- [Docker Guide](docker.md) - Persistent Docker installation
