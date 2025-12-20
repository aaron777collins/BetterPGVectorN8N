/**
 * PGVector Helpers
 * Schema management and vector operations for pgvector
 */

import { DatabaseManager } from './db';
import { sanitizeTableName } from './sqlBuilder';
import {
  SchemaConfig,
  DEFAULT_SCHEMA,
  validateSchemaConfig,
} from './schemaConfig';

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
  private schemaConfig: SchemaConfig;
  private currentDimensions?: number;

  constructor(db: DatabaseManager, schemaConfig?: Partial<SchemaConfig>) {
    this.db = db;
    // Merge provided config with defaults
    this.schemaConfig = schemaConfig
      ? validateSchemaConfig({ ...DEFAULT_SCHEMA, ...schemaConfig, columns: { ...DEFAULT_SCHEMA.columns, ...schemaConfig.columns } })
      : DEFAULT_SCHEMA;
  }

  /**
   * Get the current schema configuration
   */
  getSchemaConfig(): SchemaConfig {
    return this.schemaConfig;
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
   * If schemaConfig.createTable is false, assumes table already exists
   */
  async ensureTable(dimensions?: number): Promise<void> {
    // Use nullish coalescing to properly handle 0 (which should fail validation)
    const effectiveDimensions = dimensions ?? this.schemaConfig.dimensions ?? 1536;
    this.validateDimensions(effectiveDimensions);
    this.currentDimensions = effectiveDimensions;

    // If createTable is false, just validate dimensions and return
    if (this.schemaConfig.createTable === false) {
      return;
    }

    const tableName = sanitizeTableName(this.schemaConfig.tableName);
    const cols = this.schemaConfig.columns;

    // Build CREATE TABLE SQL using schema config
    const columnDefs: string[] = [
      `${cols.id} UUID PRIMARY KEY DEFAULT gen_random_uuid()`,
    ];

    if (cols.partition) {
      columnDefs.push(`${cols.partition} TEXT NOT NULL`);
    }
    if (cols.externalId) {
      columnDefs.push(`${cols.externalId} TEXT`);
    }
    if (cols.content) {
      columnDefs.push(`${cols.content} TEXT`);
    }
    if (cols.metadata) {
      columnDefs.push(`${cols.metadata} JSONB NOT NULL DEFAULT '{}'::jsonb`);
    }

    columnDefs.push(`${cols.embedding} vector(${effectiveDimensions}) NOT NULL`);

    if (cols.createdAt) {
      columnDefs.push(`${cols.createdAt} TIMESTAMPTZ DEFAULT NOW()`);
    }
    if (cols.updatedAt) {
      columnDefs.push(`${cols.updatedAt} TIMESTAMPTZ DEFAULT NOW()`);
    }

    // Add unique constraint if both partition and externalId exist
    if (cols.partition && cols.externalId) {
      columnDefs.push(`UNIQUE(${cols.partition}, ${cols.externalId})`);
    }

    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${tableName} (
        ${columnDefs.join(',\n        ')}
      )
    `;

    await this.db.query(createTableSQL, []);

    // Create updated_at trigger if updatedAt column exists
    if (cols.updatedAt) {
      await this.createUpdatedAtTrigger();
    }
  }

  /**
   * Create trigger to auto-update updated_at timestamp
   */
  private async createUpdatedAtTrigger(): Promise<void> {
    const tableName = sanitizeTableName(this.schemaConfig.tableName);
    const updatedAtCol = this.schemaConfig.columns.updatedAt || 'updated_at';
    const triggerName = `update_${tableName}_${updatedAtCol}`;

    // Create trigger function if it doesn't exist (uses dynamic column name)
    await this.db.query(
      `
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.${updatedAtCol} = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `,
      []
    );

    // Drop trigger if exists
    await this.db.query(
      `DROP TRIGGER IF EXISTS ${triggerName} ON ${tableName}`,
      []
    );

    // Create trigger
    await this.db.query(
      `
      CREATE TRIGGER ${triggerName}
      BEFORE UPDATE ON ${tableName}
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column()
    `,
      []
    );
  }

  /**
   * Ensure vector index exists for a collection/partition
   */
  async ensureIndex(
    collection: string,
    indexType: IndexType = IndexType.HNSW,
    distanceMetric: DistanceMetric = DistanceMetric.COSINE
  ): Promise<void> {
    const tableName = sanitizeTableName(this.schemaConfig.tableName);
    const embeddingCol = this.schemaConfig.columns.embedding;
    const partitionCol = this.schemaConfig.columns.partition;

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
    const whereClause = partitionCol ? `WHERE ${partitionCol} = '${collection}'` : '';

    if (indexType === IndexType.HNSW) {
      // HNSW index - good for high recall, faster queries
      indexSQL = `
        CREATE INDEX ${indexName}
        ON ${tableName}
        USING hnsw (${embeddingCol} ${opClass})
        ${whereClause}
      `;
    } else {
      // IVFFlat index - faster build time, good for large datasets
      indexSQL = `
        CREATE INDEX ${indexName}
        ON ${tableName}
        USING ivfflat (${embeddingCol} ${opClass})
        WITH (lists = 100)
        ${whereClause}
      `;
    }

    await this.db.query(indexSQL, []);
  }

  /**
   * Ensure metadata JSONB index exists
   */
  async ensureMetadataIndex(): Promise<void> {
    const metadataCol = this.schemaConfig.columns.metadata;
    if (!metadataCol) {
      return; // No metadata column configured
    }

    const tableName = sanitizeTableName(this.schemaConfig.tableName);
    const indexName = `idx_${tableName}_${metadataCol}`;

    // Check if index already exists
    const existsResult = await this.db.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = $1`,
      [indexName]
    );

    if (existsResult.rows.length > 0) {
      return;
    }

    await this.db.query(
      `CREATE INDEX ${indexName} ON ${tableName} USING GIN (${metadataCol})`,
      []
    );
  }

  /**
   * Delete all records from a collection/partition
   */
  async dropCollection(collection: string): Promise<DropCollectionResult> {
    const tableName = sanitizeTableName(this.schemaConfig.tableName);
    const partitionCol = this.schemaConfig.columns.partition;

    if (!partitionCol) {
      throw new Error('Cannot drop collection: no partition column configured');
    }

    const result = await this.db.query(
      `DELETE FROM ${tableName} WHERE ${partitionCol} = $1`,
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
    return this.schemaConfig.tableName;
  }

  /**
   * Get current dimensions
   */
  getDimensions(): number | undefined {
    return this.currentDimensions;
  }
}
