---
layout: default
title: Troubleshooting
nav_order: 7
---

# Troubleshooting

Common issues and solutions.

---

## Installation Issues

### Node not appearing in n8n

**Symptoms:** Installed the package but can't find "PGVector Advanced" in n8n.

**Solutions:**

1. **Restart n8n** - Nodes are loaded on startup
   ```bash
   docker compose restart n8n
   # or
   systemctl restart n8n
   ```

2. **Check installation location** - Must be in `~/.n8n/nodes`
   ```bash
   ls ~/.n8n/nodes/node_modules/n8n-nodes-pgvector-advanced
   ```

3. **Check n8n logs for errors**
   ```bash
   docker compose logs n8n | grep -i error
   ```

4. **Verify npm install succeeded**
   ```bash
   cd ~/.n8n/nodes
   npm list n8n-nodes-pgvector-advanced
   ```

### Docker: Nodes disappear after rebuild

**Symptoms:** Installed via UI, but nodes are gone after `docker compose build`.

**Solution:** Use the persistent Docker setup. See [Docker Guide](docker.md).

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/aaron777collins/BetterPGVectorN8N/main/install.sh) --docker
```

---

## Database Issues

### "pgvector extension not found"

**Symptoms:** Error about missing vector extension.

**Solution:** Install pgvector in your PostgreSQL:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Or use the pgvector Docker image:
```bash
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=pass ankane/pgvector
```

### "Dimension mismatch"

**Symptoms:** Error when inserting embeddings.

**Cause:** Your embedding dimensions don't match the schema.

**Solutions:**

1. **Check your embedding size:**
   - OpenAI text-embedding-ada-002: 1536 dimensions
   - OpenAI text-embedding-3-small: 1536 dimensions
   - OpenAI text-embedding-3-large: 3072 dimensions
   - Cohere embed-english-v3: 1024 dimensions

2. **Reinitialize schema with correct dimensions:**
   ```json
   {
     "operation": "admin",
     "adminOperation": "ensureSchema",
     "dimensions": 1536
   }
   ```

3. **Use different collections** for different embedding models

### "Connection pool exhausted"

**Symptoms:** Timeouts or connection errors under load.

**Solutions:**

1. **Increase pool size** in credentials (default: 20)

2. **Reduce concurrent operations**

3. **Check for connection leaks** - ensure workflows complete properly

---

## Query Issues

### Slow queries

**Symptoms:** Queries taking >100ms.

**Solutions:**

1. **Create a vector index:**
   ```json
   {
     "operation": "admin",
     "adminOperation": "createIndex",
     "adminCollection": "your_collection",
     "indexType": "hnsw",
     "adminDistanceMetric": "cosine"
   }
   ```

2. **Use metadata filters** to reduce search space

3. **Lower topK** if you don't need many results

4. **Check table size:**
   ```sql
   SELECT COUNT(*) FROM embeddings WHERE collection = 'your_collection';
   ```

### No results returned

**Symptoms:** Query returns empty array.

**Solutions:**

1. **Check collection name** - must match exactly (case-sensitive)

2. **Verify data exists:**
   ```sql
   SELECT COUNT(*) FROM embeddings WHERE collection = 'your_collection';
   ```

3. **Check metadata filter syntax** - must be valid JSON

4. **Try without filters** to isolate the issue

### Wrong results / low relevance

**Symptoms:** Query returns documents that don't seem related.

**Solutions:**

1. **Check distance metric** - use `cosine` for text embeddings

2. **Verify embeddings are correct** - same model for query and documents

3. **Check for data issues:**
   ```sql
   SELECT id, content, metadata FROM embeddings
   WHERE collection = 'your_collection' LIMIT 5;
   ```

---

## Upsert Issues

### Duplicates being created

**Symptoms:** Same document inserted multiple times.

**Cause:** Not using `externalId` or using different external IDs.

**Solution:** Always use consistent `externalId`:
```json
{
  "operation": "upsert",
  "collection": "documents",
  "externalId": "stable-id-123",
  "content": "...",
  "embedding": [...]
}
```

### Updates not working

**Symptoms:** Upsert doesn't update existing records.

**Cause:** `externalId` not matching or missing.

**Solution:** Ensure same `collection` + `externalId` combination.

---

## Docker Issues

### init-nodes.sh not running

**Symptoms:** Community nodes not installed after container start.

**Solutions:**

1. **Check script permissions:**
   ```bash
   chmod +x n8n/init-nodes.sh
   docker compose build n8n --no-cache
   ```

2. **Check logs:**
   ```bash
   docker compose logs n8n | grep init-nodes
   ```

3. **Verify Dockerfile ENTRYPOINT** is correct

### npm install failing in container

**Symptoms:** Errors during package installation.

**Solutions:**

1. **Check network access** from container

2. **Try with verbose logging:**
   Edit init-nodes.sh:
   ```bash
   npm install "$pkg" --save --loglevel=verbose
   ```

3. **Check npm registry access:**
   ```bash
   docker compose exec n8n npm ping
   ```

---

## Getting Help

If none of these solutions work:

1. **Check the logs** for specific error messages

2. **Search existing issues:**
   [GitHub Issues](https://github.com/aaron777collins/BetterPGVectorN8N/issues)

3. **Open a new issue** with:
   - n8n version
   - Installation method
   - Error message
   - Steps to reproduce

---

## Next Steps

- [Docker Guide](docker.md) - Persistent Docker setup
- [Operations Reference](operations.md) - All operations in detail
