import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { CallerIdentity } from "../types.js";
import type { ToolServer } from "./toolServer.js";

export interface McpStdioServerOptions {
  readonly toolServer: ToolServer;
  readonly name?: string;
  readonly version?: string;
  readonly caller: CallerIdentity;
}

export class McpStdioServer {
  private readonly server: Server;
  private readonly toolServer: ToolServer;
  private readonly caller: CallerIdentity;

  constructor(opts: McpStdioServerOptions) {
    this.toolServer = opts.toolServer;
    this.caller = opts.caller;
    this.server = new Server(
      { name: opts.name ?? "mcp-anyapi", version: opts.version ?? "0.1.0" },
      { capabilities: { tools: {} } },
    );

    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = await this.toolServer.listTools(this.caller);
      return { tools: tools.map((t) => ({ ...t })) };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const result = await this.toolServer.callTool(
        name,
        (args ?? {}) as Record<string, unknown>,
        this.caller,
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: !result.ok,
      };
    });
  }

  async connectStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
