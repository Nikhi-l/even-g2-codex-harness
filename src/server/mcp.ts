import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readConnection } from './config.js';
import { makeMcpServer } from './mcp-tools.js';

// `--channel` (or G2_HARNESS_CHANNEL=1) turns on the Claude Code channel. G2_HARNESS_SPEAKER fixes the answer label.
try {
  const channel = process.argv.includes('--channel') || process.env.G2_HARNESS_CHANNEL === '1';
  const server = makeMcpServer(await readConnection(), { channel, ...(process.env.G2_HARNESS_SPEAKER ? { speaker: process.env.G2_HARNESS_SPEAKER } : {}) });
  await server.connect(new StdioServerTransport());
  server.channel?.start();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'MCP startup failed');
  process.exitCode = 1;
}
