/**
 * Tests for PgVectorStoreTool - AI Agent tool for vector store operations
 */

import { PgVectorStoreTool } from '../../nodes/PgVectorStoreTool.node';

describe('PgVectorStoreTool', () => {
  let toolNode: PgVectorStoreTool;

  beforeEach(() => {
    toolNode = new PgVectorStoreTool();
  });

  describe('node definition', () => {
    it('should have correct node type properties', () => {
      expect(toolNode.description.displayName).toBe('PGVector Store Tool');
      expect(toolNode.description.name).toBe('pgVectorStoreTool');
      expect(toolNode.description.group).toContain('transform');
    });

    it('should be marked as an AI tool node', () => {
      expect(toolNode.description.codex).toBeDefined();
      expect(toolNode.description.codex?.categories).toContain('AI');
      expect(toolNode.description.codex?.subcategories?.AI).toContain('Tools');
    });

    it('should have required credential', () => {
      expect(toolNode.description.credentials).toBeDefined();
      expect(toolNode.description.credentials).toContainEqual(
        expect.objectContaining({ name: 'postgres' })
      );
    });

    it('should output AI tool type', () => {
      expect(toolNode.description.outputs).toContain('ai_tool');
    });

    it('should require embeddings input', () => {
      const inputs = toolNode.description.inputs as Array<{ type: string; required: boolean }>;
      const embeddingsInput = inputs.find(i => i.type === 'ai_embedding');
      expect(embeddingsInput).toBeDefined();
      expect(embeddingsInput?.required).toBe(true);
    });
  });

  describe('node properties', () => {
    it('should have operation selector with all operations', () => {
      const properties = toolNode.description.properties;
      const operationProp = properties.find(p => p.name === 'operation');

      expect(operationProp).toBeDefined();
      expect(operationProp?.type).toBe('options');

      const options = operationProp?.options as Array<{ value: string }>;
      expect(options.map(o => o.value)).toEqual(['query', 'upsert', 'delete', 'get']);
    });

    it('should have collection name property', () => {
      const properties = toolNode.description.properties;
      const collectionProp = properties.find(p => p.name === 'collection');

      expect(collectionProp).toBeDefined();
      expect(collectionProp?.type).toBe('string');
      expect(collectionProp?.required).toBe(true);
      expect(collectionProp?.default).toBe('documents');
    });

    it('should have tool description property', () => {
      const properties = toolNode.description.properties;
      const descProp = properties.find(p => p.name === 'toolDescription');

      expect(descProp).toBeDefined();
      expect(descProp?.type).toBe('string');
    });

    it('should have query-specific properties', () => {
      const properties = toolNode.description.properties;

      const topKProp = properties.find(p => p.name === 'topK');
      expect(topKProp).toBeDefined();
      expect(topKProp?.default).toBe(10);
      expect(topKProp?.displayOptions?.show?.operation).toContain('query');

      const distanceMetricProp = properties.find(p => p.name === 'distanceMetric');
      expect(distanceMetricProp).toBeDefined();
      expect(distanceMetricProp?.displayOptions?.show?.operation).toContain('query');

      const includeContentProp = properties.find(p => p.name === 'includeContent');
      expect(includeContentProp).toBeDefined();
      expect(includeContentProp?.default).toBe(true);
    });
  });

  describe('supplyData method', () => {
    it('should have supplyData method for AI tool integration', () => {
      expect(typeof toolNode.supplyData).toBe('function');
    });
  });

  describe('execute method', () => {
    it('should have execute method', () => {
      expect(typeof toolNode.execute).toBe('function');
    });
  });
});

describe('PgVectorStoreTool documentation', () => {
  it('should have documentation URL configured', () => {
    const toolNode = new PgVectorStoreTool();
    const docUrl = toolNode.description.codex?.resources?.primaryDocumentation?.[0]?.url;

    expect(docUrl).toBeDefined();
    expect(docUrl).toContain('ai-tools');
  });
});
