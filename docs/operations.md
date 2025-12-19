---
layout: default
title: Operations
nav_order: 4
---

# Operations Reference

Complete reference for all PGVector Advanced operations.

---

## Upsert

Insert new embeddings or update existing ones.

### Single Upsert

```json
{
  "operation": "upsert",
  "mode": "single",
  "collection": "documents",
  "externalId": "doc-123",
  "content": "This is a sample document about AI",
  "metadata": {
    "category": "technology",
    "author": "John Doe",
    "published": "2024-01-01"
  },
  "embedding": [0.1, 0.2, 0.3, ...]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| collection | Yes | Group name for your embeddings |
| embedding | Yes | Vector array (must match schema dimensions) |
| externalId | No | Your stable ID for syncing |
| content | No | Original text content |
| metadata | No | JSON object with custom fields |
| id | No | Internal UUID (auto-generated if not provided) |

### Batch Upsert

Map input items to embeddings:

```json
{
  "operation": "upsert",
  "mode": "batch",
  "collection": "documents",
  "fieldMapping": {
    "idField": "id",
    "externalIdField": "docId",
    "contentField": "text",
    "metadataField": "meta",
    "embeddingField": "vector"
  }
}
```

Input items:
```json
[
  {
    "docId": "doc-1",
    "text": "First document",
    "meta": {"category": "tech"},
    "vector": [0.1, 0.2, ...]
  },
  {
    "docId": "doc-2",
    "text": "Second document",
    "meta": {"category": "science"},
    "vector": [0.3, 0.4, ...]
  }
]
```

---

## Query

Search for similar embeddings using vector similarity.

### Basic Query

```json
{
  "operation": "query",
  "collection": "documents",
  "queryEmbedding": [0.1, 0.2, 0.3, ...],
  "topK": 10,
  "distanceMetric": "cosine"
}
```

### With Metadata Filter

```json
{
  "operation": "query",
  "collection": "documents",
  "queryEmbedding": [0.1, 0.2, ...],
  "topK": 5,
  "metadataFilter": {
    "category": "technology",
    "published": "2024-01-01"
  }
}
```

### With Pagination

```json
{
  "operation": "query",
  "collection": "documents",
  "queryEmbedding": [0.1, 0.2, ...],
  "topK": 20,
  "offset": 40,
  "distanceMetric": "l2"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| collection | Yes | Collection to search |
| queryEmbedding | Yes | Vector to find similar matches |
| topK | No | Number of results (default: 10) |
| offset | No | Skip first N results (for pagination) |
| distanceMetric | No | cosine, l2, or inner_product |
| metadataFilter | No | JSON filter criteria |
| includeEmbedding | No | Return embedding vectors in results |

### Query Response

```json
{
  "id": "uuid-here",
  "externalId": "doc-123",
  "collection": "documents",
  "content": "Document text",
  "metadata": {"category": "tech"},
  "score": 0.23
}
```

> **Note**: Lower score = more similar (distance-based).

---

## Delete

Remove embeddings from the database.

### Delete by ID

```json
{
  "operation": "delete",
  "deleteBy": "id",
  "deleteIds": "uuid-1, uuid-2, uuid-3"
}
```

### Delete by External ID

```json
{
  "operation": "delete",
  "collection": "documents",
  "deleteBy": "externalId",
  "deleteExternalIds": "doc-1, doc-2, doc-3"
}
```

### Delete by Metadata Filter

```json
{
  "operation": "delete",
  "collection": "documents",
  "deleteBy": "metadata",
  "deleteMetadataFilter": {
    "status": "archived",
    "year": 2020
  }
}
```

| Delete By | Required Fields |
|-----------|-----------------|
| id | deleteIds |
| externalId | collection, deleteExternalIds |
| metadata | collection, deleteMetadataFilter |

---

## Get

Retrieve specific embeddings by ID.

### Get by ID

```json
{
  "operation": "get",
  "getBy": "id",
  "getIds": "uuid-1, uuid-2"
}
```

### Get by External ID

```json
{
  "operation": "get",
  "collection": "documents",
  "getBy": "externalId",
  "getExternalIds": "doc-1, doc-2"
}
```

---

## Admin Operations

Manage schema and indexes.

### Ensure Schema

Creates table and indexes if they don't exist:

```json
{
  "operation": "admin",
  "adminOperation": "ensureSchema",
  "dimensions": 1536
}
```

### Create Vector Index

```json
{
  "operation": "admin",
  "adminOperation": "createIndex",
  "adminCollection": "documents",
  "indexType": "hnsw",
  "adminDistanceMetric": "cosine"
}
```

| Index Type | Build Time | Query Speed | Best For |
|------------|------------|-------------|----------|
| **HNSW** | Slower | Faster | Production, high recall |
| **IVFFlat** | Faster | Good | Large datasets |

### Drop Collection

Deletes all records in a collection:

```json
{
  "operation": "admin",
  "adminOperation": "dropCollection",
  "adminCollection": "documents"
}
```

---

## Distance Metrics

| Metric | SQL Operator | Best For |
|--------|--------------|----------|
| **Cosine** | `<=>` | Normalized vectors, text embeddings (OpenAI, Cohere) |
| **L2 (Euclidean)** | `<->` | When absolute distance matters |
| **Inner Product** | `<#>` | Pre-normalized vectors, dot product similarity |

---

## Next Steps

- [API Reference](api-reference.md) - TypeScript API and database schema
- [Docker Guide](docker.md) - Persistent Docker installation
- [Troubleshooting](troubleshooting.md) - Common issues
