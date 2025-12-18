import { DatabaseManager } from '../../lib/db';
import {
  PgVectorManager,
  DistanceMetric,
  IndexType,
} from '../../lib/pgvector';

describe('PgVectorManager Integration Tests', () => {
  let db: DatabaseManager;
  let pgVector: PgVectorManager;

  beforeAll(async () => {
    db = new DatabaseManager({
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT || '5432'),
      user: process.env.PGUSER || 'testuser',
      password: process.env.PGPASSWORD || 'testpass',
      database: process.env.PGDATABASE || 'testdb',
    });

    pgVector = new PgVectorManager(db);
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    // Drop test table if exists
    await db.query('DROP TABLE IF EXISTS embeddings CASCADE', []);
  });

  describe('ensureExtension', () => {
    it('should enable pgvector extension', async () => {
      await pgVector.ensureExtension();

      const result = await db.query(
        "SELECT * FROM pg_extension WHERE extname = 'vector'",
        []
      );
      expect(result.rows.length).toBeGreaterThan(0);
    });

    it('should be idempotent', async () => {
      await pgVector.ensureExtension();
      await pgVector.ensureExtension();

      const result = await db.query(
        "SELECT * FROM pg_extension WHERE extname = 'vector'",
        []
      );
      expect(result.rows.length).toBe(1);
    });
  });

  describe('ensureTable', () => {
    it('should create embeddings table with correct schema', async () => {
      await pgVector.ensureExtension();
      await pgVector.ensureTable(1536);

      // Check table exists
      const tableCheck = await db.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'embeddings'
        )`,
        []
      );
      expect(tableCheck.rows[0].exists).toBe(true);

      // Check columns
      const columns = await db.query(
        `SELECT column_name, data_type
         FROM information_schema.columns
         WHERE table_name = 'embeddings'
         ORDER BY ordinal_position`,
        []
      );

      const columnNames = columns.rows.map((r) => r.column_name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('collection');
      expect(columnNames).toContain('external_id');
      expect(columnNames).toContain('content');
      expect(columnNames).toContain('metadata');
      expect(columnNames).toContain('embedding');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');
    });

    it('should create unique constraint on collection and external_id', async () => {
      await pgVector.ensureExtension();
      await pgVector.ensureTable(768);

      const constraints = await db.query(
        `SELECT constraint_name
         FROM information_schema.table_constraints
         WHERE table_name = 'embeddings'
         AND constraint_type = 'UNIQUE'`,
        []
      );

      const constraintNames = constraints.rows.map((r) => r.constraint_name);
      expect(constraintNames).toContain('embeddings_collection_external_id_key');
    });

    it('should be idempotent', async () => {
      await pgVector.ensureExtension();
      await pgVector.ensureTable(1536);
      await pgVector.ensureTable(1536);

      const result = await db.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'embeddings'
        )`,
        []
      );
      expect(result.rows[0].exists).toBe(true);
    });
  });

  describe('ensureIndex', () => {
    beforeEach(async () => {
      await pgVector.ensureExtension();
      await pgVector.ensureTable(384);
    });

    it('should create HNSW index', async () => {
      await pgVector.ensureIndex('test_collection', IndexType.HNSW, DistanceMetric.COSINE);

      const indexes = await db.query(
        `SELECT indexname FROM pg_indexes WHERE tablename = 'embeddings'`,
        []
      );

      const indexNames = indexes.rows.map((r) => r.indexname);
      expect(indexNames).toContain('idx_embeddings_test_collection_hnsw');
    });

    it('should create IVFFlat index', async () => {
      await pgVector.ensureIndex('test_collection', IndexType.IVFFLAT, DistanceMetric.L2);

      const indexes = await db.query(
        `SELECT indexname FROM pg_indexes WHERE tablename = 'embeddings'`,
        []
      );

      const indexNames = indexes.rows.map((r) => r.indexname);
      expect(indexNames).toContain('idx_embeddings_test_collection_ivfflat');
    });

    it('should create metadata GIN index', async () => {
      await pgVector.ensureMetadataIndex();

      const indexes = await db.query(
        `SELECT indexname FROM pg_indexes WHERE tablename = 'embeddings'`,
        []
      );

      const indexNames = indexes.rows.map((r) => r.indexname);
      expect(indexNames).toContain('idx_embeddings_metadata');
    });

    it('should be idempotent', async () => {
      await pgVector.ensureIndex('test', IndexType.HNSW, DistanceMetric.COSINE);
      await pgVector.ensureIndex('test', IndexType.HNSW, DistanceMetric.COSINE);

      const indexes = await db.query(
        `SELECT indexname FROM pg_indexes WHERE tablename = 'embeddings'`,
        []
      );

      const matchingIndexes = indexes.rows.filter((r) =>
        r.indexname === 'idx_embeddings_test_hnsw'
      );
      expect(matchingIndexes).toHaveLength(1);
    });
  });

  describe('dropCollection', () => {
    beforeEach(async () => {
      await pgVector.ensureExtension();
      await pgVector.ensureTable(384);

      // Insert test data
      await db.query(
        `INSERT INTO embeddings (collection, external_id, content, metadata, embedding)
         VALUES
         ('col1', 'ext1', 'test1', '{}', $1),
         ('col1', 'ext2', 'test2', '{}', $1),
         ('col2', 'ext3', 'test3', '{}', $1)`,
        [JSON.stringify(Array(384).fill(0.1))]
      );
    });

    it('should delete all records from a collection', async () => {
      const result = await pgVector.dropCollection('col1');

      expect(result.deletedCount).toBe(2);

      const remaining = await db.query(
        'SELECT COUNT(*) as count FROM embeddings WHERE collection = $1',
        ['col1']
      );
      expect(parseInt(remaining.rows[0].count)).toBe(0);

      const col2Count = await db.query(
        'SELECT COUNT(*) as count FROM embeddings WHERE collection = $1',
        ['col2']
      );
      expect(parseInt(col2Count.rows[0].count)).toBe(1);
    });

    it('should return 0 for nonexistent collection', async () => {
      const result = await pgVector.dropCollection('nonexistent');
      expect(result.deletedCount).toBe(0);
    });
  });

  describe('getDistanceOperator', () => {
    it('should return correct operators for each metric', () => {
      expect(pgVector.getDistanceOperator(DistanceMetric.COSINE)).toBe('<=>');
      expect(pgVector.getDistanceOperator(DistanceMetric.L2)).toBe('<->');
      expect(pgVector.getDistanceOperator(DistanceMetric.INNER_PRODUCT)).toBe('<#>');
    });
  });

  describe('validateDimensions', () => {
    it('should accept valid dimensions', () => {
      expect(() => pgVector.validateDimensions(384)).not.toThrow();
      expect(() => pgVector.validateDimensions(768)).not.toThrow();
      expect(() => pgVector.validateDimensions(1536)).not.toThrow();
      expect(() => pgVector.validateDimensions(3072)).not.toThrow();
    });

    it('should reject invalid dimensions', () => {
      expect(() => pgVector.validateDimensions(0)).toThrow();
      expect(() => pgVector.validateDimensions(-1)).toThrow();
      expect(() => pgVector.validateDimensions(20000)).toThrow();
    });

    it('should reject non-integer dimensions', () => {
      expect(() => pgVector.validateDimensions(384.5)).toThrow();
    });
  });

  describe('full workflow', () => {
    it('should setup complete schema for a collection', async () => {
      const dimensions = 768;
      const collection = 'my_collection';

      await pgVector.ensureExtension();
      await pgVector.ensureTable(dimensions);
      await pgVector.ensureIndex(collection, IndexType.HNSW, DistanceMetric.COSINE);
      await pgVector.ensureMetadataIndex();

      // Verify we can insert data
      const embedding = Array(dimensions).fill(0).map(() => Math.random());
      await db.query(
        `INSERT INTO embeddings (collection, external_id, content, metadata, embedding)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          collection,
          'test-id-1',
          'This is test content',
          JSON.stringify({ category: 'test', priority: 1 }),
          JSON.stringify(embedding),
        ]
      );

      // Verify data was inserted
      const result = await db.query(
        'SELECT * FROM embeddings WHERE collection = $1 AND external_id = $2',
        [collection, 'test-id-1']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].content).toBe('This is test content');
    });
  });
});
