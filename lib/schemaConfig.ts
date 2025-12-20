/**
 * Schema Configuration
 * Flexible schema configuration for working with any table structure
 */

import { sanitizeColumnName, sanitizeTableName } from './sqlBuilder';

/**
 * Column mapping configuration
 * Maps logical field names to actual database column names
 */
export interface ColumnConfig {
  /** Primary key column (default: 'id') */
  id: string;
  /** Vector embedding column - REQUIRED */
  embedding: string;
  /** Text content column (optional) */
  content?: string;
  /** JSONB metadata column for filtering (optional) */
  metadata?: string;
  /** Partition/collection column for data separation (optional) */
  partition?: string;
  /** External ID column for user-defined IDs (optional) */
  externalId?: string;
  /** Created timestamp column (optional) */
  createdAt?: string;
  /** Updated timestamp column (optional) */
  updatedAt?: string;
}

/**
 * Full schema configuration
 */
export interface SchemaConfig {
  /** Database table name */
  tableName: string;
  /** Column name mappings */
  columns: ColumnConfig;
  /** Additional columns to return in query results */
  extraReturnColumns?: string[];
  /** Whether to create table if it doesn't exist (default: false for existing tables) */
  createTable?: boolean;
  /** Vector dimensions (required if createTable is true) */
  dimensions?: number;
}

/**
 * SQL Template configuration for advanced mode
 */
export interface SqlTemplateConfig {
  /** Search/query SQL template. Placeholders: $1=embedding, $2=partition, $3=limit, $4=offset */
  searchQuery?: string;
  /** Insert/upsert SQL template */
  insertQuery?: string;
  /** Delete SQL template */
  deleteQuery?: string;
  /** Get by ID SQL template */
  getQuery?: string;
}

/**
 * Combined configuration (either field mapping OR SQL template mode)
 */
export interface FlexibleSchemaConfig {
  /** Mode: 'fieldMapping' for column configuration, 'sqlTemplate' for raw SQL */
  mode: 'fieldMapping' | 'sqlTemplate';
  /** Schema configuration (for fieldMapping mode) */
  schema?: SchemaConfig;
  /** SQL templates (for sqlTemplate mode) */
  templates?: SqlTemplateConfig;
}

/**
 * Default schema configuration matching the original hardcoded schema
 * This ensures backward compatibility
 */
export const DEFAULT_SCHEMA: SchemaConfig = {
  tableName: 'embeddings',
  columns: {
    id: 'id',
    embedding: 'embedding',
    content: 'content',
    metadata: 'metadata',
    partition: 'collection',
    externalId: 'external_id',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  createTable: true,
  dimensions: 1536,
};

/**
 * Default flexible config using the original schema
 */
export const DEFAULT_FLEXIBLE_CONFIG: FlexibleSchemaConfig = {
  mode: 'fieldMapping',
  schema: DEFAULT_SCHEMA,
};

/**
 * Validate and sanitize a schema configuration
 * Throws if invalid column/table names are detected
 */
export function validateSchemaConfig(config: SchemaConfig): SchemaConfig {
  // Validate table name
  const tableName = sanitizeTableName(config.tableName);

  // Validate required columns
  const columns: ColumnConfig = {
    id: sanitizeColumnName(config.columns.id),
    embedding: sanitizeColumnName(config.columns.embedding),
  };

  // Validate optional columns
  if (config.columns.content) {
    columns.content = sanitizeColumnName(config.columns.content);
  }
  if (config.columns.metadata) {
    columns.metadata = sanitizeColumnName(config.columns.metadata);
  }
  if (config.columns.partition) {
    columns.partition = sanitizeColumnName(config.columns.partition);
  }
  if (config.columns.externalId) {
    columns.externalId = sanitizeColumnName(config.columns.externalId);
  }
  if (config.columns.createdAt) {
    columns.createdAt = sanitizeColumnName(config.columns.createdAt);
  }
  if (config.columns.updatedAt) {
    columns.updatedAt = sanitizeColumnName(config.columns.updatedAt);
  }

  // Validate extra return columns
  const extraReturnColumns = config.extraReturnColumns?.map(col => sanitizeColumnName(col));

  return {
    tableName,
    columns,
    extraReturnColumns,
    createTable: config.createTable,
    dimensions: config.dimensions,
  };
}

/**
 * Merge partial config with defaults
 */
export function mergeWithDefaults(partial: Partial<SchemaConfig>): SchemaConfig {
  return {
    tableName: partial.tableName || DEFAULT_SCHEMA.tableName,
    columns: {
      ...DEFAULT_SCHEMA.columns,
      ...partial.columns,
    },
    extraReturnColumns: partial.extraReturnColumns || DEFAULT_SCHEMA.extraReturnColumns,
    createTable: partial.createTable ?? DEFAULT_SCHEMA.createTable,
    dimensions: partial.dimensions || DEFAULT_SCHEMA.dimensions,
  };
}

/**
 * Build a SELECT field list from schema config
 */
export function buildSelectFields(config: SchemaConfig, includeEmbedding: boolean = false): string {
  const fields: string[] = [config.columns.id];

  if (config.columns.externalId) {
    fields.push(config.columns.externalId);
  }
  if (config.columns.partition) {
    fields.push(config.columns.partition);
  }
  if (config.columns.content) {
    fields.push(config.columns.content);
  }
  if (config.columns.metadata) {
    fields.push(config.columns.metadata);
  }
  if (includeEmbedding) {
    fields.push(config.columns.embedding);
  }

  // Add extra return columns
  if (config.extraReturnColumns) {
    fields.push(...config.extraReturnColumns);
  }

  return fields.join(', ');
}

/**
 * Build CREATE TABLE SQL from schema config
 */
export function buildCreateTableSql(config: SchemaConfig): string {
  if (!config.dimensions) {
    throw new Error('dimensions is required when createTable is true');
  }

  const cols = config.columns;
  const lines: string[] = [
    `${cols.id} UUID PRIMARY KEY DEFAULT gen_random_uuid()`,
  ];

  if (cols.partition) {
    lines.push(`${cols.partition} TEXT NOT NULL`);
  }
  if (cols.externalId) {
    lines.push(`${cols.externalId} TEXT`);
  }
  if (cols.content) {
    lines.push(`${cols.content} TEXT`);
  }
  if (cols.metadata) {
    lines.push(`${cols.metadata} JSONB NOT NULL DEFAULT '{}'::jsonb`);
  }

  lines.push(`${cols.embedding} vector(${config.dimensions}) NOT NULL`);

  if (cols.createdAt) {
    lines.push(`${cols.createdAt} TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  }
  if (cols.updatedAt) {
    lines.push(`${cols.updatedAt} TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  }

  let sql = `CREATE TABLE IF NOT EXISTS ${config.tableName} (\n  ${lines.join(',\n  ')}\n)`;

  // Add unique constraint if both partition and externalId exist
  if (cols.partition && cols.externalId) {
    sql += `;\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_${config.tableName}_unique
      ON ${config.tableName} (${cols.partition}, ${cols.externalId})
      WHERE ${cols.externalId} IS NOT NULL`;
  }

  return sql;
}
