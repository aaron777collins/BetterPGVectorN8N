/**
 * Mock n8n execution context and helpers for testing
 */

import {
  IExecuteFunctions,
  INodeExecutionData,
  ICredentialDataDecryptedObject,
  ISupplyDataFunctions,
} from 'n8n-workflow';
import { testDbConfig } from './testData';

/**
 * Create a mock IExecuteFunctions object for testing
 */
export function createMockExecuteFunctions(
  parameters: Record<string, any> = {},
  inputData: INodeExecutionData[] = [],
  credentials: ICredentialDataDecryptedObject = testDbConfig as any,
): Partial<IExecuteFunctions> {
  const mockContext = {
    // Mock getCredentials
    getCredentials: jest.fn().mockResolvedValue(credentials),

    // Mock getNodeParameter
    getNodeParameter: jest.fn((paramName: string, _itemIndex: number, defaultValue?: any) => {
      const value = parameters[paramName];
      return value !== undefined ? value : defaultValue;
    }),

    // Mock getInputData
    getInputData: jest.fn().mockReturnValue(inputData),

    // Mock helpers
    helpers: {
      returnJsonArray: jest.fn((data: any) => {
        if (Array.isArray(data)) {
          return data.map(item => ({ json: item }));
        }
        return [{ json: data }];
      }),
    },

    // Mock getNode
    getNode: jest.fn().mockReturnValue({
      name: 'PGVector Vector Store',
      type: 'n8n-nodes-pgvector-advanced.pgvectorVectorStore',
      typeVersion: 1,
      position: [250, 300],
    }),

    // Mock getWorkflow
    getWorkflow: jest.fn().mockReturnValue({
      name: 'Test Workflow',
      id: 'test-workflow-id',
    }),

    // Mock getExecutionId
    getExecutionId: jest.fn().mockReturnValue('test-execution-id'),

    // Mock continueOnFail
    continueOnFail: jest.fn().mockReturnValue(false),

    // Mock getMode
    getMode: jest.fn().mockReturnValue('manual'),
  };

  return mockContext as unknown as Partial<IExecuteFunctions>;
}

/**
 * Create mock input data for n8n node
 */
export function createMockInputData(items: any[]): INodeExecutionData[] {
  return items.map(item => ({
    json: item,
  }));
}

/**
 * Create mock credentials
 */
export function createMockCredentials(
  overrides: Partial<typeof testDbConfig> = {},
): ICredentialDataDecryptedObject {
  return {
    ...testDbConfig,
    ...overrides,
  } as any;
}

/**
 * Mock n8n NodeOperationError
 */
export class MockNodeOperationError extends Error {
  constructor(
    public node: any,
    message: string,
    public description?: string,
  ) {
    super(message);
    this.name = 'NodeOperationError';
  }
}

/**
 * Helper to extract JSON from node execution data
 */
export function extractJsonFromNodeData(data: INodeExecutionData[]): any[] {
  return data.map(item => item.json);
}

/**
 * Helper to validate node output structure
 */
export function validateNodeOutput(output: INodeExecutionData[]): void {
  expect(Array.isArray(output)).toBe(true);
  output.forEach(item => {
    expect(item).toHaveProperty('json');
    expect(typeof item.json).toBe('object');
  });
}

/**
 * Mock parameter configurations for different operations
 */
export const mockParameters = {
  // Upsert - Single mode
  upsertSingle: {
    operation: 'upsert',
    upsertMode: 'single',
    collection: 'test_collection',
    dimensions: 1536,
    externalId: 'test-doc-1',
    content: 'Test document content',
    metadata: JSON.stringify({ category: 'test' }),
    embedding: JSON.stringify(Array(1536).fill(0.1)),
  },

  // Upsert - Batch mode
  upsertBatch: {
    operation: 'upsert',
    upsertMode: 'batch',
    collection: 'test_collection',
    dimensions: 1536,
    fieldMapping: {
      idField: 'id',
      externalIdField: 'docId',
      contentField: 'text',
      metadataField: 'meta',
      embeddingField: 'vector',
    },
  },

  // Query operation
  query: {
    operation: 'query',
    collection: 'test_collection',
    queryEmbedding: JSON.stringify(Array(1536).fill(0.1)),
    topK: 10,
    offset: 0,
    distanceMetric: 'cosine',
    metadataFilter: JSON.stringify({}),
    includeEmbedding: false,
  },

  // Query with metadata filter
  queryWithFilter: {
    operation: 'query',
    collection: 'test_collection',
    queryEmbedding: JSON.stringify(Array(1536).fill(0.1)),
    topK: 5,
    distanceMetric: 'cosine',
    metadataFilter: JSON.stringify({ category: 'technology' }),
    includeEmbedding: false,
  },

  // Delete by ID
  deleteById: {
    operation: 'delete',
    deleteBy: 'id',
    deleteIds: '550e8400-e29b-41d4-a716-446655440000',
  },

  // Delete by external ID
  deleteByExternalId: {
    operation: 'delete',
    collection: 'test_collection',
    deleteBy: 'externalId',
    deleteExternalIds: 'doc-1, doc-2',
  },

  // Delete by metadata
  deleteByMetadata: {
    operation: 'delete',
    collection: 'test_collection',
    deleteBy: 'metadata',
    deleteMetadataFilter: JSON.stringify({ status: 'archived' }),
  },

  // Get by ID
  getById: {
    operation: 'get',
    getBy: 'id',
    getIds: '550e8400-e29b-41d4-a716-446655440000',
    includeEmbedding: true,
  },

  // Get by external ID
  getByExternalId: {
    operation: 'get',
    collection: 'test_collection',
    getBy: 'externalId',
    getExternalIds: 'doc-1, doc-2',
    includeEmbedding: false,
  },

  // Admin - Ensure schema
  adminEnsureSchema: {
    operation: 'admin',
    adminOperation: 'ensureSchema',
    dimensions: 1536,
  },

  // Admin - Create index
  adminCreateIndex: {
    operation: 'admin',
    adminOperation: 'createIndex',
    adminCollection: 'test_collection',
    indexType: 'hnsw',
    adminDistanceMetric: 'cosine',
  },

  // Admin - Drop collection
  adminDropCollection: {
    operation: 'admin',
    adminOperation: 'dropCollection',
    adminCollection: 'test_collection',
  },
};

/**
 * Mock parameter configurations for PgVectorStoreTool operations
 */
export const mockToolParameters = {
  // Recall operation
  recall: {
    operation: 'recall',
    collection: 'knowledge',
    toolDescription: '',
    schemaMode: 'default',
    topK: 5,
    minSimilarity: 0,
    distanceMetric: 'cosine',
  },

  // Remember operation
  remember: {
    operation: 'remember',
    collection: 'knowledge',
    toolDescription: '',
    schemaMode: 'default',
    rememberIdHint: '',
    autoGenerateId: false,
    updateThreshold: 0.7,
    distanceMetric: 'cosine',
  },

  // Remember with auto-generate ID
  rememberAutoId: {
    operation: 'remember',
    collection: 'knowledge',
    toolDescription: '',
    schemaMode: 'default',
    rememberIdHint: 'knowledge-timestamp-random',
    autoGenerateId: true,
    updateThreshold: 0.7,
    distanceMetric: 'cosine',
  },

  // Forget operation
  forget: {
    operation: 'forget',
    collection: 'knowledge',
    toolDescription: '',
    schemaMode: 'default',
    idFormatHint: '',
    returnDeletedContent: false,
  },

  // Forget Similar operation
  forgetSimilar: {
    operation: 'forgetSimilar',
    collection: 'knowledge',
    toolDescription: '',
    schemaMode: 'default',
    similarityThreshold: 0.8,
    dryRun: true,
    distanceMetric: 'cosine',
  },

  // Lookup operation
  lookup: {
    operation: 'lookup',
    collection: 'knowledge',
    toolDescription: '',
    schemaMode: 'default',
    idFormatHint: '',
    includeMetadata: true,
    includeTimestamps: true,
  },
};

/**
 * Create a mock ISupplyDataFunctions object for testing AI tool nodes
 */
export function createMockSupplyDataFunctions(
  parameters: Record<string, any> = {},
  credentials: ICredentialDataDecryptedObject = testDbConfig as any,
  embeddingsModel?: any,
): Partial<ISupplyDataFunctions> {
  const mockContext = {
    // Mock getCredentials
    getCredentials: jest.fn().mockResolvedValue(credentials),

    // Mock getNodeParameter
    getNodeParameter: jest.fn((paramName: string, _itemIndex: number, defaultValue?: any) => {
      const value = parameters[paramName];
      return value !== undefined ? value : defaultValue;
    }),

    // Mock getInputConnectionData for embeddings model
    getInputConnectionData: jest.fn().mockResolvedValue(embeddingsModel),

    // Mock getNode
    getNode: jest.fn().mockReturnValue({
      name: 'PGVector Store Tool',
      type: 'n8n-nodes-pgvector-advanced.pgVectorStoreTool',
      typeVersion: 1,
      position: [250, 300],
    }),

    // Mock getWorkflow
    getWorkflow: jest.fn().mockReturnValue({
      name: 'Test Workflow',
      id: 'test-workflow-id',
    }),

    // Mock getExecutionId
    getExecutionId: jest.fn().mockReturnValue('test-execution-id'),

    // Mock continueOnFail
    continueOnFail: jest.fn().mockReturnValue(false),

    // Mock getMode
    getMode: jest.fn().mockReturnValue('manual'),

    // Mock logger
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  };

  return mockContext as unknown as Partial<ISupplyDataFunctions>;
}

/**
 * Mock embeddings model for testing AI tools
 */
export function createMockEmbeddingsModel(dimensions: number = 1536) {
  return {
    embedQuery: jest.fn().mockImplementation(async (text: string) => {
      // Create a deterministic embedding based on text hash
      const hash = text.split('').reduce((acc, char) => {
        return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
      }, 0);

      return Array(dimensions)
        .fill(0)
        .map((_, i) => Math.sin((hash + i) * 0.01) * 0.1);
    }),
    embedDocuments: jest.fn().mockImplementation(async (texts: string[]) => {
      return Promise.all(
        texts.map(text => {
          const hash = text.split('').reduce((acc, char) => {
            return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
          }, 0);

          return Array(dimensions)
            .fill(0)
            .map((_, i) => Math.sin((hash + i) * 0.01) * 0.1);
        }),
      );
    }),
  };
}

/**
 * Wait for async operations (useful in tests)
 */
export function waitFor(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry async operation with exponential backoff
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 100,
): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await waitFor(delayMs * Math.pow(2, i));
      }
    }
  }

  throw lastError;
}
