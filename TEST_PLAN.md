# Comprehensive Test Plan for n8n-nodes-pgvector-advanced

## Overview
This document outlines the comprehensive testing strategy for the n8n PGVector Advanced node package. We follow Test-Driven Development (TDD) principles with a focus on unit tests, integration tests, and end-to-end tests.

## Test Structure

### 1. Unit Tests (`tests/unit/`)
Unit tests verify individual functions and classes in isolation, using mocks for dependencies.

#### 1.1 sqlBuilder.test.ts ✅ (Completed)
- Tests SQL query construction
- Tests parameterization and SQL injection prevention
- Tests WHERE clause building
- Tests metadata filtering

#### 1.2 db.test.ts (To Be Added)
**Purpose**: Test DatabaseManager class in isolation
**Test Cases**:
- Constructor validation
- Connection pool configuration
- Query method with mocked pool
- Transaction handling (begin, commit, rollback)
- Error handling
- Connection cleanup
- Timeout handling

#### 1.3 pgvector.test.ts (To Be Added)
**Purpose**: Test PgVectorManager class in isolation
**Test Cases**:
- Schema existence check (mocked queries)
- Table creation SQL generation
- Index creation SQL generation
- Distance metric validation
- Index type validation
- Dimension validation

#### 1.4 vectorstore.test.ts (To Be Added)
**Purpose**: Test VectorStoreOperations class in isolation
**Test Cases**:
- Upsert parameter validation
- Query parameter validation
- Delete parameter validation
- Get parameter validation
- Embedding dimension validation
- Metadata filter construction
- Error handling for invalid inputs

#### 1.5 PgvectorVectorStore.node.test.ts (New - High Priority)
**Purpose**: Test the main n8n node in isolation
**Test Cases**:
- Node description validation
- Operation parameter validation
- Credential requirement verification
- Input/output configuration
- Error handling for missing credentials
- Error handling for invalid operations
- Parameter transformation logic
- Result formatting

### 2. Integration Tests (`tests/integration/`)
Integration tests verify components working together with a real PostgreSQL database.

#### 2.1 db.test.ts ✅ (Completed - needs DB running)
- Real database connection
- Query execution
- Transaction handling
- Connection pooling

#### 2.2 pgvector.test.ts ✅ (Completed - needs DB running)
- Schema creation
- Index creation
- pgvector extension validation

#### 2.3 vectorstore.test.ts ✅ (Completed - needs DB running)
- Full CRUD operations
- Vector similarity search
- Metadata filtering
- Batch operations

### 3. End-to-End Tests (`tests/e2e/`)
E2E tests simulate real n8n workflow execution.

#### 3.1 PgvectorVectorStore.e2e.test.ts (New - High Priority)
**Purpose**: Test the node as it would run in n8n
**Test Cases**:

##### 3.1.1 Upsert Operation
- Single upsert with all fields
- Single upsert with minimal fields
- Batch upsert with field mapping
- Upsert with duplicate external_id (update scenario)
- Error handling for missing embedding
- Error handling for dimension mismatch

##### 3.1.2 Query Operation
- Basic similarity search
- Query with metadata filter
- Query with pagination (offset/limit)
- Query with different distance metrics (cosine, l2, inner_product)
- Query with includeEmbedding option
- Query on empty collection
- Error handling for invalid embedding dimensions

##### 3.1.3 Delete Operation
- Delete by ID (single)
- Delete by ID (multiple)
- Delete by external_id (single)
- Delete by external_id (multiple)
- Delete by metadata filter
- Delete from specific collection
- Error handling for non-existent records

##### 3.1.4 Get Operation
- Get by ID (single)
- Get by ID (multiple)
- Get by external_id (single)
- Get by external_id (multiple)
- Get with includeEmbedding option
- Error handling for non-existent records

##### 3.1.5 Admin Operations
- Ensure schema (first time)
- Ensure schema (idempotent - already exists)
- Create HNSW index
- Create IVFFlat index
- Drop collection
- Error handling for invalid dimensions

##### 3.1.6 Workflow Scenarios
- Complete semantic search pipeline: upsert → query
- Incremental updates: upsert same external_id multiple times
- Deduplication: query → check similarity → conditional upsert
- Batch processing: batch upsert → batch query

## Test Data

### Sample Embeddings
```typescript
const sampleEmbedding1536 = Array(1536).fill(0).map((_, i) => Math.random());
const sampleEmbedding384 = Array(384).fill(0).map((_, i) => Math.random());
```

### Sample Metadata
```typescript
const sampleMetadata = {
  category: 'technology',
  author: 'John Doe',
  published: '2024-01-01',
  tags: ['ai', 'ml', 'nlp']
};
```

### Sample Documents
```typescript
const sampleDocuments = [
  {
    externalId: 'doc-1',
    content: 'Introduction to machine learning and AI',
    metadata: { category: 'technology', difficulty: 'beginner' },
    embedding: [/* 1536 values */]
  },
  // ... more samples
];
```

## Test Environment

### Database Setup
- PostgreSQL 15+ with pgvector extension
- Docker Compose for local testing
- Separate test database to avoid pollution
- Clean state before each test suite

### Mock Strategy for Unit Tests
- Mock `pg` Pool for DatabaseManager tests
- Mock DatabaseManager for PgVectorManager tests
- Mock all dependencies for node tests
- Use jest.fn() for function mocks
- Use jest.mock() for module mocks

### n8n Testing Utilities
```typescript
// Mock n8n execution context
const mockExecuteFunctions = {
  getCredentials: jest.fn(),
  getInputData: jest.fn(),
  getNodeParameter: jest.fn(),
  helpers: {
    returnJsonArray: jest.fn(),
  },
};
```

## Coverage Goals

### Minimum Coverage Targets
- Overall: 90%+
- Unit tests: 95%+
- Integration tests: 85%+
- E2E tests: 80%+

### Critical Paths (100% coverage required)
- Error handling
- SQL injection prevention
- Credential validation
- Data validation
- Transaction management

## Test Execution Strategy

### Local Development
```bash
# Run all tests
npm test

# Run specific test types
npm run test:unit
npm run test:integration
npm run test:e2e

# Watch mode for TDD
npm run test:watch

# Coverage report
npm test -- --coverage
```

### CI/CD Pipeline
1. Lint check
2. Unit tests (fast, no external dependencies)
3. Integration tests (requires DB)
4. E2E tests (full workflow simulation)
5. Coverage report
6. Fail if coverage < 90%

## Test Data Cleanup

### After Each Test
- Truncate all test tables
- Reset sequences
- Clear connection pools

### After Test Suite
- Drop test database
- Stop Docker containers
- Clean temporary files

## Edge Cases to Test

### Data Edge Cases
- Empty collections
- Large batches (1000+ items)
- Very long content text
- Special characters in metadata
- Null/undefined values
- Empty arrays
- Extremely large metadata objects

### Vector Edge Cases
- Zero vectors
- Normalized vs non-normalized vectors
- Different dimensions (384, 768, 1536, 3072)
- Duplicate embeddings (different content, same vector)

### Database Edge Cases
- Connection failures
- Query timeouts
- Transaction rollbacks
- Constraint violations
- Concurrent operations
- Connection pool exhaustion

### n8n Integration Edge Cases
- Missing credentials
- Invalid node parameters
- Empty input data
- Malformed input items
- Large input datasets (pagination)
- Node execution errors

## Performance Benchmarks

### Expected Performance (E2E Tests)
- Single upsert: < 50ms
- Batch upsert (100 items): < 500ms
- Query (top 10): < 100ms
- Query with metadata filter: < 150ms
- Delete operation: < 50ms

### Load Tests (Future)
- 10,000 embeddings upsert
- 100 concurrent queries
- Large result set pagination

## TDD Workflow

### For Each New Feature
1. **Write failing test** - Define expected behavior
2. **Implement minimal code** - Make test pass
3. **Refactor** - Clean up while keeping tests green
4. **Add edge cases** - Test boundary conditions
5. **Document** - Update README and comments

### Test-First Example
```typescript
// 1. Write test first
describe('upsert with duplicate external_id', () => {
  it('should update existing record', async () => {
    // Setup: Insert initial record
    // Action: Upsert same external_id
    // Assert: Record updated, not duplicated
  });
});

// 2. Implement feature
// 3. Test passes
// 4. Refactor if needed
```

## Success Criteria

### Definition of Done for Testing
- [ ] All unit tests pass
- [ ] All integration tests pass (with real DB)
- [ ] All E2E tests pass (simulating n8n)
- [ ] Code coverage ≥ 90%
- [ ] No console errors or warnings
- [ ] All edge cases covered
- [ ] Performance benchmarks met
- [ ] Documentation updated
- [ ] CI/CD pipeline green

## Next Steps

1. ✅ Complete existing unit test for sqlBuilder
2. 🔄 Add unit tests for db.ts, pgvector.ts, vectorstore.ts
3. 🔄 Add unit tests for PgvectorVectorStore.node.ts
4. 🔄 Create E2E test suite for full workflow testing
5. 🔄 Run all tests with real database
6. 🔄 Generate coverage report
7. 🔄 Fix any gaps to reach 90%+ coverage
8. 🔄 Document test results and performance metrics

## Appendix

### Useful Testing Commands
```bash
# Start test database
npm run docker:up

# Run specific test file
npm test -- tests/unit/db.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="upsert"

# Update snapshots
npm test -- -u

# Debug tests
node --inspect-brk node_modules/.bin/jest --runInBand

# Coverage for specific file
npm test -- --coverage --collectCoverageFrom="lib/db.ts"
```

### Mock Example Template
```typescript
jest.mock('../lib/db', () => ({
  DatabaseManager: jest.fn().mockImplementation(() => ({
    query: jest.fn(),
    transaction: jest.fn(),
    end: jest.fn(),
  })),
}));
```
