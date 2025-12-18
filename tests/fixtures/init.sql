-- Initialize pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create test user with proper permissions
-- ALTER USER testuser WITH SUPERUSER;
