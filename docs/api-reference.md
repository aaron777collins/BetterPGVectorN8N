---
layout: default
title: API Reference
nav_order: 6
---

# API Reference

Database schema, TypeScript API, and technical details.

---

## Database Schema

The package uses a single, optimized table structure:

```sql
CREATE TABLE embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection TEXT NOT NULL,
  external_id TEXT,
  content TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  embedding VECTOR(dimensions) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(collection, external_id)
);
```

### Indexes

```sql
-- Metadata filtering
CREATE INDEX idx_embeddings_metadata ON embeddings USING GIN (metadata);

-- Collection lookup
CREATE INDEX idx_embeddings_collection ON embeddings (collection);

-- Vector similarity (per-collection HNSW)
CREATE INDEX idx_embeddings_{collection}_hnsw ON embeddings
  USING hnsw (embedding vector_cosine_ops)
  WHERE collection = 'your_collection';
```

### Column Details

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Auto-generated primary key |
| collection | TEXT | Logical grouping (like a table name) |
| external_id | TEXT | Your stable ID for syncing |
| content | TEXT | Original text content |
| metadata | JSONB | Custom JSON fields |
| embedding | VECTOR(n) | The embedding vector |
| created_at | TIMESTAMPTZ | Auto-set on insert |
| updated_at | TIMESTAMPTZ | Auto-updated on upsert |

---

## TypeScript API

### VectorStore Operations

```typescript
import { VectorStore } from 'n8n-nodes-pgvector-advanced';

// Upsert
await vectorStore.upsert({
  collection: string,
  id?: string,
  externalId?: string,
  content?: string,
  metadata?: Record<string, any>,
  embedding: number[]
});

// Query
const results = await vectorStore.query({
  collection: string,
  embedding: number[],
  topK?: number,           // default: 10
  offset?: number,         // default: 0
  distanceMetric?: 'cosine' | 'l2' | 'inner_product',
  metadataFilter?: Record<string, any>,
  includeEmbedding?: boolean
});

// Delete
await vectorStore.delete({
  id?: string | string[],
  collection?: string,
  externalId?: string | string[],
  metadataFilter?: Record<string, any>
});

// Get
const records = await vectorStore.get({
  id?: string | string[],
  collection?: string,
  externalId?: string | string[]
});
```

### Query Result Type

```typescript
interface QueryResult {
  id: string;
  externalId?: string;
  collection: string;
  content?: string;
  metadata: Record<string, any>;
  score: number;
  embedding?: number[];  // if includeEmbedding: true
}
```

---

## SQL Operations

### Distance Operators

| Metric | Operator | Example |
|--------|----------|---------|
| Cosine | `<=>` | `embedding <=> '[0.1,0.2,...]'` |
| L2 (Euclidean) | `<->` | `embedding <-> '[0.1,0.2,...]'` |
| Inner Product | `<#>` | `embedding <#> '[0.1,0.2,...]'` |

### Example Queries

**Similarity search:**
```sql
SELECT id, content, metadata,
       embedding <=> '[0.1,0.2,...]' AS score
FROM embeddings
WHERE collection = 'documents'
ORDER BY embedding <=> '[0.1,0.2,...]'
LIMIT 10;
```

**With metadata filter:**
```sql
SELECT id, content, metadata,
       embedding <=> '[0.1,0.2,...]' AS score
FROM embeddings
WHERE collection = 'documents'
  AND metadata->>'category' = 'technology'
ORDER BY embedding <=> '[0.1,0.2,...]'
LIMIT 10;
```

**Upsert with external ID:**
```sql
INSERT INTO embeddings (collection, external_id, content, metadata, embedding)
VALUES ('documents', 'doc-123', 'content', '{"key": "value"}', '[0.1,0.2,...]')
ON CONFLICT (collection, external_id)
DO UPDATE SET
  content = EXCLUDED.content,
  metadata = EXCLUDED.metadata,
  embedding = EXCLUDED.embedding,
  updated_at = NOW();
```

---

## Index Types

### HNSW (Hierarchical Navigable Small World)

```sql
CREATE INDEX ON embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| m | 16 | Max connections per node |
| ef_construction | 64 | Build-time search breadth |

**Pros:** Fast queries, high recall
**Cons:** Slower index build, more memory

### IVFFlat (Inverted File Index)

```sql
CREATE INDEX ON embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| lists | 100 | Number of clusters |

**Pros:** Faster index build
**Cons:** Slightly lower recall

### Per-Collection Indexes

For better performance with multiple collections:

```sql
CREATE INDEX idx_embeddings_docs_hnsw ON embeddings
  USING hnsw (embedding vector_cosine_ops)
  WHERE collection = 'documents';
```

---

## Connection Pooling

The package uses connection pooling for efficiency:

```typescript
// Credentials configuration
{
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  user: 'user',
  password: 'password',
  ssl: false,
  max: 20  // Max pool connections
}
```

---

## Performance Benchmarks

With HNSW index on 1M embeddings (1536 dimensions):

| Operation | Time |
|-----------|------|
| Query top-10 | <50ms |
| Batch insert (1000) | ~1 second |
| Single upsert | ~5ms |
| Delete by ID | ~2ms |

---

## Project Architecture

```
n8n-nodes-pgvector-advanced/
├── lib/
│   ├── db.ts              # Database connection pooling
│   ├── sqlBuilder.ts      # Safe SQL construction
│   ├── pgvector.ts        # PGVector schema management
│   └── vectorstore.ts     # High-level CRUD operations
├── nodes/
│   └── PgvectorVectorStore.node.ts  # n8n node definition
├── credentials/
│   └── Postgres.credentials.ts      # Credential schema
└── tests/
    ├── unit/              # Unit tests
    └── integration/       # Integration tests
```

---

## Next Steps

- [Operations Reference](operations.md) - All operations in detail
- [Troubleshooting](troubleshooting.md) - Common issues
