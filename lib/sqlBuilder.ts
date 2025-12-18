/**
 * SQL Builder Helpers
 * Safe dynamic SQL construction with parameterization
 */

export interface WhereResult {
  clause: string;
  values: any[];
}

export interface BatchResult {
  placeholders: string;
  values: any[];
}

/**
 * Escape SQL identifier (table/column names)
 * Prevents SQL injection by quoting identifiers
 */
export function escapeIdentifier(identifier: string): string {
  if (identifier.includes('.')) {
    return identifier.split('.').map(part => `"${part}"`).join('.');
  }
  return `"${identifier}"`;
}

/**
 * Sanitize table name - only allow alphanumeric and underscores
 */
export function sanitizeTableName(tableName: string): string {
  if (!tableName || tableName.length === 0) {
    throw new Error('Table name cannot be empty');
  }

  // Only allow alphanumeric characters and underscores
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
    throw new Error(`Invalid table name: ${tableName}. Only alphanumeric characters and underscores allowed.`);
  }

  return tableName;
}

/**
 * Sanitize column name - only allow alphanumeric and underscores
 */
export function sanitizeColumnName(columnName: string): string {
  if (!columnName || columnName.length === 0) {
    throw new Error('Column name cannot be empty');
  }

  // Only allow alphanumeric characters and underscores
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(columnName)) {
    throw new Error(`Invalid column name: ${columnName}. Only alphanumeric characters and underscores allowed.`);
  }

  return columnName;
}

/**
 * Build WHERE clause from filter object
 * Returns parameterized SQL and values array
 */
export function buildWhereClause(
  filter: Record<string, any>,
  startIndex: number = 1
): WhereResult {
  const conditions: string[] = [];
  const values: any[] = [];
  let paramIndex = startIndex;

  for (const [key, value] of Object.entries(filter)) {
    const sanitizedKey = sanitizeColumnName(key);

    if (value === null || value === undefined) {
      conditions.push(`${sanitizedKey} IS NULL`);
    } else if (Array.isArray(value)) {
      // Use ANY for array matching
      conditions.push(`${sanitizedKey} = ANY($${paramIndex})`);
      values.push(value);
      paramIndex++;
    } else {
      conditions.push(`${sanitizedKey} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  }

  const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { clause, values };
}

/**
 * Build JSONB filter clause
 * Uses @> operator for JSONB containment
 */
export function buildJsonbFilter(
  column: string,
  filter: Record<string, any>,
  startIndex: number = 1
): WhereResult {
  const sanitizedColumn = sanitizeColumnName(column);
  const clause = `${sanitizedColumn} @> $${startIndex}::jsonb`;
  const values = [JSON.stringify(filter)];

  return { clause, values };
}

/**
 * Build batch insert value placeholders
 * Generates ($1, $2), ($3, $4), ... and flattened values array
 */
export function buildBatchValues(
  rows: Record<string, any>[],
  columns: string[]
): BatchResult {
  if (rows.length === 0) {
    return { placeholders: '', values: [] };
  }

  const values: any[] = [];
  const rowPlaceholders: string[] = [];
  let paramIndex = 1;

  for (const row of rows) {
    const rowValues: string[] = [];

    for (const col of columns) {
      rowValues.push(`$${paramIndex}`);
      // Use null if column doesn't exist in this row
      values.push(row[col] !== undefined ? row[col] : null);
      paramIndex++;
    }

    rowPlaceholders.push(`(${rowValues.join(', ')})`);
  }

  return {
    placeholders: rowPlaceholders.join(', '),
    values
  };
}
