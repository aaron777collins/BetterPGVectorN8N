/**
 * Unit Tests for DatabaseManager
 *
 * Tests the database connection pooling, query execution, and transaction handling
 * using mocks for the pg Pool.
 */

import { DatabaseManager, vectorToSql } from '../../lib/db';
import { Pool, PoolClient } from 'pg';

// Mock pg module
jest.mock('pg', () => {
  const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
  };

  const mockPool = {
    connect: jest.fn().mockResolvedValue(mockClient),
    end: jest.fn(),
    on: jest.fn(),
    totalCount: 10,
    idleCount: 5,
    waitingCount: 2,
  };

  return {
    Pool: jest.fn(() => mockPool),
  };
});

describe('DatabaseManager - Unit Tests', () => {
  let db: DatabaseManager;
  let mockPool: any;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Get mock instances
    db = new DatabaseManager({
      host: 'localhost',
      port: 5432,
      database: 'test',
      user: 'test',
      password: 'test',
    });

    // Access the mocked pool and client
    mockPool = (db as any).pool;
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    mockPool.connect.mockResolvedValue(mockClient);
  });

  describe('Constructor', () => {
    it('should create pool with provided config', () => {
      const config = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        password: 'testpass',
      };

      new DatabaseManager(config);

      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: 5432,
          database: 'testdb',
          user: 'testuser',
          password: 'testpass',
        }),
      );
    });

    it('should apply default pool settings', () => {
      const config = {
        host: 'localhost',
        database: 'test',
      };

      new DatabaseManager(config);

      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        }),
      );
    });

    it('should allow overriding default pool settings', () => {
      const config = {
        host: 'localhost',
        database: 'test',
        max: 50,
        idleTimeoutMillis: 60000,
        connectionTimeoutMillis: 10000,
      };

      new DatabaseManager(config);

      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          max: 50,
          idleTimeoutMillis: 60000,
          connectionTimeoutMillis: 10000,
        }),
      );
    });

    it('should register error handler on pool', () => {
      expect(mockPool.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('query()', () => {
    it('should execute simple query', async () => {
      const mockResult = { rows: [{ id: 1 }], rowCount: 1 } as any;
      mockClient.query.mockResolvedValueOnce(mockResult);

      const result = await db.query('SELECT * FROM test', []);

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('SELECT * FROM test', []);
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toEqual(mockResult);
    });

    it('should execute parameterized query', async () => {
      const mockResult = { rows: [{ id: 1, name: 'Test' }], rowCount: 1 } as any;
      mockClient.query.mockResolvedValueOnce(mockResult);

      const result = await db.query('SELECT * FROM test WHERE id = $1', [1]);

      expect(mockClient.query).toHaveBeenCalledWith('SELECT * FROM test WHERE id = $1', [1]);
      expect(result).toEqual(mockResult);
    });

    it('should handle query with timeout option', async () => {
      const mockResult = { rows: [], rowCount: 0 } as any;
      mockClient.query.mockResolvedValue(mockResult);

      await db.query('SELECT * FROM test', [], { timeout: 5000 });

      expect(mockClient.query).toHaveBeenCalledWith('SET statement_timeout = 5000');
      expect(mockClient.query).toHaveBeenCalledWith('SELECT * FROM test', []);
      expect(mockClient.query).toHaveBeenCalledWith('SET statement_timeout = 0');
    });

    it('should release client even if timeout reset fails', async () => {
      const mockResult = { rows: [], rowCount: 0 } as any;
      mockClient.query
        .mockResolvedValueOnce(undefined) // SET timeout
        .mockResolvedValueOnce(mockResult) // Main query
        .mockRejectedValueOnce(new Error('Reset failed')); // Reset timeout fails

      await db.query('SELECT * FROM test', [], { timeout: 5000 });

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should throw error if connection is closed', async () => {
      await db.close();

      await expect(db.query('SELECT 1', [])).rejects.toThrow(
        'Cannot execute query: database connection is closed',
      );
    });

    it('should enhance error message with SQL context', async () => {
      const error = new Error('syntax error');
      mockClient.query.mockRejectedValue(error);

      await expect(db.query('SELECT * FROM invalid', [])).rejects.toThrow(/Database query failed/);
    });

    it('should release client on query error', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('Query failed'));

      await expect(db.query('SELECT * FROM test', [])).rejects.toThrow();

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle multiple concurrent queries', async () => {
      const mockResult = { rows: [], rowCount: 0 } as any;
      mockClient.query.mockResolvedValue(mockResult);

      const queries = [
        db.query('SELECT 1', []),
        db.query('SELECT 2', []),
        db.query('SELECT 3', []),
      ];

      await Promise.all(queries);

      expect(mockPool.connect).toHaveBeenCalledTimes(3);
      expect(mockClient.release).toHaveBeenCalledTimes(3);
    });
  });

  describe('transaction()', () => {
    it('should execute callback within transaction', async () => {
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const callback = jest.fn().mockResolvedValue('result');

      const result = await db.transaction(callback);

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(callback).toHaveBeenCalledWith(mockClient);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toBe('result');
    });

    it('should rollback on callback error', async () => {
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const error = new Error('Callback failed');
      const callback = jest.fn().mockRejectedValue(error);

      await expect(db.transaction(callback)).rejects.toThrow('Callback failed');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should release client even if rollback fails', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockRejectedValueOnce(new Error('Rollback failed')); // ROLLBACK

      const callback = jest.fn().mockRejectedValue(new Error('Callback failed'));

      await expect(db.transaction(callback)).rejects.toThrow();

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should throw error if connection is closed', async () => {
      await db.close();

      const callback = jest.fn();

      await expect(db.transaction(callback)).rejects.toThrow(
        'Cannot start transaction: database connection is closed',
      );
    });

    it('should support nested operations within transaction', async () => {
      mockClient.query.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 });

      const callback = async (client: PoolClient) => {
        await client.query('INSERT INTO test VALUES ($1)', [1]);
        await client.query('UPDATE test SET value = $1', [2]);
        return 'success';
      };

      const result = await db.transaction(callback);

      expect(result).toBe('success');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('INSERT INTO test VALUES ($1)', [1]);
      expect(mockClient.query).toHaveBeenCalledWith('UPDATE test SET value = $1', [2]);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });
  });

  describe('getPool()', () => {
    it('should return the underlying pool instance', () => {
      const pool = db.getPool();

      expect(pool).toBe(mockPool);
    });
  });

  describe('close()', () => {
    it('should close the pool', async () => {
      await db.close();

      expect(mockPool.end).toHaveBeenCalled();
    });

    it('should set isClosed flag', async () => {
      await db.close();

      await expect(db.query('SELECT 1', [])).rejects.toThrow('database connection is closed');
    });

    it('should be idempotent (safe to call multiple times)', async () => {
      await db.close();
      await db.close();

      expect(mockPool.end).toHaveBeenCalledTimes(1);
    });

    it('should prevent new queries after closing', async () => {
      await db.close();

      await expect(db.query('SELECT 1', [])).rejects.toThrow();
      await expect(db.transaction(async () => {})).rejects.toThrow();
    });
  });

  describe('testConnection()', () => {
    it('should return true for successful connection', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }], rowCount: 1 });

      const result = await db.testConnection();

      expect(result).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith('SELECT 1', []);
    });

    it('should return false for failed connection', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await db.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('getStats()', () => {
    it('should return pool statistics', () => {
      const stats = db.getStats();

      expect(stats).toEqual({
        totalCount: 10,
        idleCount: 5,
        waitingCount: 2,
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty parameter array', async () => {
      const mockResult = { rows: [], rowCount: 0 } as any;
      mockClient.query.mockResolvedValueOnce(mockResult);

      await db.query('SELECT NOW()', []);

      expect(mockClient.query).toHaveBeenCalledWith('SELECT NOW()', []);
    });

    it('should handle null values in parameters', async () => {
      const mockResult = { rows: [], rowCount: 0 } as any;
      mockClient.query.mockResolvedValueOnce(mockResult);

      await db.query('INSERT INTO test (col1, col2) VALUES ($1, $2)', [null, 'value']);

      expect(mockClient.query).toHaveBeenCalledWith(
        'INSERT INTO test (col1, col2) VALUES ($1, $2)',
        [null, 'value'],
      );
    });

    it('should handle array parameters', async () => {
      const mockResult = { rows: [], rowCount: 0 } as any;
      mockClient.query.mockResolvedValueOnce(mockResult);

      await db.query('SELECT * FROM test WHERE id = ANY($1)', [[1, 2, 3]]);

      expect(mockClient.query).toHaveBeenCalledWith('SELECT * FROM test WHERE id = ANY($1)', [[1, 2, 3]]);
    });

    it('should handle very long SQL queries', async () => {
      const mockResult = { rows: [], rowCount: 0 } as any;
      mockClient.query.mockResolvedValueOnce(mockResult);

      const longQuery = 'SELECT ' + 'a, '.repeat(1000) + 'b FROM test';

      await db.query(longQuery, []);

      expect(mockClient.query).toHaveBeenCalledWith(longQuery, []);
    });

    it('should truncate SQL in error messages for very long queries', async () => {
      const longQuery = 'SELECT ' + 'a, '.repeat(1000) + 'b FROM invalid';
      mockClient.query.mockRejectedValueOnce(new Error('syntax error'));

      try {
        await db.query(longQuery, []);
      } catch (error: any) {
        expect(error.message).toContain('Database query failed');
        expect(error.message.length).toBeLessThan(500); // Truncated
      }
    });
  });
});

describe('vectorToSql()', () => {
  it('should convert array to pgvector SQL format', () => {
    const vector = [0.1, 0.2, 0.3];
    const result = vectorToSql(vector);

    expect(typeof result).toBe('string');
    expect(result).toContain('0.1');
    expect(result).toContain('0.2');
    expect(result).toContain('0.3');
  });

  it('should handle large vectors', () => {
    const vector = Array(1536).fill(0.5);
    const result = vectorToSql(vector);

    expect(typeof result).toBe('string');
    expect(result).toBeTruthy();
  });

  it('should handle empty vector', () => {
    const vector: number[] = [];
    const result = vectorToSql(vector);

    expect(typeof result).toBe('string');
  });

  it('should handle negative values', () => {
    const vector = [-0.1, -0.2, -0.3];
    const result = vectorToSql(vector);

    expect(result).toContain('-0.1');
    expect(result).toContain('-0.2');
    expect(result).toContain('-0.3');
  });

  it('should handle zero vector', () => {
    const vector = [0, 0, 0];
    const result = vectorToSql(vector);

    expect(typeof result).toBe('string');
  });

  it('should handle very small and very large numbers', () => {
    const vector = [0.000001, 999999.999999];
    const result = vectorToSql(vector);

    expect(typeof result).toBe('string');
  });
});
