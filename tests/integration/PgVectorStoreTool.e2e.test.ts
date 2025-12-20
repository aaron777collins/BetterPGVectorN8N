/**
 * End-to-End Integration Tests for PgVectorStoreTool Node
 *
 * These tests simulate real AI agent workflow execution with a live database.
 * They test the complete integration of the tool node including:
 * - Tool creation via supplyData()
 * - Zod schema validation
 * - Tool execution with various input formats
 * - Real database operations
 *
 * This addresses the error: "Received tool input did not match expected schema"
 * by testing all possible input variations that an AI agent might send.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { PgVectorStoreTool } from '../../nodes/PgVectorStoreTool.node';
import { DatabaseManager } from '../../lib/db';
import {
  createMockSupplyDataFunctions,
  createMockEmbeddingsModel,
  mockToolParameters,
} from '../helpers/mockN8n';
import {
  sampleEmbedding1536,
  testDbConfig,
} from '../helpers/testData';

describe('PgVectorStoreTool E2E Integration Tests', () => {
  let toolNode: PgVectorStoreTool;
  let dbManager: DatabaseManager;
  let mockEmbeddings: ReturnType<typeof createMockEmbeddingsModel>;

  beforeAll(async () => {
    toolNode = new PgVectorStoreTool();
    dbManager = new DatabaseManager(testDbConfig);
    mockEmbeddings = createMockEmbeddingsModel(1536);

    // Ensure pgvector extension is installed
    await dbManager.query('CREATE EXTENSION IF NOT EXISTS vector', []);
    await dbManager.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"', []);

    // Drop and recreate table to ensure correct dimensions
    await dbManager.query('DROP TABLE IF EXISTS embeddings CASCADE', []);

    // Create embeddings table
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
    await dbManager.close();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    try {
      await dbManager.query(
        `DELETE FROM embeddings WHERE collection LIKE 'test_%' OR collection = 'knowledge'`,
        [],
      );
    } catch {
      // Table might not exist yet
    }
  });

  describe('Tool Creation via supplyData()', () => {
    it('should create recall tool with correct schema', async () => {
      const mockContext = createMockSupplyDataFunctions(
        mockToolParameters.recall,
        testDbConfig as any,
        mockEmbeddings,
      );

      const result = await toolNode.supplyData.call(mockContext as any);

      expect(result.response).toBeInstanceOf(DynamicStructuredTool);
      const tool = result.response as DynamicStructuredTool;
      expect(tool.name).toBe('recall_knowledge');
      expect(tool.description).toContain('knowledge');
    });

    it('should create remember tool with correct schema', async () => {
      const mockContext = createMockSupplyDataFunctions(
        mockToolParameters.remember,
        testDbConfig as any,
        mockEmbeddings,
      );

      const result = await toolNode.supplyData.call(mockContext as any);

      expect(result.response).toBeInstanceOf(DynamicStructuredTool);
      const tool = result.response as DynamicStructuredTool;
      expect(tool.name).toBe('remember_knowledge');
    });

    it('should create forget tool with correct schema', async () => {
      const mockContext = createMockSupplyDataFunctions(
        mockToolParameters.forget,
        testDbConfig as any,
        mockEmbeddings,
      );

      const result = await toolNode.supplyData.call(mockContext as any);

      expect(result.response).toBeInstanceOf(DynamicStructuredTool);
      const tool = result.response as DynamicStructuredTool;
      expect(tool.name).toBe('forget_knowledge');
    });

    it('should create forgetSimilar tool with correct schema', async () => {
      const mockContext = createMockSupplyDataFunctions(
        mockToolParameters.forgetSimilar,
        testDbConfig as any,
        mockEmbeddings,
      );

      const result = await toolNode.supplyData.call(mockContext as any);

      expect(result.response).toBeInstanceOf(DynamicStructuredTool);
      const tool = result.response as DynamicStructuredTool;
      expect(tool.name).toBe('forget_similar_knowledge');
    });

    it('should create lookup tool with correct schema', async () => {
      const mockContext = createMockSupplyDataFunctions(
        mockToolParameters.lookup,
        testDbConfig as any,
        mockEmbeddings,
      );

      const result = await toolNode.supplyData.call(mockContext as any);

      expect(result.response).toBeInstanceOf(DynamicStructuredTool);
      const tool = result.response as DynamicStructuredTool;
      expect(tool.name).toBe('lookup_knowledge');
    });

    it('should throw error when embeddings model is not connected', async () => {
      const mockContext = createMockSupplyDataFunctions(
        mockToolParameters.recall,
        testDbConfig as any,
        undefined, // No embeddings model
      );

      await expect(toolNode.supplyData.call(mockContext as any)).rejects.toThrow(
        'An embeddings model must be connected',
      );
    });
  });

  describe('Recall Tool Schema Validation', () => {
    let recallTool: DynamicStructuredTool;

    beforeEach(async () => {
      // Insert test document for recall tests
      await dbManager.query(
        `INSERT INTO embeddings (collection, external_id, content, metadata, embedding)
         VALUES ($1, $2, $3, $4, $5)`,
        ['knowledge', 'test-doc-1', 'Test document about AI', { category: 'ai' }, JSON.stringify(sampleEmbedding1536)],
      );

      const mockContext = createMockSupplyDataFunctions(
        mockToolParameters.recall,
        testDbConfig as any,
        mockEmbeddings,
      );

      const result = await toolNode.supplyData.call(mockContext as any);
      recallTool = result.response as DynamicStructuredTool;
    });

    it('should accept input with "query" field', async () => {
      const result = await recallTool.invoke({ query: 'artificial intelligence' });
      expect(typeof result).toBe('string');
      expect(result).not.toContain('Failed');
    });

    it('should accept input with "input" field (alternative)', async () => {
      const result = await recallTool.invoke({ input: 'artificial intelligence' });
      expect(typeof result).toBe('string');
      expect(result).not.toContain('Failed');
    });

    it('should accept input with metadata filter', async () => {
      const result = await recallTool.invoke({
        query: 'AI',
        filter: { category: 'ai' },
      });
      expect(typeof result).toBe('string');
    });

    it('should reject input with neither query nor input', async () => {
      await expect(recallTool.invoke({ filter: { category: 'ai' } })).rejects.toThrow();
    });

    it('should reject completely empty input', async () => {
      await expect(recallTool.invoke({})).rejects.toThrow();
    });
  });

  describe('Remember Tool Schema Validation', () => {
    let rememberTool: DynamicStructuredTool;

    beforeEach(async () => {
      const mockContext = createMockSupplyDataFunctions(
        mockToolParameters.remember,
        testDbConfig as any,
        mockEmbeddings,
      );

      const result = await toolNode.supplyData.call(mockContext as any);
      rememberTool = result.response as DynamicStructuredTool;
    });

    it('should accept input with "content" field', async () => {
      const result = await rememberTool.invoke({
        content: 'Important meeting notes about project X',
        id: 'meeting-001',
      });
      expect(typeof result).toBe('string');
      expect(result).toContain('Stored successfully');
    });

    it('should accept input with "text" field (alternative)', async () => {
      const result = await rememberTool.invoke({
        text: 'Important meeting notes about project Y',
        id: 'meeting-002',
      });
      expect(typeof result).toBe('string');
      expect(result).toContain('Stored successfully');
    });

    it('should accept input with metadata', async () => {
      const result = await rememberTool.invoke({
        content: 'Project update',
        id: 'update-001',
        metadata: { project: 'X', priority: 'high' },
      });
      expect(typeof result).toBe('string');
      expect(result).toContain('Stored successfully');
    });

    it('should accept input with updateSimilar for concept-based update', async () => {
      // First store something
      await rememberTool.invoke({
        content: 'Original meeting notes',
        id: 'original-001',
      });

      // Try to update similar
      const result = await rememberTool.invoke({
        content: 'Updated meeting notes',
        updateSimilar: 'meeting notes',
      });
      expect(typeof result).toBe('string');
    });

    it('should reject input with neither content nor text', async () => {
      await expect(rememberTool.invoke({ id: 'test-id' })).rejects.toThrow();
    });

    it('should reject completely empty input', async () => {
      await expect(rememberTool.invoke({})).rejects.toThrow();
    });
  });

  describe('Remember Tool with Auto-Generate ID', () => {
    let rememberTool: DynamicStructuredTool;

    beforeEach(async () => {
      const mockContext = createMockSupplyDataFunctions(
        mockToolParameters.rememberAutoId,
        testDbConfig as any,
        mockEmbeddings,
      );

      const result = await toolNode.supplyData.call(mockContext as any);
      rememberTool = result.response as DynamicStructuredTool;
    });

    it('should auto-generate ID when not provided', async () => {
      const result = await rememberTool.invoke({
        content: 'Auto-generated ID test',
      });
      expect(typeof result).toBe('string');
      expect(result).toContain('Stored successfully');
      expect(result).toContain('ID: knowledge-'); // Auto-generated prefix
    });
  });

  describe('Forget Tool Schema Validation', () => {
    let forgetTool: DynamicStructuredTool;

    beforeEach(async () => {
      // Insert test document
      await dbManager.query(
        `INSERT INTO embeddings (collection, external_id, content, metadata, embedding)
         VALUES ($1, $2, $3, $4, $5)`,
        ['knowledge', 'delete-me', 'Document to delete', {}, JSON.stringify(sampleEmbedding1536)],
      );

      const mockContext = createMockSupplyDataFunctions(
        mockToolParameters.forget,
        testDbConfig as any,
        mockEmbeddings,
      );

      const result = await toolNode.supplyData.call(mockContext as any);
      forgetTool = result.response as DynamicStructuredTool;
    });

    it('should accept input with id field', async () => {
      const result = await forgetTool.invoke({ id: 'delete-me' });
      expect(typeof result).toBe('string');
      expect(result).toContain('Deleted entry');
    });

    it('should return "not found" for non-existent id', async () => {
      const result = await forgetTool.invoke({ id: 'non-existent' });
      expect(typeof result).toBe('string');
      expect(result).toContain('No entry found');
    });

    it('should reject input without id', async () => {
      await expect(forgetTool.invoke({})).rejects.toThrow();
    });
  });

  describe('Forget Similar Tool Schema Validation', () => {
    let forgetSimilarTool: DynamicStructuredTool;

    beforeEach(async () => {
      // Insert test documents
      await dbManager.query(
        `INSERT INTO embeddings (collection, external_id, content, metadata, embedding)
         VALUES ($1, $2, $3, $4, $5)`,
        ['knowledge', 'similar-1', 'Document about cats and pets', {}, JSON.stringify(sampleEmbedding1536)],
      );

      const mockContext = createMockSupplyDataFunctions(
        mockToolParameters.forgetSimilar,
        testDbConfig as any,
        mockEmbeddings,
      );

      const result = await toolNode.supplyData.call(mockContext as any);
      forgetSimilarTool = result.response as DynamicStructuredTool;
    });

    it('should accept input with "concept" field', async () => {
      const result = await forgetSimilarTool.invoke({ concept: 'pets' });
      expect(typeof result).toBe('string');
      // In dry run mode, should show what would be deleted
    });

    it('should accept input with "input" field (alternative)', async () => {
      const result = await forgetSimilarTool.invoke({ input: 'pets' });
      expect(typeof result).toBe('string');
    });

    it('should accept input with "query" field (alternative)', async () => {
      const result = await forgetSimilarTool.invoke({ query: 'pets' });
      expect(typeof result).toBe('string');
    });

    it('should reject input without concept, input, or query', async () => {
      await expect(forgetSimilarTool.invoke({})).rejects.toThrow();
    });
  });

  describe('Lookup Tool Schema Validation', () => {
    let lookupTool: DynamicStructuredTool;

    beforeEach(async () => {
      // Insert test document
      await dbManager.query(
        `INSERT INTO embeddings (collection, external_id, content, metadata, embedding, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        ['knowledge', 'lookup-me', 'Document to lookup', { tag: 'test' }, JSON.stringify(sampleEmbedding1536)],
      );

      const mockContext = createMockSupplyDataFunctions(
        mockToolParameters.lookup,
        testDbConfig as any,
        mockEmbeddings,
      );

      const result = await toolNode.supplyData.call(mockContext as any);
      lookupTool = result.response as DynamicStructuredTool;
    });

    it('should accept input with id field', async () => {
      const result = await lookupTool.invoke({ id: 'lookup-me' });
      expect(typeof result).toBe('string');
      expect(result).toContain('Entry ID: lookup-me');
      expect(result).toContain('Document to lookup');
    });

    it('should include metadata when configured', async () => {
      const result = await lookupTool.invoke({ id: 'lookup-me' });
      expect(result).toContain('Tags:');
    });

    it('should include timestamps when configured', async () => {
      const result = await lookupTool.invoke({ id: 'lookup-me' });
      expect(result).toContain('Created:');
    });

    it('should return "not found" for non-existent id', async () => {
      const result = await lookupTool.invoke({ id: 'non-existent' });
      expect(result).toContain('No entry found');
    });

    it('should reject input without id', async () => {
      await expect(lookupTool.invoke({})).rejects.toThrow();
    });
  });

  describe('Full Workflow Integration', () => {
    it('should complete a full remember -> recall -> lookup -> forget workflow', async () => {
      // Create tools
      const rememberContext = createMockSupplyDataFunctions(
        { ...mockToolParameters.remember, collection: 'test_workflow' },
        testDbConfig as any,
        mockEmbeddings,
      );
      const recallContext = createMockSupplyDataFunctions(
        { ...mockToolParameters.recall, collection: 'test_workflow' },
        testDbConfig as any,
        mockEmbeddings,
      );
      const lookupContext = createMockSupplyDataFunctions(
        { ...mockToolParameters.lookup, collection: 'test_workflow' },
        testDbConfig as any,
        mockEmbeddings,
      );
      const forgetContext = createMockSupplyDataFunctions(
        { ...mockToolParameters.forget, collection: 'test_workflow' },
        testDbConfig as any,
        mockEmbeddings,
      );

      const rememberResult = await toolNode.supplyData.call(rememberContext as any);
      const recallResult = await toolNode.supplyData.call(recallContext as any);
      const lookupResult = await toolNode.supplyData.call(lookupContext as any);
      const forgetResult = await toolNode.supplyData.call(forgetContext as any);

      const rememberTool = rememberResult.response as DynamicStructuredTool;
      const recallTool = recallResult.response as DynamicStructuredTool;
      const lookupTool = lookupResult.response as DynamicStructuredTool;
      const forgetTool = forgetResult.response as DynamicStructuredTool;

      // Step 1: Remember
      const storeResult = await rememberTool.invoke({
        content: 'Meeting notes: Discussed Q4 budget and hiring plans',
        id: 'meeting-q4-budget',
        metadata: { type: 'meeting', quarter: 'Q4' },
      });
      expect(storeResult).toContain('Stored successfully');

      // Step 2: Recall
      const searchResult = await recallTool.invoke({
        query: 'Q4 budget discussion',
      });
      expect(searchResult).toContain('budget');

      // Step 3: Lookup
      const getResult = await lookupTool.invoke({
        id: 'meeting-q4-budget',
      });
      expect(getResult).toContain('Meeting notes');
      expect(getResult).toContain('Q4 budget');

      // Step 4: Forget
      const deleteResult = await forgetTool.invoke({
        id: 'meeting-q4-budget',
      });
      expect(deleteResult).toContain('Deleted');

      // Verify deletion
      const verifyResult = await lookupTool.invoke({
        id: 'meeting-q4-budget',
      });
      expect(verifyResult).toContain('No entry found');
    });

    it('should handle update existing entry by ID', async () => {
      const rememberContext = createMockSupplyDataFunctions(
        { ...mockToolParameters.remember, collection: 'test_update' },
        testDbConfig as any,
        mockEmbeddings,
      );

      const rememberResult = await toolNode.supplyData.call(rememberContext as any);
      const rememberTool = rememberResult.response as DynamicStructuredTool;

      // Store original
      const storeResult1 = await rememberTool.invoke({
        content: 'Version 1 content',
        id: 'doc-version',
      });
      expect(storeResult1).toContain('Stored');

      // Update with same ID
      const storeResult2 = await rememberTool.invoke({
        content: 'Version 2 content - updated',
        id: 'doc-version',
      });
      expect(storeResult2).toContain('Updated');

      // Verify only one record exists
      const countResult = await dbManager.query(
        `SELECT COUNT(*) as count FROM embeddings WHERE collection = 'test_update' AND external_id = 'doc-version'`,
        [],
      );
      expect(parseInt(countResult.rows[0].count)).toBe(1);

      // Verify content was updated
      const contentResult = await dbManager.query(
        `SELECT content FROM embeddings WHERE collection = 'test_update' AND external_id = 'doc-version'`,
        [],
      );
      expect(contentResult.rows[0].content).toContain('Version 2');
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      const badCredentials = {
        host: 'invalid-host',
        port: 5432,
        database: 'invalid',
        user: 'invalid',
        password: 'invalid',
        ssl: false,
      };

      const mockContext = createMockSupplyDataFunctions(
        mockToolParameters.recall,
        badCredentials as any,
        mockEmbeddings,
      );

      const result = await toolNode.supplyData.call(mockContext as any);
      const tool = result.response as DynamicStructuredTool;

      // The tool should be created, but invocation should fail gracefully
      const invokeResult = await tool.invoke({ query: 'test' });
      expect(invokeResult).toContain('failed');
    });

    it('should handle malformed metadata in remember tool', async () => {
      const mockContext = createMockSupplyDataFunctions(
        mockToolParameters.remember,
        testDbConfig as any,
        mockEmbeddings,
      );

      const result = await toolNode.supplyData.call(mockContext as any);
      const tool = result.response as DynamicStructuredTool;

      // Should handle complex metadata without error
      const invokeResult = await tool.invoke({
        content: 'Test with complex metadata',
        id: 'complex-meta-test',
        metadata: {
          nested: { deep: { value: 123 } },
          array: [1, 2, 3],
          nullValue: null,
        },
      });
      expect(invokeResult).toContain('Stored');
    });
  });

  describe('Schema Mode: Field Mapping', () => {
    it('should work with custom field mapping', async () => {
      // Create custom table with all required columns
      await dbManager.query(`DROP TABLE IF EXISTS custom_vectors`, []);
      await dbManager.query(
        `CREATE TABLE custom_vectors (
          my_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          category TEXT NOT NULL,
          my_external_id TEXT,
          my_content TEXT,
          my_meta JSONB NOT NULL DEFAULT '{}',
          vec VECTOR(1536) NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(category, my_external_id)
        )`,
        [],
      );

      const params = {
        ...mockToolParameters.remember,
        schemaMode: 'fieldMapping',
        tableName: 'custom_vectors',
        collection: 'custom_cat',
        columnMapping: {
          columns: {
            id: 'my_id',
            embedding: 'vec',
            content: 'my_content',
            metadata: 'my_meta',
            partition: 'category',
            externalId: 'my_external_id',
          },
        },
      };

      const mockContext = createMockSupplyDataFunctions(
        params,
        testDbConfig as any,
        mockEmbeddings,
      );

      const result = await toolNode.supplyData.call(mockContext as any);
      const tool = result.response as DynamicStructuredTool;

      const invokeResult = await tool.invoke({
        content: 'Custom schema test',
        id: 'custom-001',
      });

      expect(invokeResult).toContain('Stored');

      // Verify in database
      const dbResult = await dbManager.query(
        `SELECT * FROM custom_vectors WHERE category = 'custom_cat' AND my_external_id = 'custom-001'`,
        [],
      );
      expect(dbResult.rows.length).toBe(1);
      expect(dbResult.rows[0].my_content).toBe('Custom schema test');
    });
  });
});
