// Minimal MCP server for testing the Rust client. Speaks JSON-RPC 2.0 over
// newline-delimited stdio: handles initialize, notifications/initialized,
// tools/list and tools/call (echo).

import readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on("line", (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  // Notifications carry no id and expect no reply.
  if (msg.method === "notifications/initialized") return;

  let result;
  switch (msg.method) {
    case "initialize":
      result = {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "mock", version: "1.0.0" },
      };
      break;
    case "tools/list":
      result = {
        tools: [
          {
            name: "echo",
            description: "Echo a string back",
            inputSchema: {
              type: "object",
              properties: { text: { type: "string" } },
              required: ["text"],
            },
          },
        ],
      };
      break;
    case "tools/call": {
      const text = (msg.params && msg.params.arguments && msg.params.arguments.text) || "nothing";
      result = { content: [{ type: "text", text: `You said: ${text}` }] };
      break;
    }
    default:
      result = {};
  }
  // Match the reference TypeScript SDK's stdio framing: bare `{"result": …}`.
  process.stdout.write(JSON.stringify({ result }) + "\n");
});
