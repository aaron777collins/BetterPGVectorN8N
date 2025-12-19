---
layout: default
title: Quick Start
nav_order: 3
---

# Quick Start

Get up and running in 5 minutes.

---

## 1. Set Up Credentials

In n8n, create Postgres credentials:

1. Go to **Credentials** → **Add Credential**
2. Search for **Postgres**
3. Fill in your connection details:

| Field | Value |
|-------|-------|
| Host | Your PostgreSQL host |
| Port | 5432 (default) |
| Database | Your database name |
| User | Database user |
| Password | Database password |
| SSL | Configure as needed |

---

## 2. Initialize Schema

Before storing embeddings, initialize the database schema.

Add a **PGVector Advanced** node:

| Setting | Value |
|---------|-------|
| Operation | Admin |
| Admin Operation | Ensure Schema |
| Dimensions | 1536 (or your embedding size) |

This creates the embeddings table and necessary indexes if they don't exist.

---

## 3. Store Your First Embedding

Add another **PGVector Advanced** node:

| Setting | Value |
|---------|-------|
| Operation | Upsert |
| Collection | my_documents |
| External ID | doc-001 |
| Content | "This is my first document" |
| Embedding | [0.1, 0.2, 0.3, ...] |
| Metadata | {"category": "test"} |

> **Tip**: Use an OpenAI Embeddings node or similar to generate the embedding vector from your text.

---

## 4. Query Similar Documents

Add a **PGVector Advanced** node to search:

| Setting | Value |
|---------|-------|
| Operation | Query |
| Collection | my_documents |
| Query Embedding | [0.1, 0.2, ...] |
| Top K | 10 |
| Distance Metric | cosine |

Results include:
- `id` - Internal UUID
- `externalId` - Your stable ID
- `content` - Document text
- `metadata` - JSON metadata
- `score` - Similarity score (lower = more similar)

---

## 5. Complete Example Workflow

Here's a typical semantic search workflow:

```
[HTTP Request] → [OpenAI Embeddings] → [PGVector Upsert]
                         ↓
              [Search Query Input]
                         ↓
              [OpenAI Embeddings] → [PGVector Query] → [Results]
```

### Workflow Steps:

1. **Ingest documents**
   - Fetch documents (HTTP, file, database)
   - Generate embeddings with OpenAI/Cohere
   - Upsert to PGVector with metadata

2. **Search**
   - Receive search query
   - Generate query embedding
   - Query PGVector for similar documents
   - Return results

---

## Common Patterns

### Upsert with External ID (Sync-Friendly)

```json
{
  "operation": "upsert",
  "collection": "documents",
  "externalId": "notion-page-abc123",
  "content": "Page content here",
  "metadata": {
    "source": "notion",
    "lastUpdated": "2024-01-15"
  },
  "embedding": [...]
}
```

Using `externalId` means:
- Re-running updates existing records (no duplicates)
- Easy to sync from external systems
- Stable references for your application

### Batch Upsert

For bulk operations, use batch mode with field mapping:

```json
{
  "operation": "upsert",
  "mode": "batch",
  "collection": "documents",
  "fieldMapping": {
    "externalIdField": "id",
    "contentField": "text",
    "metadataField": "meta",
    "embeddingField": "vector"
  }
}
```

Input items:
```json
[
  {"id": "doc-1", "text": "First doc", "meta": {}, "vector": [...]},
  {"id": "doc-2", "text": "Second doc", "meta": {}, "vector": [...]}
]
```

### Query with Metadata Filter

```json
{
  "operation": "query",
  "collection": "documents",
  "queryEmbedding": [...],
  "topK": 5,
  "metadataFilter": {
    "category": "technology",
    "status": "published"
  }
}
```

---

## Next Steps

- [Operations Reference](operations.md) - All operations in detail
- [API Reference](api-reference.md) - Database schema and TypeScript API
- [Troubleshooting](troubleshooting.md) - Common issues
