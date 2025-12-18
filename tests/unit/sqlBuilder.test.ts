import {
  escapeIdentifier,
  buildWhereClause,
  buildJsonbFilter,
  buildBatchValues,
  sanitizeTableName,
  sanitizeColumnName
} from '../../lib/sqlBuilder';

describe('sqlBuilder', () => {
  describe('escapeIdentifier', () => {
    it('should escape simple identifiers', () => {
      expect(escapeIdentifier('users')).toBe('"users"');
      expect(escapeIdentifier('my_table')).toBe('"my_table"');
    });

    it('should escape identifiers with special characters', () => {
      expect(escapeIdentifier('user.name')).toBe('"user"."name"');
    });

    it('should prevent SQL injection attempts', () => {
      expect(escapeIdentifier('users; DROP TABLE users--')).toBe('"users; DROP TABLE users--"');
    });

    it('should handle empty strings', () => {
      expect(escapeIdentifier('')).toBe('""');
    });
  });

  describe('sanitizeTableName', () => {
    it('should allow valid table names', () => {
      expect(sanitizeTableName('embeddings')).toBe('embeddings');
      expect(sanitizeTableName('my_table_123')).toBe('my_table_123');
    });

    it('should reject invalid table names', () => {
      expect(() => sanitizeTableName('table; DROP TABLE users')).toThrow();
      expect(() => sanitizeTableName('table--')).toThrow();
      expect(() => sanitizeTableName('table/*')).toThrow();
    });

    it('should reject empty table names', () => {
      expect(() => sanitizeTableName('')).toThrow();
    });
  });

  describe('sanitizeColumnName', () => {
    it('should allow valid column names', () => {
      expect(sanitizeColumnName('id')).toBe('id');
      expect(sanitizeColumnName('external_id')).toBe('external_id');
      expect(sanitizeColumnName('created_at')).toBe('created_at');
    });

    it('should reject invalid column names', () => {
      expect(() => sanitizeColumnName('col; DROP')).toThrow();
      expect(() => sanitizeColumnName('col--')).toThrow();
    });
  });

  describe('buildWhereClause', () => {
    it('should build simple WHERE clause', () => {
      const { clause, values } = buildWhereClause({ collection: 'test' }, 1);
      expect(clause).toBe('WHERE collection = $1');
      expect(values).toEqual(['test']);
    });

    it('should build WHERE clause with multiple conditions', () => {
      const { clause, values } = buildWhereClause({
        collection: 'test',
        external_id: 'ext123'
      }, 1);
      expect(clause).toBe('WHERE collection = $1 AND external_id = $2');
      expect(values).toEqual(['test', 'ext123']);
    });

    it('should handle custom start index', () => {
      const { clause, values } = buildWhereClause({ collection: 'test' }, 5);
      expect(clause).toBe('WHERE collection = $5');
      expect(values).toEqual(['test']);
    });

    it('should handle empty filter object', () => {
      const { clause, values } = buildWhereClause({}, 1);
      expect(clause).toBe('');
      expect(values).toEqual([]);
    });

    it('should handle null values', () => {
      const { clause, values } = buildWhereClause({ external_id: null }, 1);
      expect(clause).toBe('WHERE external_id IS NULL');
      expect(values).toEqual([]);
    });

    it('should handle IN operator for arrays', () => {
      const { clause, values } = buildWhereClause({
        id: ['id1', 'id2', 'id3']
      }, 1);
      expect(clause).toBe('WHERE id = ANY($1)');
      expect(values).toEqual([['id1', 'id2', 'id3']]);
    });
  });

  describe('buildJsonbFilter', () => {
    it('should build simple JSONB filter', () => {
      const { clause, values } = buildJsonbFilter('metadata', { key: 'value' }, 1);
      expect(clause).toBe('metadata @> $1::jsonb');
      expect(values).toEqual([JSON.stringify({ key: 'value' })]);
    });

    it('should handle nested JSONB objects', () => {
      const filter = { user: { name: 'John', age: 30 } };
      const { clause, values } = buildJsonbFilter('metadata', filter, 1);
      expect(clause).toBe('metadata @> $1::jsonb');
      expect(values).toEqual([JSON.stringify(filter)]);
    });

    it('should handle empty JSONB filter', () => {
      const { clause, values } = buildJsonbFilter('metadata', {}, 1);
      expect(clause).toBe('metadata @> $1::jsonb');
      expect(values).toEqual([JSON.stringify({})]);
    });

    it('should use custom start index', () => {
      const { clause, values } = buildJsonbFilter('metadata', { key: 'val' }, 10);
      expect(clause).toBe('metadata @> $10::jsonb');
      expect(values).toEqual([JSON.stringify({ key: 'val' })]);
    });
  });

  describe('buildBatchValues', () => {
    it('should build batch insert values for single row', () => {
      const rows = [
        { id: '123', content: 'test', metadata: { key: 'val' } }
      ];
      const columns = ['id', 'content', 'metadata'];
      const { placeholders, values } = buildBatchValues(rows, columns);

      expect(placeholders).toBe('($1, $2, $3)');
      expect(values).toEqual(['123', 'test', { key: 'val' }]);
    });

    it('should build batch insert values for multiple rows', () => {
      const rows = [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
        { id: '3', name: 'Charlie' }
      ];
      const columns = ['id', 'name'];
      const { placeholders, values } = buildBatchValues(rows, columns);

      expect(placeholders).toBe('($1, $2), ($3, $4), ($5, $6)');
      expect(values).toEqual(['1', 'Alice', '2', 'Bob', '3', 'Charlie']);
    });

    it('should handle missing columns with null', () => {
      const rows = [
        { id: '1', name: 'Alice' },
        { id: '2' }
      ];
      const columns = ['id', 'name'];
      const { placeholders, values } = buildBatchValues(rows, columns);

      expect(placeholders).toBe('($1, $2), ($3, $4)');
      expect(values).toEqual(['1', 'Alice', '2', null]);
    });

    it('should preserve column order', () => {
      const rows = [
        { name: 'Alice', id: '1', age: 30 }
      ];
      const columns = ['id', 'name', 'age'];
      const { values } = buildBatchValues(rows, columns);

      expect(values).toEqual(['1', 'Alice', 30]);
    });

    it('should handle empty rows array', () => {
      const { placeholders, values } = buildBatchValues([], ['id', 'name']);
      expect(placeholders).toBe('');
      expect(values).toEqual([]);
    });

    it('should handle JSONB values', () => {
      const rows = [
        { metadata: { key: 'value', nested: { prop: 123 } } }
      ];
      const columns = ['metadata'];
      const { values } = buildBatchValues(rows, columns);

      expect(values[0]).toEqual({ key: 'value', nested: { prop: 123 } });
    });
  });
});
