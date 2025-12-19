// Global test setup
beforeAll(() => {
  // Set test environment variables
  // Default port is 5433 for local docker-compose, CI overrides to 5432
  process.env.PGHOST = process.env.PGHOST || 'localhost';
  process.env.PGPORT = process.env.PGPORT || '5433';
  process.env.PGUSER = process.env.PGUSER || 'testuser';
  process.env.PGPASSWORD = process.env.PGPASSWORD || 'testpass';
  process.env.PGDATABASE = process.env.PGDATABASE || 'testdb';
});

// Increase timeout for integration tests
jest.setTimeout(30000);
