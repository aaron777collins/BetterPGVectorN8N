/**
 * Unit Tests for PgvectorVectorStore Node
 *
 * These tests verify the node's structure, configuration, and logic in isolation
 * using mocks for all external dependencies.
 */

import { PgvectorVectorStore } from '../../nodes/PgvectorVectorStore.node';
import { createMockExecuteFunctions, mockParameters } from '../helpers/mockN8n';
import { sampleEmbedding1536 } from '../helpers/testData';

// Mock all dependencies
jest.mock('../../lib/db');
jest.mock('../../lib/pgvector');
jest.mock('../../lib/vectorstore');

import { DatabaseManager } from '../../lib/db';
import { PgVectorManager } from '../../lib/pgvector';
import { VectorStoreOperations } from '../../lib/vectorstore';

describe('PgvectorVectorStore Node - Unit Tests', () => {
  let node: PgvectorVectorStore;
  let mockDbManager: jest.Mocked<DatabaseManager>;
  let mockPgVectorManager: jest.Mocked<PgVectorManager>;
  let mockVectorStore: jest.Mocked<VectorStoreOperations>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create node instance
    node = new PgvectorVectorStore();

    // Create mock instances
    mockDbManager = {
      query: jest.fn(),
      transaction: jest.fn(),
      close: jest.fn(),
    } as any;

    mockPgVectorManager = {
      ensureExtension: jest.fn(),
      ensureTable: jest.fn(),
      ensureIndex: jest.fn(),
      ensureMetadataIndex: jest.fn(),
      dropCollection: jest.fn(),
      getDistanceOperator: jest.fn(),
      validateDimensions: jest.fn(),
      getTableName: jest.fn().mockReturnValue('embeddings'),
      getDimensions: jest.fn(),
    } as any;

    mockVectorStore = {
      upsert: jest.fn(),
      query: jest.fn(),
      delete: jest.fn(),
      get: jest.fn(),
    } as any;

    // Mock constructors
    (DatabaseManager as jest.MockedClass<typeof DatabaseManager>).mockImplementation(() => mockDbManager);
    (PgVectorManager as jest.MockedClass<typeof PgVectorManager>).mockImplementation(() => mockPgVectorManager);
    (VectorStoreOperations as jest.MockedClass<typeof VectorStoreOperations>).mockImplementation(
      () => mockVectorStore,
    );
  });

  describe('Node Description', () => {
    it('should have correct basic properties', () => {
      expect(node.description.displayName).toBe('PGVector Vector Store');
      expect(node.description.name).toBe('pgvectorVectorStore');
      expect(node.description.group).toContain('transform');
      expect(node.description.version).toBe(1);
    });

    it('should have correct inputs and outputs', () => {
      expect(node.description.inputs).toEqual(['main']);
      expect(node.description.outputs).toEqual(['main']);
    });

    it('should require postgres credentials', () => {
      const credentials = node.description.credentials;
      expect(credentials).toBeDefined();
      expect(credentials).toHaveLength(1);
      expect(credentials![0].name).toBe('postgres');
      expect(credentials![0].required).toBe(true);
    });

    it('should have operation parameter', () => {
      const properties = node.description.properties;
      const operationParam = properties.find(p => p.name === 'operation');

      expect(operationParam).toBeDefined();
      expect(operationParam!.type).toBe('options');
      expect(operationParam!.options).toHaveLength(5); // upsert, query, delete, get, admin
    });

    it('should have all required operations', () => {
      const properties = node.description.properties;
      const operationParam = properties.find(p => p.name === 'operation');
      const operations = operationParam!.options as any[];

      const operationValues = operations.map(op => op.value);
      expect(operationValues).toContain('upsert');
      expect(operationValues).toContain('query');
      expect(operationValues).toContain('delete');
      expect(operationValues).toContain('get');
      expect(operationValues).toContain('admin');
    });
  });

  describe('Upsert Operation - Unit Tests', () => {
    it('should call vectorstore.upsert for single mode', async () => {
      const params = {
        ...mockParameters.upsertSingle,
        embedding: JSON.stringify(sampleEmbedding1536),
      };

      mockVectorStore.upsert.mockResolvedValue({
        id: 'test-id',
        collection: params.collection,
        externalId: params.externalId,
        operation: 'insert',
      });

      const mockContext = createMockExecuteFunctions(params);
      await node.execute!.call(mockContext as any);

      expect(mockVectorStore.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: params.collection,
          externalId: params.externalId,
          content: params.content,
          metadata: params.metadata,
          embedding: params.embedding,
        }),
      );
    });

    it('should call vectorstore.upsert multiple times for batch mode', async () => {
      const batchData = [
        {
          id: 'id-1',
          docId: 'doc-1',
          text: 'Text 1',
          meta: { key: 'value1' },
          vector: sampleEmbedding1536,
        },
        {
          id: 'id-2',
          docId: 'doc-2',
          text: 'Text 2',
          meta: { key: 'value2' },
          vector: sampleEmbedding1536,
        },
      ];

      const params = {
        ...mockParameters.upsertBatch,
      };

      mockVectorStore.upsert.mockResolvedValue({
        id: 'test-id',
        collection: params.collection,
        operation: 'insert',
      });

      const mockContext = createMockExecuteFunctions(
        params,
        batchData.map(item => ({ json: item })),
      );

      await node.execute!.call(mockContext as any);

      expect(mockVectorStore.upsert).toHaveBeenCalledTimes(2);
    });

    it('should throw error if embedding is missing', async () => {
      const params = {
        ...mockParameters.upsertSingle,
        embedding: undefined,
      };

      const mockContext = createMockExecuteFunctions(params);

      await expect(node.execute!.call(mockContext as any)).rejects.toThrow();
    });

    it('should validate embedding is an array', async () => {
      const params = {
        ...mockParameters.upsertSingle,
        embedding: 'not-an-array',
      };

      const mockContext = createMockExecuteFunctions(params);

      await expect(node.execute!.call(mockContext as any)).rejects.toThrow();
    });
  });

  describe('Query Operation - Unit Tests', () => {
    it('should call vectorstore.query with correct parameters', async () => {
      const params = {
        ...mockParameters.query,
        queryEmbedding: JSON.stringify(sampleEmbedding1536),
      };

      mockVectorStore.query.mockResolvedValue({
        rows: [{
          id: 'result-1',
          collection: params.collection,
          score: 0.1,
          content: 'Result 1',
          metadata: {},
        }],
      });

      const mockContext = createMockExecuteFunctions(params);
      await node.execute!.call(mockContext as any);

      expect(mockVectorStore.query).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: params.collection,
          embedding: params.queryEmbedding,
          topK: params.topK,
          offset: params.offset,
          distanceMetric: params.distanceMetric,
        }),
      );
    });

    it('should include metadata filter when provided', async () => {
      const params = {
        ...mockParameters.queryWithFilter,
        queryEmbedding: JSON.stringify(sampleEmbedding1536),
      };

      mockVectorStore.query.mockResolvedValue({ rows: [] });

      const mockContext = createMockExecuteFunctions(params);
      await node.execute!.call(mockContext as any);

      expect(mockVectorStore.query).toHaveBeenCalledWith(
        expect.objectContaining({
          metadataFilter: params.metadataFilter,
        }),
      );
    });

    it('should throw error if queryEmbedding is missing', async () => {
      const params = {
        ...mockParameters.query,
        queryEmbedding: undefined,
      };

      const mockContext = createMockExecuteFunctions(params);

      await expect(node.execute!.call(mockContext as any)).rejects.toThrow();
    });

    it('should default topK to 10 if not provided', async () => {
      const params = {
        ...mockParameters.query,
        queryEmbedding: JSON.stringify(sampleEmbedding1536),
        topK: undefined,
      };

      mockVectorStore.query.mockResolvedValue({ rows: [] });

      const mockContext = createMockExecuteFunctions(params);
      await node.execute!.call(mockContext as any);

      expect(mockVectorStore.query).toHaveBeenCalledWith(
        expect.objectContaining({
          topK: 10,
        }),
      );
    });

    it('should support all distance metrics', async () => {
      const metrics = ['cosine', 'l2', 'inner_product'];

      for (const metric of metrics) {
        mockVectorStore.query.mockResolvedValue({ rows: [] });

        const params = {
          ...mockParameters.query,
          queryEmbedding: JSON.stringify(sampleEmbedding1536),
          distanceMetric: metric,
        };

        const mockContext = createMockExecuteFunctions(params);
        await node.execute!.call(mockContext as any);

        expect(mockVectorStore.query).toHaveBeenCalledWith(
          expect.objectContaining({
            distanceMetric: metric,
          }),
        );
      }
    });
  });

  describe('Delete Operation - Unit Tests', () => {
    it('should call vectorstore.delete by ID', async () => {
      const params = {
        ...mockParameters.deleteById,
      };

      mockVectorStore.delete.mockResolvedValue({ deletedCount: 1 });

      const mockContext = createMockExecuteFunctions(params);
      await node.execute!.call(mockContext as any);

      expect(mockVectorStore.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.any(Array),
        }),
      );
    });

    it('should parse comma-separated IDs correctly', async () => {
      const params = {
        ...mockParameters.deleteById,
        deleteIds: 'id-1, id-2, id-3',
      };

      mockVectorStore.delete.mockResolvedValue({ deletedCount: 3 });

      const mockContext = createMockExecuteFunctions(params);
      await node.execute!.call(mockContext as any);

      expect(mockVectorStore.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          id: ['id-1', 'id-2', 'id-3'],
        }),
      );
    });

    it('should call vectorstore.delete by external ID', async () => {
      const params = {
        ...mockParameters.deleteByExternalId,
      };

      mockVectorStore.delete.mockResolvedValue({ deletedCount: 2 });

      const mockContext = createMockExecuteFunctions(params);
      await node.execute!.call(mockContext as any);

      expect(mockVectorStore.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: params.collection,
          externalId: expect.any(Array),
        }),
      );
    });

    it('should call vectorstore.delete by metadata filter', async () => {
      const params = {
        ...mockParameters.deleteByMetadata,
      };

      mockVectorStore.delete.mockResolvedValue({ deletedCount: 1 });

      const mockContext = createMockExecuteFunctions(params);
      await node.execute!.call(mockContext as any);

      expect(mockVectorStore.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: params.collection,
          metadataFilter: params.deleteMetadataFilter,
        }),
      );
    });

    it('should return deleted count in response', async () => {
      const params = {
        ...mockParameters.deleteById,
      };

      mockVectorStore.delete.mockResolvedValue({ deletedCount: 5 });

      const mockContext = createMockExecuteFunctions(params);
      const result = await node.execute!.call(mockContext as any);

      const data = result[0].map(item => item.json);
      expect(data[0].deletedCount).toBe(5);
    });
  });

  describe('Get Operation - Unit Tests', () => {
    it('should call vectorstore.get by ID', async () => {
      const params = {
        ...mockParameters.getById,
      };

      mockVectorStore.get.mockResolvedValue({
        rows: [{
          id: params.getIds,
          collection: 'test',
          content: 'Test',
          metadata: {},
          embedding: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        }],
      });

      const mockContext = createMockExecuteFunctions(params);
      await node.execute!.call(mockContext as any);

      expect(mockVectorStore.get).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.any(Array),
        }),
      );
    });

    it('should call vectorstore.get by external ID', async () => {
      const params = {
        ...mockParameters.getByExternalId,
      };

      mockVectorStore.get.mockResolvedValue({ rows: [] });

      const mockContext = createMockExecuteFunctions(params);
      await node.execute!.call(mockContext as any);

      expect(mockVectorStore.get).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: params.collection,
          externalId: expect.any(Array),
        }),
      );
    });

    it('should include embedding when requested', async () => {
      const params = {
        ...mockParameters.getById,
        includeEmbedding: true,
      };

      mockVectorStore.get.mockResolvedValue({ rows: [] });

      const mockContext = createMockExecuteFunctions(params);
      await node.execute!.call(mockContext as any);

      expect(mockVectorStore.get).toHaveBeenCalledWith(
        expect.objectContaining({
          includeEmbedding: true,
        }),
      );
    });
  });

  describe('Admin Operations - Unit Tests', () => {
    it('should call pgVectorManager.ensureSchema for ensureSchema operation', async () => {
      const params = {
        ...mockParameters.adminEnsureSchema,
      };

      mockPgVectorManager.ensureTable.mockResolvedValue(undefined);

      const mockContext = createMockExecuteFunctions(params);
      await node.execute!.call(mockContext as any);

      expect(mockPgVectorManager.ensureTable).toHaveBeenCalledWith(params.dimensions);
    });

    it('should call pgVectorManager.createIndex for createIndex operation', async () => {
      const params = {
        ...mockParameters.adminCreateIndex,
      };

      mockPgVectorManager.ensureIndex.mockResolvedValue(undefined);

      const mockContext = createMockExecuteFunctions(params);
      await node.execute!.call(mockContext as any);

      expect(mockPgVectorManager.ensureIndex).toHaveBeenCalledWith(
        params.adminCollection,
        params.indexType,
        params.adminDistanceMetric,
      );
    });

    it('should call vectorstore.delete for dropCollection operation', async () => {
      const params = {
        ...mockParameters.adminDropCollection,
      };

      mockVectorStore.delete.mockResolvedValue({ deletedCount: 10 });

      const mockContext = createMockExecuteFunctions(params);
      await node.execute!.call(mockContext as any);

      expect(mockVectorStore.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: params.adminCollection,
          metadataFilter: {},
        }),
      );
    });

    it('should validate index type', async () => {
      const params = {
        ...mockParameters.adminCreateIndex,
        indexType: 'invalid-type',
      };

      const mockContext = createMockExecuteFunctions(params);

      await expect(node.execute!.call(mockContext as any)).rejects.toThrow();
    });

    it('should validate distance metric for index creation', async () => {
      const params = {
        ...mockParameters.adminCreateIndex,
        adminDistanceMetric: 'invalid-metric',
      };

      const mockContext = createMockExecuteFunctions(params);

      await expect(node.execute!.call(mockContext as any)).rejects.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should throw error if credentials are missing', async () => {
      const params = { ...mockParameters.upsertSingle };

      const mockContext = createMockExecuteFunctions(params);
      mockContext.getCredentials = jest.fn().mockRejectedValue(new Error('Credentials not found'));

      await expect(node.execute!.call(mockContext as any)).rejects.toThrow();
    });

    it('should propagate database errors', async () => {
      const params = {
        ...mockParameters.query,
        queryEmbedding: JSON.stringify(sampleEmbedding1536),
      };

      mockVectorStore.query.mockRejectedValue(new Error('Database connection failed'));

      const mockContext = createMockExecuteFunctions(params);

      await expect(node.execute!.call(mockContext as any)).rejects.toThrow('Database connection failed');
    });

    it('should handle invalid operation gracefully', async () => {
      const params = {
        operation: 'invalid-operation',
      };

      const mockContext = createMockExecuteFunctions(params);

      await expect(node.execute!.call(mockContext as any)).rejects.toThrow();
    });

    it('should cleanup database connection on error', async () => {
      const params = {
        ...mockParameters.query,
        queryEmbedding: JSON.stringify(sampleEmbedding1536),
      };

      mockVectorStore.query.mockRejectedValue(new Error('Query failed'));

      const mockContext = createMockExecuteFunctions(params);

      try {
        await node.execute!.call(mockContext as any);
      } catch (error) {
        // Expected error
      }

      expect(mockDbManager.close).toHaveBeenCalled();
    });
  });

  describe('Input/Output Formatting', () => {
    it('should return data in n8n format with json property', async () => {
      const params = {
        ...mockParameters.query,
        queryEmbedding: JSON.stringify(sampleEmbedding1536),
      };

      mockVectorStore.query.mockResolvedValue({
        rows: [{ id: '1', collection: 'test', score: 0.5, content: 'Test', metadata: {} }],
      });

      const mockContext = createMockExecuteFunctions(params);
      const result = await node.execute!.call(mockContext as any);

      expect(result[0]).toBeDefined();
      expect(Array.isArray(result[0])).toBe(true);
      result[0].forEach(item => {
        expect(item).toHaveProperty('json');
      });
    });

    it('should handle empty results', async () => {
      const params = {
        ...mockParameters.query,
        queryEmbedding: JSON.stringify(sampleEmbedding1536),
      };

      mockVectorStore.query.mockResolvedValue({ rows: [] });

      const mockContext = createMockExecuteFunctions(params);
      const result = await node.execute!.call(mockContext as any);

      expect(result[0]).toEqual([]);
    });

    it('should preserve metadata structure in output', async () => {
      const metadata = {
        nested: { key: 'value' },
        array: [1, 2, 3],
        string: 'test',
      };

      const params = {
        ...mockParameters.getById,
      };

      mockVectorStore.get.mockResolvedValue({
        rows: [{ id: '1', collection: 'test', content: 'Test', metadata, embedding: [], createdAt: new Date(), updatedAt: new Date() }],
      });

      const mockContext = createMockExecuteFunctions(params);
      const result = await node.execute!.call(mockContext as any);

      expect(result[0][0].json.metadata).toEqual(metadata);
    });
  });

  describe('Parameter Validation', () => {
    it('should validate collection name is provided for operations that need it', async () => {
      const params = {
        operation: 'query',
        queryEmbedding: JSON.stringify(sampleEmbedding1536),
        collection: undefined,
      };

      const mockContext = createMockExecuteFunctions(params);

      await expect(node.execute!.call(mockContext as any)).rejects.toThrow();
    });

    it('should trim whitespace from comma-separated values', async () => {
      const params = {
        ...mockParameters.deleteById,
        deleteIds: ' id-1 , id-2 , id-3 ',
      };

      mockVectorStore.delete.mockResolvedValue({ deletedCount: 3 });

      const mockContext = createMockExecuteFunctions(params);
      await node.execute!.call(mockContext as any);

      expect(mockVectorStore.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          id: ['id-1', 'id-2', 'id-3'],
        }),
      );
    });

    it('should handle metadata as object', async () => {
      const metadata = { key: 'value', nested: { data: 123 } };

      const params = {
        ...mockParameters.upsertSingle,
        metadata: JSON.stringify(metadata),
        embedding: JSON.stringify(sampleEmbedding1536),
      };

      mockVectorStore.upsert.mockResolvedValue({
        id: 'test-id',
        collection: params.collection,
        operation: 'insert',
      });

      const mockContext = createMockExecuteFunctions(params);
      await node.execute!.call(mockContext as any);

      expect(mockVectorStore.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata,
        }),
      );
    });
  });
});
