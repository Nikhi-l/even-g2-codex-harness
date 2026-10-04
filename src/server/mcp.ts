import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readConnection } from './config.js';
import { makeMcpServer } from './mcp-tools.js';

try {
  const server = makeMcpServer(await readConnection());
  await server.connect(new StdioServerTransport());
} catch (error) {
  console.error(error instanceof Error ? error.message : 'MCP startup failed');
  process.exitCode = 1;
}
