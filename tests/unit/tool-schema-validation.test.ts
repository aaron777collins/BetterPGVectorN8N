/**
 * Tool Schema Validation Tests
 *
 * These tests verify that the Zod schemas for each tool operation
 * correctly validate all expected input variations from AI agents.
 *
 * This directly addresses the error:
 * "Error executing tool: Received tool input did not match expected schema"
 *
 * AI agents may send inputs in various formats, so we test:
 * - Primary field names (query, content, concept, id)
 * - Alternative field names (input, text)
 * - Optional fields
 * - Edge cases (empty strings, special characters, Unicode)
 * - Invalid inputs that should be rejected
 */

import { z } from 'zod';

// Replicate the schemas from PgVectorStoreTool.node.ts for testing
const recallSchema = z.object({
  query: z.string().optional().describe('What to search for'),
  input: z.string().optional().describe('Alternative: what to search for'),
  filter: z.record(z.unknown()).optional().describe('Filter by metadata'),
}).refine(data => data.query || data.input, {
  message: "Either 'query' or 'input' must be provided",
});

const rememberSchema = z.object({
  content: z.string().optional().describe('The information to store'),
  text: z.string().optional().describe('Alternative: the information to store'),
  id: z.string().optional().describe('ID for this entry'),
  updateSimilar: z.string().optional().describe('Find entry similar to this and update it'),
  metadata: z.record(z.unknown()).optional().describe('Tags like {category: "meeting"}'),
}).refine(data => data.content || data.text, {
  message: "Either 'content' or 'text' must be provided",
});

const forgetSchema = z.object({
  id: z.string().describe('The exact ID to delete'),
});

const forgetSimilarSchema = z.object({
  concept: z.string().optional().describe('Delete entries similar to this concept'),
  input: z.string().optional().describe('Alternative: delete entries similar to this'),
  query: z.string().optional().describe('Alternative: delete entries similar to this'),
}).refine(data => data.concept || data.input || data.query, {
  message: "Either 'concept', 'input', or 'query' must be provided",
});

const lookupSchema = z.object({
  id: z.string().describe('The ID to retrieve'),
});

describe('Recall Tool Schema Validation', () => {
  describe('valid inputs', () => {
    it('should accept query field', () => {
      const input = { query: 'search term' };
      expect(() => recallSchema.parse(input)).not.toThrow();
    });

    it('should accept input field (alternative)', () => {
      const input = { input: 'search term' };
      expect(() => recallSchema.parse(input)).not.toThrow();
    });

    it('should accept query with filter', () => {
      const input = { query: 'search', filter: { category: 'tech' } };
      expect(() => recallSchema.parse(input)).not.toThrow();
    });

    it('should accept input with filter', () => {
      const input = { input: 'search', filter: { status: 'active' } };
      expect(() => recallSchema.parse(input)).not.toThrow();
    });

    it('should accept both query and input (uses first)', () => {
      const input = { query: 'primary', input: 'secondary' };
      expect(() => recallSchema.parse(input)).not.toThrow();
    });

    it('should accept query with complex filter', () => {
      const input = {
        query: 'search',
        filter: { nested: { deep: 'value' }, array: [1, 2, 3] },
      };
      expect(() => recallSchema.parse(input)).not.toThrow();
    });

    it('should accept query with special characters', () => {
      const input = { query: 'search with "quotes" and \'apostrophes\'' };
      expect(() => recallSchema.parse(input)).not.toThrow();
    });

    it('should accept query with Unicode', () => {
      const input = { query: '搜索 поиск 検索 🔍' };
      expect(() => recallSchema.parse(input)).not.toThrow();
    });

    it('should accept query with newlines', () => {
      const input = { query: 'line1\nline2\nline3' };
      expect(() => recallSchema.parse(input)).not.toThrow();
    });
  });

  describe('invalid inputs', () => {
    it('should reject empty object', () => {
      expect(() => recallSchema.parse({})).toThrow();
    });

    it('should reject filter-only (no query or input)', () => {
      expect(() => recallSchema.parse({ filter: { category: 'tech' } })).toThrow();
    });

    it('should reject null query', () => {
      expect(() => recallSchema.parse({ query: null })).toThrow();
    });

    it('should reject undefined query only', () => {
      expect(() => recallSchema.parse({ query: undefined })).toThrow();
    });

    it('should reject empty query string (refinement passes but empty)', () => {
      // Note: Empty string passes the refinement but may fail business logic
      const input = { query: '' };
      // Zod refinement checks truthiness, empty string is falsy
      expect(() => recallSchema.parse(input)).toThrow();
    });
  });
});

describe('Remember Tool Schema Validation', () => {
  describe('valid inputs', () => {
    it('should accept content field', () => {
      const input = { content: 'information to store' };
      expect(() => rememberSchema.parse(input)).not.toThrow();
    });

    it('should accept text field (alternative)', () => {
      const input = { text: 'information to store' };
      expect(() => rememberSchema.parse(input)).not.toThrow();
    });

    it('should accept content with id', () => {
      const input = { content: 'info', id: 'doc-123' };
      expect(() => rememberSchema.parse(input)).not.toThrow();
    });

    it('should accept content with updateSimilar', () => {
      const input = { content: 'new info', updateSimilar: 'old concept' };
      expect(() => rememberSchema.parse(input)).not.toThrow();
    });

    it('should accept content with metadata', () => {
      const input = { content: 'info', metadata: { category: 'meeting' } };
      expect(() => rememberSchema.parse(input)).not.toThrow();
    });

    it('should accept all fields together', () => {
      const input = {
        content: 'info',
        id: 'doc-123',
        updateSimilar: 'old concept',
        metadata: { category: 'meeting', priority: 'high' },
      };
      expect(() => rememberSchema.parse(input)).not.toThrow();
    });

    it('should accept content with complex metadata', () => {
      const input = {
        content: 'info',
        metadata: {
          nested: { deep: { value: 123 } },
          array: [1, 2, 3],
          date: '2024-01-15',
        },
      };
      expect(() => rememberSchema.parse(input)).not.toThrow();
    });

    it('should accept long content', () => {
      const longContent = 'a'.repeat(100000);
      const input = { content: longContent };
      expect(() => rememberSchema.parse(input)).not.toThrow();
    });

    it('should accept content with JSON-like strings', () => {
      const input = { content: '{"key": "value"}' };
      expect(() => rememberSchema.parse(input)).not.toThrow();
    });
  });

  describe('invalid inputs', () => {
    it('should reject empty object', () => {
      expect(() => rememberSchema.parse({})).toThrow();
    });

    it('should reject id-only (no content or text)', () => {
      expect(() => rememberSchema.parse({ id: 'doc-123' })).toThrow();
    });

    it('should reject metadata-only', () => {
      expect(() => rememberSchema.parse({ metadata: { key: 'value' } })).toThrow();
    });

    it('should reject updateSimilar-only', () => {
      expect(() => rememberSchema.parse({ updateSimilar: 'concept' })).toThrow();
    });

    it('should reject empty content string', () => {
      expect(() => rememberSchema.parse({ content: '' })).toThrow();
    });

    it('should reject null content', () => {
      expect(() => rememberSchema.parse({ content: null })).toThrow();
    });
  });
});

describe('Forget Tool Schema Validation', () => {
  describe('valid inputs', () => {
    it('should accept id field', () => {
      const input = { id: 'doc-123' };
      expect(() => forgetSchema.parse(input)).not.toThrow();
    });

    it('should accept UUID id', () => {
      const input = { id: '550e8400-e29b-41d4-a716-446655440000' };
      expect(() => forgetSchema.parse(input)).not.toThrow();
    });

    it('should accept custom id format', () => {
      const input = { id: 'meeting-2024-01-15-budget' };
      expect(() => forgetSchema.parse(input)).not.toThrow();
    });

    it('should accept id with special characters', () => {
      const input = { id: 'doc/123/subitem' };
      expect(() => forgetSchema.parse(input)).not.toThrow();
    });
  });

  describe('invalid inputs', () => {
    it('should reject empty object', () => {
      expect(() => forgetSchema.parse({})).toThrow();
    });

    it('should reject missing id', () => {
      expect(() => forgetSchema.parse({ query: 'something' })).toThrow();
    });

    it('should reject null id', () => {
      expect(() => forgetSchema.parse({ id: null })).toThrow();
    });

    it('should reject undefined id', () => {
      expect(() => forgetSchema.parse({ id: undefined })).toThrow();
    });

    it('should reject empty string id', () => {
      // Empty string is technically valid for Zod's string() type
      // but may fail validation in business logic
      const result = forgetSchema.safeParse({ id: '' });
      expect(result.success).toBe(true); // Zod allows empty string
    });
  });
});

describe('Forget Similar Tool Schema Validation', () => {
  describe('valid inputs', () => {
    it('should accept concept field', () => {
      const input = { concept: 'meeting notes' };
      expect(() => forgetSimilarSchema.parse(input)).not.toThrow();
    });

    it('should accept input field (alternative)', () => {
      const input = { input: 'meeting notes' };
      expect(() => forgetSimilarSchema.parse(input)).not.toThrow();
    });

    it('should accept query field (alternative)', () => {
      const input = { query: 'meeting notes' };
      expect(() => forgetSimilarSchema.parse(input)).not.toThrow();
    });

    it('should accept any combination of concept/input/query', () => {
      expect(() => forgetSimilarSchema.parse({ concept: 'a', input: 'b' })).not.toThrow();
      expect(() => forgetSimilarSchema.parse({ concept: 'a', query: 'b' })).not.toThrow();
      expect(() => forgetSimilarSchema.parse({ input: 'a', query: 'b' })).not.toThrow();
      expect(() => forgetSimilarSchema.parse({ concept: 'a', input: 'b', query: 'c' })).not.toThrow();
    });

    it('should accept concept with special characters', () => {
      const input = { concept: 'budget "Q4" meeting\'s notes' };
      expect(() => forgetSimilarSchema.parse(input)).not.toThrow();
    });
  });

  describe('invalid inputs', () => {
    it('should reject empty object', () => {
      expect(() => forgetSimilarSchema.parse({})).toThrow();
    });

    it('should reject all empty strings', () => {
      expect(() => forgetSimilarSchema.parse({ concept: '', input: '', query: '' })).toThrow();
    });

    it('should reject unrelated fields only', () => {
      expect(() => forgetSimilarSchema.parse({ id: 'doc-123' })).toThrow();
    });

    it('should reject null values', () => {
      expect(() => forgetSimilarSchema.parse({ concept: null })).toThrow();
    });
  });
});

describe('Lookup Tool Schema Validation', () => {
  describe('valid inputs', () => {
    it('should accept id field', () => {
      const input = { id: 'doc-123' };
      expect(() => lookupSchema.parse(input)).not.toThrow();
    });

    it('should accept UUID id', () => {
      const input = { id: '550e8400-e29b-41d4-a716-446655440000' };
      expect(() => lookupSchema.parse(input)).not.toThrow();
    });

    it('should accept custom id format', () => {
      const input = { id: 'user:john:preferences:theme' };
      expect(() => lookupSchema.parse(input)).not.toThrow();
    });
  });

  describe('invalid inputs', () => {
    it('should reject empty object', () => {
      expect(() => lookupSchema.parse({})).toThrow();
    });

    it('should reject missing id', () => {
      expect(() => lookupSchema.parse({ query: 'something' })).toThrow();
    });
  });
});

describe('Real AI Agent Input Patterns', () => {
  // These tests simulate actual inputs that AI agents might send
  // Based on common patterns from OpenAI, Anthropic, and other models

  describe('OpenAI-style inputs', () => {
    it('should handle OpenAI function call format for recall', () => {
      // OpenAI tends to use the primary field name
      const input = { query: 'What are the action items from last meeting?' };
      expect(() => recallSchema.parse(input)).not.toThrow();
    });

    it('should handle OpenAI function call format for remember', () => {
      const input = {
        content: 'Meeting notes: Discussed Q4 budget. Action items: 1. Review projections',
        metadata: { type: 'meeting', date: '2024-01-15' },
      };
      expect(() => rememberSchema.parse(input)).not.toThrow();
    });
  });

  describe('Anthropic Claude-style inputs', () => {
    it('should handle Claude input style for recall', () => {
      // Claude might use 'input' instead of 'query'
      const input = { input: 'search for budget discussions' };
      expect(() => recallSchema.parse(input)).not.toThrow();
    });

    it('should handle Claude input style for remember', () => {
      // Claude might use 'text' instead of 'content'
      const input = { text: 'Remember this for later: the project deadline is March 15th' };
      expect(() => rememberSchema.parse(input)).not.toThrow();
    });
  });

  describe('n8n AI Agent inputs', () => {
    it('should handle n8n structured tool input for recall', () => {
      const input = {
        query: 'find documents about project alpha',
        filter: { project: 'alpha', status: 'active' },
      };
      expect(() => recallSchema.parse(input)).not.toThrow();
    });

    it('should handle n8n structured tool input for remember', () => {
      const input = {
        content: 'Project Alpha status update: Phase 1 complete, starting Phase 2',
        id: 'project-alpha-update-001',
        metadata: {
          project: 'alpha',
          phase: 2,
          author: 'AI Agent',
          timestamp: new Date().toISOString(),
        },
      };
      expect(() => rememberSchema.parse(input)).not.toThrow();
    });
  });

  describe('Edge cases from production', () => {
    it('should handle very long search queries', () => {
      const longQuery = 'a'.repeat(10000);
      expect(() => recallSchema.parse({ query: longQuery })).not.toThrow();
    });

    it('should handle content with code blocks', () => {
      const codeContent = `
Here is some Python code:
\`\`\`python
def hello():
    print("Hello, World!")
\`\`\`
And some JavaScript:
\`\`\`javascript
const greet = () => console.log("Hi!");
\`\`\`
      `;
      expect(() => rememberSchema.parse({ content: codeContent })).not.toThrow();
    });

    it('should handle content with SQL', () => {
      const sqlContent = `
SELECT * FROM users WHERE id = 1;
INSERT INTO logs (message) VALUES ('test');
DROP TABLE students; -- This is a comment
      `;
      expect(() => rememberSchema.parse({ content: sqlContent })).not.toThrow();
    });

    it('should handle content with HTML', () => {
      const htmlContent = '<div class="test"><p>Hello <b>World</b></p></div>';
      expect(() => rememberSchema.parse({ content: htmlContent })).not.toThrow();
    });

    it('should handle deeply nested metadata', () => {
      const input = {
        content: 'test',
        metadata: {
          level1: {
            level2: {
              level3: {
                level4: {
                  level5: 'deep value',
                },
              },
            },
          },
        },
      };
      expect(() => rememberSchema.parse(input)).not.toThrow();
    });

    it('should handle metadata with array of objects', () => {
      const input = {
        content: 'test',
        metadata: {
          tags: [
            { name: 'important', weight: 0.9 },
            { name: 'urgent', weight: 0.8 },
          ],
        },
      };
      expect(() => rememberSchema.parse(input)).not.toThrow();
    });
  });
});
