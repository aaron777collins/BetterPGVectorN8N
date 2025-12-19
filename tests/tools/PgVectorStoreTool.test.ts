/**
 * Tests for PgVectorStoreTool - AI Agent tool for vector store operations
 * Operations: Remember, Recall, Forget, Forget Similar, Lookup
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

  describe('operations', () => {
    it('should have all five operations', () => {
      const properties = toolNode.description.properties;
      const operationProp = properties.find(p => p.name === 'operation');

      expect(operationProp).toBeDefined();
      expect(operationProp?.type).toBe('options');

      const options = operationProp?.options as Array<{ value: string }>;
      expect(options.map(o => o.value)).toEqual([
        'recall',
        'remember',
        'forget',
        'forgetSimilar',
        'lookup',
      ]);
    });

    it('should have user-friendly operation names', () => {
      const operationProp = toolNode.description.properties.find(p => p.name === 'operation');
      const options = operationProp?.options as Array<{ name: string; value: string }>;

      expect(options.find(o => o.value === 'recall')?.name).toContain('Search');
      expect(options.find(o => o.value === 'remember')?.name).toContain('Store');
      expect(options.find(o => o.value === 'forget')?.name).toContain('Delete by ID');
      expect(options.find(o => o.value === 'forgetSimilar')?.name).toContain('Delete by Concept');
      expect(options.find(o => o.value === 'lookup')?.name).toContain('Get by ID');
    });
  });

  describe('common properties', () => {
    it('should have collection name property', () => {
      const properties = toolNode.description.properties;
      const collectionProp = properties.find(p => p.name === 'collection');

      expect(collectionProp).toBeDefined();
      expect(collectionProp?.type).toBe('string');
      expect(collectionProp?.required).toBe(true);
      expect(collectionProp?.default).toBe('knowledge');
    });

    it('should have tool description property', () => {
      const properties = toolNode.description.properties;
      const descProp = properties.find(p => p.name === 'toolDescription');

      expect(descProp).toBeDefined();
      expect(descProp?.type).toBe('string');
    });
  });

  describe('recall-specific properties', () => {
    it('should have topK property for recall', () => {
      const properties = toolNode.description.properties;
      const topKProp = properties.find(p => p.name === 'topK');

      expect(topKProp).toBeDefined();
      expect(topKProp?.default).toBe(5);
      expect(topKProp?.displayOptions?.show?.operation).toContain('recall');
    });

    it('should have minSimilarity threshold for recall', () => {
      const properties = toolNode.description.properties;
      const minSimProp = properties.find(p => p.name === 'minSimilarity');

      expect(minSimProp).toBeDefined();
      expect(minSimProp?.type).toBe('number');
      expect(minSimProp?.default).toBe(0);
      expect(minSimProp?.displayOptions?.show?.operation).toContain('recall');
    });

    it('should have distance metric for recall and forgetSimilar', () => {
      const properties = toolNode.description.properties;
      const distanceMetricProp = properties.find(p => p.name === 'distanceMetric');

      expect(distanceMetricProp).toBeDefined();
      expect(distanceMetricProp?.displayOptions?.show?.operation).toContain('recall');
      expect(distanceMetricProp?.displayOptions?.show?.operation).toContain('forgetSimilar');
    });
  });

  describe('remember-specific properties', () => {
    it('should have updateThreshold for concept-based updates', () => {
      const properties = toolNode.description.properties;
      const thresholdProp = properties.find(p => p.name === 'updateThreshold');

      expect(thresholdProp).toBeDefined();
      expect(thresholdProp?.type).toBe('number');
      expect(thresholdProp?.default).toBe(0.7);
      expect(thresholdProp?.displayOptions?.show?.operation).toContain('remember');
    });

    it('should have distance metric available for remember', () => {
      const properties = toolNode.description.properties;
      const distanceMetricProp = properties.find(p => p.name === 'distanceMetric');

      expect(distanceMetricProp?.displayOptions?.show?.operation).toContain('remember');
    });
  });

  describe('forgetSimilar-specific properties', () => {
    it('should have similarity threshold for forgetSimilar', () => {
      const properties = toolNode.description.properties;
      const thresholdProp = properties.find(p => p.name === 'similarityThreshold');

      expect(thresholdProp).toBeDefined();
      expect(thresholdProp?.type).toBe('number');
      expect(thresholdProp?.default).toBe(0.8);
      expect(thresholdProp?.displayOptions?.show?.operation).toContain('forgetSimilar');
    });

    it('should have dryRun option for forgetSimilar defaulting to true', () => {
      const properties = toolNode.description.properties;
      const dryRunProp = properties.find(p => p.name === 'dryRun');

      expect(dryRunProp).toBeDefined();
      expect(dryRunProp?.type).toBe('boolean');
      expect(dryRunProp?.default).toBe(true);
      expect(dryRunProp?.displayOptions?.show?.operation).toContain('forgetSimilar');
    });
  });

  describe('methods', () => {
    it('should have supplyData method for AI tool integration', () => {
      expect(typeof toolNode.supplyData).toBe('function');
    });

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
