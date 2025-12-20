/**
 * SQL Template Engine
 * Allows advanced users to write custom SQL queries with placeholder substitution
 */

import { DistanceMetric } from './pgvector';

/**
 * Placeholder definitions for SQL templates
 */
export interface SqlPlaceholders {
  /** $1 - The embedding vector (as JSON array) */
  embedding?: number[];
  /** $2 - Partition/collection value */
  partition?: string;
  /** $3 - Limit (topK) */
  limit?: number;
  /** $4 - Offset for pagination */
  offset?: number;
  /** $5 - ID value */
  id?: string;
  /** $6 - External ID value */
  externalId?: string;
  /** $7 - Content text */
  content?: string;
  /** $8 - Metadata JSONB */
  metadata?: Record<string, unknown>;
  /** $9 - Filter JSONB for metadata queries */
  filter?: Record<string, unknown>;
}

/**
 * Result of template execution
 */
export interface TemplateResult {
  sql: string;
  values: unknown[];
}

/**
 * Template validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  placeholders: string[];
}

/**
 * Default SQL templates that match the original behavior
 */
export const DEFAULT_TEMPLATES = {
  search: `
SELECT {{selectFields}},
       {{embeddingCol}} {{distanceOp}} $1::vector AS score
FROM {{tableName}}
WHERE {{partitionCol}} = $2
{{metadataFilter}}
ORDER BY score
LIMIT $3
OFFSET $4
  `.trim(),

  insert: `
INSERT INTO {{tableName}}
  ({{partitionCol}}, {{externalIdCol}}, {{contentCol}}, {{metadataCol}}, {{embeddingCol}})
VALUES ($1, $2, $3, $4, $5)
RETURNING {{idCol}}, {{externalIdCol}}, {{partitionCol}}, true AS inserted
  `.trim(),

  upsertById: `
INSERT INTO {{tableName}}
  ({{idCol}}, {{partitionCol}}, {{externalIdCol}}, {{contentCol}}, {{metadataCol}}, {{embeddingCol}})
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT ({{idCol}})
DO UPDATE SET
  {{partitionCol}} = EXCLUDED.{{partitionCol}},
  {{externalIdCol}} = EXCLUDED.{{externalIdCol}},
  {{contentCol}} = EXCLUDED.{{contentCol}},
  {{metadataCol}} = EXCLUDED.{{metadataCol}},
  {{embeddingCol}} = EXCLUDED.{{embeddingCol}},
  {{updatedAtCol}} = NOW()
RETURNING {{idCol}}, {{externalIdCol}}, {{partitionCol}}, (xmax = 0) AS inserted
  `.trim(),

  upsertByExternalId: `
INSERT INTO {{tableName}}
  ({{partitionCol}}, {{externalIdCol}}, {{contentCol}}, {{metadataCol}}, {{embeddingCol}})
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT ({{partitionCol}}, {{externalIdCol}})
DO UPDATE SET
  {{contentCol}} = EXCLUDED.{{contentCol}},
  {{metadataCol}} = EXCLUDED.{{metadataCol}},
  {{embeddingCol}} = EXCLUDED.{{embeddingCol}},
  {{updatedAtCol}} = NOW()
RETURNING {{idCol}}, {{externalIdCol}}, {{partitionCol}}, (xmax = 0) AS inserted
  `.trim(),

  deleteById: `
DELETE FROM {{tableName}}
WHERE {{idCol}} = ANY($1)
  `.trim(),

  deleteByExternalId: `
DELETE FROM {{tableName}}
WHERE {{partitionCol}} = $1 AND {{externalIdCol}} = ANY($2)
  `.trim(),

  getById: `
SELECT {{selectFields}}, {{embeddingCol}}, {{createdAtCol}}, {{updatedAtCol}}
FROM {{tableName}}
WHERE {{idCol}} = ANY($1)
  `.trim(),

  getByExternalId: `
SELECT {{selectFields}}, {{embeddingCol}}, {{createdAtCol}}, {{updatedAtCol}}
FROM {{tableName}}
WHERE {{partitionCol}} = $1 AND {{externalIdCol}} = ANY($2)
  `.trim(),
};

/**
 * Get distance operator for a given metric
 */
export function getDistanceOperator(metric: DistanceMetric): string {
  switch (metric) {
    case DistanceMetric.L2:
      return '<->';
    case DistanceMetric.INNER_PRODUCT:
      return '<#>';
    case DistanceMetric.COSINE:
    default:
      return '<=>';
  }
}

/**
 * Validate a SQL template for common issues
 */
export function validateTemplate(template: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const placeholders: string[] = [];

  // Check for required structure
  if (!template.trim()) {
    errors.push('Template cannot be empty');
    return { valid: false, errors, warnings, placeholders };
  }

  // Extract placeholders ($1, $2, etc.)
  const dollarPlaceholders = template.match(/\$\d+/g) || [];
  placeholders.push(...new Set(dollarPlaceholders));

  // Extract template variables ({{variableName}})
  const templateVars = template.match(/\{\{[\w]+\}\}/g) || [];
  if (templateVars.length > 0) {
    warnings.push(`Template contains unsubstituted variables: ${templateVars.join(', ')}`);
  }

  // Check for dangerous patterns
  if (/;\s*(DROP|DELETE|TRUNCATE|ALTER)\s/i.test(template)) {
    errors.push('Template contains potentially dangerous SQL statements');
  }

  // Check placeholder ordering
  const numbers = dollarPlaceholders.map(p => parseInt(p.slice(1))).sort((a, b) => a - b);
  for (let i = 0; i < numbers.length; i++) {
    if (numbers[i] !== i + 1) {
      warnings.push(`Placeholder numbering may have gaps or not start at $1`);
      break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    placeholders,
  };
}

/**
 * Substitute template variables with actual values
 */
export function substituteTemplateVars(
  template: string,
  vars: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

/**
 * Build a custom search query from user template
 */
export function buildCustomSearchQuery(
  template: string,
  params: {
    embedding: number[];
    partition?: string;
    limit?: number;
    offset?: number;
    metadataFilter?: Record<string, unknown>;
  }
): TemplateResult {
  const values: unknown[] = [];

  // $1 is always the embedding
  values.push(JSON.stringify(params.embedding));

  // Build values array based on what placeholders exist in template
  if (template.includes('$2')) {
    values.push(params.partition || null);
  }
  if (template.includes('$3')) {
    values.push(params.limit || 10);
  }
  if (template.includes('$4')) {
    values.push(params.offset || 0);
  }
  if (template.includes('$5') && params.metadataFilter) {
    values.push(JSON.stringify(params.metadataFilter));
  }

  return { sql: template, values };
}

/**
 * Build a custom insert/upsert query from user template
 */
export function buildCustomInsertQuery(
  template: string,
  params: {
    id?: string;
    partition?: string;
    externalId?: string;
    content?: string;
    metadata?: Record<string, unknown>;
    embedding: number[];
  }
): TemplateResult {
  const values: unknown[] = [];

  // Standard order: id, partition, externalId, content, metadata, embedding
  if (template.includes('$1')) values.push(params.id || params.partition || null);
  if (template.includes('$2')) values.push(params.partition || params.externalId || null);
  if (template.includes('$3')) values.push(params.externalId || params.content || null);
  if (template.includes('$4')) values.push(params.content || JSON.stringify(params.metadata || {}));
  if (template.includes('$5')) values.push(JSON.stringify(params.metadata || {}));
  if (template.includes('$6')) values.push(JSON.stringify(params.embedding));

  return { sql: template, values };
}

/**
 * Parse a raw SQL template and extract metadata about it
 */
export function parseTemplate(template: string): {
  operation: 'select' | 'insert' | 'update' | 'delete' | 'unknown';
  tables: string[];
  placeholderCount: number;
} {
  const normalized = template.trim().toUpperCase();

  let operation: 'select' | 'insert' | 'update' | 'delete' | 'unknown' = 'unknown';
  if (normalized.startsWith('SELECT')) operation = 'select';
  else if (normalized.startsWith('INSERT')) operation = 'insert';
  else if (normalized.startsWith('UPDATE')) operation = 'update';
  else if (normalized.startsWith('DELETE')) operation = 'delete';

  // Extract table names (simplified - looks for FROM/INTO/UPDATE keywords)
  const tableMatches = template.match(/(?:FROM|INTO|UPDATE)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi) || [];
  const tables = tableMatches.map(m => m.split(/\s+/)[1]);

  // Count placeholders
  const placeholders = template.match(/\$\d+/g) || [];
  const placeholderCount = new Set(placeholders).size;

  return { operation, tables, placeholderCount };
}
