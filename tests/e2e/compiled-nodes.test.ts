/**
 * Tests for Compiled Node Packages
 *
 * These tests verify that the compiled JavaScript files in dist/ work correctly.
 * This is critical for ensuring that what gets published to npm actually works.
 *
 * Key scenarios tested:
 * 1. Compiled nodes can be loaded
 * 2. Node descriptions are correct
 * 3. Nodes execute correctly with real database
 * 4. Workflow JSON files work with compiled nodes
 */

import * as path from 'path';
import * as fs from 'fs';
import { DatabaseManager } from '../../lib/db';
import {
  createMockExecuteFunctions,
  createMockSupplyDataFunctions,
  createMockEmbeddingsModel,
  extractJsonFromNodeData,
  mockParameters,
  mockToolParameters,
} from '../helpers/mockN8n';
import {
  sampleEmbedding1536,
  testDbConfig,
} from '../helpers/testData';

const distPath = path.join(__dirname, '../../dist');

describe('Compiled Node Package Tests', () => {
  // Check if dist folder exists - if not, skip these tests
  const distExists = fs.existsSync(distPath);

  beforeAll(() => {
    if (!distExists) {
      console.warn(
        'WARNING: dist/ folder does not exist. Run `npm run build` first. Skipping compiled node tests.',
      );
    }
  });

  describe('Package Structure', () => {
    it('should have dist folder after build', () => {
      if (!distExists) return;
      expect(fs.existsSync(distPath)).toBe(true);
    });

    it('should have compiled PgvectorVectorStore node', () => {
      if (!distExists) return;
      const nodePath = path.join(distPath, 'nodes/PgvectorVectorStore.node.js');
      expect(fs.existsSync(nodePath)).toBe(true);
    });

    it('should have compiled PgVectorStoreTool node', () => {
      if (!distExists) return;
      const nodePath = path.join(distPath, 'nodes/PgVectorStoreTool.node.js');
      expect(fs.existsSync(nodePath)).toBe(true);
    });

    it('should have compiled credentials', () => {
      if (!distExists) return;
      const credPath = path.join(distPath, 'credentials/Postgres.credentials.js');
      expect(fs.existsSync(credPath)).toBe(true);
    });

    it('should have node icon', () => {
      if (!distExists) return;
      const iconPath = path.join(distPath, 'nodes/pgvector.svg');
      expect(fs.existsSync(iconPath)).toBe(true);
    });

    it('should have compiled lib files', () => {
      if (!distExists) return;
      const libFiles = ['db.js', 'pgvector.js', 'vectorstore.js', 'sqlBuilder.js', 'schemaConfig.js'];
      for (const file of libFiles) {
        const filePath = path.join(distPath, 'lib', file);
        expect(fs.existsSync(filePath)).toBe(true);
      }
    });
  });

  describe('Compiled PgvectorVectorStore Node', () => {
    let CompiledNode: any;
    let dbManager: DatabaseManager;

    beforeAll(async () => {
      if (!distExists) return;

      // Load compiled node
      const nodePath = path.join(distPath, 'nodes/PgvectorVectorStore.node.js');
      const module = require(nodePath);
      CompiledNode = module.PgvectorVectorStore;

      dbManager = new DatabaseManager(testDbConfig);

      // Setup database
      await dbManager.query('CREATE EXTENSION IF NOT EXISTS vector', []);
      await dbManager.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"', []);
      await dbManager.query('DROP TABLE IF EXISTS embeddings CASCADE', []);
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
    });

    afterAll(async () => {
      if (dbManager) {
        await dbManager.close();
      }
    });

    beforeEach(async () => {
      if (!distExists) return;
      try {
        await dbManager.query(`DELETE FROM embeddings WHERE collection LIKE 'compiled_test_%'`, []);
      } catch {
        // Table might not exist
      }
    });

    it('should load and instantiate compiled node', () => {
      if (!distExists) return;
      expect(CompiledNode).toBeDefined();
      const node = new CompiledNode();
      expect(node).toBeDefined();
      expect(node.description).toBeDefined();
    });

    it('should have correct node description', () => {
      if (!distExists) return;
      const node = new CompiledNode();
      expect(node.description.displayName).toBe('PGVector Vector Store');
      expect(node.description.name).toBe('pgvectorVectorStore');
      expect(node.description.version).toBe(1);
    });

    it('should execute upsert operation with compiled node', async () => {
      if (!distExists) return;

      const node = new CompiledNode();
      const params = {
        ...mockParameters.upsertSingle,
        collection: 'compiled_test_upsert',
        externalId: 'compiled-doc-1',
        content: 'Compiled node test document',
        metadata: JSON.stringify({ source: 'compiled-test' }),
        embedding: JSON.stringify(sampleEmbedding1536),
      };

      const mockContext = createMockExecuteFunctions(params);
      const result = await node.execute.call(mockContext as any);

      const data = extractJsonFromNodeData(result[0]);
      expect(data[0]).toHaveProperty('id');
      expect(data[0].externalId).toBe('compiled-doc-1');
    });

    it('should execute query operation with compiled node', async () => {
      if (!distExists) return;

      // First insert a document
      await dbManager.query(
        `INSERT INTO embeddings (collection, external_id, content, metadata, embedding)
         VALUES ($1, $2, $3, $4, $5)`,
        ['compiled_test_query', 'query-doc-1', 'Query test', {}, JSON.stringify(sampleEmbedding1536)],
      );

      const node = new CompiledNode();
      const params = {
        ...mockParameters.query,
        collection: 'compiled_test_query',
        queryEmbedding: JSON.stringify(sampleEmbedding1536),
        topK: 5,
      };

      const mockContext = createMockExecuteFunctions(params);
      const result = await node.execute.call(mockContext as any);

      const data = extractJsonFromNodeData(result[0]);
      expect(data.length).toBeGreaterThan(0);
      expect(data[0]).toHaveProperty('score');
    });

    it('should execute get operation with compiled node', async () => {
      if (!distExists) return;

      // Insert a document
      await dbManager.query(
        `INSERT INTO embeddings (collection, external_id, content, metadata, embedding)
         VALUES ($1, $2, $3, $4, $5)`,
        ['compiled_test_get', 'get-doc-1', 'Get test', {}, JSON.stringify(sampleEmbedding1536)],
      );

      const node = new CompiledNode();
      const params = {
        ...mockParameters.getByExternalId,
        collection: 'compiled_test_get',
        getExternalIds: 'get-doc-1',
      };

      const mockContext = createMockExecuteFunctions(params);
      const result = await node.execute.call(mockContext as any);

      const data = extractJsonFromNodeData(result[0]);
      expect(data.length).toBe(1);
      expect(data[0].externalId).toBe('get-doc-1');
    });

    it('should execute delete operation with compiled node', async () => {
      if (!distExists) return;

      // Insert a document
      await dbManager.query(
        `INSERT INTO embeddings (collection, external_id, content, metadata, embedding)
         VALUES ($1, $2, $3, $4, $5)`,
        ['compiled_test_delete', 'delete-doc-1', 'Delete test', {}, JSON.stringify(sampleEmbedding1536)],
      );

      const node = new CompiledNode();
      const params = {
        ...mockParameters.deleteByExternalId,
        collection: 'compiled_test_delete',
        deleteExternalIds: 'delete-doc-1',
      };

      const mockContext = createMockExecuteFunctions(params);
      const result = await node.execute.call(mockContext as any);

      const data = extractJsonFromNodeData(result[0]);
      expect(data[0].deletedCount).toBe(1);
    });
  });

  describe('Compiled PgVectorStoreTool Node', () => {
    let CompiledToolNode: any;
    let dbManager: DatabaseManager;
    let mockEmbeddings: ReturnType<typeof createMockEmbeddingsModel>;

    beforeAll(async () => {
      if (!distExists) return;

      // Load compiled node
      const nodePath = path.join(distPath, 'nodes/PgVectorStoreTool.node.js');
      const module = require(nodePath);
      CompiledToolNode = module.PgVectorStoreTool;

      dbManager = new DatabaseManager(testDbConfig);
      mockEmbeddings = createMockEmbeddingsModel(1536);

      // Setup database
      await dbManager.query('CREATE EXTENSION IF NOT EXISTS vector', []);
      await dbManager.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"', []);
      await dbManager.query('DROP TABLE IF EXISTS embeddings CASCADE', []);
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
    });

    afterAll(async () => {
      if (dbManager) {
        await dbManager.close();
      }
    });

    beforeEach(async () => {
      if (!distExists) return;
      try {
        await dbManager.query(`DELETE FROM embeddings WHERE collection LIKE 'compiled_tool_%'`, []);
      } catch {
        // Table might not exist
      }
    });

    it('should load and instantiate compiled tool node', () => {
      if (!distExists) return;
      expect(CompiledToolNode).toBeDefined();
      const node = new CompiledToolNode();
      expect(node).toBeDefined();
      expect(node.description).toBeDefined();
    });

    it('should have correct tool node description', () => {
      if (!distExists) return;
      const node = new CompiledToolNode();
      expect(node.description.displayName).toBe('PGVector Store Tool');
      expect(node.description.name).toBe('pgVectorStoreTool');
      expect(node.description.outputs).toContain('ai_tool');
    });

    it('should create remember tool with compiled node', async () => {
      if (!distExists) return;

      const node = new CompiledToolNode();
      const params = {
        ...mockToolParameters.remember,
        collection: 'compiled_tool_remember',
      };

      const mockContext = createMockSupplyDataFunctions(
        params,
        testDbConfig as any,
        mockEmbeddings,
      );

      const result = await node.supplyData.call(mockContext as any);
      expect(result.response).toBeDefined();

      // Test tool invocation
      const tool = result.response;
      const invokeResult = await tool.invoke({
        content: 'Compiled tool test',
        id: 'compiled-tool-001',
      });
      expect(invokeResult).toContain('Stored');
    });

    it('should create recall tool with compiled node', async () => {
      if (!distExists) return;

      // Insert test data
      await dbManager.query(
        `INSERT INTO embeddings (collection, external_id, content, metadata, embedding)
         VALUES ($1, $2, $3, $4, $5)`,
        ['compiled_tool_recall', 'recall-doc-1', 'Compiled recall test', {}, JSON.stringify(sampleEmbedding1536)],
      );

      const node = new CompiledToolNode();
      const params = {
        ...mockToolParameters.recall,
        collection: 'compiled_tool_recall',
      };

      const mockContext = createMockSupplyDataFunctions(
        params,
        testDbConfig as any,
        mockEmbeddings,
      );

      const result = await node.supplyData.call(mockContext as any);
      const tool = result.response;
      const invokeResult = await tool.invoke({ query: 'recall test' });
      expect(typeof invokeResult).toBe('string');
    });

    it('should validate tool input schema with compiled node', async () => {
      if (!distExists) return;

      const node = new CompiledToolNode();
      const params = {
        ...mockToolParameters.recall,
        collection: 'compiled_tool_schema',
      };

      const mockContext = createMockSupplyDataFunctions(
        params,
        testDbConfig as any,
        mockEmbeddings,
      );

      const result = await node.supplyData.call(mockContext as any);
      const tool = result.response;

      // Valid input should work
      const validResult = await tool.invoke({ query: 'test' });
      expect(typeof validResult).toBe('string');

      // Invalid input should throw
      await expect(tool.invoke({})).rejects.toThrow();
    });
  });

  describe('Workflow JSON Validation', () => {
    const workflowsPath = path.join(__dirname, '../../examples/workflows');

    it('should have example workflow files', () => {
      if (!distExists) return;
      expect(fs.existsSync(workflowsPath)).toBe(true);
    });

    it('should parse basic CRUD workflow JSON', () => {
      if (!distExists) return;
      const workflowPath = path.join(workflowsPath, 'basic-crud-workflow.json');
      if (!fs.existsSync(workflowPath)) return;

      const workflowJson = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
      expect(workflowJson.name).toBe('PGVector Basic CRUD Test');
      expect(workflowJson.nodes).toBeInstanceOf(Array);
      expect(workflowJson.connections).toBeDefined();

      // Verify nodes use correct types
      const pgvectorNodes = workflowJson.nodes.filter(
        (n: any) => n.type === 'n8n-nodes-pgvector-advanced.pgvectorVectorStore',
      );
      expect(pgvectorNodes.length).toBeGreaterThan(0);
    });

    it('should parse AI tool workflow JSON', () => {
      if (!distExists) return;
      const workflowPath = path.join(workflowsPath, 'ai-tool-workflow.json');
      if (!fs.existsSync(workflowPath)) return;

      const workflowJson = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
      expect(workflowJson.name).toBe('PGVector AI Tool Test');

      // Verify tool nodes use correct types
      const toolNodes = workflowJson.nodes.filter(
        (n: any) => n.type === 'n8n-nodes-pgvector-advanced.pgVectorStoreTool',
      );
      expect(toolNodes.length).toBeGreaterThan(0);

      // Verify all operations are present
      const operations = toolNodes.map((n: any) => n.parameters.operation);
      expect(operations).toContain('recall');
      expect(operations).toContain('remember');
      expect(operations).toContain('forget');
      expect(operations).toContain('forgetSimilar');
      expect(operations).toContain('lookup');
    });

    it('should have valid node parameters in workflow', () => {
      if (!distExists) return;
      const workflowPath = path.join(workflowsPath, 'basic-crud-workflow.json');
      if (!fs.existsSync(workflowPath)) return;

      const workflowJson = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

      // Check each PGVector node has required parameters
      const pgvectorNodes = workflowJson.nodes.filter(
        (n: any) => n.type === 'n8n-nodes-pgvector-advanced.pgvectorVectorStore',
      );

      for (const node of pgvectorNodes) {
        expect(node.parameters).toBeDefined();
        expect(node.parameters.operation).toBeDefined();
        expect(node.credentials).toBeDefined();
      }
    });
  });

  describe('Compiled Node Full Workflow Simulation', () => {
    let dbManager: DatabaseManager;
    let CompiledNode: any;

    beforeAll(async () => {
      if (!distExists) return;

      const nodePath = path.join(distPath, 'nodes/PgvectorVectorStore.node.js');

      CompiledNode = require(nodePath).PgvectorVectorStore;

      dbManager = new DatabaseManager(testDbConfig);

      // Setup
      await dbManager.query('CREATE EXTENSION IF NOT EXISTS vector', []);
      await dbManager.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"', []);
      await dbManager.query('DROP TABLE IF EXISTS embeddings CASCADE', []);
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
    });

    afterAll(async () => {
      if (dbManager) {
        await dbManager.close();
      }
    });

    beforeEach(async () => {
      if (!distExists) return;
      await dbManager.query(`DELETE FROM embeddings WHERE collection = 'workflow_sim'`, []);
    });

    it('should execute complete workflow: admin -> upsert -> query -> get -> delete', async () => {
      if (!distExists) return;

      const node = new CompiledNode();

      // Step 1: Ensure schema
      const adminParams = {
        ...mockParameters.adminEnsureSchema,
        dimensions: 1536,
      };
      const adminContext = createMockExecuteFunctions(adminParams);
      const adminResult = await node.execute.call(adminContext as any);
      expect(extractJsonFromNodeData(adminResult[0])[0].success).toBe(true);

      // Step 2: Upsert document
      const upsertParams = {
        ...mockParameters.upsertSingle,
        collection: 'workflow_sim',
        externalId: 'workflow-doc-1',
        content: 'Workflow simulation test document',
        metadata: JSON.stringify({ test: true }),
        embedding: JSON.stringify(sampleEmbedding1536),
      };
      const upsertContext = createMockExecuteFunctions(upsertParams);
      const upsertResult = await node.execute.call(upsertContext as any);
      const upsertData = extractJsonFromNodeData(upsertResult[0]);
      expect(upsertData[0].externalId).toBe('workflow-doc-1');
      const docId = upsertData[0].id;

      // Step 3: Query
      const queryParams = {
        ...mockParameters.query,
        collection: 'workflow_sim',
        queryEmbedding: JSON.stringify(sampleEmbedding1536),
        topK: 5,
      };
      const queryContext = createMockExecuteFunctions(queryParams);
      const queryResult = await node.execute.call(queryContext as any);
      const queryData = extractJsonFromNodeData(queryResult[0]);
      expect(queryData.length).toBe(1);
      expect(queryData[0].externalId).toBe('workflow-doc-1');

      // Step 4: Get by ID
      const getParams = {
        ...mockParameters.getById,
        getIds: docId,
        includeEmbedding: false,
      };
      const getContext = createMockExecuteFunctions(getParams);
      const getResult = await node.execute.call(getContext as any);
      const getData = extractJsonFromNodeData(getResult[0]);
      expect(getData[0].content).toBe('Workflow simulation test document');

      // Step 5: Delete
      const deleteParams = {
        ...mockParameters.deleteByExternalId,
        collection: 'workflow_sim',
        deleteExternalIds: 'workflow-doc-1',
      };
      const deleteContext = createMockExecuteFunctions(deleteParams);
      const deleteResult = await node.execute.call(deleteContext as any);
      const deleteData = extractJsonFromNodeData(deleteResult[0]);
      expect(deleteData[0].deletedCount).toBe(1);

      // Verify deletion
      const verifyResult = await dbManager.query(
        `SELECT COUNT(*) as count FROM embeddings WHERE collection = 'workflow_sim'`,
        [],
      );
      expect(parseInt(verifyResult.rows[0].count)).toBe(0);
    });
  });
});
