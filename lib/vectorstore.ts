/**
 * Vector Store Operations
 * High-level CRUD operations for pgvector embeddings
 * Now supports flexible schema configuration
 */

import { DatabaseManager } from './db';
import { PgVectorManager, DistanceMetric } from './pgvector';
import {
  buildJsonbFilter,
  sanitizeTableName,
  sanitizeColumnName,
} from './sqlBuilder';
import { SchemaConfig } from './schemaConfig';

export interface UpsertParams {
  id?: string;
  collection?: string;  // Now optional - uses partition column
  externalId?: string;
  content?: string;
  metadata?: Record<string, any>;
  embedding: number[];
  /** Extra column values for custom schemas */
  extraColumns?: Record<string, any>;
}

export interface UpsertResult {
  id: string;
  externalId?: string;
  collection?: string;
  operation: 'insert' | 'update';
}

export interface QueryParams {
  collection?: string;  // Now optional - partition value
  embedding: number[];
  topK?: number;
  offset?: number;
  distanceMetric?: DistanceMetric;
  metadataFilter?: Record<string, any>;
  includeEmbedding?: boolean;
  /** Extra WHERE conditions (column -> value) */
  extraFilters?: Record<string, any>;
}

export interface QueryResult {
  rows: QueryRow[];
  totalCount?: number;
}

export interface QueryRow {
  id: string;
  externalId?: string;
  collection?: string;
  content?: string;
  metadata: Record<string, any>;
  score: number;
  embedding?: number[];
  /** Extra columns returned from query */
  extra?: Record<string, any>;
}

export interface DeleteParams {
  id?: string | string[];
  collection?: string;
  externalId?: string | string[];
  metadataFilter?: Record<string, any>;
}

export interface DeleteResult {
  deletedCount: number;
}

export interface GetParams {
  id?: string | string[];
  collection?: string;
  externalId?: string | string[];
  includeEmbedding?: boolean;
}

export interface GetResult {
  rows: GetRow[];
}

export interface GetRow {
  id: string;
  externalId?: string;
  collection?: string;
  content?: string;
  metadata: Record<string, any>;
  embedding?: number[];
  createdAt?: Date;
  updatedAt?: Date;
  /** Extra columns from custom schema */
  extra?: Record<string, any>;
}

/**
 * VectorStore Operations
 * Provides high-level CRUD operations for embeddings
 * Now supports flexible schema configuration
 */
export class VectorStoreOperations {
  private db: DatabaseManager;
  private pgVector: PgVectorManager;
  private config: SchemaConfig;

  constructor(db: DatabaseManager, pgVector: PgVectorManager) {
    this.db = db;
    this.pgVector = pgVector;
    this.config = pgVector.getSchemaConfig();
  }

  /**
   * Get the schema config
   */
  getSchemaConfig(): SchemaConfig {
    return this.config;
  }

  /**
   * Upsert a single embedding
   * Inserts new or updates existing based on id or (partition, external_id)
   */
  async upsert(params: UpsertParams): Promise<UpsertResult> {
    const tableName = sanitizeTableName(this.config.tableName);
    const metadata = params.metadata || {};
    const embeddingJson = JSON.stringify(params.embedding);

    const cols = this.config.columns;
    let result;

    if (params.id) {
      // Update by ID
      const insertCols: string[] = [cols.id];
      const updateCols: string[] = [];
      const values: any[] = [params.id];

      if (cols.partition && params.collection) {
        insertCols.push(cols.partition);
        updateCols.push(`${cols.partition} = EXCLUDED.${cols.partition}`);
        values.push(params.collection);
      }
      if (cols.externalId) {
        insertCols.push(cols.externalId);
        updateCols.push(`${cols.externalId} = EXCLUDED.${cols.externalId}`);
        values.push(params.externalId || null);
      }
      if (cols.content) {
        insertCols.push(cols.content);
        updateCols.push(`${cols.content} = EXCLUDED.${cols.content}`);
        values.push(params.content || null);
      }
      if (cols.metadata) {
        insertCols.push(cols.metadata);
        updateCols.push(`${cols.metadata} = EXCLUDED.${cols.metadata}`);
        values.push(JSON.stringify(metadata));
      }

      insertCols.push(cols.embedding);
      updateCols.push(`${cols.embedding} = EXCLUDED.${cols.embedding}`);
      values.push(embeddingJson);

      if (cols.updatedAt) {
        updateCols.push(`${cols.updatedAt} = NOW()`);
      }

      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
      const returnCols = [cols.id];
      if (cols.externalId) returnCols.push(cols.externalId);
      if (cols.partition) returnCols.push(cols.partition);

      const sql = `
        INSERT INTO ${tableName} (${insertCols.join(', ')})
        VALUES (${placeholders})
        ON CONFLICT (${cols.id})
        DO UPDATE SET ${updateCols.join(', ')}
        RETURNING ${returnCols.join(', ')}, (xmax = 0) AS inserted
      `;

      result = await this.db.query(sql, values);
    } else if (params.externalId && cols.externalId && cols.partition) {
      // Upsert by partition + external_id
      const insertCols: string[] = [cols.partition];
      const values: any[] = [params.collection || 'default'];

      insertCols.push(cols.externalId);
      values.push(params.externalId);

      const updateCols: string[] = [];

      if (cols.content) {
        insertCols.push(cols.content);
        updateCols.push(`${cols.content} = EXCLUDED.${cols.content}`);
        values.push(params.content || null);
      }
      if (cols.metadata) {
        insertCols.push(cols.metadata);
        updateCols.push(`${cols.metadata} = EXCLUDED.${cols.metadata}`);
        values.push(JSON.stringify(metadata));
      }

      insertCols.push(cols.embedding);
      updateCols.push(`${cols.embedding} = EXCLUDED.${cols.embedding}`);
      values.push(embeddingJson);

      if (cols.updatedAt) {
        updateCols.push(`${cols.updatedAt} = NOW()`);
      }

      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
      const returnCols = [cols.id];
      if (cols.externalId) returnCols.push(cols.externalId);
      if (cols.partition) returnCols.push(cols.partition);

      const sql = `
        INSERT INTO ${tableName} (${insertCols.join(', ')})
        VALUES (${placeholders})
        ON CONFLICT (${cols.partition}, ${cols.externalId})
        DO UPDATE SET ${updateCols.join(', ')}
        RETURNING ${returnCols.join(', ')}, (xmax = 0) AS inserted
      `;

      result = await this.db.query(sql, values);
    } else {
      // Insert new without external_id
      const insertCols: string[] = [];
      const values: any[] = [];

      if (cols.partition) {
        insertCols.push(cols.partition);
        values.push(params.collection || 'default');
      }
      if (cols.content) {
        insertCols.push(cols.content);
        values.push(params.content || null);
      }
      if (cols.metadata) {
        insertCols.push(cols.metadata);
        values.push(JSON.stringify(metadata));
      }

      insertCols.push(cols.embedding);
      values.push(embeddingJson);

      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
      const returnCols = [cols.id];
      if (cols.externalId) returnCols.push(cols.externalId);
      if (cols.partition) returnCols.push(cols.partition);

      const sql = `
        INSERT INTO ${tableName} (${insertCols.join(', ')})
        VALUES (${placeholders})
        RETURNING ${returnCols.join(', ')}, true AS inserted
      `;

      result = await this.db.query(sql, values);
    }

    const row = result.rows[0];
    const cols2 = this.config.columns;

    return {
      id: row[cols2.id],
      externalId: cols2.externalId ? row[cols2.externalId] : undefined,
      collection: cols2.partition ? row[cols2.partition] : undefined,
      operation: row.inserted ? 'insert' : 'update',
    };
  }

  /**
   * Batch upsert multiple embeddings
   */
  async upsertBatch(items: UpsertParams[]): Promise<UpsertResult[]> {
    const results: UpsertResult[] = [];
    const batchSize = 100;

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map((item) => this.upsert(item)));
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Query similar embeddings
   */
  async query(params: QueryParams): Promise<QueryResult> {
    const tableName = sanitizeTableName(this.config.tableName);
    const cols = this.config.columns;
    const topK = params.topK || 10;
    const offset = params.offset || 0;
    const distanceMetric = params.distanceMetric || DistanceMetric.COSINE;
    const distanceOp = this.pgVector.getDistanceOperator(distanceMetric);
    const embeddingJson = JSON.stringify(params.embedding);

    // Build select fields
    const selectFields: string[] = [cols.id];
    if (cols.externalId) selectFields.push(cols.externalId);
    if (cols.partition) selectFields.push(cols.partition);
    if (cols.content) selectFields.push(cols.content);
    if (cols.metadata) selectFields.push(cols.metadata);
    if (params.includeEmbedding) selectFields.push(cols.embedding);

    // Add extra return columns
    if (this.config.extraReturnColumns) {
      selectFields.push(...this.config.extraReturnColumns);
    }

    let sql = `
      SELECT ${selectFields.join(', ')},
             ${cols.embedding} ${distanceOp} $1::vector AS score
      FROM ${tableName}
    `;

    const values: any[] = [embeddingJson];
    let paramIndex = 2;
    const conditions: string[] = [];

    // Add partition filter if configured and provided
    if (cols.partition && params.collection) {
      conditions.push(`${cols.partition} = $${paramIndex}`);
      values.push(params.collection);
      paramIndex++;
    }

    // Add metadata filter if provided
    if (cols.metadata && params.metadataFilter && Object.keys(params.metadataFilter).length > 0) {
      const { clause, values: filterValues } = buildJsonbFilter(
        cols.metadata,
        params.metadataFilter,
        paramIndex
      );
      conditions.push(clause);
      values.push(...filterValues);
      paramIndex += filterValues.length;
    }

    // Add extra filters
    if (params.extraFilters) {
      for (const [colName, value] of Object.entries(params.extraFilters)) {
        const safeCol = sanitizeColumnName(colName);
        conditions.push(`${safeCol} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += `
      ORDER BY score
      LIMIT $${paramIndex}
      OFFSET $${paramIndex + 1}
    `;

    values.push(topK, offset);

    const result = await this.db.query(sql, values);

    return {
      rows: result.rows.map((row) => {
        const queryRow: QueryRow = {
          id: row[cols.id],
          externalId: cols.externalId ? row[cols.externalId] : undefined,
          collection: cols.partition ? row[cols.partition] : undefined,
          content: cols.content ? row[cols.content] : undefined,
          metadata: cols.metadata ? row[cols.metadata] || {} : {},
          score: parseFloat(row.score),
        };

        // Only include embedding if explicitly requested
        if (params.includeEmbedding && row[cols.embedding]) {
          queryRow.embedding = typeof row[cols.embedding] === 'string'
            ? JSON.parse(row[cols.embedding])
            : row[cols.embedding];
        }

        // Add extra columns
        if (this.config.extraReturnColumns && this.config.extraReturnColumns.length > 0) {
          queryRow.extra = {};
          for (const extraCol of this.config.extraReturnColumns) {
            queryRow.extra[extraCol] = row[extraCol];
          }
        }

        return queryRow;
      }),
    };
  }

  /**
   * Delete embeddings
   */
  async delete(params: DeleteParams): Promise<DeleteResult> {
    const tableName = sanitizeTableName(this.config.tableName);
    const cols = this.config.columns;

    if (params.id) {
      // Delete by ID(s)
      const ids = Array.isArray(params.id) ? params.id : [params.id];
      const result = await this.db.query(
        `DELETE FROM ${tableName} WHERE ${cols.id} = ANY($1)`,
        [ids]
      );

      return { deletedCount: result.rowCount || 0 };
    }

    if (!cols.partition || !params.collection) {
      throw new Error('Either id or (partition column + collection) must be provided for delete');
    }

    // Build WHERE clause
    const conditions: string[] = [`${cols.partition} = $1`];
    const values: any[] = [params.collection];
    let paramIndex = 2;

    if (cols.externalId && params.externalId) {
      const externalIds = Array.isArray(params.externalId)
        ? params.externalId
        : [params.externalId];
      conditions.push(`${cols.externalId} = ANY($${paramIndex})`);
      values.push(externalIds);
      paramIndex++;
    }

    if (cols.metadata && params.metadataFilter && Object.keys(params.metadataFilter).length > 0) {
      const { clause, values: filterValues } = buildJsonbFilter(
        cols.metadata,
        params.metadataFilter,
        paramIndex
      );
      conditions.push(clause);
      values.push(...filterValues);
    }

    const sql = `DELETE FROM ${tableName} WHERE ${conditions.join(' AND ')}`;
    const result = await this.db.query(sql, values);

    return { deletedCount: result.rowCount || 0 };
  }

  /**
   * Get embeddings by ID or external_id
   */
  async get(params: GetParams): Promise<GetResult> {
    const tableName = sanitizeTableName(this.config.tableName);
    const cols = this.config.columns;
    const includeEmbedding = params.includeEmbedding ?? false;

    // Build select fields
    const selectFields: string[] = [cols.id];
    if (cols.externalId) selectFields.push(cols.externalId);
    if (cols.partition) selectFields.push(cols.partition);
    if (cols.content) selectFields.push(cols.content);
    if (cols.metadata) selectFields.push(cols.metadata);
    if (includeEmbedding) selectFields.push(cols.embedding);
    if (cols.createdAt) selectFields.push(cols.createdAt);
    if (cols.updatedAt) selectFields.push(cols.updatedAt);

    // Add extra return columns
    if (this.config.extraReturnColumns) {
      selectFields.push(...this.config.extraReturnColumns);
    }

    if (params.id) {
      // Get by ID(s)
      const ids = Array.isArray(params.id) ? params.id : [params.id];
      const result = await this.db.query(
        `SELECT ${selectFields.join(', ')}
         FROM ${tableName}
         WHERE ${cols.id} = ANY($1)`,
        [ids]
      );

      return {
        rows: result.rows.map((row) => this.mapGetRow(row, includeEmbedding)),
      };
    }

    if (!cols.partition || !params.collection) {
      throw new Error('Either id or (partition column + collection) must be provided');
    }

    // Get by external_id(s)
    if (cols.externalId && params.externalId) {
      const externalIds = Array.isArray(params.externalId)
        ? params.externalId
        : [params.externalId];
      const result = await this.db.query(
        `SELECT ${selectFields.join(', ')}
         FROM ${tableName}
         WHERE ${cols.partition} = $1 AND ${cols.externalId} = ANY($2)`,
        [params.collection, externalIds]
      );

      return {
        rows: result.rows.map((row) => this.mapGetRow(row, includeEmbedding)),
      };
    }

    throw new Error('Either id or externalId must be provided');
  }

  /**
   * Map a database row to a GetRow object
   */
  private mapGetRow(row: any, includeEmbedding: boolean = false): GetRow {
    const cols = this.config.columns;

    const getRow: GetRow = {
      id: row[cols.id],
      externalId: cols.externalId ? row[cols.externalId] : undefined,
      collection: cols.partition ? row[cols.partition] : undefined,
      content: cols.content ? row[cols.content] : undefined,
      metadata: cols.metadata ? row[cols.metadata] || {} : {},
      createdAt: cols.createdAt ? row[cols.createdAt] : undefined,
      updatedAt: cols.updatedAt ? row[cols.updatedAt] : undefined,
    };

    // Only include embedding if explicitly requested
    if (includeEmbedding && row[cols.embedding]) {
      getRow.embedding = typeof row[cols.embedding] === 'string'
        ? JSON.parse(row[cols.embedding])
        : row[cols.embedding];
    }

    // Add extra columns
    if (this.config.extraReturnColumns && this.config.extraReturnColumns.length > 0) {
      getRow.extra = {};
      for (const extraCol of this.config.extraReturnColumns) {
        getRow.extra[extraCol] = row[extraCol];
      }
    }

    return getRow;
  }
}
