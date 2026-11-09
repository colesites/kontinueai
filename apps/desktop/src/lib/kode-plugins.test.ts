import { expect, test } from "bun:test";
import { pluginCommands, pluginMcpConfigs, renderPluginCommand, type InstalledPlugin } from "./kode-plugins";

const plugin = (over: Partial<InstalledPlugin>): InstalledPlugin => ({
  name: "vercel",
  description: "",
  version: "1",
  author: null,
  source: "vercel/vercel-plugin",
  enabled: true,
  installedAt: 0,
  dir: "/p",
  commands: [{ name: "deploy", description: "Deploy", argumentHint: null, body: "Deploy to $ARGUMENTS." }],
  skills: [],
  mcpServers: { vercel: { type: "http", url: "https://mcp.vercel.com" } },
  agents: [],
  hooks: null,
  hooksAllowed: false,
  ...over,
});

test("$ARGUMENTS is filled, otherwise text is appended", () => {
  expect(renderPluginCommand({ name: "d", description: "", argumentHint: null, body: "Deploy to $ARGUMENTS." }, "prod")).toBe(
    "Deploy to prod.",
  );
  expect(renderPluginCommand({ name: "s", description: "", argumentHint: null, body: "Show status" }, "please")).toBe(
    "Show status\n\nplease",
  );
});

test("only enabled plugins contribute commands and MCP servers", () => {
  const list = [plugin({}), plugin({ name: "off", enabled: false })];
  expect(pluginCommands(list).map((c) => `${c.plugin}:${c.name}`)).toEqual(["vercel:deploy"]);
  expect(pluginMcpConfigs(list)).toEqual([
    {
      id: "plugin-vercel-vercel",
      name: "vercel",
      plugin: "vercel",
      url: "https://mcp.vercel.com",
      command: undefined,
      args: undefined,
      env: undefined,
      enabled: true,
    },
  ]);
});
