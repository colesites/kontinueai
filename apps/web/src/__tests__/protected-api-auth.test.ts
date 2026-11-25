import { afterAll, describe, expect, mock, test } from "bun:test";

const deleteBlob = mock(() => Promise.resolve());
mock.module("@clerk/nextjs/server", () => ({
	auth: () => Promise.resolve({ userId: null }),
	clerkClient: () => Promise.resolve({ users: { getUser: mock() } }),
}));
mock.module("@web/lib/object-storage", () => ({
	deletePublicObject: deleteBlob,
}));
mock.module("server-only", () => ({}));

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
});
