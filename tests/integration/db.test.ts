import { DatabaseManager } from '../../lib/db';
import { Pool } from 'pg';

describe('DatabaseManager Integration Tests', () => {
  let db: DatabaseManager;

  beforeAll(async () => {
    db = new DatabaseManager({
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT || '5432'),
      user: process.env.PGUSER || 'testuser',
      password: process.env.PGPASSWORD || 'testpass',
      database: process.env.PGDATABASE || 'testdb',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    // Clean up test tables
    await db.query('DROP TABLE IF EXISTS test_table CASCADE', []);
  });

  describe('query', () => {
    it('should execute simple SELECT query', async () => {
      const result = await db.query('SELECT 1 as num', []);
      expect(result.rows).toEqual([{ num: 1 }]);
      expect(result.rowCount).toBe(1);
    });

    it('should execute parameterized query', async () => {
      await db.query(
        'CREATE TABLE test_table (id SERIAL PRIMARY KEY, name TEXT)',
        []
      );
      await db.query('INSERT INTO test_table (name) VALUES ($1)', ['Alice']);

      const result = await db.query(
        'SELECT * FROM test_table WHERE name = $1',
        ['Alice']
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe('Alice');
    });

    it('should handle query timeout', async () => {
      const slowQuery = 'SELECT pg_sleep(10)';
      await expect(db.query(slowQuery, [], { timeout: 100 })).rejects.toThrow();
    }, 10000);

    it('should handle multiple concurrent queries', async () => {
      await db.query(
        'CREATE TABLE test_table (id SERIAL PRIMARY KEY, num INT)',
        []
      );

      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(
          db.query('INSERT INTO test_table (num) VALUES ($1)', [i])
        );
      }

      await Promise.all(promises);

      const result = await db.query('SELECT COUNT(*) as count FROM test_table', []);
      expect(parseInt(result.rows[0].count)).toBe(20);
    });

    it('should return error for invalid SQL', async () => {
      await expect(
        db.query('SELECT * FROM nonexistent_table', [])
      ).rejects.toThrow();
    });
  });

  describe('transaction', () => {
    beforeEach(async () => {
      await db.query(
        'CREATE TABLE test_table (id SERIAL PRIMARY KEY, value TEXT)',
        []
      );
    });

    it('should commit transaction on success', async () => {
      await db.transaction(async (client) => {
        await client.query('INSERT INTO test_table (value) VALUES ($1)', ['test1']);
        await client.query('INSERT INTO test_table (value) VALUES ($1)', ['test2']);
      });

      const result = await db.query('SELECT COUNT(*) as count FROM test_table', []);
      expect(parseInt(result.rows[0].count)).toBe(2);
    });

    it('should rollback transaction on error', async () => {
      await expect(
        db.transaction(async (client) => {
          await client.query('INSERT INTO test_table (value) VALUES ($1)', ['test1']);
          throw new Error('Intentional error');
        })
      ).rejects.toThrow('Intentional error');

      const result = await db.query('SELECT COUNT(*) as count FROM test_table', []);
      expect(parseInt(result.rows[0].count)).toBe(0);
    });

    it('should rollback on SQL error', async () => {
      await expect(
        db.transaction(async (client) => {
          await client.query('INSERT INTO test_table (value) VALUES ($1)', ['test1']);
          await client.query('INSERT INTO nonexistent (value) VALUES ($1)', ['test2']);
        })
      ).rejects.toThrow();

      const result = await db.query('SELECT COUNT(*) as count FROM test_table', []);
      expect(parseInt(result.rows[0].count)).toBe(0);
    });
  });

  describe('connection pool management', () => {
    it('should create connection pool on initialization', () => {
      expect(db.getPool()).toBeInstanceOf(Pool);
    });

    it('should reuse connections from pool', async () => {
      const results = [];
      for (let i = 0; i < 5; i++) {
        const result = await db.query('SELECT $1::int as num', [i]);
        results.push(result.rows[0].num);
      }
      expect(results).toEqual([0, 1, 2, 3, 4]);
    });

    it('should close pool gracefully', async () => {
      const testDb = new DatabaseManager({
        host: process.env.PGHOST || 'localhost',
        port: parseInt(process.env.PGPORT || '5432'),
        user: process.env.PGUSER || 'testuser',
        password: process.env.PGPASSWORD || 'testpass',
        database: process.env.PGDATABASE || 'testdb',
      });

      await testDb.query('SELECT 1', []);
      await testDb.close();

      // Query after close should fail
      await expect(testDb.query('SELECT 1', [])).rejects.toThrow();
    });
  });

  describe('error handling', () => {
    it('should provide clear error messages', async () => {
      try {
        await db.query('SELECT * FROM nonexistent_table', []);
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('nonexistent_table');
      }
    });

    it('should handle connection errors gracefully', async () => {
      const badDb = new DatabaseManager({
        host: 'nonexistent-host',
        port: 9999,
        user: 'baduser',
        password: 'badpass',
        database: 'baddb',
        connectionTimeoutMillis: 1000,
      });

      await expect(badDb.query('SELECT 1', [])).rejects.toThrow();
      await badDb.close();
    });
  });
});
