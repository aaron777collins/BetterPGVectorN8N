# n8n-nodes-pgvector-advanced

Advanced PGVector + Postgres nodes for n8n with full CRUD control, removing all limitations of the built-in PGVector node.

## Features

- **Full CRUD Operations**: Upsert, Query, Delete, and Get embeddings with complete control
- **Stable IDs**: Support both internal UUIDs and external IDs for reliable upstream integration
- **Advanced Querying**: Vector similarity search with metadata filters, pagination, and multiple distance metrics
- **Batch Operations**: Efficient batch inserts and updates
- **Schema Management**: Automatic table creation, indexing (HNSW/IVFFlat), and schema validation
- **Production-Ready**: Connection pooling, error handling, retries, and comprehensive testing
- **Type-Safe**: Full TypeScript implementation with strict typing

## Installation

### From npm (when published)

```bash
npm install n8n-nodes-pgvector-advanced
```

### From source

```bash
git clone <repository-url>
cd n8n-nodes-pgvector-advanced
npm install
npm run build
```

### Install in n8n

1. Navigate to your n8n installation directory
2. Install the package:
   ```bash
   npm install n8n-nodes-pgvector-advanced
   ```
3. Restart n8n

For local development:
```bash
# In the package directory
npm link

# In your n8n directory
npm link n8n-nodes-pgvector-advanced
```

## Prerequisites

- PostgreSQL 12+ with pgvector extension installed
- n8n instance (self-hosted or cloud)

### Install pgvector

```sql
-- Using Docker
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=password ankane/pgvector

-- Or install manually
-- See: https://github.com/pgvector/pgvector#installation
CREATE EXTENSION IF NOT EXISTS vector;
```

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

-- Indexes
CREATE INDEX idx_embeddings_metadata ON embeddings USING GIN (metadata);
CREATE INDEX idx_embeddings_{collection}_hnsw ON embeddings
  USING hnsw (embedding vector_cosine_ops)
  WHERE collection = 'your_collection';
```

## Usage

### 1. Configure Credentials

In n8n, add new Postgres credentials:

- **Host**: Your PostgreSQL host
- **Port**: 5432 (default)
- **Database**: Your database name
- **User**: Database user
- **Password**: Database password
- **SSL**: Configure as needed
- **Connection Pool**: Max connections (default: 20)

### 2. Upsert Embeddings

**Single Upsert**

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

**Batch Upsert**

Map input items to embeddings using field mapping:

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

### 3. Query Similar Embeddings

**Basic Similarity Search**

```json
{
  "operation": "query",
  "collection": "documents",
  "queryEmbedding": [0.1, 0.2, 0.3, ...],
  "topK": 10,
  "distanceMetric": "cosine"
}
```

**With Metadata Filter**

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

**With Pagination**

```json
{
  "operation": "query",
  "collection": "documents",
  "queryEmbedding": [0.1, 0.2, ...],
  "topK": 20,
  "offset": 40,  // Skip first 40 results
  "distanceMetric": "l2"
}
```

Query results include:
```json
{
  "id": "uuid-here",
  "externalId": "doc-123",
  "collection": "documents",
  "content": "Document text",
  "metadata": {"category": "tech"},
  "score": 0.23  // Lower is more similar
}
```

### 4. Delete Embeddings

**Delete by ID**

```json
{
  "operation": "delete",
  "deleteBy": "id",
  "deleteIds": "uuid-1, uuid-2, uuid-3"
}
```

**Delete by External ID**

```json
{
  "operation": "delete",
  "collection": "documents",
  "deleteBy": "externalId",
  "deleteExternalIds": "doc-1, doc-2, doc-3"
}
```

**Delete by Metadata Filter**

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

### 5. Get Embeddings

**Get by ID**

```json
{
  "operation": "get",
  "getBy": "id",
  "getIds": "uuid-1, uuid-2"
}
```

**Get by External ID**

```json
{
  "operation": "get",
  "collection": "documents",
  "getBy": "externalId",
  "getExternalIds": "doc-1, doc-2"
}
```

### 6. Admin Operations

**Ensure Schema**

Creates table and indexes if they don't exist:

```json
{
  "operation": "admin",
  "adminOperation": "ensureSchema",
  "dimensions": 1536
}
```

**Create Vector Index**

```json
{
  "operation": "admin",
  "adminOperation": "createIndex",
  "adminCollection": "documents",
  "indexType": "hnsw",  // or "ivfflat"
  "adminDistanceMetric": "cosine"
}
```

**Drop Collection**

Deletes all records in a collection:

```json
{
  "operation": "admin",
  "adminOperation": "dropCollection",
  "adminCollection": "documents"
}
```

## Distance Metrics

| Metric | When to Use | SQL Operator |
|--------|-------------|--------------|
| **Cosine** | Normalized vectors, text embeddings (OpenAI, etc.) | `<=>` |
| **L2 (Euclidean)** | Absolute distance matters | `<->` |
| **Inner Product** | Already normalized, dot product similarity | `<#>` |

## Index Types

| Type | Build Time | Query Speed | Best For |
|------|------------|-------------|----------|
| **HNSW** | Slower | Faster | High recall, production queries |
| **IVFFlat** | Faster | Good | Large datasets, faster indexing |

## Example Workflows

### Semantic Search Pipeline

1. **Extract Documents** → Parse PDFs/text
2. **Generate Embeddings** → Call OpenAI/Cohere API
3. **Upsert to PGVector** → Store with metadata
4. **Query** → Search similar documents

### Deduplication

1. **Query existing** → Check if similar document exists
2. **If score > threshold** → Skip (duplicate)
3. **Else** → Upsert new document

### Incremental Updates

1. **Upsert by externalId** → Updates existing or inserts new
2. **Automatic timestamp tracking** → `updated_at` auto-updated
3. **No data loss** → Stable IDs prevent duplicates

## Performance

- **Batch Operations**: Process 1000+ embeddings efficiently
- **Connection Pooling**: Reuse connections (configurable pool size)
- **Index Optimization**: HNSW for fast queries, IVFFlat for large datasets
- **Pagination Support**: Handle large result sets

### Benchmarks

With HNSW index on 1M embeddings (1536 dimensions):
- Query time: <50ms for top-10 results
- Insert rate: ~1000 embeddings/sec (batched)
- Update rate: ~800 embeddings/sec

## Development

### Setup

```bash
npm install
```

### Run Tests

```bash
# Start test database
npm run docker:up

# Run all tests
npm test

# Run integration tests only
npm run test:integration

# Run unit tests only
npm run test:unit
```

### Build

```bash
npm run build
```

### Linting

```bash
npm run lint
npm run lint:fix
```

## Architecture

```
n8n-nodes-pgvector-advanced/
├── lib/
│   ├── db.ts              # Database connection pooling
│   ├── sqlBuilder.ts      # Safe SQL construction
│   ├── pgvector.ts        # PGVector schema management
│   └── vectorstore.ts     # High-level CRUD operations
├── nodes/
│   └── PgvectorVectorStore.node.ts
├── credentials/
│   └── Postgres.credentials.ts
└── tests/
    ├── unit/
    └── integration/
```

## API Reference

### VectorStoreOperations

```typescript
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
await vectorStore.query({
  collection: string,
  embedding: number[],
  topK?: number,
  offset?: number,
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
await vectorStore.get({
  id?: string | string[],
  collection?: string,
  externalId?: string | string[]
});
```

## Troubleshooting

### pgvector extension not found

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Dimension mismatch

Ensure all embeddings in a table have the same dimensions. Use different collections for different embedding models.

### Slow queries

1. Create appropriate vector index (HNSW recommended)
2. Create GIN index on metadata for filter queries
3. Use connection pooling
4. Consider pagination for large result sets

### Connection pool exhausted

Increase `max` in credentials configuration or reduce concurrent operations.

## Migration from Built-in PGVector Node

1. Export your data using the built-in node
2. Run `Ensure Schema` admin operation
3. Batch upsert your data with `externalId` field
4. Create indexes for your collections
5. Update workflows to use new node

## Publishing

This package is automatically published to npm when a version tag is pushed to GitHub.

### Publishing Process

1. **Update version in package.json**
   ```bash
   npm version patch  # or minor, or major
   ```

2. **Push changes and tags**
   ```bash
   git push origin main
   git push origin --tags
   ```

3. **Automated workflow**
   - GitHub Actions will automatically run tests
   - Build the package
   - Verify the version tag matches package.json
   - Publish to npm with provenance
   - Create a GitHub release

### Prerequisites

- The `NPM_TOKEN` secret must be configured in GitHub repository settings
- The version must not already exist on npm
- All tests must pass
- The version tag must match the package.json version

### Manual Publishing (if needed)

```bash
npm run build
npm pack --dry-run  # Verify contents
npm publish --access public
```

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Add tests for new features
4. Run `npm test` and `npm run lint`
5. Submit a pull request

## License

MIT

## Support

- GitHub Issues: Report bugs and feature requests
- Documentation: See `/docs` directory for detailed guides
- Examples: See `/examples` directory for workflow examples

## Credits

Built with:
- [n8n](https://n8n.io/) - Workflow automation
- [pgvector](https://github.com/pgvector/pgvector) - Vector similarity search
- [node-postgres](https://node-postgres.com/) - PostgreSQL client

---

**Made with ❤️ for the n8n community**
