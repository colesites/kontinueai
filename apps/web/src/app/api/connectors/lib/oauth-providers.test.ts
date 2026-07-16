import { describe, expect, test } from "bun:test";
import { getOAuthProvider } from "./oauth-providers";

describe("Google Sheets OAuth provider", () => {
	test("requests Sheets write access and Drive metadata discovery access", () => {
		const provider = getOAuthProvider("google_sheets");
		expect(provider).not.toBeNull();
		expect(provider?.clientIdEnv).toBe("GOOGLE_CLIENT_ID");
		expect(provider?.clientSecretEnv).toBe("GOOGLE_CLIENT_SECRET");
		expect(provider?.scopes).toContain(
			"https://www.googleapis.com/auth/spreadsheets",
		);
		expect(provider?.scopes).toContain(
			"https://www.googleapis.com/auth/drive.metadata.readonly",
		);

		const authorizeUrl = new URL(
			provider?.buildAuthorizeUrl({
				clientId: "client-id",
				redirectUri:
					"https://app.kontinueai.com/api/connectors/google_sheets/callback",
				state: "state-token",
			}) ?? "",
		);
		expect(authorizeUrl.hostname).toBe("accounts.google.com");
		expect(authorizeUrl.searchParams.get("access_type")).toBe("offline");
		expect(authorizeUrl.searchParams.get("prompt")).toBe("consent");
		expect(authorizeUrl.searchParams.get("scope")).toContain(
			"https://www.googleapis.com/auth/spreadsheets",
		);
	});
});
