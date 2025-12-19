import { DatabaseManager, DatabaseConfig } from '../lib/db';
import { PgVectorManager, DistanceMetric, IndexType } from '../lib/pgvector';
import { VectorStoreOperations } from '../lib/vectorstore';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export interface McpServerInfo {
  name: string;
  version: string;
  description: string;
}

interface McpServerConfig extends DatabaseConfig {}

export class PgVectorMcpServer {
  private dbManager: DatabaseManager;
  private pgvectorManager: PgVectorManager;
  private vectorStore: VectorStoreOperations;

  constructor(config: McpServerConfig) {
    // Validate config
    if (!config.host || !config.database || !config.user) {
      throw new Error('Missing required database configuration: host, database, user are required');
    }

    this.dbManager = new DatabaseManager(config);
    this.pgvectorManager = new PgVectorManager(this.dbManager);
    this.vectorStore = new VectorStoreOperations(this.dbManager, this.pgvectorManager);
  }

  getServerInfo(): McpServerInfo {
    return {
      name: 'pgvector-advanced',
      version: '1.0.5',
      description: 'Advanced PGVector operations for AI agents - full CRUD control over vector embeddings',
    };
  }

  listTools(): McpToolDefinition[] {
    return [
      {
        name: 'pgvector_upsert',
        description: 'Insert or update embeddings in the vector store. Supports both single and batch operations.',
        inputSchema: {
          type: 'object',
          properties: {
            collection: {
              type: 'string',
              description: 'Collection name to organize embeddings',
            },
            embedding: {
              type: 'array',
              items: { type: 'number' },
              description: 'Vector embedding array',
            },
            externalId: {
              type: 'string',
              description: 'External ID for stable references (enables upsert by external ID)',
            },
            content: {
              type: 'string',
              description: 'Original text content',
            },
            metadata: {
              type: 'object',
              description: 'Custom metadata as JSON object',
            },
            id: {
              type: 'string',
              description: 'Internal UUID (auto-generated if not provided)',
            },
          },
          required: ['collection', 'embedding'],
        },
      },
      {
        name: 'pgvector_query',
        description: 'Search for similar embeddings using vector similarity. Supports filtering and pagination.',
        inputSchema: {
          type: 'object',
          properties: {
            collection: {
              type: 'string',
              description: 'Collection to search in',
            },
            queryEmbedding: {
              type: 'array',
              items: { type: 'number' },
              description: 'Query vector to find similar embeddings',
            },
            topK: {
              type: 'number',
              description: 'Number of results to return (default: 10)',
              default: 10,
            },
            offset: {
              type: 'number',
              description: 'Number of results to skip (for pagination)',
              default: 0,
            },
            distanceMetric: {
              type: 'string',
              enum: ['cosine', 'l2', 'inner_product'],
              description: 'Distance metric for similarity (default: cosine)',
              default: 'cosine',
            },
            metadataFilter: {
              type: 'object',
              description: 'Filter results by metadata fields',
            },
            includeEmbedding: {
              type: 'boolean',
              description: 'Include embedding vectors in results',
              default: false,
            },
          },
          required: ['collection', 'queryEmbedding'],
        },
      },
      {
        name: 'pgvector_delete',
        description: 'Delete embeddings by ID, external ID, or metadata filter.',
        inputSchema: {
          type: 'object',
          properties: {
            collection: {
              type: 'string',
              description: 'Collection to delete from',
            },
            deleteBy: {
              type: 'string',
              enum: ['id', 'externalId', 'metadata'],
              description: 'How to identify records to delete',
            },
            ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'UUIDs to delete (when deleteBy=id)',
            },
            externalIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'External IDs to delete (when deleteBy=externalId)',
            },
            metadataFilter: {
              type: 'object',
              description: 'Metadata filter for deletion (when deleteBy=metadata)',
            },
          },
          required: ['deleteBy'],
        },
      },
      {
        name: 'pgvector_get',
        description: 'Retrieve specific embeddings by ID or external ID.',
        inputSchema: {
          type: 'object',
          properties: {
            collection: {
              type: 'string',
              description: 'Collection to get from',
            },
            getBy: {
              type: 'string',
              enum: ['id', 'externalId'],
              description: 'How to identify records to get',
            },
            ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'UUIDs to get (when getBy=id)',
            },
            externalIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'External IDs to get (when getBy=externalId)',
            },
            includeEmbedding: {
              type: 'boolean',
              description: 'Include embedding vectors in results',
              default: false,
            },
          },
          required: ['getBy'],
        },
      },
      {
        name: 'pgvector_admin',
        description: 'Administrative operations: ensure schema, create indexes, drop collections.',
        inputSchema: {
          type: 'object',
          properties: {
            operation: {
              type: 'string',
              enum: ['ensureSchema', 'createIndex', 'dropCollection'],
              description: 'Admin operation to perform',
            },
            dimensions: {
              type: 'number',
              description: 'Embedding dimensions (for ensureSchema)',
            },
            collection: {
              type: 'string',
              description: 'Collection name (for createIndex, dropCollection)',
            },
            indexType: {
              type: 'string',
              enum: ['hnsw', 'ivfflat'],
              description: 'Vector index type (for createIndex)',
            },
            distanceMetric: {
              type: 'string',
              enum: ['cosine', 'l2', 'inner_product'],
              description: 'Distance metric (for createIndex)',
            },
          },
          required: ['operation'],
        },
      },
    ];
  }

  async callTool(name: string, args: Record<string, any>): Promise<McpToolResult> {
    try {
      switch (name) {
        case 'pgvector_upsert':
          return await this.handleUpsert(args);
        case 'pgvector_query':
          return await this.handleQuery(args);
        case 'pgvector_delete':
          return await this.handleDelete(args);
        case 'pgvector_get':
          return await this.handleGet(args);
        case 'pgvector_admin':
          return await this.handleAdmin(args);
        default:
          return this.errorResult(`Unknown tool: ${name}`);
      }
    } catch (error: any) {
      return this.errorResult(error.message || 'Unknown error');
    }
  }

  private async handleUpsert(args: Record<string, any>): Promise<McpToolResult> {
    // Validate required fields
    if (!args.collection) {
      return this.errorResult('Missing required field: collection');
    }
    if (!args.embedding) {
      return this.errorResult('Missing required field: embedding');
    }
    if (!Array.isArray(args.embedding)) {
      return this.errorResult('Invalid embedding: must be an array of numbers');
    }

    const result = await this.vectorStore.upsert({
      collection: args.collection,
      embedding: args.embedding,
      externalId: args.externalId,
      content: args.content,
      metadata: args.metadata || {},
      id: args.id,
    });

    return this.successResult({ success: true, id: result.id, externalId: result.externalId });
  }

  private async handleQuery(args: Record<string, any>): Promise<McpToolResult> {
    // Validate required fields
    if (!args.collection) {
      return this.errorResult('Missing required field: collection');
    }
    if (!args.queryEmbedding) {
      return this.errorResult('Missing required field: queryEmbedding');
    }
    if (!Array.isArray(args.queryEmbedding)) {
      return this.errorResult('Invalid queryEmbedding: must be an array of numbers');
    }

    // Validate optional fields
    if (args.distanceMetric && !['cosine', 'l2', 'inner_product'].includes(args.distanceMetric)) {
      return this.errorResult('Invalid distanceMetric: must be cosine, l2, or inner_product');
    }
    if (args.topK !== undefined && (typeof args.topK !== 'number' || args.topK < 1)) {
      return this.errorResult('Invalid topK: must be a positive number');
    }

    const distanceMetric = args.distanceMetric === 'l2'
      ? DistanceMetric.L2
      : args.distanceMetric === 'inner_product'
        ? DistanceMetric.INNER_PRODUCT
        : DistanceMetric.COSINE;

    const queryResult = await this.vectorStore.query({
      collection: args.collection,
      embedding: args.queryEmbedding,
      topK: args.topK || 10,
      offset: args.offset || 0,
      distanceMetric,
      metadataFilter: args.metadataFilter,
      includeEmbedding: args.includeEmbedding || false,
    });

    return this.successResult({ results: queryResult.rows });
  }

  private async handleDelete(args: Record<string, any>): Promise<McpToolResult> {
    if (!args.deleteBy) {
      return this.errorResult('Missing required field: deleteBy');
    }

    let deleteResult;

    switch (args.deleteBy) {
      case 'id':
        if (!args.ids || !Array.isArray(args.ids)) {
          return this.errorResult('Missing or invalid ids array for deleteBy=id');
        }
        deleteResult = await this.vectorStore.delete({ id: args.ids });
        break;

      case 'externalId':
        if (!args.collection) {
          return this.errorResult('Missing collection for deleteBy=externalId');
        }
        if (!args.externalIds || !Array.isArray(args.externalIds)) {
          return this.errorResult('Missing or invalid externalIds array for deleteBy=externalId');
        }
        deleteResult = await this.vectorStore.delete({
          collection: args.collection,
          externalId: args.externalIds,
        });
        break;

      case 'metadata':
        if (!args.collection) {
          return this.errorResult('Missing collection for deleteBy=metadata');
        }
        if (!args.metadataFilter) {
          return this.errorResult('Missing metadataFilter for deleteBy=metadata');
        }
        deleteResult = await this.vectorStore.delete({
          collection: args.collection,
          metadataFilter: args.metadataFilter,
        });
        break;

      default:
        return this.errorResult('Invalid deleteBy: must be id, externalId, or metadata');
    }

    return this.successResult({ deleted: deleteResult.deletedCount });
  }

  private async handleGet(args: Record<string, any>): Promise<McpToolResult> {
    if (!args.getBy) {
      return this.errorResult('Missing required field: getBy');
    }

    let getResult;

    switch (args.getBy) {
      case 'id':
        if (!args.ids || !Array.isArray(args.ids)) {
          return this.errorResult('Missing or invalid ids array for getBy=id');
        }
        getResult = await this.vectorStore.get({
          id: args.ids,
          includeEmbedding: args.includeEmbedding || false,
        });
        break;

      case 'externalId':
        if (!args.collection) {
          return this.errorResult('Missing collection for getBy=externalId');
        }
        if (!args.externalIds || !Array.isArray(args.externalIds)) {
          return this.errorResult('Missing or invalid externalIds array for getBy=externalId');
        }
        getResult = await this.vectorStore.get({
          collection: args.collection,
          externalId: args.externalIds,
          includeEmbedding: args.includeEmbedding || false,
        });
        break;

      default:
        return this.errorResult('Invalid getBy: must be id or externalId');
    }

    return this.successResult({ results: getResult.rows });
  }

  private async handleAdmin(args: Record<string, any>): Promise<McpToolResult> {
    if (!args.operation) {
      return this.errorResult('Missing required field: operation');
    }

    switch (args.operation) {
      case 'ensureSchema':
        const dimensions = args.dimensions || 1536;
        await this.pgvectorManager.ensureExtension();
        await this.pgvectorManager.ensureTable(dimensions);
        return this.successResult({ success: true, operation: 'ensureSchema', dimensions });

      case 'createIndex':
        if (!args.collection) {
          return this.errorResult('Missing collection for createIndex');
        }
        const indexType = args.indexType === 'ivfflat' ? IndexType.IVFFLAT : IndexType.HNSW;
        const distanceMetric = args.distanceMetric === 'l2'
          ? DistanceMetric.L2
          : args.distanceMetric === 'inner_product'
            ? DistanceMetric.INNER_PRODUCT
            : DistanceMetric.COSINE;
        await this.pgvectorManager.ensureIndex(args.collection, indexType, distanceMetric);
        return this.successResult({ success: true, operation: 'createIndex', collection: args.collection });

      case 'dropCollection':
        if (!args.collection) {
          return this.errorResult('Missing collection for dropCollection');
        }
        const dropResult = await this.pgvectorManager.dropCollection(args.collection);
        return this.successResult({
          success: true,
          operation: 'dropCollection',
          collection: args.collection,
          deletedCount: dropResult.deletedCount,
        });

      default:
        return this.errorResult('Invalid operation: must be ensureSchema, createIndex, or dropCollection');
    }
  }

  private successResult(data: any): McpToolResult {
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      isError: false,
    };
  }

  private errorResult(message: string): McpToolResult {
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }

  async close(): Promise<void> {
    await this.dbManager.close();
  }
}
