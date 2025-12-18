import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeOperationError,
} from 'n8n-workflow';

import { DatabaseManager } from '../lib/db';
import { PgVectorManager, DistanceMetric, IndexType } from '../lib/pgvector';
import { VectorStoreOperations, UpsertParams, QueryParams, DeleteParams, GetParams } from '../lib/vectorstore';

export class PgvectorVectorStore implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'PGVector Vector Store',
    name: 'pgvectorVectorStore',
    icon: 'file:pgvector.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: 'Advanced PGVector operations with full CRUD control',
    defaults: {
      name: 'PGVector Vector Store',
    },
    inputs: ['main'],
    outputs: ['main'],
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
        options: [
          {
            name: 'Upsert',
            value: 'upsert',
            description: 'Insert or update embeddings',
            action: 'Upsert embeddings',
          },
          {
            name: 'Query',
            value: 'query',
            description: 'Search similar embeddings',
            action: 'Query similar embeddings',
          },
          {
            name: 'Delete',
            value: 'delete',
            description: 'Delete embeddings',
            action: 'Delete embeddings',
          },
          {
            name: 'Get',
            value: 'get',
            description: 'Get embeddings by ID or external ID',
            action: 'Get embeddings',
          },
          {
            name: 'Admin',
            value: 'admin',
            description: 'Administrative operations',
            action: 'Perform administrative operation',
          },
        ],
        default: 'upsert',
      },

      // Collection (common to most operations)
      {
        displayName: 'Collection',
        name: 'collection',
        type: 'string',
        required: true,
        default: '',
        description: 'Collection name to organize embeddings',
        displayOptions: {
          hide: {
            operation: ['admin'],
          },
        },
      },

      // Embedding Dimensions
      {
        displayName: 'Embedding Dimensions',
        name: 'dimensions',
        type: 'number',
        required: true,
        default: 1536,
        description: 'Number of dimensions in the embedding vectors',
        displayOptions: {
          show: {
            operation: ['upsert', 'admin'],
          },
        },
      },

      // === UPSERT OPTIONS ===
      {
        displayName: 'Mode',
        name: 'upsertMode',
        type: 'options',
        options: [
          {
            name: 'Single',
            value: 'single',
            description: 'Upsert a single embedding',
          },
          {
            name: 'Batch',
            value: 'batch',
            description: 'Upsert multiple embeddings from input items',
          },
        ],
        default: 'single',
        displayOptions: {
          show: {
            operation: ['upsert'],
          },
        },
      },

      {
        displayName: 'ID',
        name: 'id',
        type: 'string',
        default: '',
        description: 'Unique ID (UUID). Leave empty to generate new ID.',
        displayOptions: {
          show: {
            operation: ['upsert'],
            upsertMode: ['single'],
          },
        },
      },

      {
        displayName: 'External ID',
        name: 'externalId',
        type: 'string',
        default: '',
        description: 'Stable external ID from upstream system',
        displayOptions: {
          show: {
            operation: ['upsert'],
            upsertMode: ['single'],
          },
        },
      },

      {
        displayName: 'Content',
        name: 'content',
        type: 'string',
        default: '',
        description: 'Text content associated with the embedding',
        displayOptions: {
          show: {
            operation: ['upsert'],
            upsertMode: ['single'],
          },
        },
      },

      {
        displayName: 'Metadata',
        name: 'metadata',
        type: 'json',
        default: '{}',
        description: 'JSON metadata associated with the embedding',
        displayOptions: {
          show: {
            operation: ['upsert'],
            upsertMode: ['single'],
          },
        },
      },

      {
        displayName: 'Embedding',
        name: 'embedding',
        type: 'json',
        required: true,
        default: '[]',
        description: 'Embedding vector as JSON array of numbers',
        displayOptions: {
          show: {
            operation: ['upsert'],
            upsertMode: ['single'],
          },
        },
      },

      {
        displayName: 'Input Field Mapping',
        name: 'fieldMapping',
        type: 'fixedCollection',
        default: {},
        placeholder: 'Add Field Mapping',
        description: 'Map input item fields to embedding properties',
        displayOptions: {
          show: {
            operation: ['upsert'],
            upsertMode: ['batch'],
          },
        },
        options: [
          {
            name: 'mappings',
            displayName: 'Mappings',
            values: [
              {
                displayName: 'ID Field',
                name: 'idField',
                type: 'string',
                default: 'id',
                description: 'Field containing the ID',
              },
              {
                displayName: 'External ID Field',
                name: 'externalIdField',
                type: 'string',
                default: 'externalId',
                description: 'Field containing the external ID',
              },
              {
                displayName: 'Content Field',
                name: 'contentField',
                type: 'string',
                default: 'content',
                description: 'Field containing the text content',
              },
              {
                displayName: 'Metadata Field',
                name: 'metadataField',
                type: 'string',
                default: 'metadata',
                description: 'Field containing the metadata object',
              },
              {
                displayName: 'Embedding Field',
                name: 'embeddingField',
                type: 'string',
                default: 'embedding',
                description: 'Field containing the embedding vector',
              },
            ],
          },
        ],
      },

      // === QUERY OPTIONS ===
      {
        displayName: 'Query Embedding',
        name: 'queryEmbedding',
        type: 'json',
        required: true,
        default: '[]',
        description: 'Query embedding vector as JSON array of numbers',
        displayOptions: {
          show: {
            operation: ['query'],
          },
        },
      },

      {
        displayName: 'Top K',
        name: 'topK',
        type: 'number',
        default: 10,
        description: 'Number of results to return',
        displayOptions: {
          show: {
            operation: ['query'],
          },
        },
      },

      {
        displayName: 'Offset',
        name: 'offset',
        type: 'number',
        default: 0,
        description: 'Number of results to skip (for pagination)',
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
        options: [
          {
            name: 'Cosine',
            value: 'cosine',
            description: 'Cosine similarity (best for normalized vectors)',
          },
          {
            name: 'L2 (Euclidean)',
            value: 'l2',
            description: 'Euclidean distance',
          },
          {
            name: 'Inner Product',
            value: 'inner_product',
            description: 'Inner product (dot product)',
          },
        ],
        default: 'cosine',
        displayOptions: {
          show: {
            operation: ['query'],
          },
        },
      },

      {
        displayName: 'Metadata Filter',
        name: 'metadataFilter',
        type: 'json',
        default: '{}',
        description: 'JSON filter for metadata (uses JSONB containment)',
        displayOptions: {
          show: {
            operation: ['query'],
          },
        },
      },

      {
        displayName: 'Include Embedding',
        name: 'includeEmbedding',
        type: 'boolean',
        default: false,
        description: 'Whether to include embedding vectors in results',
        displayOptions: {
          show: {
            operation: ['query'],
          },
        },
      },

      // === DELETE OPTIONS ===
      {
        displayName: 'Delete By',
        name: 'deleteBy',
        type: 'options',
        options: [
          {
            name: 'ID',
            value: 'id',
            description: 'Delete by UUID',
          },
          {
            name: 'External ID',
            value: 'externalId',
            description: 'Delete by external ID',
          },
          {
            name: 'Metadata Filter',
            value: 'metadata',
            description: 'Delete by metadata filter',
          },
        ],
        default: 'id',
        displayOptions: {
          show: {
            operation: ['delete'],
          },
        },
      },

      {
        displayName: 'ID(s)',
        name: 'deleteIds',
        type: 'string',
        default: '',
        description: 'Comma-separated list of UUIDs to delete',
        displayOptions: {
          show: {
            operation: ['delete'],
            deleteBy: ['id'],
          },
        },
      },

      {
        displayName: 'External ID(s)',
        name: 'deleteExternalIds',
        type: 'string',
        default: '',
        description: 'Comma-separated list of external IDs to delete',
        displayOptions: {
          show: {
            operation: ['delete'],
            deleteBy: ['externalId'],
          },
        },
      },

      {
        displayName: 'Metadata Filter',
        name: 'deleteMetadataFilter',
        type: 'json',
        default: '{}',
        description: 'JSON filter for metadata to delete matching records',
        displayOptions: {
          show: {
            operation: ['delete'],
            deleteBy: ['metadata'],
          },
        },
      },

      // === GET OPTIONS ===
      {
        displayName: 'Get By',
        name: 'getBy',
        type: 'options',
        options: [
          {
            name: 'ID',
            value: 'id',
            description: 'Get by UUID',
          },
          {
            name: 'External ID',
            value: 'externalId',
            description: 'Get by external ID',
          },
        ],
        default: 'id',
        displayOptions: {
          show: {
            operation: ['get'],
          },
        },
      },

      {
        displayName: 'ID(s)',
        name: 'getIds',
        type: 'string',
        default: '',
        description: 'Comma-separated list of UUIDs to fetch',
        displayOptions: {
          show: {
            operation: ['get'],
            getBy: ['id'],
          },
        },
      },

      {
        displayName: 'External ID(s)',
        name: 'getExternalIds',
        type: 'string',
        default: '',
        description: 'Comma-separated list of external IDs to fetch',
        displayOptions: {
          show: {
            operation: ['get'],
            getBy: ['externalId'],
          },
        },
      },

      // === ADMIN OPTIONS ===
      {
        displayName: 'Admin Operation',
        name: 'adminOperation',
        type: 'options',
        options: [
          {
            name: 'Ensure Schema',
            value: 'ensureSchema',
            description: 'Create table and indexes if they don\'t exist',
          },
          {
            name: 'Create Index',
            value: 'createIndex',
            description: 'Create vector index for a collection',
          },
          {
            name: 'Drop Collection',
            value: 'dropCollection',
            description: 'Delete all records in a collection',
          },
        ],
        default: 'ensureSchema',
        displayOptions: {
          show: {
            operation: ['admin'],
          },
        },
      },

      {
        displayName: 'Collection',
        name: 'adminCollection',
        type: 'string',
        default: '',
        description: 'Collection name for admin operations',
        displayOptions: {
          show: {
            operation: ['admin'],
            adminOperation: ['createIndex', 'dropCollection'],
          },
        },
      },

      {
        displayName: 'Index Type',
        name: 'indexType',
        type: 'options',
        options: [
          {
            name: 'HNSW',
            value: 'hnsw',
            description: 'HNSW index (faster queries, slower build)',
          },
          {
            name: 'IVFFlat',
            value: 'ivfflat',
            description: 'IVFFlat index (faster build, good for large datasets)',
          },
        ],
        default: 'hnsw',
        displayOptions: {
          show: {
            operation: ['admin'],
            adminOperation: ['createIndex'],
          },
        },
      },

      {
        displayName: 'Distance Metric',
        name: 'adminDistanceMetric',
        type: 'options',
        options: [
          {
            name: 'Cosine',
            value: 'cosine',
          },
          {
            name: 'L2',
            value: 'l2',
          },
          {
            name: 'Inner Product',
            value: 'inner_product',
          },
        ],
        default: 'cosine',
        displayOptions: {
          show: {
            operation: ['admin'],
            adminOperation: ['createIndex'],
          },
        },
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const operation = this.getNodeParameter('operation', 0) as string;

    // Get credentials
    const credentials = await this.getCredentials('postgres');

    // Initialize database connection
    const db = new DatabaseManager({
      host: credentials.host as string,
      port: credentials.port as number,
      user: credentials.user as string,
      password: credentials.password as string,
      database: credentials.database as string,
      max: (credentials.max as number) || 20,
      connectionTimeoutMillis: (credentials.connectionTimeoutMillis as number) || 5000,
      idleTimeoutMillis: (credentials.idleTimeoutMillis as number) || 30000,
    });

    const pgVector = new PgVectorManager(db);
    const vectorStore = new VectorStoreOperations(db, pgVector);

    try {
      if (operation === 'upsert') {
        const mode = this.getNodeParameter('upsertMode', 0) as string;
        const collection = this.getNodeParameter('collection', 0) as string;
        const dimensions = this.getNodeParameter('dimensions', 0) as number;

        // Ensure schema
        await pgVector.ensureExtension();
        await pgVector.ensureTable(dimensions);

        if (mode === 'single') {
          const id = this.getNodeParameter('id', 0, '') as string;
          const externalId = this.getNodeParameter('externalId', 0, '') as string;
          const content = this.getNodeParameter('content', 0, '') as string;
          const metadataStr = this.getNodeParameter('metadata', 0, '{}') as string;
          const embeddingStr = this.getNodeParameter('embedding', 0, '[]') as string;

          const metadata = JSON.parse(metadataStr);
          const embedding = JSON.parse(embeddingStr);

          if (!embeddingStr || !embedding || !Array.isArray(embedding) || embedding.length === 0) {
            throw new Error('Embedding is required and must be a non-empty array');
          }

          const params: UpsertParams = {
            collection,
            embedding,
            content: content || undefined,
            metadata,
          };

          if (id) params.id = id;
          if (externalId) params.externalId = externalId;

          const result = await vectorStore.upsert(params);
          returnData.push({ json: result as any });
        } else {
          // Batch mode
          const fieldMapping = this.getNodeParameter('fieldMapping', 0, {}) as any;
          const mappings = fieldMapping.mappings || {};

          const idField = mappings.idField || 'id';
          const externalIdField = mappings.externalIdField || 'externalId';
          const contentField = mappings.contentField || 'content';
          const metadataField = mappings.metadataField || 'metadata';
          const embeddingField = mappings.embeddingField || 'embedding';

          const upsertItems: UpsertParams[] = items.map((item: INodeExecutionData) => {
            const json = item.json;
            return {
              collection,
              id: json[idField] as string | undefined,
              externalId: json[externalIdField] as string | undefined,
              content: json[contentField] as string | undefined,
              metadata: json[metadataField] as Record<string, any> || {},
              embedding: json[embeddingField] as number[],
            };
          });

          const results = await vectorStore.upsertBatch(upsertItems);
          results.forEach((result) => returnData.push({ json: result as any }));
        }
      } else if (operation === 'query') {
        const collection = this.getNodeParameter('collection', 0) as string;
        const queryEmbeddingStr = this.getNodeParameter('queryEmbedding', 0) as string;
        const topK = this.getNodeParameter('topK', 0, 10) as number;
        const offset = this.getNodeParameter('offset', 0, 0) as number;
        const distanceMetric = this.getNodeParameter('distanceMetric', 0, 'cosine') as DistanceMetric;
        const metadataFilterStr = this.getNodeParameter('metadataFilter', 0, '{}') as string;
        const includeEmbedding = this.getNodeParameter('includeEmbedding', 0, false) as boolean;

        const queryEmbedding = JSON.parse(queryEmbeddingStr);
        const metadataFilter = JSON.parse(metadataFilterStr);

        const params: QueryParams = {
          collection,
          embedding: queryEmbedding,
          topK,
          offset,
          distanceMetric,
          includeEmbedding,
        };

        if (Object.keys(metadataFilter).length > 0) {
          params.metadataFilter = metadataFilter;
        }

        const result = await vectorStore.query(params);
        result.rows.forEach((row) => returnData.push({ json: row as any }));
      } else if (operation === 'delete') {
        const collection = this.getNodeParameter('collection', 0) as string;
        const deleteBy = this.getNodeParameter('deleteBy', 0) as string;

        const params: DeleteParams = {};

        if (deleteBy === 'id') {
          const idsStr = this.getNodeParameter('deleteIds', 0) as string;
          const ids = idsStr.split(',').map((id) => id.trim()).filter((id) => id);
          params.id = ids;
        } else if (deleteBy === 'externalId') {
          const externalIdsStr = this.getNodeParameter('deleteExternalIds', 0) as string;
          const externalIds = externalIdsStr.split(',').map((id) => id.trim()).filter((id) => id);
          params.collection = collection;
          params.externalId = externalIds;
        } else if (deleteBy === 'metadata') {
          const metadataFilterStr = this.getNodeParameter('deleteMetadataFilter', 0, '{}') as string;
          const metadataFilter = JSON.parse(metadataFilterStr);
          params.collection = collection;
          params.metadataFilter = metadataFilter;
        }

        const result = await vectorStore.delete(params);
        returnData.push({ json: result as any });
      } else if (operation === 'get') {
        const collection = this.getNodeParameter('collection', 0) as string;
        const getBy = this.getNodeParameter('getBy', 0) as string;
        const includeEmbedding = this.getNodeParameter('includeEmbedding', 0, false) as boolean;

        const params: GetParams = {
          includeEmbedding,
        };

        if (getBy === 'id') {
          const idsStr = this.getNodeParameter('getIds', 0) as string;
          const ids = idsStr.split(',').map((id) => id.trim()).filter((id) => id);
          params.id = ids;
        } else if (getBy === 'externalId') {
          const externalIdsStr = this.getNodeParameter('getExternalIds', 0) as string;
          const externalIds = externalIdsStr.split(',').map((id) => id.trim()).filter((id) => id);
          params.collection = collection;
          params.externalId = externalIds;
        }

        const result = await vectorStore.get(params);
        result.rows.forEach((row) => returnData.push({ json: row as any }));
      } else if (operation === 'admin') {
        const adminOperation = this.getNodeParameter('adminOperation', 0) as string;

        if (adminOperation === 'ensureSchema') {
          const dimensions = this.getNodeParameter('dimensions', 0) as number;
          await pgVector.ensureExtension();
          await pgVector.ensureTable(dimensions);
          await pgVector.ensureMetadataIndex();

          returnData.push({
            json: {
              success: true,
              message: `Schema ensured for ${dimensions} dimensions`,
            },
          });
        } else if (adminOperation === 'createIndex') {
          const collection = this.getNodeParameter('adminCollection', 0) as string;
          const indexType = this.getNodeParameter('indexType', 0) as string;
          const distanceMetric = this.getNodeParameter('adminDistanceMetric', 0) as string;

          // Validate indexType
          if (!Object.values(IndexType).includes(indexType as IndexType)) {
            throw new Error(`Invalid index type: ${indexType}. Must be one of: ${Object.values(IndexType).join(', ')}`);
          }

          // Validate distanceMetric
          if (!Object.values(DistanceMetric).includes(distanceMetric as DistanceMetric)) {
            throw new Error(`Invalid distance metric: ${distanceMetric}. Must be one of: ${Object.values(DistanceMetric).join(', ')}`);
          }

          await pgVector.ensureIndex(collection, indexType as IndexType, distanceMetric as DistanceMetric);

          returnData.push({
            json: {
              success: true,
              message: `Index created for collection: ${collection}`,
              indexType,
              distanceMetric,
            },
          });
        } else if (adminOperation === 'dropCollection') {
          const collection = this.getNodeParameter('adminCollection', 0) as string;

          const result = await pgVector.dropCollection(collection);

          returnData.push({
            json: {
              success: true,
              collection,
              deletedCount: result.deletedCount,
            },
          });
        }
      } else {
        throw new Error(`Invalid operation: ${operation}`);
      }

      return [returnData];
    } catch (error) {
      if (error instanceof Error) {
        throw new NodeOperationError(this.getNode(), error.message);
      }
      throw error;
    } finally {
      await db.close();
    }
  }
}
