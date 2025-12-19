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
| ID Format Hint | Example ID format to guide the AI (e.g., "meeting-2024-01-15") |
| Auto-Generate ID | Automatically create IDs when AI doesn't provide one |
| Update Similarity Threshold | Min similarity to allow concept-based update (default: 0.7) |
| Distance Metric | For concept-based updates (cosine, l2, inner_product) |

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

Create with specific ID:
> "Remember with ID 'api-expiry': The API key expires January 15th"

Update by ID:
> "Update entry 'api-info' with the new expiration date"

Update by concept:
> "Update the information about API keys with this new content: ..."

**How it works in n8n:**
1. Configure `ID Format Hint` to "api-v1-info" so the AI uses consistent IDs
2. Enable `Auto-Generate ID` if you don't need specific IDs
3. Set `Update Similarity Threshold` to 0.8 for strict concept matching

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

**How it works in n8n:**
1. Set `Minimum Similarity` to 0.6 to filter out weak matches
2. Use `Top K Results` = 3 for focused responses, 10 for comprehensive

### Forget (Delete by ID)

Delete a specific entry by its exact ID.

**n8n Configuration:**
| Setting | Description |
|---------|-------------|
| Collection | Knowledge base name |
| ID Format Hint | Example ID format so AI knows what IDs look like |
| Return Deleted Content | Show what was deleted (useful for confirmation) |

**AI provides:**
| Parameter | Description |
|-----------|-------------|
| id | The exact ID to delete (required) |

**Example AI interactions:**
> "Delete the entry with ID 'old-notes-123'"

**How it works in n8n:**
1. Set `ID Format Hint` to match your ID scheme (e.g., "doc-123")
2. Enable `Return Deleted Content` for audit trails or confirmations

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

**How it works in n8n:**
1. Keep `Dry Run` ON for safety - shows what would be deleted
2. Set `Similarity Threshold` to 0.9 for very precise matching
3. Create a separate workflow with `Dry Run` OFF for actual deletion

### Lookup (Get by ID)

Retrieve a specific entry by its exact ID.

**n8n Configuration:**
| Setting | Description |
|---------|-------------|
| Collection | Knowledge base name |
| ID Format Hint | Example ID format so AI knows what IDs look like |
| Include Metadata | Show metadata tags in response (default: ON) |
| Include Timestamps | Show created/updated times (default: ON) |

**AI provides:**
| Parameter | Description |
|-----------|-------------|
| id | The ID to retrieve (required) |

**Example AI interactions:**
> "Show me the entry with ID 'meeting-notes-jan'"

**How it works in n8n:**
1. Set `ID Format Hint` to help AI recognize valid IDs
2. Disable `Include Timestamps` if you don't need date info

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

The design philosophy separates concerns:

| Controlled by | Purpose | Examples |
|---------------|---------|----------|
| **n8n Configuration** | Safety, limits, behavior | Thresholds, dry run, ID hints |
| **AI Runtime** | Data and targets | Content, IDs, search queries |

This means:
- **Users** control safety (thresholds, dry run mode) via n8n UI
- **AI** handles the data (what to store, what to search for)
- **ID Format Hints** guide the AI without enforcing - they appear in tool descriptions

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

**Configuration:**
- Remember: ID Format Hint = "note-YYYY-MM-DD", Auto-Generate ID = ON
- Recall: Top K = 5, Minimum Similarity = 0.5
- Forget: ID Format Hint = "note-YYYY-MM-DD", Return Deleted Content = ON
- Lookup: Include Metadata = ON, Include Timestamps = ON

### Safe Cleanup Workflow

```
Chat Trigger → AI Agent → OpenAI Chat Model
                    ↓
              PGVector Store Tool (Forget Similar, Dry Run ON)
```

First run with Dry Run to see what would be deleted, then create another workflow with Dry Run OFF for actual deletion.

### Meeting Notes Assistant

```
Chat Trigger → AI Agent → OpenAI Chat Model
                    ↓
              PGVector Store Tool (Remember) → OpenAI Embeddings
                    ↓
              PGVector Store Tool (Recall) → OpenAI Embeddings
```

**Configuration:**
- Remember:
  - ID Format Hint = "meeting-2024-01-15-standup"
  - Auto-Generate ID = OFF (AI provides structured IDs)
  - Update Similarity Threshold = 0.85
- Recall:
  - Top K = 10
  - Minimum Similarity = 0.6

**User interaction:**
> User: "Remember today's standup: John discussed the API migration"
> AI: Uses `remember_meetings` with ID "meeting-2024-01-15-standup"

> User: "What did we discuss about APIs last week?"
> AI: Uses `recall_meetings` to search

---

## Best Practices

### 1. Use ID Format Hints

Set the ID Format Hint in n8n to guide the AI:
```
meeting-2024-01-15-standup
doc-api-v2-guide
note-project-alpha-123
```

The hint appears in the tool description, helping the AI use consistent IDs.

### 2. Enable Auto-Generate ID for Simple Cases

When you don't need specific IDs, enable Auto-Generate ID:
- Creates IDs like `knowledge-1705315200000-x7k2m9`
- Prevents missing IDs when AI forgets to provide one

### 3. Use Concept Updates Carefully

The updateSimilar feature is powerful but should have a reasonable threshold:
- 0.85+ for strict matching (production)
- 0.7 for moderate matching (development)
- Below 0.6 may match unintended entries

### 4. Always Dry Run First

When using Forget Similar, always test with Dry Run ON to see what would be deleted.

### 5. Return Deleted Content for Auditing

Enable "Return Deleted Content" on Forget to:
- Confirm the right entry was deleted
- Provide audit trail for users

### 6. Organize with Metadata

```json
{
  "metadata": {
    "category": "meeting",
    "quarter": "Q1",
    "project": "alpha"
  }
}
```

Use with Recall's filter parameter to narrow searches.

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

### AI doesn't use the ID format I specified

ID Format Hint is guidance, not enforcement. To ensure consistent IDs:
1. Make the hint clearer (e.g., "project-YYYYMMDD-topic")
2. Include format in your prompts to the AI
3. Or enable Auto-Generate ID for automatic IDs

---

## See Also

- [Installation Guide](installation.md)
- [Operations Reference](operations.md)
- [MCP Server](mcp.md) - Use with external AI agents
