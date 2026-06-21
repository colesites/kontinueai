import { afterAll, describe, expect, mock, test } from "bun:test";

const deleteBlob = mock(() => Promise.resolve());
mock.module("@clerk/nextjs/server", () => ({
	auth: () => Promise.resolve({ userId: null }),
	clerkClient: () => Promise.resolve({ users: { getUser: mock() } }),
}));
mock.module("@vercel/blob", () => ({ del: deleteBlob }));
mock.module("server-only", () => ({}));
mock.module("../features/kode/lib/availability", () => ({
	isKodeComingSoon: () => true,
}));

afterAll(() => mock.restore());

describe("protected API authentication", () => {
	test("AUTH-004: an invalid or expired session returns 401", async () => {
		const { DELETE } = await import("../app/api/files/delete/route");
		const response = await DELETE(
			new Request("https://app.test/api/files/delete?pathname=private"),
		);
		expect(response.status).toBe(401);
		expect(deleteBlob).not.toHaveBeenCalled();
	});

	test("PLAN-006: disabled production Kode builds return 503 before auth", async () => {
		const { POST } = await import("../app/api/kode/build/route");
		const response = await POST(
			new Request("https://chat.kontinueai.com/api/kode/build", {
				method: "POST",
				headers: { host: "chat.kontinueai.com" },
			}),
		);
		expect(response.status).toBe(503);
	});
});
