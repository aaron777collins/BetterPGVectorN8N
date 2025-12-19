/**
 * PGVector Store Tool - AI Agent tool for vector store operations
 * Intuitive operations: Remember, Recall, Forget, Lookup
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

interface EmbeddingsModel {
  embedQuery(text: string): Promise<number[]>;
}

// REMEMBER: Store information in the knowledge base
function createRememberTool(
  collection: string,
  description: string,
  embeddings: EmbeddingsModel,
  vectorStore: VectorStoreOperations
): DynamicStructuredTool {
  const toolDescription = description ||
    `Remember/store information in the "${collection}" knowledge base. Use this to save new information that should be recalled later. You can optionally provide an ID to update existing information.`;

  return new DynamicStructuredTool({
    name: `remember_${collection.replace(/[^a-zA-Z0-9_]/g, '_')}`,
    description: toolDescription,
    schema: z.object({
      content: z.string().describe('The information/text to remember'),
      id: z.string().optional().describe('Optional ID for this memory (use to update existing entries)'),
      metadata: z.record(z.unknown()).optional().describe('Optional metadata tags (e.g., {category: "meeting", date: "2024-01"})'),
    }),
    func: async ({ content, id, metadata }) => {
      try {
        const embedding = await embeddings.embedQuery(content);

        const result = await vectorStore.upsert({
          collection,
          content,
          embedding,
          externalId: id,
          metadata: (metadata || {}) as Record<string, unknown>,
        });

        const action = result.operation === 'insert' ? 'Remembered' : 'Updated';
        return `${action} successfully! ID: ${result.externalId || result.id}`;
      } catch (error) {
        return `Failed to remember: ${(error as Error).message}`;
      }
    },
  });
}

// RECALL: Search for similar information
function createRecallTool(
  collection: string,
  description: string,
  embeddings: EmbeddingsModel,
  vectorStore: VectorStoreOperations,
  topK: number,
  distanceMetric: DistanceMetric
): DynamicStructuredTool {
  const toolDescription = description ||
    `Recall/search for information in the "${collection}" knowledge base. Returns the ${topK} most relevant results based on semantic similarity.`;

  return new DynamicStructuredTool({
    name: `recall_${collection.replace(/[^a-zA-Z0-9_]/g, '_')}`,
    description: toolDescription,
    schema: z.object({
      query: z.string().describe('What to search for (natural language)'),
      filter: z.record(z.unknown()).optional().describe('Optional metadata filter (e.g., {category: "meeting"})'),
    }),
    func: async ({ query, filter }) => {
      try {
        const queryEmbedding = await embeddings.embedQuery(query);

        const result = await vectorStore.query({
          collection,
          embedding: queryEmbedding,
          topK,
          distanceMetric,
          metadataFilter: filter as Record<string, unknown>,
          includeEmbedding: false,
        });

        if (result.rows.length === 0) {
          return `No relevant information found for: "${query}"`;
        }

        const formatted = result.rows.map((row, i) => {
          const lines = [`[${i + 1}] (relevance: ${(1 - row.score).toFixed(2)})`];
          if (row.content) lines.push(row.content);
          if (row.externalId) lines.push(`ID: ${row.externalId}`);
          if (Object.keys(row.metadata).length > 0) {
            lines.push(`Tags: ${JSON.stringify(row.metadata)}`);
          }
          return lines.join('\n');
        });

        return `Found ${result.rows.length} results:\n\n${formatted.join('\n\n')}`;
      } catch (error) {
        return `Failed to recall: ${(error as Error).message}`;
      }
    },
  });
}

// FORGET: Delete information (by ID or by concept similarity)
function createForgetTool(
  collection: string,
  description: string,
  embeddings: EmbeddingsModel,
  vectorStore: VectorStoreOperations,
  distanceMetric: DistanceMetric
): DynamicStructuredTool {
  const toolDescription = description ||
    `Forget/delete information from the "${collection}" knowledge base. Can delete by exact ID, or by concept (finds and deletes similar entries above a similarity threshold).`;

  return new DynamicStructuredTool({
    name: `forget_${collection.replace(/[^a-zA-Z0-9_]/g, '_')}`,
    description: toolDescription,
    schema: z.object({
      id: z.string().optional().describe('Exact ID of the entry to delete'),
      concept: z.string().optional().describe('Delete entries similar to this concept/text'),
      threshold: z.number().min(0).max(1).optional().describe('Similarity threshold for concept deletion (0-1, default 0.8). Higher = stricter matching.'),
      dryRun: z.boolean().optional().describe('If true, shows what would be deleted without actually deleting'),
    }),
    func: async ({ id, concept, threshold = 0.8, dryRun = false }) => {
      try {
        // Delete by exact ID
        if (id) {
          if (dryRun) {
            const existing = await vectorStore.get({ collection, externalId: id });
            if (existing.rows.length === 0) {
              return `Dry run: No entry found with ID "${id}"`;
            }
            return `Dry run: Would delete entry with ID "${id}":\n${existing.rows[0].content?.substring(0, 200)}...`;
          }

          const result = await vectorStore.delete({ collection, externalId: id });
          if (result.deletedCount === 0) {
            return `No entry found with ID "${id}"`;
          }
          return `Forgot entry with ID "${id}"`;
        }

        // Delete by concept similarity
        if (concept) {
          const queryEmbedding = await embeddings.embedQuery(concept);

          // Find similar entries
          const similar = await vectorStore.query({
            collection,
            embedding: queryEmbedding,
            topK: 100, // Check up to 100 entries
            distanceMetric,
            includeEmbedding: false,
          });

          // Filter by threshold (score is distance, lower = more similar)
          // Convert threshold to distance: threshold 0.8 means distance < 0.2
          const maxDistance = 1 - threshold;
          const toDelete = similar.rows.filter(row => row.score <= maxDistance);

          if (toDelete.length === 0) {
            return `No entries found similar enough to "${concept}" (threshold: ${threshold})`;
          }

          if (dryRun) {
            const preview = toDelete.slice(0, 5).map((row, i) =>
              `${i + 1}. [similarity: ${(1 - row.score).toFixed(2)}] ${row.content?.substring(0, 100)}...`
            ).join('\n');
            return `Dry run: Would delete ${toDelete.length} entries:\n${preview}${toDelete.length > 5 ? `\n...and ${toDelete.length - 5} more` : ''}`;
          }

          // Delete all matching entries
          let deletedCount = 0;
          for (const row of toDelete) {
            if (row.externalId) {
              const result = await vectorStore.delete({ collection, externalId: row.externalId });
              deletedCount += result.deletedCount;
            } else {
              const result = await vectorStore.delete({ id: row.id });
              deletedCount += result.deletedCount;
            }
          }

          return `Forgot ${deletedCount} entries similar to "${concept}"`;
        }

        return 'Please provide either an ID or a concept to forget';
      } catch (error) {
        return `Failed to forget: ${(error as Error).message}`;
      }
    },
  });
}

// LOOKUP: Get specific entry by ID
function createLookupTool(
  collection: string,
  description: string,
  vectorStore: VectorStoreOperations
): DynamicStructuredTool {
  const toolDescription = description ||
    `Look up a specific entry by its ID from the "${collection}" knowledge base.`;

  return new DynamicStructuredTool({
    name: `lookup_${collection.replace(/[^a-zA-Z0-9_]/g, '_')}`,
    description: toolDescription,
    schema: z.object({
      id: z.string().describe('The ID of the entry to retrieve'),
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
        const lines = [`Entry found (ID: ${doc.externalId || doc.id}):`];
        if (doc.content) lines.push(`\nContent:\n${doc.content}`);
        if (Object.keys(doc.metadata).length > 0) {
          lines.push(`\nTags: ${JSON.stringify(doc.metadata)}`);
        }
        lines.push(`\nCreated: ${doc.createdAt}`);

        return lines.join('');
      } catch (error) {
        return `Failed to lookup: ${(error as Error).message}`;
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
    description: 'AI Agent tool for knowledge base operations - Remember, Recall, Forget, Lookup',
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
            description: 'Search for similar information in the knowledge base',
          },
          {
            name: 'Remember (Store)',
            value: 'remember',
            description: 'Store new information (with optional ID for updates)',
          },
          {
            name: 'Forget (Delete)',
            value: 'forget',
            description: 'Delete by ID or by concept similarity',
          },
          {
            name: 'Lookup (Get by ID)',
            value: 'lookup',
            description: 'Retrieve a specific entry by its ID',
          },
        ],
      },
      {
        displayName: 'Collection',
        name: 'collection',
        type: 'string',
        default: 'knowledge',
        required: true,
        description: 'Name of the knowledge base collection',
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
      {
        displayName: 'Top K Results',
        name: 'topK',
        type: 'number',
        default: 5,
        description: 'Number of results to return',
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
            operation: ['recall', 'forget'],
          },
        },
      },
    ],
  };

  async supplyData(this: ISupplyDataFunctions): Promise<SupplyData> {
    const operation = this.getNodeParameter('operation', 0) as string;
    const collection = this.getNodeParameter('collection', 0) as string;
    const customDescription = this.getNodeParameter('toolDescription', 0, '') as string;

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

    const pgVector = new PgVectorManager(dbManager);
    const vectorStore = new VectorStoreOperations(dbManager, pgVector);

    const distanceMetricStr = this.getNodeParameter('distanceMetric', 0, 'cosine') as string;
    const distanceMetric = distanceMetricStr === 'l2'
      ? DistanceMetric.L2
      : distanceMetricStr === 'inner_product'
        ? DistanceMetric.INNER_PRODUCT
        : DistanceMetric.COSINE;

    let tool: DynamicStructuredTool;

    switch (operation) {
      case 'remember':
        tool = createRememberTool(collection, customDescription, embeddings, vectorStore);
        break;
      case 'recall': {
        const topK = this.getNodeParameter('topK', 0, 5) as number;
        tool = createRecallTool(collection, customDescription, embeddings, vectorStore, topK, distanceMetric);
        break;
      }
      case 'forget':
        tool = createForgetTool(collection, customDescription, embeddings, vectorStore, distanceMetric);
        break;
      case 'lookup':
        tool = createLookupTool(collection, customDescription, vectorStore);
        break;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }

    return { response: tool };
  }

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    return [this.getInputData()];
  }
}
