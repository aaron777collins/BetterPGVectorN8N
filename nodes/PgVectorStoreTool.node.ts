/**
 * PGVector Store Tool - AI Agent tool for vector store operations
 * Allows AI agents in n8n to search, store, and manage vector embeddings
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

// Type for embeddings model interface
interface EmbeddingsModel {
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(texts: string[]): Promise<number[][]>;
}

// Helper to create a query tool
function createQueryTool(
  collection: string,
  customDescription: string,
  embeddings: EmbeddingsModel,
  vectorStore: VectorStoreOperations,
  topK: number,
  distanceMetric: DistanceMetric,
  includeContent: boolean
): DynamicStructuredTool {
  const description = customDescription ||
    `Search the "${collection}" collection for documents similar to the query. Returns the ${topK} most relevant results with similarity scores.`;

  return new DynamicStructuredTool({
    name: `search_${collection.replace(/[^a-zA-Z0-9_]/g, '_')}`,
    description,
    schema: z.object({
      queryText: z.string().describe('The text to search for similar documents'),
      filterMetadata: z.record(z.unknown()).optional().describe('Optional metadata filter as key-value pairs'),
    }),
    func: async ({ queryText, filterMetadata }) => {
      try {
        const queryEmbedding = await embeddings.embedQuery(queryText);

        const result = await vectorStore.query({
          collection,
          embedding: queryEmbedding,
          topK,
          distanceMetric,
          metadataFilter: filterMetadata as Record<string, unknown>,
          includeEmbedding: false,
        });

        if (result.rows.length === 0) {
          return `No results found in "${collection}" for the query.`;
        }

        const formattedResults = result.rows.map((row, idx) => {
          const parts = [`Result ${idx + 1} (score: ${row.score.toFixed(4)}):`];
          if (includeContent && row.content) {
            parts.push(`Content: ${row.content}`);
          }
          if (Object.keys(row.metadata).length > 0) {
            parts.push(`Metadata: ${JSON.stringify(row.metadata)}`);
          }
          parts.push(`ID: ${row.externalId || row.id}`);
          return parts.join('\n');
        });

        return `Found ${result.rows.length} results:\n\n${formattedResults.join('\n\n')}`;
      } catch (error) {
        return `Error searching vector store: ${(error as Error).message}`;
      }
    },
  });
}

// Helper to create an upsert tool
function createUpsertTool(
  collection: string,
  customDescription: string,
  embeddings: EmbeddingsModel,
  vectorStore: VectorStoreOperations
): DynamicStructuredTool {
  const description = customDescription ||
    `Store a document in the "${collection}" collection. The document will be embedded and stored for later similarity search.`;

  return new DynamicStructuredTool({
    name: `store_in_${collection.replace(/[^a-zA-Z0-9_]/g, '_')}`,
    description,
    schema: z.object({
      content: z.string().describe('The text content of the document to store'),
      externalId: z.string().optional().describe('Optional unique identifier for the document (for updates)'),
      metadata: z.record(z.unknown()).optional().describe('Optional metadata as key-value pairs'),
    }),
    func: async ({ content, externalId, metadata }) => {
      try {
        const embedding = await embeddings.embedQuery(content);

        const result = await vectorStore.upsert({
          collection,
          content,
          embedding,
          externalId,
          metadata: (metadata || {}) as Record<string, unknown>,
        });

        return `Document ${result.operation === 'insert' ? 'stored' : 'updated'} successfully. ID: ${result.id}${result.externalId ? `, External ID: ${result.externalId}` : ''}`;
      } catch (error) {
        return `Error storing document: ${(error as Error).message}`;
      }
    },
  });
}

// Helper to create a delete tool
function createDeleteTool(
  collection: string,
  customDescription: string,
  vectorStore: VectorStoreOperations
): DynamicStructuredTool {
  const description = customDescription ||
    `Delete documents from the "${collection}" collection by their external ID.`;

  return new DynamicStructuredTool({
    name: `delete_from_${collection.replace(/[^a-zA-Z0-9_]/g, '_')}`,
    description,
    schema: z.object({
      externalId: z.string().describe('The external ID of the document to delete'),
    }),
    func: async ({ externalId }) => {
      try {
        const result = await vectorStore.delete({
          collection,
          externalId,
        });

        if (result.deletedCount === 0) {
          return `No document found with external ID "${externalId}" in "${collection}".`;
        }

        return `Successfully deleted ${result.deletedCount} document(s) with external ID "${externalId}".`;
      } catch (error) {
        return `Error deleting document: ${(error as Error).message}`;
      }
    },
  });
}

// Helper to create a get tool
function createGetTool(
  collection: string,
  customDescription: string,
  vectorStore: VectorStoreOperations
): DynamicStructuredTool {
  const description = customDescription ||
    `Retrieve a specific document from the "${collection}" collection by its external ID.`;

  return new DynamicStructuredTool({
    name: `get_from_${collection.replace(/[^a-zA-Z0-9_]/g, '_')}`,
    description,
    schema: z.object({
      externalId: z.string().describe('The external ID of the document to retrieve'),
    }),
    func: async ({ externalId }) => {
      try {
        const result = await vectorStore.get({
          collection,
          externalId,
          includeEmbedding: false,
        });

        if (result.rows.length === 0) {
          return `No document found with external ID "${externalId}" in "${collection}".`;
        }

        const doc = result.rows[0];
        const parts = [
          `Document found:`,
          `ID: ${doc.id}`,
          `External ID: ${doc.externalId}`,
        ];

        if (doc.content) {
          parts.push(`Content: ${doc.content}`);
        }

        if (Object.keys(doc.metadata).length > 0) {
          parts.push(`Metadata: ${JSON.stringify(doc.metadata)}`);
        }

        parts.push(`Created: ${doc.createdAt}`);
        parts.push(`Updated: ${doc.updatedAt}`);

        return parts.join('\n');
      } catch (error) {
        return `Error retrieving document: ${(error as Error).message}`;
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
    description: 'AI Agent tool for vector store operations - search, store, and manage embeddings',
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
        default: 'query',
        options: [
          {
            name: 'Query (Similarity Search)',
            value: 'query',
            description: 'Search for similar documents in the vector store',
          },
          {
            name: 'Upsert (Store Document)',
            value: 'upsert',
            description: 'Store or update a document in the vector store',
          },
          {
            name: 'Delete',
            value: 'delete',
            description: 'Delete documents from the vector store',
          },
          {
            name: 'Get',
            value: 'get',
            description: 'Retrieve specific documents by ID',
          },
        ],
      },
      {
        displayName: 'Collection',
        name: 'collection',
        type: 'string',
        default: 'documents',
        required: true,
        description: 'The collection name to operate on',
      },
      {
        displayName: 'Tool Description',
        name: 'toolDescription',
        type: 'string',
        default: '',
        description: 'Description for the AI to understand when to use this tool. Leave empty for auto-generated description.',
        typeOptions: {
          rows: 3,
        },
      },
      {
        displayName: 'Top K Results',
        name: 'topK',
        type: 'number',
        default: 10,
        description: 'Number of results to return for similarity search',
        displayOptions: {
          show: {
            operation: ['query'],
          },
        },
      },
      {
        displayName: 'Distance Metric',
        name: 'distanceMetric',
        type: 'options',
        default: 'cosine',
        options: [
          { name: 'Cosine', value: 'cosine' },
          { name: 'L2 (Euclidean)', value: 'l2' },
          { name: 'Inner Product', value: 'inner_product' },
        ],
        displayOptions: {
          show: {
            operation: ['query'],
          },
        },
      },
      {
        displayName: 'Include Content in Results',
        name: 'includeContent',
        type: 'boolean',
        default: true,
        description: 'Whether to include document content in search results',
        displayOptions: {
          show: {
            operation: ['query'],
          },
        },
      },
    ],
  };

  async supplyData(this: ISupplyDataFunctions): Promise<SupplyData> {
    const operation = this.getNodeParameter('operation', 0) as string;
    const collection = this.getNodeParameter('collection', 0) as string;
    const customDescription = this.getNodeParameter('toolDescription', 0, '') as string;

    // Get credentials
    const credentials = await this.getCredentials('postgres');

    // Get connected embeddings model
    const embeddingsInput = await this.getInputConnectionData('ai_embedding' as never, 0);

    if (!embeddingsInput) {
      throw new Error('An embeddings model must be connected to use this tool');
    }

    const embeddings = embeddingsInput as unknown as EmbeddingsModel;

    // Initialize database connection
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

    // Create the appropriate tool based on operation
    let tool: DynamicStructuredTool;

    switch (operation) {
      case 'query': {
        const topK = this.getNodeParameter('topK', 0, 10) as number;
        const distanceMetricStr = this.getNodeParameter('distanceMetric', 0, 'cosine') as string;
        const includeContent = this.getNodeParameter('includeContent', 0, true) as boolean;

        const distanceMetric = distanceMetricStr === 'l2'
          ? DistanceMetric.L2
          : distanceMetricStr === 'inner_product'
            ? DistanceMetric.INNER_PRODUCT
            : DistanceMetric.COSINE;

        tool = createQueryTool(collection, customDescription, embeddings, vectorStore, topK, distanceMetric, includeContent);
        break;
      }
      case 'upsert':
        tool = createUpsertTool(collection, customDescription, embeddings, vectorStore);
        break;
      case 'delete':
        tool = createDeleteTool(collection, customDescription, vectorStore);
        break;
      case 'get':
        tool = createGetTool(collection, customDescription, vectorStore);
        break;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }

    return {
      response: tool,
    };
  }

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    return [items];
  }
}
