/**
 * PGVector Helpers
 * Schema management and vector operations for pgvector
 */

import { DatabaseManager } from './db';
import { sanitizeTableName } from './sqlBuilder';

export enum DistanceMetric {
  COSINE = 'cosine',
  L2 = 'l2',
  INNER_PRODUCT = 'inner_product',
}

export enum IndexType {
  HNSW = 'hnsw',
  IVFFLAT = 'ivfflat',
}

export interface DropCollectionResult {
  deletedCount: number;
}

/**
 * PGVector Manager
 * Handles pgvector extension setup, table creation, and indexing
 */
export class PgVectorManager {
  private db: DatabaseManager;
  private tableName = 'embeddings';
  private currentDimensions?: number;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  /**
   * Ensure pgvector extension is enabled
   */
  async ensureExtension(): Promise<void> {
    await this.db.query('CREATE EXTENSION IF NOT EXISTS vector', []);
    await this.db.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"', []);
  }

  /**
   * Ensure embeddings table exists with correct schema
   */
  async ensureTable(dimensions: number): Promise<void> {
    this.validateDimensions(dimensions);
    this.currentDimensions = dimensions;

    const tableName = sanitizeTableName(this.tableName);

    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        collection TEXT NOT NULL,
        external_id TEXT,
        content TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        embedding vector(${dimensions}) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(collection, external_id)
      )
    `;

    await this.db.query(createTableSQL, []);

    // Create updated_at trigger
    await this.createUpdatedAtTrigger();
  }

  /**
   * Create trigger to auto-update updated_at timestamp
   */
  private async createUpdatedAtTrigger(): Promise<void> {
    const tableName = sanitizeTableName(this.tableName);

    // Create trigger function if it doesn't exist
    await this.db.query(
      `
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `,
      []
    );

    // Drop trigger if exists
    await this.db.query(
      `DROP TRIGGER IF EXISTS update_embeddings_updated_at ON ${tableName}`,
      []
    );

    // Create trigger
    await this.db.query(
      `
      CREATE TRIGGER update_embeddings_updated_at
      BEFORE UPDATE ON ${tableName}
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column()
    `,
      []
    );
  }

  /**
   * Ensure vector index exists for a collection
   */
  async ensureIndex(
    collection: string,
    indexType: IndexType = IndexType.HNSW,
    distanceMetric: DistanceMetric = DistanceMetric.COSINE
  ): Promise<void> {
    const tableName = sanitizeTableName(this.tableName);
    const safeColl = collection.replace(/[^a-zA-Z0-9_]/g, '_');
    const indexName = `idx_${tableName}_${safeColl}_${indexType}`;

    // Check if index already exists
    const existsResult = await this.db.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = $1`,
      [indexName]
    );

    if (existsResult.rows.length > 0) {
      return;
    }

    const opClass = this.getOperatorClass(distanceMetric);

    let indexSQL: string;
    if (indexType === IndexType.HNSW) {
      // HNSW index - good for high recall, faster queries
      indexSQL = `
        CREATE INDEX ${indexName}
        ON ${tableName}
        USING hnsw (embedding ${opClass})
        WHERE collection = '${collection}'
      `;
    } else {
      // IVFFlat index - faster build time, good for large datasets
      indexSQL = `
        CREATE INDEX ${indexName}
        ON ${tableName}
        USING ivfflat (embedding ${opClass})
        WITH (lists = 100)
        WHERE collection = '${collection}'
      `;
    }

    await this.db.query(indexSQL, []);
  }

  /**
   * Ensure metadata JSONB index exists
   */
  async ensureMetadataIndex(): Promise<void> {
    const tableName = sanitizeTableName(this.tableName);
    const indexName = `idx_${tableName}_metadata`;

    // Check if index already exists
    const existsResult = await this.db.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = $1`,
      [indexName]
    );

    if (existsResult.rows.length > 0) {
      return;
    }

    await this.db.query(
      `CREATE INDEX ${indexName} ON ${tableName} USING GIN (metadata)`,
      []
    );
  }

  /**
   * Delete all records from a collection
   */
  async dropCollection(collection: string): Promise<DropCollectionResult> {
    const tableName = sanitizeTableName(this.tableName);

    const result = await this.db.query(
      `DELETE FROM ${tableName} WHERE collection = $1`,
      [collection]
    );

    return {
      deletedCount: result.rowCount || 0,
    };
  }

  /**
   * Get distance operator for a metric (used in queries)
   */
  getDistanceOperator(metric: DistanceMetric): string {
    switch (metric) {
      case DistanceMetric.COSINE:
        return '<=>';
      case DistanceMetric.L2:
        return '<->';
      case DistanceMetric.INNER_PRODUCT:
        return '<#>';
      default:
        throw new Error(`Unknown distance metric: ${metric}`);
    }
  }

  /**
   * Get operator class for a metric (used in index creation)
   */
  getOperatorClass(metric: DistanceMetric): string {
    switch (metric) {
      case DistanceMetric.COSINE:
        return 'vector_cosine_ops';
      case DistanceMetric.L2:
        return 'vector_l2_ops';
      case DistanceMetric.INNER_PRODUCT:
        return 'vector_ip_ops';
      default:
        throw new Error(`Unknown distance metric: ${metric}`);
    }
  }

  /**
   * Validate embedding dimensions
   */
  validateDimensions(dimensions: number): void {
    if (!Number.isInteger(dimensions)) {
      throw new Error(`Dimensions must be an integer, got: ${dimensions}`);
    }

    if (dimensions <= 0) {
      throw new Error(`Dimensions must be positive, got: ${dimensions}`);
    }

    if (dimensions > 16000) {
      throw new Error(
        `Dimensions too large (max 16000 for pgvector), got: ${dimensions}`
      );
    }
  }

  /**
   * Get table name
   */
  getTableName(): string {
    return this.tableName;
  }

  /**
   * Get current dimensions
   */
  getDimensions(): number | undefined {
    return this.currentDimensions;
  }
}
