---
layout: default
title: AI Agent Tools
nav_order: 6
---

# AI Agent Tools for n8n

This package includes an **AI Agent Tool** node that allows n8n's AI Agents to interact with your vector store using intuitive, human-like operations.

---

## What is the PGVector Store Tool?

The **PGVector Store Tool** provides AI Agents with a natural way to manage knowledge:

- **Remember** - Store new information (with optional ID for updates)
- **Recall** - Search for similar information using natural language
- **Forget** - Delete by exact ID or by concept similarity
- **Lookup** - Get a specific entry by ID

This enables powerful RAG (Retrieval-Augmented Generation) workflows where AI agents can dynamically manage your knowledge base.

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
2. Choose the **Operation** (Recall, Remember, Forget, or Lookup)
3. Specify your **Collection** name (default: "knowledge")
4. Optionally customize the **Tool Description**

### 4. Run Your Agent

The AI Agent will now be able to use your vector store based on the conversation context!

---

## Operations

### Remember (Store Information)

Store new information or update existing entries.

| Parameter | Description |
|-----------|-------------|
| content | The information/text to remember |
| id | Optional ID for this memory (use to update existing entries) |
| metadata | Optional tags like `{category: "meeting", date: "2024-01"}` |

**Example AI interactions:**
> "Remember that our next team meeting is on Friday at 2pm"

> "Save this with ID 'meeting-schedule': Team meetings are every Friday"

> "Update the entry with ID 'api-docs' with the new endpoint information"

The tool generates an embedding and stores the content. If an ID is provided and already exists, it updates the entry.

### Recall (Search)

Search for information using natural language.

| Parameter | Description |
|-----------|-------------|
| query | What to search for (natural language) |
| filter | Optional metadata filter like `{category: "meeting"}` |
| Top K | Number of results to return (default: 5) |
| Distance Metric | cosine, l2, or inner_product |

**Example AI interactions:**
> "What do we know about upcoming meetings?"

> "Find all information tagged with category 'technical'"

> "Recall anything related to API authentication"

Results include relevance scores and any stored metadata.

### Forget (Delete)

Remove information by exact ID or by concept similarity.

| Parameter | Description |
|-----------|-------------|
| id | Exact ID of the entry to delete |
| concept | Delete entries similar to this concept/text |
| threshold | Similarity threshold for concept deletion (0-1, default 0.8) |
| dryRun | If true, shows what would be deleted without actually deleting |

**Example AI interactions:**

By ID:
> "Forget the entry with ID 'old-meeting-notes'"

By concept:
> "Forget everything related to the deprecated API"

With dry run:
> "Show me what would be deleted if I forget all information about Q1 planning"

The concept-based deletion is powerful for cleaning up related information. Use `dryRun` to preview what would be deleted.

### Lookup (Get by ID)

Retrieve a specific entry by its exact ID.

| Parameter | Description |
|-----------|-------------|
| id | The ID of the entry to retrieve |

**Example AI interactions:**
> "Show me the entry with ID 'meeting-notes-2024'"

> "Look up the document with ID 'api-v2-spec'"

---

## Tool Naming

Tools are automatically named based on the collection:
- `remember_knowledge`
- `recall_knowledge`
- `forget_knowledge`
- `lookup_knowledge`

For a collection named "docs":
- `remember_docs`
- `recall_docs`
- `forget_docs`
- `lookup_docs`

---

## Example Workflows

### RAG Chatbot with Memory

```
Chat Trigger → AI Agent → OpenAI Chat Model
                    ↓
              PGVector Store Tool (Recall) → OpenAI Embeddings
```

The agent searches your knowledge base to answer questions.

### Learning Assistant

```
Chat Trigger → AI Agent → OpenAI Chat Model
                    ↓
              PGVector Store Tool (Remember) → OpenAI Embeddings
              PGVector Store Tool (Recall) → OpenAI Embeddings
```

The agent can both learn new information and recall it later.

### Knowledge Base Manager

```
Chat Trigger → AI Agent → OpenAI Chat Model
                    ↓
              PGVector Store Tool (All Operations) → OpenAI Embeddings
```

The agent can remember, recall, forget, and lookup based on conversation.

---

## Multiple Tools / Collections

You can add **multiple PGVector Store Tool nodes** to give your agent access to different collections:

```
AI Agent
    ├── PGVector Store Tool (Recall - meetings)
    ├── PGVector Store Tool (Recall - documents)
    ├── PGVector Store Tool (Remember - notes)
    └── PGVector Store Tool (Forget - notes)
```

Each tool will have a distinct name like `recall_meetings`, `recall_documents`, etc.

---

## Best Practices

### 1. Clear Tool Descriptions

Write specific descriptions so the AI knows exactly when to use each tool:

```
Bad: "Search documents"
Good: "Search the customer support knowledge base for answers to technical questions about our software products"
```

### 2. Use IDs for Important Entries

Provide IDs when storing information you'll want to update or delete later:

```json
{
  "id": "team-schedule-2024",
  "content": "Team meetings are on Fridays at 2pm"
}
```

### 3. Leverage Concept-Based Forget

When cleaning up related information, use the concept-based forget with a dry run first:

```
"Show me what would be deleted if I forget all Q1 meeting notes"
```

Then without dry run:
```
"Forget all Q1 meeting notes"
```

### 4. Metadata for Organization

Add metadata to enable filtered searches:

```json
{
  "metadata": {
    "category": "meeting",
    "quarter": "Q1",
    "year": "2024"
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

### Concept-based forget not working as expected

- Try adjusting the threshold (higher = stricter matching)
- Use dry run to preview what will be deleted
- Check that the concept text is similar enough to stored content

---

## See Also

- [Installation Guide](installation.md) - Set up the package
- [Operations Reference](operations.md) - Detailed operation docs
- [MCP Server](mcp.md) - Use with external AI agents (Claude, etc.)
