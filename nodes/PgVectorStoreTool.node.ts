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
  updateThreshold: number
): DynamicStructuredTool {
  const toolDescription = description ||
    `Store information in the "${collection}" knowledge base. Provide ID to update by ID, or updateSimilar to find and update similar entry.`;

  return new DynamicStructuredTool({
    name: `remember_${collection.replace(/[^a-zA-Z0-9_]/g, '_')}`,
    description: toolDescription,
    schema: z.object({
      content: z.string().describe('The information to store'),
      id: z.string().optional().describe('ID to update (if you know the exact ID)'),
      updateSimilar: z.string().optional().describe('Find entry similar to this and update it'),
      metadata: z.record(z.unknown()).optional().describe('Tags like {category: "meeting"}'),
    }),
    func: async ({ content, id, updateSimilar, metadata }) => {
      try {
        const embedding = await embeddings.embedQuery(content);

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
            content,
            embedding,
            externalId: match.externalId || undefined,
            id: match.externalId ? undefined : match.id,
            metadata: (metadata || match.metadata) as Record<string, unknown>,
          });

          return `Updated entry (similarity: ${similarity.toFixed(2)}). ID: ${result.externalId || result.id}`;
        }

        // Standard upsert by ID
        const result = await vectorStore.upsert({
          collection,
          content,
          embedding,
          externalId: id,
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
      query: z.string().describe('What to search for'),
      filter: z.record(z.unknown()).optional().describe('Filter by metadata, e.g. {category: "meeting"}'),
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

        // Filter by minimum similarity (score is distance, lower = more similar)
        const maxDistance = 1 - minSimilarity;
        const filtered = result.rows.filter(row => row.score <= maxDistance);

        if (filtered.length === 0) {
          return `No results found for: "${query}"`;
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
  vectorStore: VectorStoreOperations
): DynamicStructuredTool {
  const toolDescription = description ||
    `Delete an entry from the "${collection}" knowledge base by its exact ID.`;

  return new DynamicStructuredTool({
    name: `forget_${collection.replace(/[^a-zA-Z0-9_]/g, '_')}`,
    description: toolDescription,
    schema: z.object({
      id: z.string().describe('The exact ID of the entry to delete'),
    }),
    func: async ({ id }) => {
      try {
        const result = await vectorStore.delete({ collection, externalId: id });

        if (result.deletedCount === 0) {
          return `No entry found with ID "${id}"`;
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
      concept: z.string().describe('Delete entries similar to this concept'),
    }),
    func: async ({ concept }) => {
      try {
        const queryEmbedding = await embeddings.embedQuery(concept);

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
          return `No entries found similar to "${concept}" (threshold: ${threshold})`;
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

        return `Deleted ${deletedCount} entries similar to "${concept}"`;
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
  vectorStore: VectorStoreOperations
): DynamicStructuredTool {
  const toolDescription = description ||
    `Get a specific entry from the "${collection}" knowledge base by its ID.`;

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
        const lines = [`Entry ID: ${doc.externalId || doc.id}`];
        if (doc.content) lines.push(`\nContent:\n${doc.content}`);
        if (Object.keys(doc.metadata).length > 0) {
          lines.push(`\nTags: ${JSON.stringify(doc.metadata)}`);
        }
        lines.push(`\nCreated: ${doc.createdAt}`);

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

    let tool: DynamicStructuredTool;

    switch (operation) {
      case 'remember': {
        const updateThreshold = this.getNodeParameter('updateThreshold', 0, 0.7) as number;
        const distanceMetricStr = this.getNodeParameter('distanceMetric', 0, 'cosine') as string;
        const distanceMetric = distanceMetricStr === 'l2'
          ? DistanceMetric.L2
          : distanceMetricStr === 'inner_product'
            ? DistanceMetric.INNER_PRODUCT
            : DistanceMetric.COSINE;
        tool = createRememberTool(collection, customDescription, embeddings, vectorStore, distanceMetric, updateThreshold);
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

      case 'forget':
        tool = createForgetTool(collection, customDescription, vectorStore);
        break;

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
