import { describe, expect, test } from "bun:test";
import {
	buildRemoteAnswer,
	deviceSeenLabel,
	isDeviceOnline,
	isKodeRemoteMode,
	KODE_REMOTE_MAX_LIVE_TEXT,
	liveTextTail,
	parseKodeRemoteMessage,
	remoteChatTitle,
} from "./kode-remote";

describe("kode remote helpers", () => {
	test("online window and seen labels", () => {
		const now = 1_000_000_000;
		expect(isDeviceOnline(now - 10_000, now)).toBe(true);
		expect(isDeviceOnline(now - 120_000, now)).toBe(false);
		expect(isDeviceOnline(null, now)).toBe(false);
		expect(deviceSeenLabel(now - 5 * 60_000, now)).toBe("Seen 5m ago");
		expect(deviceSeenLabel(now - 3 * 3_600_000, now)).toBe("Seen 3h ago");
	});

	test("only the safe modes are allowed from a phone", () => {
		expect(isKodeRemoteMode("supervised")).toBe(true);
		expect(isKodeRemoteMode("plan")).toBe(true);
		expect(isKodeRemoteMode("full_access")).toBe(false);
		expect(isKodeRemoteMode("auto")).toBe(false);
	});

	test("saved steps and images are pulled out of a message", () => {
		const steps = JSON.stringify([
			{ id: "a", name: "run_command", description: "bun test", state: "done" },
			{ name: "edit_file", description: "Edit login.ts", state: "rejected" },
		]);
		const parsed = parseKodeRemoteMessage(
			"```kode-steps\n" + steps + "\n```\n\nAll green.\n```kode-image\n{\"path\":\"a.png\"}\n```",
		);
		expect(parsed.steps.map((step) => [step.label, step.state])).toEqual([
			["bun test", "done"],
			["Edit login.ts", "rejected"],
		]);
		expect(parsed.text).toBe("All green.\n[Image]");
	});

	test("titles and long live replies are trimmed", () => {
		expect(remoteChatTitle("  Fix the login bug\nmore detail")).toBe("Fix the login bug");
		expect(remoteChatTitle("")).toBe("New chat");
		const long = "x".repeat(KODE_REMOTE_MAX_LIVE_TEXT + 50);
		expect(liveTextTail(long).length).toBe(KODE_REMOTE_MAX_LIVE_TEXT + 1);
	});
});

describe("remote answers", () => {
	test("match what the desktop prompt sends", () => {
		const choice = [{ question: "DB?", kind: "multi", options: [{ value: "pg", label: "Postgres" }], allowOther: true }];
		expect(buildRemoteAnswer(choice, { 0: { picked: ["pg"], text: "mysql" } })).toEqual(["pg", "mysql"]);
		expect(buildRemoteAnswer([{ question: "Name?", kind: "text", options: [] }], { 0: { picked: [], text: " Ada " } })).toEqual(["Ada"]);
		const form = [
			{ question: "Name?", kind: "text", options: [] },
			{ question: "Ship?", kind: "choice", options: [{ value: "yes", label: "Yes" }] },
		];
		expect(buildRemoteAnswer(form, { 0: { picked: [], text: "Ada" }, 1: { picked: ["yes"], text: "" } })).toEqual(["Ada", "yes"]);
		expect(buildRemoteAnswer(form, {})).toEqual([]);
	});
});
