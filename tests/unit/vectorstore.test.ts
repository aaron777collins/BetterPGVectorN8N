/**
 * Unit Tests for VectorStoreOperations
 *
 * Tests the high-level CRUD operations for embeddings
 * using mocks for DatabaseManager and PgVectorManager.
 */

import { VectorStoreOperations, UpsertParams, QueryParams, DeleteParams, GetParams } from '../../lib/vectorstore';
import { DatabaseManager } from '../../lib/db';
import { PgVectorManager, DistanceMetric } from '../../lib/pgvector';
import { generateEmbedding } from '../helpers/testData';
import { DEFAULT_SCHEMA } from '../../lib/schemaConfig';

// Mock dependencies
jest.mock('../../lib/db');
jest.mock('../../lib/pgvector');

describe('VectorStoreOperations - Unit Tests', () => {
  let vectorStore: VectorStoreOperations;
  let mockDb: jest.Mocked<DatabaseManager>;
  let mockPgVector: jest.Mocked<PgVectorManager>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock DatabaseManager
    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      transaction: jest.fn(),
      close: jest.fn(),
      testConnection: jest.fn(),
      getStats: jest.fn(),
      getPool: jest.fn(),
    } as any;

    // Create mock PgVectorManager
    mockPgVector = {
      ensureExtension: jest.fn(),
      ensureTable: jest.fn(),
      ensureIndex: jest.fn(),
      ensureMetadataIndex: jest.fn(),
      dropCollection: jest.fn(),
      getDistanceOperator: jest.fn().mockReturnValue('<=>'),
      validateDimensions: jest.fn(),
      getTableName: jest.fn().mockReturnValue('embeddings'),
      getDimensions: jest.fn(),
      getSchemaConfig: jest.fn().mockReturnValue(DEFAULT_SCHEMA),
    } as any;

    // Create VectorStoreOperations instance
    vectorStore = new VectorStoreOperations(mockDb, mockPgVector);
  });

  describe('Constructor', () => {
    it('should create instance with DatabaseManager and PgVectorManager', () => {
      expect(vectorStore).toBeInstanceOf(VectorStoreOperations);
    });

    it('should get schema config from PgVectorManager', () => {
      expect(mockPgVector.getSchemaConfig).toHaveBeenCalled();
    });
  });

  describe('upsert()', () => {
    const sampleEmbedding = generateEmbedding(1536);

    describe('Insert by ID', () => {
      it('should insert new record with id', async () => {
        const params: UpsertParams = {
          id: '550e8400-e29b-41d4-a716-446655440000',
          collection: 'test',
          externalId: 'doc-1',
          content: 'Test content',
          metadata: { key: 'value' },
          embedding: sampleEmbedding,
        };

        mockDb.query.mockResolvedValueOnce({
          rows: [
            {
              id: params.id,
              external_id: params.externalId,
              collection: params.collection,
              inserted: true, // xmax = 0 means insert
            },
          ],
          rowCount: 1,
        } as any);

        const result = await vectorStore.upsert(params);

        expect(result).toEqual({
          id: params.id,
          externalId: params.externalId,
          collection: params.collection,
          operation: 'insert',
        });

        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO embeddings'),
          expect.arrayContaining([
            params.id,
            params.collection,
            params.externalId,
            params.content,
            JSON.stringify(params.metadata),
            JSON.stringify(params.embedding),
          ]),
        );
      });

      it('should update existing record with id', async () => {
        const params: UpsertParams = {
          id: '550e8400-e29b-41d4-a716-446655440000',
          collection: 'test',
          content: 'Updated content',
          metadata: { version: 2 },
          embedding: sampleEmbedding,
        };

        mockDb.query.mockResolvedValueOnce({
          rows: [
            {
              id: params.id,
              external_id: null,
              collection: params.collection,
              inserted: false, // xmax > 0 means update
            },
          ],
          rowCount: 1,
        } as any);

        const result = await vectorStore.upsert(params);

        expect(result.operation).toBe('update');
      });
    });

    describe('Insert by external_id', () => {
      it('should insert new record with external_id', async () => {
        const params: UpsertParams = {
          collection: 'test',
          externalId: 'doc-1',
          content: 'Test content',
          metadata: { key: 'value' },
          embedding: sampleEmbedding,
        };

        mockDb.query.mockResolvedValueOnce({
          rows: [
            {
              id: 'generated-uuid',
              external_id: params.externalId,
              collection: params.collection,
              inserted: true,
            },
          ],
          rowCount: 1,
        } as any);

        const result = await vectorStore.upsert(params);

        expect(result.operation).toBe('insert');
        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringContaining('ON CONFLICT (collection, external_id)'),
          expect.any(Array),
        );
      });

      it('should update existing record with same external_id', async () => {
        const params: UpsertParams = {
          collection: 'test',
          externalId: 'doc-1',
          content: 'Updated content',
          metadata: { version: 2 },
          embedding: sampleEmbedding,
        };

        mockDb.query.mockResolvedValueOnce({
          rows: [
            {
              id: 'existing-uuid',
              external_id: params.externalId,
              collection: params.collection,
              inserted: false,
            },
          ],
          rowCount: 1,
        } as any);

        const result = await vectorStore.upsert(params);

        expect(result.operation).toBe('update');
      });
    });

    describe('Insert without external_id', () => {
      it('should insert new record without external_id', async () => {
        const params: UpsertParams = {
          collection: 'test',
          content: 'Test content',
          metadata: {},
          embedding: sampleEmbedding,
        };

        mockDb.query.mockResolvedValueOnce({
          rows: [
            {
              id: 'generated-uuid',
              external_id: null,
              collection: params.collection,
              inserted: true,
            },
          ],
          rowCount: 1,
        } as any);

        const result = await vectorStore.upsert(params);

        expect(result.operation).toBe('insert');
        expect(result.externalId).toBeNull();
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty metadata', async () => {
        const params: UpsertParams = {
          collection: 'test',
          embedding: sampleEmbedding,
        };

        mockDb.query.mockResolvedValueOnce({
          rows: [{ id: 'id', collection: 'test', inserted: true }],
          rowCount: 1,
        } as any);

        await vectorStore.upsert(params);

        expect(mockDb.query).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([JSON.stringify({})]),
        );
      });

      it('should handle null content', async () => {
        const params: UpsertParams = {
          collection: 'test',
          content: undefined,
          embedding: sampleEmbedding,
        };

        mockDb.query.mockResolvedValueOnce({
          rows: [{ id: 'id', collection: 'test', inserted: true }],
          rowCount: 1,
        } as any);

        await vectorStore.upsert(params);

        expect(mockDb.query).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([null]),
        );
      });

      it('should handle special characters in content', async () => {
        const params: UpsertParams = {
          collection: 'test',
          content: 'Test with "quotes" and \'apostrophes\' and \n newlines',
          embedding: sampleEmbedding,
        };

        mockDb.query.mockResolvedValueOnce({
          rows: [{ id: 'id', collection: 'test', inserted: true }],
          rowCount: 1,
        } as any);

        await vectorStore.upsert(params);

        expect(mockDb.query).toHaveBeenCalled();
      });

      it('should handle nested metadata objects', async () => {
        const params: UpsertParams = {
          collection: 'test',
          metadata: {
            level1: {
              level2: {
                level3: 'value',
              },
            },
          },
          embedding: sampleEmbedding,
        };

        mockDb.query.mockResolvedValueOnce({
          rows: [{ id: 'id', collection: 'test', inserted: true }],
          rowCount: 1,
        } as any);

        await vectorStore.upsert(params);

        expect(mockDb.query).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([JSON.stringify(params.metadata)]),
        );
      });
    });
  });

  describe('upsertBatch()', () => {
    const sampleEmbedding = generateEmbedding(1536);

    it('should upsert multiple items', async () => {
      const items: UpsertParams[] = [
        { collection: 'test', externalId: 'doc-1', embedding: sampleEmbedding },
        { collection: 'test', externalId: 'doc-2', embedding: sampleEmbedding },
        { collection: 'test', externalId: 'doc-3', embedding: sampleEmbedding },
      ];

      mockDb.query.mockResolvedValue({
        rows: [{ id: 'id', collection: 'test', inserted: true }],
        rowCount: 1,
      } as any);

      const results = await vectorStore.upsertBatch(items);

      expect(results).toHaveLength(3);
      expect(mockDb.query).toHaveBeenCalledTimes(3);
    });

    it('should process in batches of 100', async () => {
      const items: UpsertParams[] = Array(250)
        .fill(null)
        .map((_, i) => ({
          collection: 'test',
          externalId: `doc-${i}`,
          embedding: sampleEmbedding,
        }));

      mockDb.query.mockResolvedValue({
        rows: [{ id: 'id', collection: 'test', inserted: true }],
        rowCount: 1,
      } as any);

      const results = await vectorStore.upsertBatch(items);

      expect(results).toHaveLength(250);
      expect(mockDb.query).toHaveBeenCalledTimes(250);
    });

    it('should handle empty array', async () => {
      const results = await vectorStore.upsertBatch([]);

      expect(results).toHaveLength(0);
      expect(mockDb.query).not.toHaveBeenCalled();
    });

    it('should preserve order of results', async () => {
      const items: UpsertParams[] = [
        { collection: 'test', externalId: 'doc-1', embedding: sampleEmbedding },
        { collection: 'test', externalId: 'doc-2', embedding: sampleEmbedding },
      ];

      let callCount = 0;
      mockDb.query.mockImplementation(async () => {
        callCount++;
        return {
          rows: [{ id: `id-${callCount}`, external_id: `doc-${callCount}`, collection: 'test', inserted: true }],
          rowCount: 1,
        } as any;
      });

      const results = await vectorStore.upsertBatch(items);

      expect(results[0].externalId).toBe('doc-1');
      expect(results[1].externalId).toBe('doc-2');
    });
  });

  describe('query()', () => {
    const sampleEmbedding = generateEmbedding(1536);

    it('should query with default parameters', async () => {
      const params: QueryParams = {
        collection: 'test',
        embedding: sampleEmbedding,
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: '1',
            external_id: 'doc-1',
            collection: 'test',
            content: 'Content',
            metadata: { key: 'value' },
            score: '0.5',
          },
        ],
        rowCount: 1,
      } as any);

      const result = await vectorStore.query(params);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].score).toBe(0.5);

      // Should use default topK=10, offset=0, cosine distance
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT'),
        expect.arrayContaining([10, 0]),
      );
    });

    it('should query with custom topK and offset', async () => {
      const params: QueryParams = {
        collection: 'test',
        embedding: sampleEmbedding,
        topK: 5,
        offset: 10,
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      await vectorStore.query(params);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([5, 10]),
      );
    });

    it('should use correct distance operator', async () => {
      const params: QueryParams = {
        collection: 'test',
        embedding: sampleEmbedding,
        distanceMetric: DistanceMetric.L2,
      };

      mockPgVector.getDistanceOperator.mockReturnValueOnce('<->');
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await vectorStore.query(params);

      expect(mockPgVector.getDistanceOperator).toHaveBeenCalledWith(DistanceMetric.L2);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('<->'),
        expect.any(Array),
      );
    });

    it('should include metadata filter', async () => {
      const params: QueryParams = {
        collection: 'test',
        embedding: sampleEmbedding,
        metadataFilter: { category: 'tech', status: 'active' },
      };

      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await vectorStore.query(params);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('AND'),
        expect.any(Array),
      );
    });

    it('should include embedding in results when requested', async () => {
      const params: QueryParams = {
        collection: 'test',
        embedding: sampleEmbedding,
        includeEmbedding: true,
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: '1',
            collection: 'test',
            metadata: {},
            score: '0.5',
            embedding: JSON.stringify(sampleEmbedding),
          },
        ],
        rowCount: 1,
      } as any);

      const result = await vectorStore.query(params);

      expect(result.rows[0].embedding).toBeDefined();
      expect(Array.isArray(result.rows[0].embedding)).toBe(true);
    });

    it('should not include embedding when not requested', async () => {
      const params: QueryParams = {
        collection: 'test',
        embedding: sampleEmbedding,
        includeEmbedding: false,
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: '1',
            collection: 'test',
            metadata: {},
            score: '0.5',
          },
        ],
        rowCount: 1,
      } as any);

      const result = await vectorStore.query(params);

      expect(result.rows[0].embedding).toBeUndefined();
    });

    it('should parse score as float', async () => {
      const params: QueryParams = {
        collection: 'test',
        embedding: sampleEmbedding,
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: '1',
            collection: 'test',
            metadata: {},
            score: '0.123456',
          },
        ],
        rowCount: 1,
      } as any);

      const result = await vectorStore.query(params);

      expect(typeof result.rows[0].score).toBe('number');
      expect(result.rows[0].score).toBeCloseTo(0.123456);
    });

    it('should handle empty results', async () => {
      const params: QueryParams = {
        collection: 'empty_collection',
        embedding: sampleEmbedding,
      };

      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const result = await vectorStore.query(params);

      expect(result.rows).toHaveLength(0);
    });
  });

  describe('delete()', () => {
    it('should delete by single ID', async () => {
      const params: DeleteParams = {
        id: '550e8400-e29b-41d4-a716-446655440000',
      };

      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

      const result = await vectorStore.delete(params);

      expect(result.deletedCount).toBe(1);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = ANY($1)'),
        expect.arrayContaining([['550e8400-e29b-41d4-a716-446655440000']]),
      );
    });

    it('should delete by multiple IDs', async () => {
      const params: DeleteParams = {
        id: ['id-1', 'id-2', 'id-3'],
      };

      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 3 } as any);

      const result = await vectorStore.delete(params);

      expect(result.deletedCount).toBe(3);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([['id-1', 'id-2', 'id-3']]),
      );
    });

    it('should delete by collection and external_id', async () => {
      const params: DeleteParams = {
        collection: 'test',
        externalId: 'doc-1',
      };

      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

      const result = await vectorStore.delete(params);

      expect(result.deletedCount).toBe(1);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('collection = $1'),
        expect.arrayContaining(['test', ['doc-1']]),
      );
    });

    it('should delete by metadata filter', async () => {
      const params: DeleteParams = {
        collection: 'test',
        metadataFilter: { status: 'archived' },
      };

      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 5 } as any);

      const result = await vectorStore.delete(params);

      expect(result.deletedCount).toBe(5);
    });

    it('should throw error if neither id nor collection provided', async () => {
      const params: DeleteParams = {};

      await expect(vectorStore.delete(params)).rejects.toThrow(
        'Either id or (partition column + collection) must be provided for delete',
      );
    });

    it('should handle zero deletions', async () => {
      const params: DeleteParams = {
        id: 'non-existent-id',
      };

      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const result = await vectorStore.delete(params);

      expect(result.deletedCount).toBe(0);
    });

    it('should handle null rowCount', async () => {
      const params: DeleteParams = {
        id: 'test-id',
      };

      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: null } as any);

      const result = await vectorStore.delete(params);

      expect(result.deletedCount).toBe(0);
    });
  });

  describe('get()', () => {
    it('should get by single ID', async () => {
      const params: GetParams = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        includeEmbedding: true,
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: params.id,
            external_id: 'doc-1',
            collection: 'test',
            content: 'Content',
            metadata: { key: 'value' },
            embedding: JSON.stringify([0.1, 0.2]),
            created_at: new Date('2024-01-01'),
            updated_at: new Date('2024-01-02'),
          },
        ],
        rowCount: 1,
      } as any);

      const result = await vectorStore.get(params);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].id).toBe(params.id);
      expect(result.rows[0].embedding).toEqual([0.1, 0.2]);
      expect(result.rows[0].createdAt).toBeInstanceOf(Date);
      expect(result.rows[0].updatedAt).toBeInstanceOf(Date);
    });

    it('should get by multiple IDs', async () => {
      const params: GetParams = {
        id: ['id-1', 'id-2'],
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [
          { id: 'id-1', collection: 'test', metadata: {}, embedding: '[]', created_at: new Date(), updated_at: new Date() },
          { id: 'id-2', collection: 'test', metadata: {}, embedding: '[]', created_at: new Date(), updated_at: new Date() },
        ],
        rowCount: 2,
      } as any);

      const result = await vectorStore.get(params);

      expect(result.rows).toHaveLength(2);
    });

    it('should get by collection and external_id', async () => {
      const params: GetParams = {
        collection: 'test',
        externalId: 'doc-1',
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'uuid',
            external_id: 'doc-1',
            collection: 'test',
            metadata: {},
            embedding: '[]',
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
        rowCount: 1,
      } as any);

      const result = await vectorStore.get(params);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].externalId).toBe('doc-1');
    });

    it('should throw error if neither id nor collection provided', async () => {
      const params: GetParams = {};

      await expect(vectorStore.get(params)).rejects.toThrow(
        'Either id or (partition column + collection) must be provided',
      );
    });

    it('should throw error if collection provided without external_id', async () => {
      const params: GetParams = {
        collection: 'test',
      };

      await expect(vectorStore.get(params)).rejects.toThrow(
        'Either id or externalId must be provided',
      );
    });

    it('should handle empty results', async () => {
      const params: GetParams = {
        id: 'non-existent-id',
      };

      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const result = await vectorStore.get(params);

      expect(result.rows).toHaveLength(0);
    });

    it('should parse embedding JSON', async () => {
      const params: GetParams = {
        id: 'test-id',
        includeEmbedding: true,
      };

      const embedding = [0.1, 0.2, 0.3];
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'test-id',
            collection: 'test',
            metadata: {},
            embedding: JSON.stringify(embedding),
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
        rowCount: 1,
      } as any);

      const result = await vectorStore.get(params);

      expect(result.rows[0].embedding).toEqual(embedding);
    });
  });

  describe('Error Handling', () => {
    it('should propagate database errors', async () => {
      const params: UpsertParams = {
        collection: 'test',
        embedding: generateEmbedding(1536),
      };

      const error = new Error('Database connection failed');
      mockDb.query.mockRejectedValueOnce(error);

      await expect(vectorStore.upsert(params)).rejects.toThrow('Database connection failed');
    });

    it('should handle malformed query results', async () => {
      const params: QueryParams = {
        collection: 'test',
        embedding: generateEmbedding(1536),
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [{ malformed: 'data' }],
        rowCount: 1,
      } as any);

      const result = await vectorStore.query(params);

      // Should handle gracefully, setting undefined for missing fields
      expect(result.rows[0].id).toBeUndefined();
    });
  });
});
