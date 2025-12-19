---
layout: default
title: AI Agent Tools
nav_order: 6
---

# AI Agent Tools for n8n

This package includes an **AI Agent Tool** node that allows n8n's AI Agents to interact with your vector store using intuitive operations.

---

## What is the PGVector Store Tool?

The **PGVector Store Tool** provides AI Agents with a natural way to manage knowledge:

| Operation | What it does |
|-----------|--------------|
| **Remember** | Store new information, or update by ID or by finding similar content |
| **Recall** | Search for similar information with configurable threshold |
| **Forget** | Delete a specific entry by its exact ID |
| **Forget Similar** | Delete entries similar to a concept (with safety controls) |
| **Lookup** | Get a specific entry by ID |

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
2. Choose the **Operation**
3. Configure operation-specific settings
4. Specify your **Collection** name

---

## Operations

### Remember (Store/Update)

Store new information or update existing entries.

**n8n Configuration:**
| Setting | Description |
|---------|-------------|
| Collection | Knowledge base name |
| Distance Metric | For concept-based updates |
| Update Similarity Threshold | Min similarity to allow concept-based update (default: 0.7) |

**AI provides:**
| Parameter | Description |
|-----------|-------------|
| content | The information to store (required) |
| id | Update entry with this ID |
| updateSimilar | Find and update entry similar to this concept |
| metadata | Tags like `{category: "meeting"}` |

**Example AI interactions:**

Create new:
> "Remember that the API key expires on January 15th"

Update by ID:
> "Update entry 'api-info' with the new expiration date"

Update by concept:
> "Update the information about API keys with this new content: ..."

### Recall (Search)

Search for similar information.

**n8n Configuration:**
| Setting | Description |
|---------|-------------|
| Collection | Knowledge base name |
| Top K Results | Maximum results to return (default: 5) |
| Minimum Similarity | Only return results above this threshold (0-1, default: 0) |
| Distance Metric | cosine, l2, or inner_product |

**AI provides:**
| Parameter | Description |
|-----------|-------------|
| query | What to search for (required) |
| filter | Metadata filter like `{category: "meeting"}` |

**Example AI interactions:**
> "What do we know about the API?"

> "Find all meeting notes from Q1"

### Forget (Delete by ID)

Delete a specific entry by its exact ID.

**n8n Configuration:**
| Setting | Description |
|---------|-------------|
| Collection | Knowledge base name |

**AI provides:**
| Parameter | Description |
|-----------|-------------|
| id | The exact ID to delete (required) |

**Example AI interactions:**
> "Delete the entry with ID 'old-notes-123'"

### Forget Similar (Delete by Concept)

Delete entries similar to a concept. Has safety controls.

**n8n Configuration:**
| Setting | Description |
|---------|-------------|
| Collection | Knowledge base name |
| Distance Metric | For similarity matching |
| Similarity Threshold | Only delete if similarity above this (default: 0.8) |
| Dry Run | Show what would be deleted without deleting (default: ON) |

**AI provides:**
| Parameter | Description |
|-----------|-------------|
| concept | Delete entries similar to this (required) |

**Example AI interactions:**
> "Delete all information about the deprecated API"

With Dry Run ON, the tool shows what would be deleted. Set Dry Run OFF to actually delete.

### Lookup (Get by ID)

Retrieve a specific entry by its exact ID.

**n8n Configuration:**
| Setting | Description |
|---------|-------------|
| Collection | Knowledge base name |

**AI provides:**
| Parameter | Description |
|-----------|-------------|
| id | The ID to retrieve (required) |

**Example AI interactions:**
> "Show me the entry with ID 'meeting-notes-jan'"

---

## Tool Naming

Tools are automatically named based on collection:
- `remember_knowledge`
- `recall_knowledge`
- `forget_knowledge`
- `forget_similar_knowledge`
- `lookup_knowledge`

---

## Configuration vs AI Parameters

The design philosophy is:
- **n8n Configuration**: Safety settings, thresholds, limits
- **AI Parameters**: The actual data and targets

This means users control safety (thresholds, dry run) while the AI handles the content.

---

## Example Workflows

### Knowledge Base with Full CRUD

```
Chat Trigger → AI Agent → OpenAI Chat Model
                    ↓
              PGVector Store Tool (Remember) → OpenAI Embeddings
              PGVector Store Tool (Recall) → OpenAI Embeddings
              PGVector Store Tool (Forget) → OpenAI Embeddings
              PGVector Store Tool (Lookup) → OpenAI Embeddings
```

### Safe Cleanup Workflow

```
Chat Trigger → AI Agent → OpenAI Chat Model
                    ↓
              PGVector Store Tool (Forget Similar, Dry Run ON)
```

First run with Dry Run to see what would be deleted, then create another workflow with Dry Run OFF for actual deletion.

---

## Best Practices

### 1. Use IDs for Important Entries

When storing information you'll want to update later:
```
AI: "Remember this with ID 'weekly-schedule': Team meetings are Fridays at 2pm"
```

### 2. Use Concept Updates Carefully

The updateSimilar feature is powerful but should have a reasonable threshold:
- 0.8+ for strict matching
- 0.7 for moderate matching
- Below 0.6 may match unintended entries

### 3. Always Dry Run First

When using Forget Similar, always test with Dry Run ON to see what would be deleted.

### 4. Organize with Metadata

```json
{
  "metadata": {
    "category": "meeting",
    "quarter": "Q1",
    "project": "alpha"
  }
}
```

---

## Troubleshooting

### "No existing entry found similar to..."

When using updateSimilar, no entry was found that matches. Store as new instead.

### "Similarity below threshold"

The found entry isn't similar enough to the search concept. Either:
- Use the provided ID to force update
- Lower the Update Similarity Threshold in n8n config

### "Dry run - would delete X entries"

This is expected! Disable Dry Run in n8n config to actually delete.

---

## See Also

- [Installation Guide](installation.md)
- [Operations Reference](operations.md)
- [MCP Server](mcp.md) - Use with external AI agents
