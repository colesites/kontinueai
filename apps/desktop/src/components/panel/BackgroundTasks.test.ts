import { expect, test } from "bun:test";
import { elapsed, splitTasks, type BackgroundTask } from "./BackgroundTasks";

test("groups servers, running jobs and finished tasks; formats run time", () => {
  const base = { command: "x", name: null, exitCode: null, startedAt: 0, endedAt: null };
  const tasks: BackgroundTask[] = [
    { ...base, id: "a", status: "running", port: 3000 },
    { ...base, id: "b", status: "running", port: null },
    { ...base, id: "c", status: "exited", port: null },
    { ...base, id: "d", status: "failed", port: 5173 },
  ];
  const { servers, jobs, finished } = splitTasks(tasks);
  expect(servers.map((t) => t.id)).toEqual(["a"]);
  expect(jobs.map((t) => t.id)).toEqual(["b"]);
  expect(finished.map((t) => t.id)).toEqual(["c", "d"]);
  expect(elapsed(0, 12_000)).toBe("12s");
  expect(elapsed(0, 5 * 60_000)).toBe("5m");
  expect(elapsed(0, (2 * 60 + 47) * 60_000)).toBe("2h 47m");
});

import { shortCommand, untrackedServers } from "./BackgroundTasks";

test("detected servers skip ports Kode already tracks and read nicely", () => {
  const base = { command: "x", name: null, exitCode: null, startedAt: 0, endedAt: null };
  const tracked: BackgroundTask[] = [{ ...base, id: "a", status: "running", port: 3000 }];
  const detected = [
    { pid: 1, port: 3000, command: "node vite" },
    { pid: 2, port: 3210, command: "node /Users/me/app/node_modules/.bin/vite --port 3210" },
  ];
  expect(untrackedServers(detected, tracked).map((s) => s.pid)).toEqual([2]);
  expect(shortCommand(detected[1].command)).toBe("vite --port 3210");
  expect(shortCommand("/opt/homebrew/bin/bun run dev")).toBe("bun run dev");
  expect(shortCommand("python3 -m http.server 8000")).toBe("python3 -m http.server 8000");
});
