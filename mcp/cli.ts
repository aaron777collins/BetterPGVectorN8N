#!/usr/bin/env node

import { PgVectorMcpServer } from './server';
import * as readline from 'readline';

/**
 * MCP Server CLI for pgvector-advanced
 *
 * This CLI implements the MCP protocol over stdin/stdout for use with AI agents.
 *
 * Environment variables:
 *   PGHOST - PostgreSQL host (default: localhost)
 *   PGPORT - PostgreSQL port (default: 5432)
 *   PGDATABASE - Database name (required)
 *   PGUSER - Database user (required)
 *   PGPASSWORD - Database password (required)
 */

interface McpRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: any;
}

interface McpResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: any;
  error?: { code: number; message: string };
}

async function main() {
  const config = {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432'),
    database: process.env.PGDATABASE || '',
    user: process.env.PGUSER || '',
    password: process.env.PGPASSWORD || '',
  };

  if (!config.database || !config.user) {
    console.error('Error: PGDATABASE and PGUSER environment variables are required');
    process.exit(1);
  }

  const server = new PgVectorMcpServer(config);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  const sendResponse = (response: McpResponse) => {
    console.log(JSON.stringify(response));
  };

  rl.on('line', async (line: string) => {
    try {
      const request: McpRequest = JSON.parse(line);

      switch (request.method) {
        case 'initialize':
          sendResponse({
            jsonrpc: '2.0',
            id: request.id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: {},
              },
              serverInfo: server.getServerInfo(),
            },
          });
          break;

        case 'tools/list':
          sendResponse({
            jsonrpc: '2.0',
            id: request.id,
            result: {
              tools: server.listTools(),
            },
          });
          break;

        case 'tools/call': {
          const { name, arguments: args } = request.params || {};
          const result = await server.callTool(name, args || {});
          sendResponse({
            jsonrpc: '2.0',
            id: request.id,
            result: result,
          });
          break;
        }

        case 'shutdown':
          await server.close();
          sendResponse({
            jsonrpc: '2.0',
            id: request.id,
            result: null,
          });
          process.exit(0);
          break;

        default:
          sendResponse({
            jsonrpc: '2.0',
            id: request.id,
            error: { code: -32601, message: `Method not found: ${request.method}` },
          });
      }
    } catch (error: any) {
      sendResponse({
        jsonrpc: '2.0',
        id: 0,
        error: { code: -32700, message: `Parse error: ${error.message}` },
      });
    }
  });

  rl.on('close', async () => {
    await server.close();
    process.exit(0);
  });

  // Handle signals
  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
