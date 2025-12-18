/**
 * Vector Store Operations
 * High-level CRUD operations for pgvector embeddings
 */

import { DatabaseManager } from './db';
import { PgVectorManager, DistanceMetric } from './pgvector';
import {
  buildJsonbFilter,
  sanitizeTableName,
} from './sqlBuilder';

export interface UpsertParams {
  id?: string;
  collection: string;
  externalId?: string;
  content?: string;
  metadata?: Record<string, any>;
  embedding: number[];
}

export interface UpsertResult {
  id: string;
  externalId?: string;
  collection: string;
  operation: 'insert' | 'update';
}

export interface QueryParams {
  collection: string;
  embedding: number[];
  topK?: number;
  offset?: number;
  distanceMetric?: DistanceMetric;
  metadataFilter?: Record<string, any>;
  includeEmbedding?: boolean;
}

export interface QueryResult {
  rows: QueryRow[];
  totalCount?: number;
}

export interface QueryRow {
  id: string;
  externalId?: string;
  collection: string;
  content?: string;
  metadata: Record<string, any>;
  score: number;
  embedding?: number[];
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
  collection: string;
  content?: string;
  metadata: Record<string, any>;
  embedding: number[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * VectorStore Operations
 * Provides high-level CRUD operations for embeddings
 */
export class VectorStoreOperations {
  private db: DatabaseManager;
  private pgVector: PgVectorManager;
  private tableName: string;

  constructor(db: DatabaseManager, pgVector: PgVectorManager) {
    this.db = db;
    this.pgVector = pgVector;
    this.tableName = pgVector.getTableName();
  }

  /**
   * Upsert a single embedding
   * Inserts new or updates existing based on id or (collection, external_id)
   */
  async upsert(params: UpsertParams): Promise<UpsertResult> {
    const tableName = sanitizeTableName(this.tableName);
    const metadata = params.metadata || {};
    const embeddingJson = JSON.stringify(params.embedding);

    let result;

    if (params.id) {
      // Update by ID
      result = await this.db.query(
        `INSERT INTO ${tableName}
         (id, collection, external_id, content, metadata, embedding)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id)
         DO UPDATE SET
           collection = EXCLUDED.collection,
           external_id = EXCLUDED.external_id,
           content = EXCLUDED.content,
           metadata = EXCLUDED.metadata,
           embedding = EXCLUDED.embedding,
           updated_at = NOW()
         RETURNING id, external_id, collection,
                   (xmax = 0) AS inserted`,
        [
          params.id,
          params.collection,
          params.externalId || null,
          params.content || null,
          JSON.stringify(metadata),
          embeddingJson,
        ]
      );
    } else if (params.externalId) {
      // Upsert by collection + external_id
      result = await this.db.query(
        `INSERT INTO ${tableName}
         (collection, external_id, content, metadata, embedding)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (collection, external_id)
         DO UPDATE SET
           content = EXCLUDED.content,
           metadata = EXCLUDED.metadata,
           embedding = EXCLUDED.embedding,
           updated_at = NOW()
         RETURNING id, external_id, collection,
                   (xmax = 0) AS inserted`,
        [
          params.collection,
          params.externalId,
          params.content || null,
          JSON.stringify(metadata),
          embeddingJson,
        ]
      );
    } else {
      // Insert new without external_id
      result = await this.db.query(
        `INSERT INTO ${tableName}
         (collection, content, metadata, embedding)
         VALUES ($1, $2, $3, $4)
         RETURNING id, external_id, collection, true AS inserted`,
        [params.collection, params.content || null, JSON.stringify(metadata), embeddingJson]
      );
    }

    const row = result.rows[0];

    return {
      id: row.id,
      externalId: row.external_id,
      collection: row.collection,
      operation: row.inserted ? 'insert' : 'update',
    };
  }

  /**
   * Batch upsert multiple embeddings
   */
  async upsertBatch(items: UpsertParams[]): Promise<UpsertResult[]> {
    const results: UpsertResult[] = [];

    // Process in batches to avoid overwhelming the database
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
    const tableName = sanitizeTableName(this.tableName);
    const topK = params.topK || 10;
    const offset = params.offset || 0;
    const distanceMetric = params.distanceMetric || DistanceMetric.COSINE;
    const distanceOp = this.pgVector.getDistanceOperator(distanceMetric);
    const embeddingJson = JSON.stringify(params.embedding);

    const selectFields = params.includeEmbedding
      ? 'id, external_id, collection, content, metadata, embedding'
      : 'id, external_id, collection, content, metadata';

    let sql = `
      SELECT ${selectFields},
             embedding ${distanceOp} $1::vector AS score
      FROM ${tableName}
      WHERE collection = $2
    `;

    const values: any[] = [embeddingJson, params.collection];
    let paramIndex = 3;

    // Add metadata filter if provided
    if (params.metadataFilter && Object.keys(params.metadataFilter).length > 0) {
      const { clause, values: filterValues } = buildJsonbFilter(
        'metadata',
        params.metadataFilter,
        paramIndex
      );
      sql += ` AND ${clause}`;
      values.push(...filterValues);
      paramIndex += filterValues.length;
    }

    sql += `
      ORDER BY score
      LIMIT $${paramIndex}
      OFFSET $${paramIndex + 1}
    `;

    values.push(topK, offset);

    const result = await this.db.query(sql, values);

    return {
      rows: result.rows.map((row) => ({
        id: row.id,
        externalId: row.external_id,
        collection: row.collection,
        content: row.content,
        metadata: row.metadata,
        score: parseFloat(row.score),
        embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
      })),
    };
  }

  /**
   * Delete embeddings
   */
  async delete(params: DeleteParams): Promise<DeleteResult> {
    const tableName = sanitizeTableName(this.tableName);

    if (params.id) {
      // Delete by ID(s)
      const ids = Array.isArray(params.id) ? params.id : [params.id];
      const result = await this.db.query(
        `DELETE FROM ${tableName} WHERE id = ANY($1)`,
        [ids]
      );

      return { deletedCount: result.rowCount || 0 };
    }

    if (!params.collection) {
      throw new Error('Either id or collection must be provided for delete');
    }

    // Build WHERE clause
    const conditions: string[] = ['collection = $1'];
    const values: any[] = [params.collection];
    let paramIndex = 2;

    if (params.externalId) {
      const externalIds = Array.isArray(params.externalId)
        ? params.externalId
        : [params.externalId];
      conditions.push(`external_id = ANY($${paramIndex})`);
      values.push(externalIds);
      paramIndex++;
    }

    if (params.metadataFilter && Object.keys(params.metadataFilter).length > 0) {
      const { clause, values: filterValues } = buildJsonbFilter(
        'metadata',
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
    const tableName = sanitizeTableName(this.tableName);

    if (params.id) {
      // Get by ID(s)
      const ids = Array.isArray(params.id) ? params.id : [params.id];
      const result = await this.db.query(
        `SELECT id, external_id, collection, content, metadata, embedding, created_at, updated_at
         FROM ${tableName}
         WHERE id = ANY($1)`,
        [ids]
      );

      return {
        rows: result.rows.map((row) => ({
          id: row.id,
          externalId: row.external_id,
          collection: row.collection,
          content: row.content,
          metadata: row.metadata,
          embedding: JSON.parse(row.embedding),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
      };
    }

    if (!params.collection) {
      throw new Error('Either id or collection must be provided');
    }

    // Get by external_id(s)
    if (params.externalId) {
      const externalIds = Array.isArray(params.externalId)
        ? params.externalId
        : [params.externalId];
      const result = await this.db.query(
        `SELECT id, external_id, collection, content, metadata, embedding, created_at, updated_at
         FROM ${tableName}
         WHERE collection = $1 AND external_id = ANY($2)`,
        [params.collection, externalIds]
      );

      return {
        rows: result.rows.map((row) => ({
          id: row.id,
          externalId: row.external_id,
          collection: row.collection,
          content: row.content,
          metadata: row.metadata,
          embedding: JSON.parse(row.embedding),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
      };
    }

    throw new Error('Either id or externalId must be provided');
  }
}
