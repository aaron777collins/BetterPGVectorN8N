/**
 * Unit Tests for PgVectorManager
 *
 * Tests the pgvector schema management, indexing, and vector operations
 * using mocks for the DatabaseManager.
 */

import { PgVectorManager, DistanceMetric, IndexType } from '../../lib/pgvector';
import { DatabaseManager } from '../../lib/db';

// Mock DatabaseManager
jest.mock('../../lib/db');

describe('PgVectorManager - Unit Tests', () => {
  let pgVector: PgVectorManager;
  let mockDb: jest.Mocked<DatabaseManager>;

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

    // Create PgVectorManager instance
    pgVector = new PgVectorManager(mockDb);
  });

  describe('Constructor', () => {
    it('should create instance with DatabaseManager', () => {
      expect(pgVector).toBeInstanceOf(PgVectorManager);
    });

    it('should set default table name', () => {
      expect(pgVector.getTableName()).toBe('embeddings');
    });

    it('should not have dimensions set initially', () => {
      expect(pgVector.getDimensions()).toBeUndefined();
    });
  });

  describe('ensureExtension()', () => {
    it('should create vector extension', async () => {
      await pgVector.ensureExtension();

      expect(mockDb.query).toHaveBeenCalledWith('CREATE EXTENSION IF NOT EXISTS vector', []);
    });

    it('should create uuid-ossp extension', async () => {
      await pgVector.ensureExtension();

      expect(mockDb.query).toHaveBeenCalledWith('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"', []);
    });

    it('should call query twice for both extensions', async () => {
      await pgVector.ensureExtension();

      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('ensureTable()', () => {
    it('should create embeddings table with correct schema', async () => {
      await pgVector.ensureTable(1536);

      expect(mockDb.query).toHaveBeenCalled();
      const createTableCall = (mockDb.query as jest.Mock).mock.calls.find(call =>
        call[0].includes('CREATE TABLE IF NOT EXISTS'),
      );

      expect(createTableCall).toBeDefined();
      expect(createTableCall[0]).toContain('id UUID PRIMARY KEY');
      expect(createTableCall[0]).toContain('collection TEXT NOT NULL');
      expect(createTableCall[0]).toContain('external_id TEXT');
      expect(createTableCall[0]).toContain('content TEXT');
      expect(createTableCall[0]).toContain('metadata JSONB');
      expect(createTableCall[0]).toContain('embedding vector(1536)');
      expect(createTableCall[0]).toContain('created_at TIMESTAMPTZ');
      expect(createTableCall[0]).toContain('updated_at TIMESTAMPTZ');
      expect(createTableCall[0]).toContain('UNIQUE(collection, external_id)');
    });

    it('should create updated_at trigger', async () => {
      await pgVector.ensureTable(1536);

      // Should create trigger function
      const createFunctionCall = (mockDb.query as jest.Mock).mock.calls.find(call =>
        call[0].includes('CREATE OR REPLACE FUNCTION update_updated_at_column'),
      );
      expect(createFunctionCall).toBeDefined();

      // Should drop existing trigger
      const dropTriggerCall = (mockDb.query as jest.Mock).mock.calls.find(call =>
        call[0].includes('DROP TRIGGER IF EXISTS'),
      );
      expect(dropTriggerCall).toBeDefined();

      // Should create new trigger
      const createTriggerCall = (mockDb.query as jest.Mock).mock.calls.find(call =>
        call[0].includes('CREATE TRIGGER update_embeddings_updated_at'),
      );
      expect(createTriggerCall).toBeDefined();
    });

    it('should set current dimensions', async () => {
      await pgVector.ensureTable(768);

      expect(pgVector.getDimensions()).toBe(768);
    });

    it('should use different dimensions when called again', async () => {
      await pgVector.ensureTable(384);
      expect(pgVector.getDimensions()).toBe(384);

      await pgVector.ensureTable(1536);
      expect(pgVector.getDimensions()).toBe(1536);
    });

    it('should throw error for invalid dimensions', async () => {
      await expect(pgVector.ensureTable(0)).rejects.toThrow('Dimensions must be positive');
      await expect(pgVector.ensureTable(-100)).rejects.toThrow('Dimensions must be positive');
      await expect(pgVector.ensureTable(17000)).rejects.toThrow('Dimensions too large');
      await expect(pgVector.ensureTable(1.5 as any)).rejects.toThrow('Dimensions must be an integer');
    });
  });

  describe('ensureIndex()', () => {
    beforeEach(() => {
      // Mock index existence check to return empty (index doesn't exist)
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 } as any);
    });

    it('should create HNSW index with default parameters', async () => {
      await pgVector.ensureIndex('test_collection');

      const createIndexCall = (mockDb.query as jest.Mock).mock.calls.find(call =>
        call[0].includes('CREATE INDEX'),
      );

      expect(createIndexCall).toBeDefined();
      expect(createIndexCall[0]).toContain('USING hnsw');
      expect(createIndexCall[0]).toContain('vector_cosine_ops');  // cosine distance operator class
      expect(createIndexCall[0]).toContain("collection = 'test_collection'");
    });

    it('should create HNSW index with cosine distance', async () => {
      await pgVector.ensureIndex('test', IndexType.HNSW, DistanceMetric.COSINE);

      const createIndexCall = (mockDb.query as jest.Mock).mock.calls.find(call =>
        call[0].includes('CREATE INDEX'),
      );

      expect(createIndexCall[0]).toContain('USING hnsw');
      expect(createIndexCall[0]).toContain('vector_cosine_ops');  // cosine distance operator class
    });

    it('should create HNSW index with L2 distance', async () => {
      await pgVector.ensureIndex('test', IndexType.HNSW, DistanceMetric.L2);

      const createIndexCall = (mockDb.query as jest.Mock).mock.calls.find(call =>
        call[0].includes('CREATE INDEX'),
      );

      expect(createIndexCall[0]).toContain('USING hnsw');
      expect(createIndexCall[0]).toContain('vector_l2_ops');  // L2 distance operator class
    });

    it('should create HNSW index with inner product distance', async () => {
      await pgVector.ensureIndex('test', IndexType.HNSW, DistanceMetric.INNER_PRODUCT);

      const createIndexCall = (mockDb.query as jest.Mock).mock.calls.find(call =>
        call[0].includes('CREATE INDEX'),
      );

      expect(createIndexCall[0]).toContain('USING hnsw');
      expect(createIndexCall[0]).toContain('vector_ip_ops');  // inner product operator class
    });

    it('should create IVFFlat index', async () => {
      await pgVector.ensureIndex('test', IndexType.IVFFLAT, DistanceMetric.L2);

      const createIndexCall = (mockDb.query as jest.Mock).mock.calls.find(call =>
        call[0].includes('CREATE INDEX'),
      );

      expect(createIndexCall[0]).toContain('USING ivfflat');
      expect(createIndexCall[0]).toContain('WITH (lists = 100)');
    });

    it('should skip index creation if already exists', async () => {
      // Mock index exists
      mockDb.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }], rowCount: 1 } as any);

      await pgVector.ensureIndex('test');

      // Should only call query once (existence check, no create)
      const createIndexCalls = (mockDb.query as jest.Mock).mock.calls.filter(call =>
        call[0].includes('CREATE INDEX'),
      );

      expect(createIndexCalls).toHaveLength(0);
    });

    it('should sanitize collection name in index name', async () => {
      await pgVector.ensureIndex('test-collection.v1');

      const createIndexCall = (mockDb.query as jest.Mock).mock.calls.find(call =>
        call[0].includes('CREATE INDEX'),
      );

      expect(createIndexCall[0]).toContain('idx_embeddings_test_collection_v1_hnsw');
    });

    it('should check for existing index before creating', async () => {
      await pgVector.ensureIndex('test');

      const checkCall = (mockDb.query as jest.Mock).mock.calls.find(call =>
        call[0].includes('SELECT 1 FROM pg_indexes'),
      );

      expect(checkCall).toBeDefined();
      expect(checkCall[1]).toEqual(['idx_embeddings_test_hnsw']);
    });
  });

  describe('ensureMetadataIndex()', () => {
    it('should create GIN index on metadata', async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      await pgVector.ensureMetadataIndex();

      const createIndexCall = (mockDb.query as jest.Mock).mock.calls.find(call =>
        call[0].includes('CREATE INDEX'),
      );

      expect(createIndexCall).toBeDefined();
      expect(createIndexCall[0]).toContain('USING GIN (metadata)');
    });

    it('should skip if index already exists', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }], rowCount: 1 } as any);

      await pgVector.ensureMetadataIndex();

      const createIndexCalls = (mockDb.query as jest.Mock).mock.calls.filter(call =>
        call[0].includes('CREATE INDEX'),
      );

      expect(createIndexCalls).toHaveLength(0);
    });

    it('should check for existing index first', async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      await pgVector.ensureMetadataIndex();

      const checkCall = (mockDb.query as jest.Mock).mock.calls.find(call =>
        call[0].includes('SELECT 1 FROM pg_indexes'),
      );

      expect(checkCall).toBeDefined();
      expect(checkCall[1]).toEqual(['idx_embeddings_metadata']);
    });
  });

  describe('dropCollection()', () => {
    it('should delete all records from collection', async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 5 } as any);

      const result = await pgVector.dropCollection('test_collection');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM embeddings WHERE collection = $1'),
        ['test_collection'],
      );
      expect(result.deletedCount).toBe(5);
    });

    it('should return 0 if no records deleted', async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const result = await pgVector.dropCollection('non_existent');

      expect(result.deletedCount).toBe(0);
    });

    it('should handle null rowCount', async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: null } as any);

      const result = await pgVector.dropCollection('test');

      expect(result.deletedCount).toBe(0);
    });
  });

  describe('getDistanceOperator()', () => {
    it('should return <=> for cosine distance', () => {
      const op = pgVector.getDistanceOperator(DistanceMetric.COSINE);
      expect(op).toBe('<=>');
    });

    it('should return <-> for L2 distance', () => {
      const op = pgVector.getDistanceOperator(DistanceMetric.L2);
      expect(op).toBe('<->');
    });

    it('should return <#> for inner product', () => {
      const op = pgVector.getDistanceOperator(DistanceMetric.INNER_PRODUCT);
      expect(op).toBe('<#>');
    });

    it('should throw error for unknown metric', () => {
      expect(() => pgVector.getDistanceOperator('invalid' as any)).toThrow('Unknown distance metric');
    });
  });

  describe('getOperatorClass()', () => {
    it('should return vector_cosine_ops for cosine distance', () => {
      const opClass = pgVector.getOperatorClass(DistanceMetric.COSINE);
      expect(opClass).toBe('vector_cosine_ops');
    });

    it('should return vector_l2_ops for L2 distance', () => {
      const opClass = pgVector.getOperatorClass(DistanceMetric.L2);
      expect(opClass).toBe('vector_l2_ops');
    });

    it('should return vector_ip_ops for inner product', () => {
      const opClass = pgVector.getOperatorClass(DistanceMetric.INNER_PRODUCT);
      expect(opClass).toBe('vector_ip_ops');
    });

    it('should throw error for unknown metric', () => {
      expect(() => pgVector.getOperatorClass('invalid' as any)).toThrow('Unknown distance metric');
    });
  });

  describe('validateDimensions()', () => {
    it('should accept valid dimensions', () => {
      expect(() => pgVector.validateDimensions(1)).not.toThrow();
      expect(() => pgVector.validateDimensions(384)).not.toThrow();
      expect(() => pgVector.validateDimensions(768)).not.toThrow();
      expect(() => pgVector.validateDimensions(1536)).not.toThrow();
      expect(() => pgVector.validateDimensions(16000)).not.toThrow();
    });

    it('should reject non-integer dimensions', () => {
      expect(() => pgVector.validateDimensions(1.5)).toThrow('Dimensions must be an integer');
      expect(() => pgVector.validateDimensions(384.7)).toThrow('Dimensions must be an integer');
      expect(() => pgVector.validateDimensions(NaN)).toThrow('Dimensions must be an integer');
    });

    it('should reject zero dimensions', () => {
      expect(() => pgVector.validateDimensions(0)).toThrow('Dimensions must be positive');
    });

    it('should reject negative dimensions', () => {
      expect(() => pgVector.validateDimensions(-1)).toThrow('Dimensions must be positive');
      expect(() => pgVector.validateDimensions(-100)).toThrow('Dimensions must be positive');
    });

    it('should reject dimensions over 16000', () => {
      expect(() => pgVector.validateDimensions(16001)).toThrow('Dimensions too large');
      expect(() => pgVector.validateDimensions(20000)).toThrow('Dimensions too large');
      expect(() => pgVector.validateDimensions(100000)).toThrow('Dimensions too large');
    });

    it('should include dimension value in error message', () => {
      expect(() => pgVector.validateDimensions(0)).toThrow('got: 0');
      expect(() => pgVector.validateDimensions(-5)).toThrow('got: -5');
      expect(() => pgVector.validateDimensions(20000)).toThrow('got: 20000');
    });
  });

  describe('getTableName()', () => {
    it('should return table name', () => {
      expect(pgVector.getTableName()).toBe('embeddings');
    });
  });

  describe('getDimensions()', () => {
    it('should return undefined initially', () => {
      expect(pgVector.getDimensions()).toBeUndefined();
    });

    it('should return dimensions after ensureTable', async () => {
      await pgVector.ensureTable(1536);
      expect(pgVector.getDimensions()).toBe(1536);
    });

    it('should update dimensions when ensureTable called again', async () => {
      await pgVector.ensureTable(384);
      expect(pgVector.getDimensions()).toBe(384);

      await pgVector.ensureTable(768);
      expect(pgVector.getDimensions()).toBe(768);
    });
  });

  describe('Edge Cases', () => {
    it('should handle collection names with special characters', async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      await pgVector.ensureIndex('test-collection.v1@2024');

      const createIndexCall = (mockDb.query as jest.Mock).mock.calls.find(call =>
        call[0].includes('CREATE INDEX'),
      );

      // Special chars should be replaced with underscore
      expect(createIndexCall[0]).toContain('test_collection_v1_2024');
    });

    it('should handle very long collection names', async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const longName = 'a'.repeat(100);
      await pgVector.ensureIndex(longName);

      const createIndexCall = (mockDb.query as jest.Mock).mock.calls.find(call =>
        call[0].includes('CREATE INDEX'),
      );

      expect(createIndexCall).toBeDefined();
    });

    it('should handle database errors gracefully', async () => {
      mockDb.query.mockRejectedValue(new Error('Database error'));

      await expect(pgVector.ensureTable(1536)).rejects.toThrow('Database error');
    });

    it('should handle concurrent index creation attempts', async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const promises = [
        pgVector.ensureIndex('test'),
        pgVector.ensureIndex('test'),
        pgVector.ensureIndex('test'),
      ];

      await Promise.all(promises);

      // Each call should check and attempt to create
      expect(mockDb.query).toHaveBeenCalled();
    });

    it('should preserve case in collection name for WHERE clause', async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      await pgVector.ensureIndex('MixedCaseCollection');

      const createIndexCall = (mockDb.query as jest.Mock).mock.calls.find(call =>
        call[0].includes('CREATE INDEX'),
      );

      expect(createIndexCall[0]).toContain("collection = 'MixedCaseCollection'");
    });

    it('should handle empty collection names', async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      await pgVector.dropCollection('');

      expect(mockDb.query).toHaveBeenCalledWith(expect.any(String), ['']);
    });
  });

  describe('Integration with DatabaseManager', () => {
    it('should pass queries to DatabaseManager', async () => {
      await pgVector.ensureExtension();

      expect(mockDb.query).toHaveBeenCalledWith(expect.any(String), expect.any(Array));
    });

    it('should propagate DatabaseManager errors', async () => {
      const error = new Error('Connection failed');
      mockDb.query.mockRejectedValue(error);

      await expect(pgVector.ensureExtension()).rejects.toThrow('Connection failed');
    });

    it('should handle query timeouts', async () => {
      const timeoutError = new Error('Query timeout');
      mockDb.query.mockRejectedValue(timeoutError);

      await expect(pgVector.ensureTable(1536)).rejects.toThrow('Query timeout');
    });
  });
});

describe('Enums', () => {
  describe('DistanceMetric', () => {
    it('should have cosine metric', () => {
      expect(DistanceMetric.COSINE).toBe('cosine');
    });

    it('should have L2 metric', () => {
      expect(DistanceMetric.L2).toBe('l2');
    });

    it('should have inner product metric', () => {
      expect(DistanceMetric.INNER_PRODUCT).toBe('inner_product');
    });
  });

  describe('IndexType', () => {
    it('should have HNSW type', () => {
      expect(IndexType.HNSW).toBe('hnsw');
    });

    it('should have IVFFlat type', () => {
      expect(IndexType.IVFFLAT).toBe('ivfflat');
    });
  });
});
