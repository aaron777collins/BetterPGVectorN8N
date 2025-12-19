---
layout: default
title: AI Agent Tools
nav_order: 6
---

# AI Agent Tools for n8n

This package includes an **AI Agent Tool** node that allows n8n's AI Agents to interact with your vector store directly.

---

## What is the PGVector Store Tool?

The **PGVector Store Tool** is a special n8n node that provides AI Agents with the ability to:

- **Search** for similar documents using natural language
- **Store** new documents with automatic embedding generation
- **Delete** documents by their external ID
- **Retrieve** specific documents by ID

This enables powerful RAG (Retrieval-Augmented Generation) workflows where AI agents can dynamically access and update your knowledge base.

---

## Quick Start

### 1. Add the AI Agent

1. Create a new workflow in n8n
2. Add an **AI Agent** node
3. Connect a **Chat Model** (e.g., OpenAI, Anthropic)

### 2. Add the PGVector Store Tool

1. Add a **PGVector Store Tool** node
2. Connect it to the AI Agent's tool input
3. Connect an **Embeddings** node (e.g., OpenAI Embeddings)

### 3. Configure the Tool

1. Set up your **Postgres credentials**
2. Choose the **Operation** (Query, Upsert, Delete, or Get)
3. Specify your **Collection** name
4. Optionally customize the **Tool Description**

### 4. Run Your Agent

The AI Agent will now be able to use your vector store based on the conversation context!

---

## Node Configuration

### Connection Requirements

The PGVector Store Tool requires:

| Input | Description |
|-------|-------------|
| **Embeddings** | An embeddings model (OpenAI, Cohere, etc.) to generate vectors |
| **Postgres Credentials** | Database connection for your pgvector instance |

### Operations

#### Query (Similarity Search)

Search for documents similar to the AI's query.

| Parameter | Description |
|-----------|-------------|
| Collection | The collection to search |
| Top K | Number of results to return (default: 10) |
| Distance Metric | cosine, l2, or inner_product |
| Include Content | Whether to show document content |

**Example AI interaction:**
> "Find documents about machine learning in my knowledge base"

The agent will automatically use the tool to search and return relevant results.

#### Upsert (Store Document)

Store new documents or update existing ones.

| Parameter | Description |
|-----------|-------------|
| Collection | The collection to store in |

**Example AI interaction:**
> "Save this article about TypeScript best practices to my documents collection"

The agent will embed and store the content automatically.

#### Delete

Remove documents from the collection.

| Parameter | Description |
|-----------|-------------|
| Collection | The collection to delete from |

**Example AI interaction:**
> "Delete the document with ID 'old-article-123' from my collection"

#### Get

Retrieve a specific document by its external ID.

| Parameter | Description |
|-----------|-------------|
| Collection | The collection to get from |

**Example AI interaction:**
> "Show me the document with external ID 'meeting-notes-2024'"

---

## Tool Descriptions

You can customize how the AI understands when to use each tool by setting a custom **Tool Description**.

**Default descriptions:**

| Operation | Default Description |
|-----------|---------------------|
| Query | "Search the {collection} collection for documents similar to the query. Returns the {topK} most relevant results with similarity scores." |
| Upsert | "Store a document in the {collection} collection. The document will be embedded and stored for later similarity search." |
| Delete | "Delete documents from the {collection} collection by their external ID." |
| Get | "Retrieve a specific document from the {collection} collection by its external ID." |

**Custom example:**
```
Search our product documentation for answers to customer questions.
Use this when the user asks about product features, pricing, or support.
```

---

## Example Workflows

### RAG Chatbot

```
Chat Trigger → AI Agent → OpenAI Chat Model
                    ↓
              PGVector Store Tool (Query) → OpenAI Embeddings
```

The agent searches your knowledge base to answer questions.

### Document Ingestion

```
Webhook → AI Agent → OpenAI Chat Model
               ↓
         PGVector Store Tool (Upsert) → OpenAI Embeddings
```

The agent processes and stores incoming documents.

### Knowledge Base Management

```
Chat Trigger → AI Agent → OpenAI Chat Model
                    ↓
              PGVector Store Tool (All Operations) → OpenAI Embeddings
```

The agent can search, add, update, and delete documents based on conversation.

---

## Multiple Tools

You can add **multiple PGVector Store Tool nodes** to give your agent access to different operations or collections:

```
AI Agent
    ├── PGVector Store Tool (Query - documents)
    ├── PGVector Store Tool (Query - products)
    ├── PGVector Store Tool (Upsert - documents)
    └── PGVector Store Tool (Delete - documents)
```

Each tool will have a distinct name like `search_documents`, `search_products`, etc.

---

## Best Practices

### 1. Clear Tool Descriptions

Write specific descriptions so the AI knows exactly when to use each tool:

```
❌ Bad: "Search documents"
✅ Good: "Search the customer support knowledge base for answers to technical questions about our software products"
```

### 2. Separate Collections

Use different collections for different types of content:
- `support_articles` - Customer support documentation
- `product_info` - Product specifications
- `meeting_notes` - Internal meeting summaries

### 3. Use External IDs

Always provide external IDs when upserting documents to enable updates and deletions:

```json
{
  "externalId": "article-123",
  "content": "Document content..."
}
```

### 4. Metadata for Filtering

Add metadata to enable filtered searches:

```json
{
  "metadata": {
    "category": "support",
    "product": "enterprise",
    "date": "2024-01"
  }
}
```

---

## Troubleshooting

### "An embeddings model must be connected"

Make sure you've connected an **Embeddings** node (like OpenAI Embeddings) to the tool.

### Agent not using the tool

- Check the tool description is clear and specific
- Ensure the AI model supports function calling
- Try prompting the agent more explicitly

### Connection errors

- Verify Postgres credentials are correct
- Ensure pgvector extension is installed
- Check database is accessible from n8n

---

## See Also

- [Installation Guide](installation.md) - Set up the package
- [Operations Reference](operations.md) - Detailed operation docs
- [MCP Server](mcp.md) - Use with external AI agents
