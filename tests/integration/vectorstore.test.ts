import { DatabaseManager } from '../../lib/db';
import { PgVectorManager, DistanceMetric, IndexType } from '../../lib/pgvector';
import {
  VectorStoreOperations,
  UpsertParams,
  QueryParams,
  DeleteParams,
  GetParams,
} from '../../lib/vectorstore';

describe('VectorStore Operations Integration Tests', () => {
  let db: DatabaseManager;
  let pgVector: PgVectorManager;
  let vectorStore: VectorStoreOperations;

  const DIMENSIONS = 1536;
  const TEST_COLLECTION = 'test_collection';

  beforeAll(async () => {
    db = new DatabaseManager({
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT || '5433'),
      user: process.env.PGUSER || 'testuser',
      password: process.env.PGPASSWORD || 'testpass',
      database: process.env.PGDATABASE || 'testdb',
    });

    pgVector = new PgVectorManager(db);
    vectorStore = new VectorStoreOperations(db, pgVector);

    // Setup schema - drop and recreate to ensure correct dimensions
    await pgVector.ensureExtension();
    await db.query('DROP TABLE IF EXISTS embeddings CASCADE', []);
    await pgVector.ensureTable(DIMENSIONS);
    await pgVector.ensureMetadataIndex();
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    // Clean up test data
    await pgVector.dropCollection(TEST_COLLECTION);
  });

  describe('Upsert', () => {
    it('should insert new embedding with generated ID', async () => {
      const embedding = Array(DIMENSIONS).fill(0.1);
      const params: UpsertParams = {
        collection: TEST_COLLECTION,
        externalId: 'doc-1',
        content: 'This is a test document',
        metadata: { category: 'test', priority: 1 },
        embedding,
      };

      const result = await vectorStore.upsert(params);

      expect(result.id).toBeDefined();
      expect(result.externalId).toBe('doc-1');
      expect(result.collection).toBe(TEST_COLLECTION);
      expect(result.operation).toBe('insert');
    });

    it('should update existing embedding by external_id', async () => {
      const embedding1 = Array(DIMENSIONS).fill(0.1);
      const params1: UpsertParams = {
        collection: TEST_COLLECTION,
        externalId: 'doc-1',
        content: 'Original content',
        metadata: { version: 1 },
        embedding: embedding1,
      };

      const result1 = await vectorStore.upsert(params1);
      const firstId = result1.id;

      // Upsert with same external_id
      const embedding2 = Array(DIMENSIONS).fill(0.2);
      const params2: UpsertParams = {
        collection: TEST_COLLECTION,
        externalId: 'doc-1',
        content: 'Updated content',
        metadata: { version: 2 },
        embedding: embedding2,
      };

      const result2 = await vectorStore.upsert(params2);

      expect(result2.id).toBe(firstId);
      expect(result2.operation).toBe('update');

      // Verify update
      const fetched = await vectorStore.get({
        id: firstId,
      });

      expect(fetched.rows).toHaveLength(1);
      expect(fetched.rows[0].content).toBe('Updated content');
      expect(fetched.rows[0].metadata.version).toBe(2);
    });

    it('should update existing embedding by id', async () => {
      const embedding1 = Array(DIMENSIONS).fill(0.1);
      const result1 = await vectorStore.upsert({
        collection: TEST_COLLECTION,
        content: 'Original',
        metadata: {},
        embedding: embedding1,
      });

      const embedding2 = Array(DIMENSIONS).fill(0.2);
      const result2 = await vectorStore.upsert({
        id: result1.id,
        collection: TEST_COLLECTION,
        content: 'Updated',
        metadata: {},
        embedding: embedding2,
      });

      expect(result2.id).toBe(result1.id);
      expect(result2.operation).toBe('update');
    });

    it('should handle batch upserts', async () => {
      const items = Array(10)
        .fill(null)
        .map((_, i) => ({
          collection: TEST_COLLECTION,
          externalId: `doc-${i}`,
          content: `Document ${i}`,
          metadata: { index: i },
          embedding: Array(DIMENSIONS).fill(i / 10),
        }));

      const results = await vectorStore.upsertBatch(items);

      expect(results).toHaveLength(10);
      results.forEach((result, i) => {
        expect(result.externalId).toBe(`doc-${i}`);
      });
    });
  });

  describe('Query', () => {
    beforeEach(async () => {
      // Insert test embeddings
      const items = [
        {
          collection: TEST_COLLECTION,
          externalId: 'doc-1',
          content: 'About cats',
          metadata: { category: 'animals', type: 'cat' },
          embedding: Array(DIMENSIONS).fill(0.1),
        },
        {
          collection: TEST_COLLECTION,
          externalId: 'doc-2',
          content: 'About dogs',
          metadata: { category: 'animals', type: 'dog' },
          embedding: Array(DIMENSIONS).fill(0.3),
        },
        {
          collection: TEST_COLLECTION,
          externalId: 'doc-3',
          content: 'About cars',
          metadata: { category: 'vehicles', type: 'car' },
          embedding: Array(DIMENSIONS).fill(0.8),
        },
      ];

      await vectorStore.upsertBatch(items);
    });

    it('should perform similarity search', async () => {
      const queryEmbedding = Array(DIMENSIONS).fill(0.1);
      const params: QueryParams = {
        collection: TEST_COLLECTION,
        embedding: queryEmbedding,
        topK: 2,
        distanceMetric: DistanceMetric.L2,
      };

      const results = await vectorStore.query(params);

      expect(results.rows).toHaveLength(2);
      expect(results.rows[0].externalId).toBe('doc-1');
      expect(results.rows[0].score).toBeDefined();
      expect(results.rows[0].content).toBe('About cats');
    });

    it('should apply metadata filters', async () => {
      const queryEmbedding = Array(DIMENSIONS).fill(0.1);
      const params: QueryParams = {
        collection: TEST_COLLECTION,
        embedding: queryEmbedding,
        topK: 10,
        distanceMetric: DistanceMetric.L2,
        metadataFilter: { category: 'animals' },
      };

      const results = await vectorStore.query(params);

      expect(results.rows).toHaveLength(2);
      results.rows.forEach((row) => {
        expect(row.metadata.category).toBe('animals');
      });
    });

    it('should support pagination', async () => {
      const queryEmbedding = Array(DIMENSIONS).fill(0.1);

      const page1 = await vectorStore.query({
        collection: TEST_COLLECTION,
        embedding: queryEmbedding,
        topK: 2,
        offset: 0,
        distanceMetric: DistanceMetric.L2,
      });

      const page2 = await vectorStore.query({
        collection: TEST_COLLECTION,
        embedding: queryEmbedding,
        topK: 2,
        offset: 2,
        distanceMetric: DistanceMetric.L2,
      });

      expect(page1.rows).toHaveLength(2);
      expect(page2.rows).toHaveLength(1);
      expect(page1.rows[0].id).not.toBe(page2.rows[0].id);
    });

    it('should support different distance metrics', async () => {
      const queryEmbedding = Array(DIMENSIONS).fill(0.1);

      const cosineResults = await vectorStore.query({
        collection: TEST_COLLECTION,
        embedding: queryEmbedding,
        topK: 3,
        distanceMetric: DistanceMetric.COSINE,
      });

      const l2Results = await vectorStore.query({
        collection: TEST_COLLECTION,
        embedding: queryEmbedding,
        topK: 3,
        distanceMetric: DistanceMetric.L2,
      });

      expect(cosineResults.rows).toHaveLength(3);
      expect(l2Results.rows).toHaveLength(3);
    });
  });

  describe('Delete', () => {
    let docIds: string[];

    beforeEach(async () => {
      const items = Array(5)
        .fill(null)
        .map((_, i) => ({
          collection: TEST_COLLECTION,
          externalId: `doc-${i}`,
          content: `Document ${i}`,
          metadata: { index: i, category: i % 2 === 0 ? 'even' : 'odd' },
          embedding: Array(DIMENSIONS).fill(i / 10),
        }));

      const results = await vectorStore.upsertBatch(items);
      docIds = results.map((r) => r.id);
    });

    it('should delete by id', async () => {
      const params: DeleteParams = {
        id: [docIds[0]],
      };

      const result = await vectorStore.delete(params);

      expect(result.deletedCount).toBe(1);

      const remaining = await vectorStore.get({ id: docIds[0] });
      expect(remaining.rows).toHaveLength(0);
    });

    it('should delete by multiple ids', async () => {
      const params: DeleteParams = {
        id: [docIds[0], docIds[1], docIds[2]],
      };

      const result = await vectorStore.delete(params);

      expect(result.deletedCount).toBe(3);
    });

    it('should delete by externalId', async () => {
      const params: DeleteParams = {
        collection: TEST_COLLECTION,
        externalId: ['doc-0', 'doc-1'],
      };

      const result = await vectorStore.delete(params);

      expect(result.deletedCount).toBe(2);
    });

    it('should delete by metadata filter', async () => {
      const params: DeleteParams = {
        collection: TEST_COLLECTION,
        metadataFilter: { category: 'even' },
      };

      const result = await vectorStore.delete(params);

      expect(result.deletedCount).toBe(3);
    });

    it('should require either id or collection+filter', async () => {
      await expect(vectorStore.delete({} as DeleteParams)).rejects.toThrow();
    });
  });

  describe('Get', () => {
    let docIds: string[];

    beforeEach(async () => {
      const items = Array(3)
        .fill(null)
        .map((_, i) => ({
          collection: TEST_COLLECTION,
          externalId: `doc-${i}`,
          content: `Document ${i}`,
          metadata: { index: i },
          embedding: Array(DIMENSIONS).fill(i / 10),
        }));

      const results = await vectorStore.upsertBatch(items);
      docIds = results.map((r) => r.id);
    });

    it('should fetch by id', async () => {
      const params: GetParams = {
        id: docIds[0],
      };

      const result = await vectorStore.get(params);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].id).toBe(docIds[0]);
      expect(result.rows[0].externalId).toBe('doc-0');
    });

    it('should fetch by multiple ids', async () => {
      const params: GetParams = {
        id: [docIds[0], docIds[1]],
      };

      const result = await vectorStore.get(params);

      expect(result.rows).toHaveLength(2);
    });

    it('should fetch by externalId', async () => {
      const params: GetParams = {
        collection: TEST_COLLECTION,
        externalId: 'doc-1',
      };

      const result = await vectorStore.get(params);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].externalId).toBe('doc-1');
    });

    it('should fetch by multiple externalIds', async () => {
      const params: GetParams = {
        collection: TEST_COLLECTION,
        externalId: ['doc-0', 'doc-2'],
      };

      const result = await vectorStore.get(params);

      expect(result.rows).toHaveLength(2);
    });
  });

  describe('Performance', () => {
    it('should handle 1000+ embeddings efficiently', async () => {
      const batchSize = 100;
      const totalItems = 1000;

      for (let i = 0; i < totalItems / batchSize; i++) {
        const items = Array(batchSize)
          .fill(null)
          .map((_, j) => {
            const idx = i * batchSize + j;
            return {
              collection: TEST_COLLECTION,
              externalId: `perf-doc-${idx}`,
              content: `Performance test document ${idx}`,
              metadata: { batch: i, index: j },
              embedding: Array(DIMENSIONS).fill(Math.random()),
            };
          });

        await vectorStore.upsertBatch(items);
      }

      // Create index for better query performance
      await pgVector.ensureIndex(TEST_COLLECTION, IndexType.HNSW, DistanceMetric.L2);

      const startTime = Date.now();
      const queryResult = await vectorStore.query({
        collection: TEST_COLLECTION,
        embedding: Array(DIMENSIONS).fill(0.5),
        topK: 10,
        distanceMetric: DistanceMetric.L2,
      });
      const queryTime = Date.now() - startTime;

      expect(queryResult.rows).toHaveLength(10);
      expect(queryTime).toBeLessThan(1000); // Should be fast with index

      console.log(`Query time for 1000 documents: ${queryTime}ms`);
    }, 60000);
  });
});
