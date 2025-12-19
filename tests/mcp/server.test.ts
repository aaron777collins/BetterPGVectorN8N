import { PgVectorMcpServer } from '../../mcp/server';

describe('PgVectorMcpServer', () => {
  let server: PgVectorMcpServer;

  beforeEach(() => {
    server = new PgVectorMcpServer({
      host: 'localhost',
      port: 5432,
      database: 'test',
      user: 'test',
      password: 'test',
    });
  });

  afterEach(async () => {
    await server.close();
  });

  describe('initialization', () => {
    it('should create server with valid config', () => {
      expect(server).toBeInstanceOf(PgVectorMcpServer);
    });

    it('should throw error with missing config', () => {
      expect(() => new PgVectorMcpServer({} as any)).toThrow();
    });

    it('should have server info', () => {
      const info = server.getServerInfo();
      expect(info.name).toBe('pgvector-advanced');
      expect(info.version).toBeDefined();
      expect(info.description).toContain('PGVector');
    });
  });

  describe('tool definitions', () => {
    it('should list all available tools', () => {
      const tools = server.listTools();
      expect(tools).toHaveLength(5);
      expect(tools.map(t => t.name)).toEqual([
        'pgvector_upsert',
        'pgvector_query',
        'pgvector_delete',
        'pgvector_get',
        'pgvector_admin',
      ]);
    });

    it('should have valid schema for upsert tool', () => {
      const tools = server.listTools();
      const upsertTool = tools.find(t => t.name === 'pgvector_upsert');

      expect(upsertTool).toBeDefined();
      expect(upsertTool!.description).toContain('Insert or update');
      expect(upsertTool!.inputSchema.type).toBe('object');
      expect(upsertTool!.inputSchema.required).toContain('collection');
      expect(upsertTool!.inputSchema.required).toContain('embedding');
      expect(upsertTool!.inputSchema.properties.collection).toBeDefined();
      expect(upsertTool!.inputSchema.properties.embedding).toBeDefined();
      expect(upsertTool!.inputSchema.properties.externalId).toBeDefined();
      expect(upsertTool!.inputSchema.properties.content).toBeDefined();
      expect(upsertTool!.inputSchema.properties.metadata).toBeDefined();
    });

    it('should have valid schema for query tool', () => {
      const tools = server.listTools();
      const queryTool = tools.find(t => t.name === 'pgvector_query');

      expect(queryTool).toBeDefined();
      expect(queryTool!.description).toContain('Search');
      expect(queryTool!.inputSchema.required).toContain('collection');
      expect(queryTool!.inputSchema.required).toContain('queryEmbedding');
      expect(queryTool!.inputSchema.properties.topK).toBeDefined();
      expect(queryTool!.inputSchema.properties.distanceMetric).toBeDefined();
      expect(queryTool!.inputSchema.properties.metadataFilter).toBeDefined();
    });

    it('should have valid schema for delete tool', () => {
      const tools = server.listTools();
      const deleteTool = tools.find(t => t.name === 'pgvector_delete');

      expect(deleteTool).toBeDefined();
      expect(deleteTool!.inputSchema.properties.deleteBy).toBeDefined();
      expect(deleteTool!.inputSchema.properties.ids).toBeDefined();
      expect(deleteTool!.inputSchema.properties.externalIds).toBeDefined();
      expect(deleteTool!.inputSchema.properties.metadataFilter).toBeDefined();
    });

    it('should have valid schema for get tool', () => {
      const tools = server.listTools();
      const getTool = tools.find(t => t.name === 'pgvector_get');

      expect(getTool).toBeDefined();
      expect(getTool!.inputSchema.properties.getBy).toBeDefined();
      expect(getTool!.inputSchema.properties.ids).toBeDefined();
      expect(getTool!.inputSchema.properties.externalIds).toBeDefined();
    });

    it('should have valid schema for admin tool', () => {
      const tools = server.listTools();
      const adminTool = tools.find(t => t.name === 'pgvector_admin');

      expect(adminTool).toBeDefined();
      expect(adminTool!.inputSchema.properties.operation).toBeDefined();
      expect(adminTool!.inputSchema.properties.dimensions).toBeDefined();
      expect(adminTool!.inputSchema.properties.collection).toBeDefined();
      expect(adminTool!.inputSchema.properties.indexType).toBeDefined();
    });
  });

  describe('input validation', () => {
    it('should reject unknown tool name', async () => {
      const result = await server.callTool('unknown_tool', {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown tool');
    });

    it('should reject upsert without required fields', async () => {
      const result = await server.callTool('pgvector_upsert', {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('collection');
    });

    it('should reject upsert with invalid embedding type', async () => {
      const result = await server.callTool('pgvector_upsert', {
        collection: 'test',
        embedding: 'not an array',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('embedding');
    });

    it('should reject query without required fields', async () => {
      const result = await server.callTool('pgvector_query', {});
      expect(result.isError).toBe(true);
    });

    it('should reject delete without deleteBy', async () => {
      const result = await server.callTool('pgvector_delete', {
        collection: 'test',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('deleteBy');
    });

    it('should reject admin without operation', async () => {
      const result = await server.callTool('pgvector_admin', {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('operation');
    });

    it('should validate distanceMetric values', async () => {
      const result = await server.callTool('pgvector_query', {
        collection: 'test',
        queryEmbedding: [0.1, 0.2],
        distanceMetric: 'invalid',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('distanceMetric');
    });

    it('should validate topK is positive', async () => {
      const result = await server.callTool('pgvector_query', {
        collection: 'test',
        queryEmbedding: [0.1, 0.2],
        topK: -1,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('topK');
    });
  });
});

describe('PgVectorMcpServer Integration', () => {
  let server: PgVectorMcpServer;
  const testCollection = 'mcp_test_' + Date.now();

  beforeAll(async () => {
    server = new PgVectorMcpServer({
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT || '5433'),
      database: process.env.PGDATABASE || 'testdb',
      user: process.env.PGUSER || 'testuser',
      password: process.env.PGPASSWORD || 'testpass',
    });

    // Ensure schema exists
    await server.callTool('pgvector_admin', {
      operation: 'ensureSchema',
      dimensions: 3,
    });
  });

  afterAll(async () => {
    // Cleanup test collection
    await server.callTool('pgvector_admin', {
      operation: 'dropCollection',
      collection: testCollection,
    });
    await server.close();
  });

  describe('upsert operations', () => {
    it('should upsert single embedding', async () => {
      const result = await server.callTool('pgvector_upsert', {
        collection: testCollection,
        externalId: 'test-1',
        content: 'Test document 1',
        embedding: [0.1, 0.2, 0.3],
        metadata: { type: 'test' },
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.id).toBeDefined();
    });

    it('should update existing embedding by externalId', async () => {
      const result = await server.callTool('pgvector_upsert', {
        collection: testCollection,
        externalId: 'test-1',
        content: 'Updated document 1',
        embedding: [0.2, 0.3, 0.4],
        metadata: { type: 'test', updated: true },
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
    });

    it('should upsert multiple embeddings', async () => {
      for (let i = 2; i <= 5; i++) {
        const result = await server.callTool('pgvector_upsert', {
          collection: testCollection,
          externalId: `test-${i}`,
          content: `Test document ${i}`,
          embedding: [0.1 * i, 0.2 * i, 0.3 * i],
          metadata: { type: 'test', index: i },
        });
        expect(result.isError).toBe(false);
      }
    });
  });

  describe('query operations', () => {
    it('should query similar embeddings', async () => {
      const result = await server.callTool('pgvector_query', {
        collection: testCollection,
        queryEmbedding: [0.15, 0.25, 0.35],
        topK: 3,
        distanceMetric: 'cosine',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.results).toBeInstanceOf(Array);
      expect(data.results.length).toBeLessThanOrEqual(3);
    });

    it('should query with metadata filter', async () => {
      const result = await server.callTool('pgvector_query', {
        collection: testCollection,
        queryEmbedding: [0.1, 0.2, 0.3],
        topK: 10,
        metadataFilter: { type: 'test' },
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.results.every((r: any) => r.metadata.type === 'test')).toBe(true);
    });

    it('should support pagination with offset', async () => {
      const result1 = await server.callTool('pgvector_query', {
        collection: testCollection,
        queryEmbedding: [0.1, 0.2, 0.3],
        topK: 2,
        offset: 0,
      });

      const result2 = await server.callTool('pgvector_query', {
        collection: testCollection,
        queryEmbedding: [0.1, 0.2, 0.3],
        topK: 2,
        offset: 2,
      });

      expect(result1.isError).toBe(false);
      expect(result2.isError).toBe(false);

      const data1 = JSON.parse(result1.content[0].text);
      const data2 = JSON.parse(result2.content[0].text);

      // Results should be different
      if (data1.results.length > 0 && data2.results.length > 0) {
        expect(data1.results[0].id).not.toBe(data2.results[0].id);
      }
    });
  });

  describe('get operations', () => {
    it('should get by externalId', async () => {
      const result = await server.callTool('pgvector_get', {
        collection: testCollection,
        getBy: 'externalId',
        externalIds: ['test-1', 'test-2'],
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.results).toBeInstanceOf(Array);
      expect(data.results.length).toBe(2);
    });

    it('should return empty for non-existent externalId', async () => {
      const result = await server.callTool('pgvector_get', {
        collection: testCollection,
        getBy: 'externalId',
        externalIds: ['non-existent-id'],
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.results).toHaveLength(0);
    });
  });

  describe('delete operations', () => {
    it('should delete by externalId', async () => {
      // First upsert a doc to delete
      await server.callTool('pgvector_upsert', {
        collection: testCollection,
        externalId: 'to-delete',
        content: 'Will be deleted',
        embedding: [0.9, 0.9, 0.9],
      });

      const result = await server.callTool('pgvector_delete', {
        collection: testCollection,
        deleteBy: 'externalId',
        externalIds: ['to-delete'],
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.deleted).toBeGreaterThanOrEqual(1);

      // Verify deletion
      const getResult = await server.callTool('pgvector_get', {
        collection: testCollection,
        getBy: 'externalId',
        externalIds: ['to-delete'],
      });
      const getData = JSON.parse(getResult.content[0].text);
      expect(getData.results).toHaveLength(0);
    });

    it('should delete by metadata filter', async () => {
      // Upsert docs to delete
      await server.callTool('pgvector_upsert', {
        collection: testCollection,
        externalId: 'delete-by-meta-1',
        embedding: [0.8, 0.8, 0.8],
        metadata: { toDelete: true },
      });

      const result = await server.callTool('pgvector_delete', {
        collection: testCollection,
        deleteBy: 'metadata',
        metadataFilter: { toDelete: true },
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.deleted).toBeGreaterThanOrEqual(1);
    });
  });

  describe('admin operations', () => {
    it('should create index', async () => {
      const result = await server.callTool('pgvector_admin', {
        operation: 'createIndex',
        collection: testCollection,
        indexType: 'hnsw',
        distanceMetric: 'cosine',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
    });
  });
});
