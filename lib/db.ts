/**
 * Database Layer
 * Centralized Postgres connection pooling and query execution
 */

import { Pool, PoolClient, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import { toSql } from 'pgvector/pg';

export interface QueryOptions {
  timeout?: number;
}

export interface DatabaseConfig extends PoolConfig {
  // Inherit all Pool config options
}

/**
 * Database Manager
 * Handles connection pooling, query execution, transactions, and error handling
 */
export class DatabaseManager {
  private pool: Pool;
  private isClosed: boolean = false;

  constructor(config: DatabaseConfig) {
    this.pool = new Pool({
      ...config,
      // Sensible defaults
      max: config.max || 20,
      idleTimeoutMillis: config.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMillis || 5000,
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });
  }

  /**
   * Execute a parameterized SQL query
   * Always use parameterized queries to prevent SQL injection
   */
  async query<T extends QueryResultRow = any>(
    sql: string,
    params: any[],
    options: QueryOptions = {}
  ): Promise<QueryResult<T>> {
    if (this.isClosed) {
      throw new Error('Cannot execute query: database connection is closed');
    }

    const client = await this.pool.connect();

    try {
      // Set statement timeout if specified
      if (options.timeout) {
        await client.query(`SET statement_timeout = ${options.timeout}`);
      }

      const result = await client.query<T>(sql, params);
      return result;
    } catch (error) {
      // Enhance error message with query context
      const err = error as Error;
      throw new Error(`Database query failed: ${err.message}\nSQL: ${sql.substring(0, 200)}`);
    } finally {
      // Reset timeout and release client
      if (options.timeout) {
        await client.query('SET statement_timeout = 0').catch(() => {});
      }
      client.release();
    }
  }

  /**
   * Execute a function within a transaction
   * Automatically commits on success or rolls back on error
   */
  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    if (this.isClosed) {
      throw new Error('Cannot start transaction: database connection is closed');
    }

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get the underlying pool (for advanced usage)
   */
  getPool(): Pool {
    return this.pool;
  }

  /**
   * Close all connections in the pool
   * Should be called when shutting down the application
   */
  async close(): Promise<void> {
    if (!this.isClosed) {
      await this.pool.end();
      this.isClosed = true;
    }
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.query('SELECT 1', []);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }
}

/**
 * Helper function to convert arrays to pgvector format
 */
export function vectorToSql(vector: number[]): string {
  return toSql(vector);
}
