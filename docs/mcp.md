---
layout: default
title: MCP Server
nav_order: 7
---

# MCP Server for AI Agents

This package includes an **MCP (Model Context Protocol) server** that allows AI agents like Claude to interact with your PGVector database directly.

---

## What is MCP?

[Model Context Protocol (MCP)](https://modelcontextprotocol.io/) is an open standard that allows AI assistants to connect to external tools and data sources. Think of it as giving AI agents "hands" to interact with your systems.

**This is NOT for n8n workflows** - n8n uses the PGVector Advanced node directly. MCP is for AI coding assistants and agents.

---

## Who is this for?

- **Claude Desktop** users who want Claude to search/store embeddings
- **Claude Code** users who want AI-assisted vector operations
- **AI agent developers** building systems that need vector storage
- **MCP-compatible tools** that support the protocol

---

## Quick Start

### 1. Install the package

```bash
npm install -g n8n-nodes-pgvector-advanced
```

### 2. Set environment variables

```bash
export PGHOST=localhost
export PGPORT=5432
export PGDATABASE=your_db
export PGUSER=your_user
export PGPASSWORD=your_password
```

### 3. Run the MCP server

```bash
pgvector-mcp
```

Or run directly without installing:

```bash
npx n8n-nodes-pgvector-advanced
```

---

## Configure Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on Mac):

```json
{
  "mcpServers": {
    "pgvector": {
      "command": "pgvector-mcp",
      "env": {
        "PGHOST": "localhost",
        "PGPORT": "5432",
        "PGDATABASE": "your_db",
        "PGUSER": "your_user",
        "PGPASSWORD": "your_password"
      }
    }
  }
}
```

Restart Claude Desktop to load the server.

---

## Available Tools

The MCP server provides 5 tools:

### pgvector_upsert

Insert or update embeddings in the vector store.

```json
{
  "collection": "documents",
  "externalId": "doc-123",
  "content": "Document text content",
  "embedding": [0.1, 0.2, 0.3, ...],
  "metadata": {"category": "tech", "author": "Jane"}
}
```

### pgvector_query

Search for similar embeddings.

```json
{
  "collection": "documents",
  "queryEmbedding": [0.1, 0.2, ...],
  "topK": 10,
  "distanceMetric": "cosine",
  "metadataFilter": {"category": "tech"}
}
```

### pgvector_delete

Delete embeddings by ID, external ID, or metadata.

```json
{
  "deleteBy": "externalId",
  "collection": "documents",
  "externalIds": ["doc-1", "doc-2"]
}
```

### pgvector_get

Retrieve specific embeddings.

```json
{
  "getBy": "externalId",
  "collection": "documents",
  "externalIds": ["doc-123"]
}
```

### pgvector_admin

Manage schema and indexes.

```json
{
  "operation": "ensureSchema",
  "dimensions": 1536
}
```

```json
{
  "operation": "createIndex",
  "collection": "documents",
  "indexType": "hnsw",
  "distanceMetric": "cosine"
}
```

---

## Example Conversation with Claude

Once configured, you can ask Claude things like:

> "Store this document in my vector database with the embedding I provide"

> "Search for documents similar to this text in the 'articles' collection"

> "Delete all embeddings with metadata category 'outdated'"

> "Set up the database schema for 1536-dimension embeddings"

Claude will use the MCP tools to perform these operations on your PostgreSQL database.

---

## Docker Setup

If your PostgreSQL is running in Docker, make sure the MCP server can reach it:

```bash
# Use host.docker.internal on Mac/Windows
export PGHOST=host.docker.internal

# Or use the container's IP
export PGHOST=$(docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' your-postgres-container)
```

---

## Troubleshooting

**"Connection refused"**
- Check that PostgreSQL is running and accessible
- Verify PGHOST, PGPORT, PGUSER, PGPASSWORD are correct
- Ensure the pgvector extension is installed

**"Tool not found in Claude"**
- Restart Claude Desktop after config changes
- Check the config file path is correct
- Look for errors in Claude's developer console

**"Permission denied"**
- Ensure the database user has CREATE/INSERT/SELECT/DELETE permissions
- For schema operations, may need superuser or extension creation rights

---

## n8n vs MCP

| Feature | n8n Node | MCP Server |
|---------|----------|------------|
| **For** | Workflow automation | AI agents |
| **Interface** | Visual node editor | Natural language |
| **Use case** | Scheduled jobs, triggers | Interactive AI chat |
| **Setup** | Install in n8n | Configure in Claude |

**Use n8n** when you want automated workflows with triggers, schedules, and integrations.

**Use MCP** when you want an AI assistant to interactively work with your vector data.

---

## Next Steps

- [Installation](installation.md) - Install the n8n node
- [Operations Reference](operations.md) - Full API documentation
- [MCP Documentation](https://modelcontextprotocol.io/) - Learn more about MCP
