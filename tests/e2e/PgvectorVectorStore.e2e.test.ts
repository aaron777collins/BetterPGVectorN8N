/**
 * End-to-End Tests for PgvectorVectorStore Node
 *
 * These tests simulate real n8n workflow execution with a live database.
 * They test the complete integration of the node with PostgreSQL and pgvector.
 *
 * Following TDD principles:
 * 1. Write test first (red)
 * 2. Implement minimal code (green)
 * 3. Refactor (clean)
 */

import { PgvectorVectorStore } from '../../nodes/PgvectorVectorStore.node';
import { DatabaseManager } from '../../lib/db';
import {
  createMockExecuteFunctions,
  extractJsonFromNodeData,
  mockParameters,
} from '../helpers/mockN8n';
import {
  sampleEmbedding1536,
  sampleEmbedding1536_2,
  sampleEmbedding1536_3,
  testCollections,
  testDbConfig,
} from '../helpers/testData';

describe('PgvectorVectorStore E2E Tests', () => {
  let node: PgvectorVectorStore;
  let dbManager: DatabaseManager;

  beforeAll(async () => {
    // Initialize node instance
    node = new PgvectorVectorStore();

    // Create database connection
    dbManager = new DatabaseManager(testDbConfig);

    // Ensure pgvector extension is installed
    await dbManager.query('CREATE EXTENSION IF NOT EXISTS vector', []);

    // Create embeddings table if it doesn't exist
    await dbManager.query(
      `CREATE TABLE IF NOT EXISTS embeddings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        collection TEXT NOT NULL,
        external_id TEXT,
        content TEXT,
        metadata JSONB NOT NULL DEFAULT '{}',
        embedding VECTOR(1536) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(collection, external_id)
      )`,
      [],
    );

    // Create metadata index
    await dbManager.query(
      `CREATE INDEX IF NOT EXISTS idx_embeddings_metadata ON embeddings USING GIN (metadata)`,
      [],
    );
  });

  afterAll(async () => {
    // Clean up database connection
    await dbManager.close();
  });

  beforeEach(async () => {
    // Clean up all test data before each test
    await dbManager.query(
      `DELETE FROM embeddings WHERE collection LIKE 'test_%' OR collection = 'default'`,
      [],
    );
  });

  describe('Admin Operations', () => {
    it('should ensure schema on first run', async () => {
      const params = {
        ...mockParameters.adminEnsureSchema,
        dimensions: 1536,
      };

      const mockContext = createMockExecuteFunctions(params);
      const result = await node.execute!.call(mockContext as any);

      const data = extractJsonFromNodeData(result[0]);
      expect(data[0]).toMatchObject({
        success: true,
        operation: 'ensureSchema',
      });

      // Verify table exists
      const tableCheck = await dbManager.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'embeddings'
        )`,
        [],
      );
      expect(tableCheck.rows[0].exists).toBe(true);
    });

    it('should be idempotent (run multiple times safely)', async () => {
      const params = {
        ...mockParameters.adminEnsureSchema,
        dimensions: 1536,
      };

      const mockContext = createMockExecuteFunctions(params);

      // Run twice
      await node.execute!.call(mockContext as any);
      const result = await node.execute!.call(mockContext as any);

      const data = extractJsonFromNodeData(result[0]);
      expect(data[0].success).toBe(true);
    });

    it('should create HNSW index', async () => {
      // First ensure some data exists in the collection
      await dbManager.query(
        `INSERT INTO embeddings (collection, content, metadata, embedding)
         VALUES ($1, $2, $3, $4)`,
        [testCollections.default, 'Test', {}, JSON.stringify(sampleEmbedding1536)],
      );

      const params = {
        ...mockParameters.adminCreateIndex,
        adminCollection: testCollections.default,
        indexType: 'hnsw',
        adminDistanceMetric: 'cosine',
      };

      const mockContext = createMockExecuteFunctions(params);
      const result = await node.execute!.call(mockContext as any);

      const data = extractJsonFromNodeData(result[0]);
      expect(data[0]).toMatchObject({
        success: true,
        operation: 'createIndex',
        indexType: 'hnsw',
      });
    });

    it('should create IVFFlat index', async () => {
      // First ensure some data exists
      await dbManager.query(
        `INSERT INTO embeddings (collection, content, metadata, embedding)
         VALUES ($1, $2, $3, $4)`,
        [testCollections.default, 'Test', {}, JSON.stringify(sampleEmbedding1536)],
      );

      const params = {
        ...mockParameters.adminCreateIndex,
        adminCollection: testCollections.default,
        indexType: 'ivfflat',
        adminDistanceMetric: 'l2',
      };

      const mockContext = createMockExecuteFunctions(params);
      const result = await node.execute!.call(mockContext as any);

      const data = extractJsonFromNodeData(result[0]);
      expect(data[0]).toMatchObject({
        success: true,
        operation: 'createIndex',
        indexType: 'ivfflat',
      });
    });

    it('should drop collection', async () => {
      // Insert some data first
      await dbManager.query(
        `INSERT INTO embeddings (collection, content, metadata, embedding)
         VALUES ($1, $2, $3, $4)`,
        [testCollections.temp, 'Test', {}, JSON.stringify(sampleEmbedding1536)],
      );

      const params = {
        ...mockParameters.adminDropCollection,
        adminCollection: testCollections.temp,
      };

      const mockContext = createMockExecuteFunctions(params);
      const result = await node.execute!.call(mockContext as any);

      const data = extractJsonFromNodeData(result[0]);
      expect(data[0].success).toBe(true);

      // Verify collection is empty
      const countResult = await dbManager.query(
        `SELECT COUNT(*) as count FROM embeddings WHERE collection = $1`,
        [testCollections.temp],
      );
      expect(parseInt(countResult.rows[0].count)).toBe(0);
    });
  });

  describe('Upsert Operation', () => {
    it('should upsert single embedding with all fields', async () => {
      const params = {
        ...mockParameters.upsertSingle,
        collection: testCollections.default,
        externalId: 'doc-1',
        content: 'Test document',
        metadata: { category: 'test' },
        embedding: sampleEmbedding1536,
      };

      const mockContext = createMockExecuteFunctions(params);
      const result = await node.execute!.call(mockContext as any);

      const data = extractJsonFromNodeData(result[0]);
      expect(data[0]).toHaveProperty('id');
      expect(data[0].externalId).toBe('doc-1');
    });

    it('should upsert single embedding with minimal fields', async () => {
      const params = {
        ...mockParameters.upsertSingle,
        collection: testCollections.default,
        embedding: sampleEmbedding1536,
      };

      const mockContext = createMockExecuteFunctions(params);
      const result = await node.execute!.call(mockContext as any);

      const data = extractJsonFromNodeData(result[0]);
      expect(data[0]).toHaveProperty('id');
    });

    it('should update existing embedding when external_id matches', async () => {
      const externalId = 'doc-update-test';

      // Insert initial version
      const params1 = {
        ...mockParameters.upsertSingle,
        collection: testCollections.default,
        externalId,
        content: 'Version 1',
        metadata: { version: 1 },
        embedding: sampleEmbedding1536,
      };

      const context1 = createMockExecuteFunctions(params1);
      await node.execute!.call(context1 as any);

      // Update with same external_id
      const params2 = {
        ...mockParameters.upsertSingle,
        collection: testCollections.default,
        externalId,
        content: 'Version 2',
        metadata: { version: 2 },
        embedding: sampleEmbedding1536_2,
      };

      const context2 = createMockExecuteFunctions(params2);
      await node.execute!.call(context2 as any);

      // Verify only one record exists
      const countResult = await dbManager.query(
        `SELECT COUNT(*) as count FROM embeddings
         WHERE collection = $1 AND external_id = $2`,
        [testCollections.default, externalId],
      );
      expect(parseInt(countResult.rows[0].count)).toBe(1);

      // Verify it's the latest version
      const selectResult = await dbManager.query(
        `SELECT metadata FROM embeddings
         WHERE collection = $1 AND external_id = $2`,
        [testCollections.default, externalId],
      );
      expect(selectResult.rows[0].metadata.version).toBe(2);
    });

    it('should handle batch upserts with field mapping', async () => {
      const params = {
        ...mockParameters.upsertBatch,
        collection: testCollections.default,
      };

      const mockContext = createMockExecuteFunctions(params);
      const result = await node.execute!.call(mockContext as any);

      const data = extractJsonFromNodeData(result[0]);
      expect(data.length).toBeGreaterThan(0);
      expect(data[0]).toHaveProperty('id');
    });

    it('should throw error for missing embedding', async () => {
      const params = {
        ...mockParameters.upsertSingle,
        collection: testCollections.default,
        // Missing embedding
      };

      const mockContext = createMockExecuteFunctions(params);

      await expect(node.execute!.call(mockContext as any)).rejects.toThrow();
    });
  });

  describe('Query Operation', () => {
    beforeEach(async () => {
      // Insert test documents
      const docs = [
        {
          collection: testCollections.documents,
          external_id: 'query-doc-1',
          content: 'AI and machine learning',
          metadata: { category: 'tech', difficulty: 'beginner' },
          embedding: sampleEmbedding1536,
        },
        {
          collection: testCollections.documents,
          external_id: 'query-doc-2',
          content: 'Advanced AI concepts',
          metadata: { category: 'tech', difficulty: 'advanced' },
          embedding: sampleEmbedding1536_2,
        },
        {
          collection: testCollections.documents,
          external_id: 'query-doc-3',
          content: 'Science basics',
          metadata: { category: 'science', difficulty: 'beginner' },
          embedding: sampleEmbedding1536_3,
        },
      ];

      for (const doc of docs) {
        await dbManager.query(
          `INSERT INTO embeddings (collection, external_id, content, metadata, embedding)
           VALUES ($1, $2, $3, $4, $5)`,
          [doc.collection, doc.external_id, doc.content, doc.metadata, JSON.stringify(doc.embedding)],
        );
      }
    });

    it('should perform basic similarity search', async () => {
      const params = {
        ...mockParameters.query,
        collection: testCollections.documents,
        queryEmbedding: sampleEmbedding1536,
        topK: 5,
      };

      const mockContext = createMockExecuteFunctions(params);
      const result = await node.execute!.call(mockContext as any);

      const data = extractJsonFromNodeData(result[0]);
      expect(data.length).toBeGreaterThan(0);
      expect(data[0]).toHaveProperty('score');
      expect(data[0]).toHaveProperty('externalId');
    });

    it('should apply metadata filters', async () => {
      const params = {
        ...mockParameters.query,
        collection: testCollections.documents,
        queryEmbedding: sampleEmbedding1536,
        topK: 10,
        metadataFilter: { category: 'tech' },
      };

      const mockContext = createMockExecuteFunctions(params);
      const result = await node.execute!.call(mockContext as any);

      const data = extractJsonFromNodeData(result[0]);
      expect(data.length).toBeGreaterThan(0);
      data.forEach((item: any) => {
        expect(item.metadata.category).toBe('tech');
      });
    });

    it('should support pagination with offset', async () => {
      const params = {
        ...mockParameters.query,
        collection: testCollections.documents,
        queryEmbedding: sampleEmbedding1536,
        topK: 2,
        offset: 1,
      };

      const mockContext = createMockExecuteFunctions(params);
      const result = await node.execute!.call(mockContext as any);

      const data = extractJsonFromNodeData(result[0]);
      expect(data.length).toBeLessThanOrEqual(2);
    });

    it('should support different distance metrics', async () => {
      const metrics = ['cosine', 'l2', 'inner_product'];

      for (const metric of metrics) {
        const params = {
          ...mockParameters.query,
          collection: testCollections.documents,
          queryEmbedding: sampleEmbedding1536,
          topK: 5,
          distanceMetric: metric,
        };

        const mockContext = createMockExecuteFunctions(params);
        const result = await node.execute!.call(mockContext as any);

        const data = extractJsonFromNodeData(result[0]);
        expect(data.length).toBeGreaterThan(0);
      }
    });

    it('should include embedding when requested', async () => {
      const params = {
        ...mockParameters.query,
        collection: testCollections.documents,
        queryEmbedding: sampleEmbedding1536,
        topK: 1,
        includeEmbedding: true,
      };

      const mockContext = createMockExecuteFunctions(params);
      const result = await node.execute!.call(mockContext as any);

      const data = extractJsonFromNodeData(result[0]);
      expect(data[0]).toHaveProperty('embedding');
      expect(Array.isArray(data[0].embedding)).toBe(true);
    });

    it('should not include embedding by default', async () => {
      const params = {
        ...mockParameters.query,
        collection: testCollections.documents,
        queryEmbedding: sampleEmbedding1536,
        topK: 1,
        includeEmbedding: false,
      };

      const mockContext = createMockExecuteFunctions(params);
      const result = await node.execute!.call(mockContext as any);

      const data = extractJsonFromNodeData(result[0]);
      expect(data[0]).not.toHaveProperty('embedding');
    });

    it('should return empty array for query on empty collection', async () => {
      const params = {
        ...mockParameters.query,
        collection: 'empty_collection',
        queryEmbedding: sampleEmbedding1536,
        topK: 10,
      };

      const mockContext = createMockExecuteFunctions(params);
      const result = await node.execute!.call(mockContext as any);

      const data = extractJsonFromNodeData(result[0]);
      expect(data).toEqual([]);
    });
  });

  describe('Delete Operation', () => {
    let insertedIds: string[];

    beforeEach(async () => {
      // Insert test data
      const docs = [
        {
          collection: testCollections.temp,
          external_id: 'delete-doc-1',
          content: 'Document 1',
          metadata: { status: 'active', category: 'tech' },
          embedding: sampleEmbedding1536,
        },
        {
          collection: testCollections.temp,
          external_id: 'delete-doc-2',
          content: 'Document 2',
          metadata: { status: 'archived', category: 'science' },
          embedding: sampleEmbedding1536_2,
        },
        {
          collection: testCollections.temp,
          external_id: 'delete-doc-3',
          content: 'Document 3',
          metadata: { status: 'archived', category: 'tech' },
          embedding: sampleEmbedding1536_3,
        },
      ];

      insertedIds = [];
      for (const doc of docs) {
        const result = await dbManager.query(
          `INSERT INTO embeddings (collection, external_id, content, metadata, embedding)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [doc.collection, doc.external_id, doc.content, doc.metadata, JSON.stringify(doc.embedding)],
        );
        insertedIds.push(result.rows[0].id);
      }
    });

    it('should delete by single ID', async () => {
      const params = {
        ...mockParameters.deleteById,
        deleteIds: insertedIds[0],
      };

      const mockContext = createMockExecuteFunctions(params);
      const result = await node.execute!.call(mockContext as any);

      const data = extractJsonFromNodeData(result[0]);
      expect(data[0].deletedCount).toBe(1);

      // Verify deletion
      const countResult = await dbManager.query(
        `SELECT COUNT(*) as count FROM embeddings WHERE id = $1`,
        [insertedIds[0]],
      );
      expect(parseInt(countResult.rows[0].count)).toBe(0);
    });

    it('should delete by multiple IDs', async () => {
      const params = {
        ...mockParameters.deleteById,
        deleteIds: `${insertedIds[0]}, ${insertedIds[1]}`,
      };

      const mockContext = createMockExecuteFunctions(params);
      const result = await node.execute!.call(mockContext as any);

      const data = extractJsonFromNodeData(result[0]);
      expect(data[0].deletedCount).toBe(2);
    });

    it('should delete by external ID', async () => {
      const params = {
        ...mockParameters.deleteByExternalId,
        collection: testCollections.temp,
        deleteExternalIds: 'delete-doc-1, delete-doc-2',
      };

      const mockContext = createMockExecuteFunctions(params);
      const result = await node.execute!.call(mockContext as any);

      const data = extractJsonFromNodeData(result[0]);
      expect(data[0].deletedCount).toBe(2);
    });

    it('should delete by metadata filter', async () => {
      const params = {
        ...mockParameters.deleteByMetadata,
        collection: testCollections.temp,
        deleteMetadataFilter: { status: 'archived' },
      };

      const mockContext = createMockExecuteFunctions(params);
      const result = await node.execute!.call(mockContext as any);

      const data = extractJsonFromNodeData(result[0]);
      expect(data[0].deletedCount).toBe(2); // delete-doc-2 and delete-doc-3

      // Verify only active documents remain
      const countResult = await dbManager.query(
        `SELECT COUNT(*) as count FROM embeddings
         WHERE collection = $1 AND metadata->>'status' = 'active'`,
        [testCollections.temp],
      );
      expect(parseInt(countResult.rows[0].count)).toBe(1);
    });

    it('should delete from specific collection only', async () => {
      // Insert doc in different collection
      await dbManager.query(
        `INSERT INTO embeddings (collection, external_id, content, metadata, embedding)
         VALUES ($1, $2, $3, $4, $5)`,
        ['other_collection', 'other-doc', 'Other content', {}, JSON.stringify(sampleEmbedding1536)],
      );

      const params = {
        ...mockParameters.deleteByMetadata,
        collection: testCollections.temp,
        deleteMetadataFilter: {},
      };

      const mockContext = createMockExecuteFunctions(params);
      await node.execute!.call(mockContext as any);

      // Verify other collection is untouched
      const countResult = await dbManager.query(`SELECT COUNT(*) as count FROM embeddings WHERE collection = 'other_collection'`);
      expect(parseInt(countResult.rows[0].count)).toBe(1);
    });

    it('should return 0 for non-existent records', async () => {
      const params = {
        ...mockParameters.deleteById,
        deleteIds: '550e8400-e29b-41d4-a716-446655440099',
      };

      const mockContext = createMockExecuteFunctions(params);
      const result = await node.execute!.call(mockContext as any);

      const data = extractJsonFromNodeData(result[0]);
      expect(data[0].deletedCount).toBe(0);
    });
  });

  describe('Get Operation', () => {
    let insertedIds: string[];

    beforeEach(async () => {
      // Insert test data
      const docs = [
        {
          collection: testCollections.default,
          external_id: 'get-doc-1',
          content: 'Get test 1',
          metadata: { index: 1 },
          embedding: sampleEmbedding1536,
        },
        {
          collection: testCollections.default,
          external_id: 'get-doc-2',
          content: 'Get test 2',
          metadata: { index: 2 },
          embedding: sampleEmbedding1536_2,
        },
      ];

      insertedIds = [];
      for (const doc of docs) {
        const result = await dbManager.query(
          `INSERT INTO embeddings (collection, external_id, content, metadata, embedding)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [doc.collection, doc.external_id, doc.content, doc.metadata, JSON.stringify(doc.embedding)],
        );
        insertedIds.push(result.rows[0].id);
      }
    });

    it('should get by single ID', async () => {
      const params = {
        ...mockParameters.getById,
        getIds: insertedIds[0],
      };

      const mockContext = createMockExecuteFunctions(params);
      const result = await node.execute!.call(mockContext as any);

      const data = extractJsonFromNodeData(result[0]);
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe(insertedIds[0]);
      expect(data[0].externalId).toBe('get-doc-1');
    });

    it('should get by multiple IDs', async () => {
      const params = {
        ...mockParameters.getById,
        getIds: `${insertedIds[0]}, ${insertedIds[1]}`,
      };

      const mockContext = createMockExecuteFunctions(params);
      const result = await node.execute!.call(mockContext as any);

      const data = extractJsonFromNodeData(result[0]);
      expect(data).toHaveLength(2);
    });

    it('should get by external ID', async () => {
      const params = {
        ...mockParameters.getByExternalId,
        collection: testCollections.default,
        getExternalIds: 'get-doc-1',
      };

      const mockContext = createMockExecuteFunctions(params);
      const result = await node.execute!.call(mockContext as any);

      const data = extractJsonFromNodeData(result[0]);
      expect(data).toHaveLength(1);
      expect(data[0].externalId).toBe('get-doc-1');
    });

    it('should include embedding when requested', async () => {
      const params = {
        ...mockParameters.getById,
        getIds: insertedIds[0],
        includeEmbedding: true,
      };

      const mockContext = createMockExecuteFunctions(params);
      const result = await node.execute!.call(mockContext as any);

      const data = extractJsonFromNodeData(result[0]);
      expect(data[0]).toHaveProperty('embedding');
      expect(Array.isArray(data[0].embedding)).toBe(true);
    });

    it('should not include embedding by default', async () => {
      const params = {
        ...mockParameters.getById,
        getIds: insertedIds[0],
        includeEmbedding: false,
      };

      const mockContext = createMockExecuteFunctions(params);
      const result = await node.execute!.call(mockContext as any);

      const data = extractJsonFromNodeData(result[0]);
      expect(data[0]).not.toHaveProperty('embedding');
    });

    it('should return empty array for non-existent IDs', async () => {
      const params = {
        ...mockParameters.getById,
        getIds: '550e8400-e29b-41d4-a716-446655440099',
      };

      const mockContext = createMockExecuteFunctions(params);
      const result = await node.execute!.call(mockContext as any);

      const data = extractJsonFromNodeData(result[0]);
      expect(data).toHaveLength(0);
    });
  });

  describe('Workflow Scenarios', () => {
    it('should support complete semantic search pipeline', async () => {
      // Step 1: Upsert documents
      const upsertParams = {
        ...mockParameters.upsertSingle,
        collection: testCollections.documents,
        externalId: 'pipeline-doc-1',
        content: 'AI and machine learning tutorial',
        metadata: { type: 'tutorial' },
        embedding: sampleEmbedding1536,
      };

      const upsertContext = createMockExecuteFunctions(upsertParams);
      await node.execute!.call(upsertContext as any);

      // Step 2: Query similar documents
      const queryParams = {
        ...mockParameters.query,
        collection: testCollections.documents,
        queryEmbedding: sampleEmbedding1536,
        topK: 5,
      };

      const queryContext = createMockExecuteFunctions(queryParams);
      const queryResult = await node.execute!.call(queryContext as any);

      const queryData = extractJsonFromNodeData(queryResult[0]);
      expect(queryData.length).toBeGreaterThan(0);
      expect(queryData[0].externalId).toBe('pipeline-doc-1');
    });

    it('should support incremental updates with same external_id', async () => {
      const externalId = 'incremental-doc';

      // Version 1
      const params1 = {
        ...mockParameters.upsertSingle,
        collection: testCollections.default,
        externalId,
        content: 'Version 1',
        metadata: { version: 1 },
        embedding: sampleEmbedding1536,
      };

      const context1 = createMockExecuteFunctions(params1);
      await node.execute!.call(context1 as any);

      // Version 2
      const params2 = {
        ...mockParameters.upsertSingle,
        collection: testCollections.default,
        externalId,
        content: 'Version 2',
        metadata: { version: 2 },
        embedding: sampleEmbedding1536_2,
      };

      const context2 = createMockExecuteFunctions(params2);
      await node.execute!.call(context2 as any);

      // Verify only one record exists
      const countResult = await dbManager.query(
        `SELECT COUNT(*) as count FROM embeddings
         WHERE collection = $1 AND external_id = $2`,
        [testCollections.default, externalId],
      );
      expect(parseInt(countResult.rows[0].count)).toBe(1);

      // Verify it's the latest version
      const selectResult = await dbManager.query(
        `SELECT metadata FROM embeddings
         WHERE collection = $1 AND external_id = $2`,
        [testCollections.default, externalId],
      );
      expect(selectResult.rows[0].metadata.version).toBe(2);
    });

    it('should support deduplication workflow', async () => {
      // Insert original document
      const originalParams = {
        ...mockParameters.upsertSingle,
        collection: testCollections.documents,
        externalId: 'original-doc',
        content: 'Original content',
        metadata: {},
        embedding: sampleEmbedding1536,
      };

      const originalContext = createMockExecuteFunctions(originalParams);
      await node.execute!.call(originalContext as any);

      // Check if similar document exists
      const queryParams = {
        ...mockParameters.query,
        collection: testCollections.documents,
        queryEmbedding: sampleEmbedding1536,
        topK: 1,
      };

      const queryContext = createMockExecuteFunctions(queryParams);
      const queryResult = await node.execute!.call(queryContext as any);

      const queryData = extractJsonFromNodeData(queryResult[0]);
      const similarity = 1 - queryData[0].score; // Convert distance to similarity

      // If similarity > threshold, skip insert (duplicate)
      const threshold = 0.95;
      expect(similarity).toBeGreaterThan(threshold);
      // In real workflow, would not insert duplicate
    });

    it('should support batch processing workflow', async () => {
      // Batch insert
      const batchParams = {
        ...mockParameters.upsertBatch,
        collection: testCollections.default,
      };

      const batchContext = createMockExecuteFunctions(batchParams);
      await node.execute!.call(batchContext as any);

      // Batch query
      const queryParams = {
        ...mockParameters.query,
        collection: testCollections.default,
        queryEmbedding: sampleEmbedding1536,
        topK: 10,
      };

      const queryContext = createMockExecuteFunctions(queryParams);
      const queryResult = await node.execute!.call(queryContext as any);

      const data = extractJsonFromNodeData(queryResult[0]);
      expect(data.length).toBeGreaterThan(0);
    });
  });

  describe('Performance Tests', () => {
    it('should perform query with HNSW index quickly', async () => {
      // First ensure some data exists
      await dbManager.query(
        `INSERT INTO embeddings (collection, content, metadata, embedding)
         VALUES ($1, $2, $3, $4)`,
        [testCollections.documents, 'Test', {}, JSON.stringify(sampleEmbedding1536)],
      );

      // Create HNSW index
      await dbManager.query(
        `CREATE INDEX IF NOT EXISTS idx_test_docs_hnsw
        ON embeddings USING hnsw (embedding vector_cosine_ops)
        WHERE collection = '${testCollections.documents}'`,
        [],
      );

      const params = {
        ...mockParameters.query,
        collection: testCollections.documents,
        queryEmbedding: sampleEmbedding1536,
        topK: 10,
      };

      const mockContext = createMockExecuteFunctions(params);

      const startTime = Date.now();
      await node.execute!.call(mockContext as any);
      const duration = Date.now() - startTime;

      // Should be fast with index (< 100ms)
      expect(duration).toBeLessThan(100);
    });
  });
});
