/**
 * PGVector Store Tool - AI Agent tool for vector store operations
 *
 * Operations:
 * - Remember: Store information (with optional ID for updates)
 * - Recall: Search with similarity threshold
 * - Forget: Delete by exact ID
 * - Forget Similar: Delete by concept similarity (configurable threshold)
 * - Lookup: Get by exact ID
 */

import type {
  IExecuteFunctions,
  INodeType,
  INodeTypeDescription,
  INodeExecutionData,
  ISupplyDataFunctions,
  SupplyData,
} from 'n8n-workflow';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { DatabaseManager } from '../lib/db';
import { PgVectorManager, DistanceMetric } from '../lib/pgvector';
import { VectorStoreOperations } from '../lib/vectorstore';
import { SchemaConfig } from '../lib/schemaConfig';

interface EmbeddingsModel {
  embedQuery(text: string): Promise<number[]>;
}

// REMEMBER: Store information with optional ID or concept for updates
function createRememberTool(
  collection: string,
  description: string,
  embeddings: EmbeddingsModel,
  vectorStore: VectorStoreOperations,
  distanceMetric: DistanceMetric,
  updateThreshold: number,
  idFormatHint: string,
  autoGenerateId: boolean
): DynamicStructuredTool {
  let toolDescription = description ||
    `Store information in the "${collection}" knowledge base. Provide ID to update by ID, or updateSimilar to find and update similar entry.`;

  if (idFormatHint) {
    toolDescription += ` Suggested ID format: ${idFormatHint}`;
  }

  const idDescription = idFormatHint
    ? `ID for this entry (format: ${idFormatHint})`
    : 'ID for this entry (provide to update existing)';

  return new DynamicStructuredTool({
    name: `remember_${collection.replace(/[^a-zA-Z0-9_]/g, '_')}`,
    description: toolDescription,
    schema: z.object({
      // Accept both 'content' and 'text' to handle different AI models
      content: z.string().optional().describe('The information to store'),
      text: z.string().optional().describe('Alternative: the information to store'),
      id: z.string().optional().describe(idDescription),
      updateSimilar: z.string().optional().describe('Find entry similar to this and update it'),
      metadata: z.record(z.unknown()).optional().describe('Tags like {category: "meeting"}'),
    }).refine(data => data.content || data.text, {
      message: "Either 'content' or 'text' must be provided",
    }),
    func: async ({ content, text, id, updateSimilar, metadata }) => {
      const storeContent = content || text || '';
      try {
        const embedding = await embeddings.embedQuery(storeContent);

        // If updateSimilar provided, find most similar entry and update it
        if (updateSimilar && !id) {
          const searchEmbedding = await embeddings.embedQuery(updateSimilar);
          const similar = await vectorStore.query({
            collection,
            embedding: searchEmbedding,
            topK: 1,
            distanceMetric,
            includeEmbedding: false,
          });

          if (similar.rows.length === 0) {
            return `No existing entry found similar to "${updateSimilar}". Use without updateSimilar to create new.`;
          }

          const match = similar.rows[0];
          const similarity = 1 - match.score;

          if (similarity < updateThreshold) {
            return `Found entry but similarity (${similarity.toFixed(2)}) is below threshold (${updateThreshold}). Use ID "${match.externalId || match.id}" to force update.`;
          }

          // Update the found entry
          const result = await vectorStore.upsert({
            collection,
            content: storeContent,
            embedding,
            externalId: match.externalId || undefined,
            id: match.externalId ? undefined : match.id,
            metadata: (metadata || match.metadata) as Record<string, unknown>,
          });

          return `Updated entry (similarity: ${similarity.toFixed(2)}). ID: ${result.externalId || result.id}`;
        }

        // Auto-generate ID if enabled and not provided
        let finalId = id;
        if (!finalId && autoGenerateId) {
          finalId = `${collection}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        }

        // Standard upsert by ID
        const result = await vectorStore.upsert({
          collection,
          content: storeContent,
          embedding,
          externalId: finalId,
          metadata: (metadata || {}) as Record<string, unknown>,
        });

        const action = result.operation === 'insert' ? 'Stored' : 'Updated';
        return `${action} successfully. ID: ${result.externalId || result.id}`;
      } catch (error) {
        return `Failed to store: ${(error as Error).message}`;
      }
    },
  });
}

// RECALL: Search with configurable similarity threshold
function createRecallTool(
  collection: string,
  description: string,
  embeddings: EmbeddingsModel,
  vectorStore: VectorStoreOperations,
  topK: number,
  distanceMetric: DistanceMetric,
  minSimilarity: number
): DynamicStructuredTool {
  const toolDescription = description ||
    `Search the "${collection}" knowledge base. Returns up to ${topK} results.`;

  return new DynamicStructuredTool({
    name: `recall_${collection.replace(/[^a-zA-Z0-9_]/g, '_')}`,
    description: toolDescription,
    schema: z.object({
      // Accept both 'query' and 'input' to handle different AI models
      query: z.string().optional().describe('What to search for'),
      input: z.string().optional().describe('Alternative: what to search for'),
      filter: z.record(z.unknown()).optional().describe('Filter by metadata, e.g. {category: "meeting"}'),
    }).refine(data => data.query || data.input, {
      message: "Either 'query' or 'input' must be provided",
    }),
    func: async ({ query, input, filter }) => {
      const searchText = query || input || '';
      try {
        const queryEmbedding = await embeddings.embedQuery(searchText);

        const result = await vectorStore.query({
          collection,
          embedding: queryEmbedding,
          topK,
          distanceMetric,
          metadataFilter: filter as Record<string, unknown>,
          includeEmbedding: false,
        });

        // Filter by minimum similarity (score is distance, lower = more similar)
        const maxDistance = 1 - minSimilarity;
        const filtered = result.rows.filter(row => row.score <= maxDistance);

        if (filtered.length === 0) {
          return `No results found for: "${searchText}"`;
        }

        const formatted = filtered.map((row, i) => {
          const similarity = (1 - row.score).toFixed(2);
          const lines = [`[${i + 1}] (similarity: ${similarity})`];
          if (row.content) lines.push(row.content);
          if (row.externalId) lines.push(`ID: ${row.externalId}`);
          if (Object.keys(row.metadata).length > 0) {
            lines.push(`Tags: ${JSON.stringify(row.metadata)}`);
          }
          return lines.join('\n');
        });

        return `Found ${filtered.length} results:\n\n${formatted.join('\n\n')}`;
      } catch (error) {
        return `Search failed: ${(error as Error).message}`;
      }
    },
  });
}

// FORGET: Delete by exact ID
function createForgetTool(
  collection: string,
  description: string,
  vectorStore: VectorStoreOperations,
  idFormatHint: string,
  returnDeletedContent: boolean
): DynamicStructuredTool {
  let toolDescription = description ||
    `Delete an entry from the "${collection}" knowledge base by its exact ID.`;

  if (idFormatHint) {
    toolDescription += ` ID format example: ${idFormatHint}`;
  }

  const idDescription = idFormatHint
    ? `The exact ID to delete (format: ${idFormatHint})`
    : 'The exact ID of the entry to delete';

  return new DynamicStructuredTool({
    name: `forget_${collection.replace(/[^a-zA-Z0-9_]/g, '_')}`,
    description: toolDescription,
    schema: z.object({
      id: z.string().describe(idDescription),
    }),
    func: async ({ id }) => {
      try {
        // If returnDeletedContent, get the content first
        let deletedContent = '';
        if (returnDeletedContent) {
          const existing = await vectorStore.get({ collection, externalId: id });
          if (existing.rows.length > 0) {
            deletedContent = existing.rows[0].content || '';
          }
        }

        const result = await vectorStore.delete({ collection, externalId: id });

        if (result.deletedCount === 0) {
          return `No entry found with ID "${id}"`;
        }

        if (returnDeletedContent && deletedContent) {
          return `Deleted entry "${id}". Content was: ${deletedContent.substring(0, 200)}${deletedContent.length > 200 ? '...' : ''}`;
        }
        return `Deleted entry with ID "${id}"`;
      } catch (error) {
        return `Delete failed: ${(error as Error).message}`;
      }
    },
  });
}

// FORGET SIMILAR: Delete by concept similarity (with n8n-configured threshold)
function createForgetSimilarTool(
  collection: string,
  description: string,
  embeddings: EmbeddingsModel,
  vectorStore: VectorStoreOperations,
  distanceMetric: DistanceMetric,
  threshold: number,
  dryRun: boolean
): DynamicStructuredTool {
  const modeText = dryRun ? ' (DRY RUN - will show what would be deleted)' : '';
  const toolDescription = description ||
    `Delete entries from "${collection}" that are similar to a concept.${modeText} Threshold: ${threshold}`;

  return new DynamicStructuredTool({
    name: `forget_similar_${collection.replace(/[^a-zA-Z0-9_]/g, '_')}`,
    description: toolDescription,
    schema: z.object({
      // Accept both 'concept' and 'input' to handle different AI models
      concept: z.string().optional().describe('Delete entries similar to this concept'),
      input: z.string().optional().describe('Alternative: delete entries similar to this'),
      query: z.string().optional().describe('Alternative: delete entries similar to this'),
    }).refine(data => data.concept || data.input || data.query, {
      message: "Either 'concept', 'input', or 'query' must be provided",
    }),
    func: async ({ concept, input, query }) => {
      const searchConcept = concept || input || query || '';
      try {
        const queryEmbedding = await embeddings.embedQuery(searchConcept);

        // Find similar entries
        const similar = await vectorStore.query({
          collection,
          embedding: queryEmbedding,
          topK: 100,
          distanceMetric,
          includeEmbedding: false,
        });

        // Filter by threshold (score is distance, lower = more similar)
        const maxDistance = 1 - threshold;
        const toDelete = similar.rows.filter(row => row.score <= maxDistance);

        if (toDelete.length === 0) {
          return `No entries found similar to "${searchConcept}" (threshold: ${threshold})`;
        }

        if (dryRun) {
          const preview = toDelete.slice(0, 5).map((row, i) => {
            const similarity = (1 - row.score).toFixed(2);
            const content = row.content?.substring(0, 80) || '(no content)';
            return `${i + 1}. [${similarity}] ${content}...`;
          }).join('\n');

          const more = toDelete.length > 5 ? `\n...and ${toDelete.length - 5} more` : '';
          return `DRY RUN - Would delete ${toDelete.length} entries:\n${preview}${more}`;
        }

        // Actually delete
        let deletedCount = 0;
        for (const row of toDelete) {
          const deleteResult = row.externalId
            ? await vectorStore.delete({ collection, externalId: row.externalId })
            : await vectorStore.delete({ id: row.id });
          deletedCount += deleteResult.deletedCount;
        }

        return `Deleted ${deletedCount} entries similar to "${searchConcept}"`;
      } catch (error) {
        return `Delete failed: ${(error as Error).message}`;
      }
    },
  });
}

// LOOKUP: Get by exact ID
function createLookupTool(
  collection: string,
  description: string,
  vectorStore: VectorStoreOperations,
  idFormatHint: string,
  includeMetadata: boolean,
  includeTimestamps: boolean
): DynamicStructuredTool {
  let toolDescription = description ||
    `Get a specific entry from the "${collection}" knowledge base by its ID.`;

  if (idFormatHint) {
    toolDescription += ` ID format example: ${idFormatHint}`;
  }

  const idDescription = idFormatHint
    ? `The ID to retrieve (format: ${idFormatHint})`
    : 'The ID of the entry to retrieve';

  return new DynamicStructuredTool({
    name: `lookup_${collection.replace(/[^a-zA-Z0-9_]/g, '_')}`,
    description: toolDescription,
    schema: z.object({
      id: z.string().describe(idDescription),
    }),
    func: async ({ id }) => {
      try {
        const result = await vectorStore.get({
          collection,
          externalId: id,
          includeEmbedding: false,
        });

        if (result.rows.length === 0) {
          return `No entry found with ID "${id}"`;
        }

        const doc = result.rows[0];
        const lines = [`Entry ID: ${doc.externalId || doc.id}`];
        if (doc.content) lines.push(`\nContent:\n${doc.content}`);
        if (includeMetadata && Object.keys(doc.metadata).length > 0) {
          lines.push(`\nTags: ${JSON.stringify(doc.metadata)}`);
        }
        if (includeTimestamps) {
          lines.push(`\nCreated: ${doc.createdAt}`);
          if (doc.updatedAt) lines.push(`Updated: ${doc.updatedAt}`);
        }

        return lines.join('');
      } catch (error) {
        return `Lookup failed: ${(error as Error).message}`;
      }
    },
  });
}

export class PgVectorStoreTool implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'PGVector Store Tool',
    name: 'pgVectorStoreTool',
    icon: 'file:pgvector.svg',
    group: ['transform'],
    version: 1,
    description: 'AI Agent tool for knowledge base operations',
    defaults: {
      name: 'PGVector Store Tool',
    },
    codex: {
      categories: ['AI'],
      subcategories: {
        AI: ['Tools'],
      },
      resources: {
        primaryDocumentation: [
          {
            url: 'https://aaron777collins.github.io/BetterPGVectorN8N/ai-tools',
          },
        ],
      },
    },
    inputs: [
      {
        displayName: 'Embeddings',
        type: 'ai_embedding' as const,
        required: true,
        maxConnections: 1,
      },
    ],
    outputs: ['ai_tool'] as INodeTypeDescription['outputs'],
    outputNames: ['Tool'],
    credentials: [
      {
        name: 'postgres',
        required: true,
      },
    ],
    properties: [
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        default: 'recall',
        options: [
          {
            name: 'Recall (Search)',
            value: 'recall',
            description: 'Search for similar information',
          },
          {
            name: 'Remember (Store)',
            value: 'remember',
            description: 'Store new information (with optional ID for updates)',
          },
          {
            name: 'Forget (Delete by ID)',
            value: 'forget',
            description: 'Delete a specific entry by its ID',
          },
          {
            name: 'Forget Similar (Delete by Concept)',
            value: 'forgetSimilar',
            description: 'Delete entries similar to a concept',
          },
          {
            name: 'Lookup (Get by ID)',
            value: 'lookup',
            description: 'Retrieve a specific entry by ID',
          },
        ],
      },
      {
        displayName: 'Collection',
        name: 'collection',
        type: 'string',
        default: 'knowledge',
        required: true,
        description: 'Name of the knowledge base collection (partition value)',
      },
      // ═══════════════════════════════════════════════════════
      // SCHEMA CONFIGURATION
      // ═══════════════════════════════════════════════════════
      {
        displayName: 'Schema Configuration',
        name: 'schemaConfigNotice',
        type: 'notice',
        default: '',
        displayOptions: {
          show: {
            '/schemaMode': ['fieldMapping'],
          },
        },
      },
      {
        displayName: 'Schema Mode',
        name: 'schemaMode',
        type: 'options',
        default: 'default',
        options: [
          {
            name: 'Default Schema',
            value: 'default',
            description: 'Use the standard embeddings table schema',
          },
          {
            name: 'Field Mapping',
            value: 'fieldMapping',
            description: 'Configure custom column names for an existing table',
          },
          {
            name: 'SQL Template (Advanced)',
            value: 'sqlTemplate',
            description: 'Write custom SQL queries',
          },
        ],
        description: 'How to interact with the database',
      },
      {
        displayName: 'Table Name',
        name: 'tableName',
        type: 'string',
        default: 'embeddings',
        description: 'Database table name',
        displayOptions: {
          show: {
            schemaMode: ['fieldMapping', 'sqlTemplate'],
          },
        },
      },
      {
        displayName: 'Create Table If Missing',
        name: 'createTable',
        type: 'boolean',
        default: false,
        description: 'Create the table if it does not exist (requires proper column config)',
        displayOptions: {
          show: {
            schemaMode: ['fieldMapping'],
          },
        },
      },
      // Column Mapping
      {
        displayName: 'Column Mapping',
        name: 'columnMapping',
        type: 'fixedCollection',
        default: {},
        placeholder: 'Configure column names',
        typeOptions: {
          multipleValues: false,
        },
        displayOptions: {
          show: {
            schemaMode: ['fieldMapping'],
          },
        },
        options: [
          {
            name: 'columns',
            displayName: 'Columns',
            values: [
              {
                displayName: 'Embedding Column',
                name: 'embedding',
                type: 'string',
                default: 'embedding',
                required: true,
                description: 'Column containing the vector embedding (required)',
              },
              {
                displayName: 'ID Column',
                name: 'id',
                type: 'string',
                default: 'id',
                description: 'Primary key column',
              },
              {
                displayName: 'Content Column',
                name: 'content',
                type: 'string',
                default: 'content',
                description: 'Text content column',
              },
              {
                displayName: 'Partition Column',
                name: 'partition',
                type: 'string',
                default: 'collection',
                description: 'Column for partitioning data (like "collection")',
              },
              {
                displayName: 'Metadata Column',
                name: 'metadata',
                type: 'string',
                default: 'metadata',
                description: 'JSONB column for metadata/filters',
              },
              {
                displayName: 'External ID Column',
                name: 'externalId',
                type: 'string',
                default: 'external_id',
                description: 'Column for user-provided IDs',
              },
            ],
          },
        ],
      },
      {
        displayName: 'Extra Return Columns',
        name: 'extraReturnColumns',
        type: 'string',
        default: '',
        placeholder: 'title, author, created_at',
        description: 'Additional columns to return in query results (comma-separated)',
        displayOptions: {
          show: {
            schemaMode: ['fieldMapping'],
          },
        },
      },
      // SQL Template Mode
      {
        displayName: 'Search SQL Template',
        name: 'searchSqlTemplate',
        type: 'string',
        default: '',
        placeholder: 'SELECT id, content, embedding <-> $1::vector AS score FROM my_table WHERE category = $2 ORDER BY score LIMIT $3',
        description: 'Custom SQL for search. Placeholders: $1=embedding, $2=partition, $3=limit',
        typeOptions: {
          rows: 5,
        },
        displayOptions: {
          show: {
            schemaMode: ['sqlTemplate'],
            operation: ['recall'],
          },
        },
      },
      {
        displayName: 'Tool Description',
        name: 'toolDescription',
        type: 'string',
        default: '',
        description: 'Custom description for the AI (leave empty for auto-generated)',
        typeOptions: {
          rows: 3,
        },
      },
      // AI Parameters notices - show what the AI will provide
      {
        displayName: 'The AI will provide: <strong>query</strong> (required) - what to search for, <strong>filter</strong> (optional) - metadata filter like {category: "meeting"}',
        name: 'recallParamsNotice',
        type: 'notice',
        default: '',
        displayOptions: {
          show: {
            operation: ['recall'],
          },
        },
      },
      {
        displayName: 'The AI will provide: <strong>content</strong> (required) - text to store, <strong>id</strong> (optional) - entry ID, <strong>updateSimilar</strong> (optional) - find & update similar entry, <strong>metadata</strong> (optional) - tags',
        name: 'rememberParamsNotice',
        type: 'notice',
        default: '',
        displayOptions: {
          show: {
            operation: ['remember'],
          },
        },
      },
      {
        displayName: 'The AI will provide: <strong>id</strong> (required) - the exact ID to delete',
        name: 'forgetParamsNotice',
        type: 'notice',
        default: '',
        displayOptions: {
          show: {
            operation: ['forget'],
          },
        },
      },
      {
        displayName: 'The AI will provide: <strong>concept</strong> (required) - delete entries similar to this concept',
        name: 'forgetSimilarParamsNotice',
        type: 'notice',
        default: '',
        displayOptions: {
          show: {
            operation: ['forgetSimilar'],
          },
        },
      },
      {
        displayName: 'The AI will provide: <strong>id</strong> (required) - the ID to retrieve',
        name: 'lookupParamsNotice',
        type: 'notice',
        default: '',
        displayOptions: {
          show: {
            operation: ['lookup'],
          },
        },
      },
      // Recall-specific options
      {
        displayName: 'Top K Results',
        name: 'topK',
        type: 'number',
        default: 5,
        description: 'Maximum number of results to return',
        displayOptions: {
          show: {
            operation: ['recall'],
          },
        },
      },
      {
        displayName: 'Minimum Similarity',
        name: 'minSimilarity',
        type: 'number',
        default: 0,
        description: 'Only return results with similarity above this threshold (0-1). 0 = all results.',
        typeOptions: {
          minValue: 0,
          maxValue: 1,
          numberPrecision: 2,
        },
        displayOptions: {
          show: {
            operation: ['recall'],
          },
        },
      },
      {
        displayName: 'Distance Metric',
        name: 'distanceMetric',
        type: 'options',
        default: 'cosine',
        options: [
          { name: 'Cosine (Recommended)', value: 'cosine' },
          { name: 'L2 (Euclidean)', value: 'l2' },
          { name: 'Inner Product', value: 'inner_product' },
        ],
        displayOptions: {
          show: {
            operation: ['recall', 'remember', 'forgetSimilar'],
          },
        },
      },
      // Remember-specific options
      {
        displayName: 'ID Format Hint',
        name: 'rememberIdHint',
        type: 'string',
        default: '',
        placeholder: 'e.g., "meeting-2024-01-15", "doc-123"',
        description: 'Example ID format to suggest to the AI when storing entries',
        displayOptions: {
          show: {
            operation: ['remember'],
          },
        },
      },
      {
        displayName: 'Auto-Generate ID',
        name: 'autoGenerateId',
        type: 'boolean',
        default: false,
        description: 'When enabled, auto-generates an ID if the AI does not provide one',
        displayOptions: {
          show: {
            operation: ['remember'],
          },
        },
      },
      {
        displayName: 'Update Similarity Threshold',
        name: 'updateThreshold',
        type: 'number',
        default: 0.7,
        description: 'When updating by concept, only update if similarity is above this threshold (0-1)',
        typeOptions: {
          minValue: 0,
          maxValue: 1,
          numberPrecision: 2,
        },
        displayOptions: {
          show: {
            operation: ['remember'],
          },
        },
      },
      // Forget Similar-specific options
      {
        displayName: 'Similarity Threshold',
        name: 'similarityThreshold',
        type: 'number',
        default: 0.8,
        description: 'Only delete entries with similarity above this threshold (0-1). Higher = stricter.',
        typeOptions: {
          minValue: 0,
          maxValue: 1,
          numberPrecision: 2,
        },
        displayOptions: {
          show: {
            operation: ['forgetSimilar'],
          },
        },
      },
      {
        displayName: 'Dry Run',
        name: 'dryRun',
        type: 'boolean',
        default: true,
        description: 'When enabled, shows what would be deleted without actually deleting. Disable to perform actual deletion.',
        displayOptions: {
          show: {
            operation: ['forgetSimilar'],
          },
        },
      },
      // ID-based operations options (Forget, Lookup)
      {
        displayName: 'ID Format Hint',
        name: 'idFormatHint',
        type: 'string',
        default: '',
        placeholder: 'e.g., "doc-123", "meeting-2024-01-15"',
        description: 'Example ID format to help the AI understand what IDs look like. Included in tool description.',
        displayOptions: {
          show: {
            operation: ['forget', 'lookup'],
          },
        },
      },
      // Lookup-specific options
      {
        displayName: 'Include Metadata',
        name: 'includeMetadata',
        type: 'boolean',
        default: true,
        description: 'Include metadata tags in the response',
        displayOptions: {
          show: {
            operation: ['lookup'],
          },
        },
      },
      {
        displayName: 'Include Timestamps',
        name: 'includeTimestamps',
        type: 'boolean',
        default: true,
        description: 'Include created/updated timestamps in the response',
        displayOptions: {
          show: {
            operation: ['lookup'],
          },
        },
      },
      // Forget-specific options
      {
        displayName: 'Return Deleted Content',
        name: 'returnDeletedContent',
        type: 'boolean',
        default: false,
        description: 'Return the content that was deleted (useful for confirmation)',
        displayOptions: {
          show: {
            operation: ['forget'],
          },
        },
      },
    ],
  };

  async supplyData(this: ISupplyDataFunctions): Promise<SupplyData> {
    const operation = this.getNodeParameter('operation', 0) as string;
    const collection = this.getNodeParameter('collection', 0) as string;
    const customDescription = this.getNodeParameter('toolDescription', 0, '') as string;

    // Schema configuration
    const schemaMode = this.getNodeParameter('schemaMode', 0, 'default') as string;

    const credentials = await this.getCredentials('postgres');
    const embeddingsInput = await this.getInputConnectionData('ai_embedding' as never, 0);

    if (!embeddingsInput) {
      throw new Error('An embeddings model must be connected');
    }

    const embeddings = embeddingsInput as unknown as EmbeddingsModel;

    const dbManager = new DatabaseManager({
      host: credentials.host as string,
      port: credentials.port as number,
      database: credentials.database as string,
      user: credentials.user as string,
      password: credentials.password as string,
      ssl: credentials.ssl as boolean,
    });

    // Build schema config based on mode
    let schemaConfig: Partial<SchemaConfig> | undefined;

    if (schemaMode === 'fieldMapping') {
      const tableName = this.getNodeParameter('tableName', 0, 'embeddings') as string;
      const createTable = this.getNodeParameter('createTable', 0, false) as boolean;
      const columnMapping = this.getNodeParameter('columnMapping', 0, {}) as any;
      const extraReturnColumnsStr = this.getNodeParameter('extraReturnColumns', 0, '') as string;

      const columns = columnMapping.columns || {};

      schemaConfig = {
        tableName,
        createTable,
        columns: {
          id: columns.id || 'id',
          embedding: columns.embedding || 'embedding',
          content: columns.content || 'content',
          metadata: columns.metadata || 'metadata',
          partition: columns.partition || 'collection',
          externalId: columns.externalId || 'external_id',
        },
        extraReturnColumns: extraReturnColumnsStr
          ? extraReturnColumnsStr.split(',').map(c => c.trim()).filter(c => c)
          : undefined,
      };
    } else if (schemaMode === 'sqlTemplate') {
      const tableName = this.getNodeParameter('tableName', 0, 'embeddings') as string;
      schemaConfig = {
        tableName,
        createTable: false, // Never auto-create in SQL template mode
      };
    }

    const pgVector = new PgVectorManager(dbManager, schemaConfig);
    const vectorStore = new VectorStoreOperations(dbManager, pgVector);

    let tool: DynamicStructuredTool;

    switch (operation) {
      case 'remember': {
        const updateThreshold = this.getNodeParameter('updateThreshold', 0, 0.7) as number;
        const idFormatHint = this.getNodeParameter('rememberIdHint', 0, '') as string;
        const autoGenerateId = this.getNodeParameter('autoGenerateId', 0, false) as boolean;
        const distanceMetricStr = this.getNodeParameter('distanceMetric', 0, 'cosine') as string;
        const distanceMetric = distanceMetricStr === 'l2'
          ? DistanceMetric.L2
          : distanceMetricStr === 'inner_product'
            ? DistanceMetric.INNER_PRODUCT
            : DistanceMetric.COSINE;
        tool = createRememberTool(collection, customDescription, embeddings, vectorStore, distanceMetric, updateThreshold, idFormatHint, autoGenerateId);
        break;
      }

      case 'recall': {
        const topK = this.getNodeParameter('topK', 0, 5) as number;
        const minSimilarity = this.getNodeParameter('minSimilarity', 0, 0) as number;
        const distanceMetricStr = this.getNodeParameter('distanceMetric', 0, 'cosine') as string;
        const distanceMetric = distanceMetricStr === 'l2'
          ? DistanceMetric.L2
          : distanceMetricStr === 'inner_product'
            ? DistanceMetric.INNER_PRODUCT
            : DistanceMetric.COSINE;
        tool = createRecallTool(collection, customDescription, embeddings, vectorStore, topK, distanceMetric, minSimilarity);
        break;
      }

      case 'forget': {
        const idFormatHint = this.getNodeParameter('idFormatHint', 0, '') as string;
        const returnDeletedContent = this.getNodeParameter('returnDeletedContent', 0, false) as boolean;
        tool = createForgetTool(collection, customDescription, vectorStore, idFormatHint, returnDeletedContent);
        break;
      }

      case 'forgetSimilar': {
        const threshold = this.getNodeParameter('similarityThreshold', 0, 0.8) as number;
        const dryRun = this.getNodeParameter('dryRun', 0, true) as boolean;
        const distanceMetricStr = this.getNodeParameter('distanceMetric', 0, 'cosine') as string;
        const distanceMetric = distanceMetricStr === 'l2'
          ? DistanceMetric.L2
          : distanceMetricStr === 'inner_product'
            ? DistanceMetric.INNER_PRODUCT
            : DistanceMetric.COSINE;
        tool = createForgetSimilarTool(collection, customDescription, embeddings, vectorStore, distanceMetric, threshold, dryRun);
        break;
      }

      case 'lookup': {
        const idFormatHint = this.getNodeParameter('idFormatHint', 0, '') as string;
        const includeMetadata = this.getNodeParameter('includeMetadata', 0, true) as boolean;
        const includeTimestamps = this.getNodeParameter('includeTimestamps', 0, true) as boolean;
        tool = createLookupTool(collection, customDescription, vectorStore, idFormatHint, includeMetadata, includeTimestamps);
        break;
      }

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }

    return { response: tool };
  }

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    return [this.getInputData()];
  }
}
