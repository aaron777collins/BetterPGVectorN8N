// Global test setup
beforeAll(() => {
  // Set test environment variables
  process.env.PGHOST = process.env.PGHOST || 'localhost';
  process.env.PGPORT = process.env.PGPORT || '5432';
  process.env.PGUSER = process.env.PGUSER || 'testuser';
  process.env.PGPASSWORD = process.env.PGPASSWORD || 'testpass';
  process.env.PGDATABASE = process.env.PGDATABASE || 'testdb';
});

// Increase timeout for integration tests
jest.setTimeout(30000);
