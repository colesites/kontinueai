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
