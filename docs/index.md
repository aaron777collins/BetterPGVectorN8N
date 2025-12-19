---
layout: default
title: Home
nav_order: 1
---

# n8n-nodes-pgvector-advanced

Advanced PGVector nodes for n8n with full CRUD control. No more limitations of the built-in node.

## Install in 30 Seconds

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/aaron777collins/BetterPGVectorN8N/main/install.sh)
```

The installer auto-detects your setup and does the right thing.

[Full Installation Guide](installation.md){: .btn .btn-primary }
[Quick Start](quick-start.md){: .btn }

---

## Why Use This?

| Built-in PGVector Node | This Package |
|------------------------|--------------|
| Insert only | Full CRUD (Upsert, Query, Delete, Get) |
| No stable IDs | External IDs for reliable syncing |
| Basic queries | Filters, pagination, multiple distance metrics |
| Single inserts | Batch operations (1000+ embeddings) |
| Manual schema | Auto table/index creation |

---

## Features

- **Full CRUD Operations** - Upsert, Query, Delete, and Get embeddings with complete control
- **Stable IDs** - Support both internal UUIDs and external IDs for reliable upstream integration
- **Advanced Querying** - Vector similarity search with metadata filters, pagination, and multiple distance metrics
- **Batch Operations** - Efficient batch inserts and updates (1000+ embeddings)
- **Schema Management** - Automatic table creation, indexing (HNSW/IVFFlat), and schema validation
- **Production-Ready** - Connection pooling, error handling, retries, and comprehensive testing
- **Type-Safe** - Full TypeScript implementation with strict typing

---

## Quick Links

| Guide | Description |
|-------|-------------|
| [Installation](installation.md) | All installation methods (Docker, npm, UI) |
| [Quick Start](quick-start.md) | Get up and running in 5 minutes |
| [Operations](operations.md) | Complete reference for all operations |
| [Docker Guide](docker.md) | Persistent Docker installation |
| [API Reference](api-reference.md) | TypeScript API and database schema |
| [Troubleshooting](troubleshooting.md) | Common issues and solutions |

---

## Example Workflow

```
1. Parse documents
2. Generate embeddings (OpenAI, Cohere, etc.)
3. Upsert to PGVector with metadata
4. Query similar documents
5. Use results in your workflow
```

---

## License

MIT

---

**Made with ❤️ for the n8n community**

[View on GitHub](https://github.com/aaron777collins/BetterPGVectorN8N){: .btn }
[View on npm](https://www.npmjs.com/package/n8n-nodes-pgvector-advanced){: .btn }
