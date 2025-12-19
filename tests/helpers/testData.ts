/**
 * Test data fixtures for PGVector Advanced tests
 */

/**
 * Generate a random embedding vector of specified dimensions
 */
export function generateEmbedding(dimensions: number): number[] {
  return Array(dimensions)
    .fill(0)
    .map(() => Math.random());
}

/**
 * Generate a normalized embedding (unit length)
 */
export function generateNormalizedEmbedding(dimensions: number): number[] {
  const embedding = generateEmbedding(dimensions);
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return embedding.map(val => val / magnitude);
}

/**
 * Sample embeddings for testing (1536 dimensions - OpenAI ada-002)
 */
export const sampleEmbedding1536 = generateEmbedding(1536);
export const sampleEmbedding1536_2 = generateEmbedding(1536);
export const sampleEmbedding1536_3 = generateEmbedding(1536);

/**
 * Sample embeddings for testing (384 dimensions - MiniLM)
 */
export const sampleEmbedding384 = generateEmbedding(384);
export const sampleEmbedding384_2 = generateEmbedding(384);

/**
 * Sample metadata objects
 */
export const sampleMetadata1 = {
  category: 'technology',
  author: 'John Doe',
  published: '2024-01-01',
  tags: ['ai', 'ml', 'nlp'],
  difficulty: 'beginner',
};

export const sampleMetadata2 = {
  category: 'science',
  author: 'Jane Smith',
  published: '2024-02-15',
  tags: ['physics', 'quantum'],
  difficulty: 'advanced',
};

export const sampleMetadata3 = {
  category: 'technology',
  author: 'Bob Johnson',
  published: '2024-03-20',
  tags: ['web', 'frontend', 'react'],
  difficulty: 'intermediate',
};

/**
 * Sample documents for testing
 */
export const sampleDocuments = [
  {
    externalId: 'doc-1',
    content: 'Introduction to machine learning and artificial intelligence',
    metadata: sampleMetadata1,
    embedding: sampleEmbedding1536,
  },
  {
    externalId: 'doc-2',
    content: 'Quantum mechanics and particle physics fundamentals',
    metadata: sampleMetadata2,
    embedding: sampleEmbedding1536_2,
  },
  {
    externalId: 'doc-3',
    content: 'Building modern web applications with React and TypeScript',
    metadata: sampleMetadata3,
    embedding: sampleEmbedding1536_3,
  },
];

/**
 * Sample batch data for field mapping tests
 */
export const sampleBatchData = [
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    docId: 'batch-doc-1',
    text: 'First batch document about AI',
    meta: { category: 'ai', priority: 'high' },
    vector: generateEmbedding(1536),
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440002',
    docId: 'batch-doc-2',
    text: 'Second batch document about ML',
    meta: { category: 'ml', priority: 'medium' },
    vector: generateEmbedding(1536),
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440003',
    docId: 'batch-doc-3',
    text: 'Third batch document about NLP',
    meta: { category: 'nlp', priority: 'low' },
    vector: generateEmbedding(1536),
  },
];

/**
 * Edge case test data
 */
export const edgeCases = {
  emptyMetadata: {},
  longContent: 'A'.repeat(10000),
  specialCharactersContent: 'Test with special chars: !@#$%^&*()[]{}|\\/<>?~`"\'',
  unicodeContent: '测试中文 テスト 테스트 🚀 🎉 ✨',
  nestedMetadata: {
    level1: {
      level2: {
        level3: {
          value: 'deeply nested',
        },
      },
    },
  },
  arrayMetadata: {
    tags: ['tag1', 'tag2', 'tag3'],
    numbers: [1, 2, 3, 4, 5],
  },
  nullContent: null,
  undefinedContent: undefined,
  zeroVector: Array(1536).fill(0),
};

/**
 * Test collection names
 */
export const testCollections = {
  default: 'test_collection',
  documents: 'test_documents',
  embeddings: 'test_embeddings',
  batch: 'test_batch',
  temp: 'test_temp',
};

/**
 * Database configuration for tests
 * Uses same env vars as setup.ts and docker-compose.yml for consistency
 * Default port is 5433 for local docker-compose, CI overrides to 5432
 */
export const testDbConfig = {
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5433'),
  database: process.env.PGDATABASE || 'testdb',
  user: process.env.PGUSER || 'testuser',
  password: process.env.PGPASSWORD || 'testpass',
  max: 10, // connection pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

/**
 * Generate multiple documents for batch testing
 */
export function generateBatchDocuments(count: number, dimensions: number = 1536) {
  return Array(count)
    .fill(0)
    .map((_, i) => ({
      externalId: `batch-doc-${i + 1}`,
      content: `Batch document ${i + 1} content for testing`,
      metadata: {
        index: i,
        category: ['tech', 'science', 'arts'][i % 3],
        batch: true,
      },
      embedding: generateEmbedding(dimensions),
    }));
}

/**
 * Calculate cosine similarity between two vectors
 * Useful for validating search results
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }

  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Calculate L2 (Euclidean) distance between two vectors
 */
export function l2Distance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }

  return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0));
}

/**
 * Calculate inner product between two vectors
 */
export function innerProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }

  return -a.reduce((sum, val, i) => sum + val * b[i], 0); // Negative for pgvector compatibility
}
