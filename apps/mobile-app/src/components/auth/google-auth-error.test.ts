import { describe, expect, it } from "@jest/globals";

import { getGoogleAuthError } from "./google-auth-error";

describe("getGoogleAuthError", () => {
  it("recognizes Android credential configuration failures", () => {
    expect(
      getGoogleAuthError({
        code: "GOOGLE_SIGN_IN_ERROR",
        message: "DEVELOPER_ERROR: code 10",
      }),
    ).toMatchObject({
      code: "GOOGLE_SIGN_IN_ERROR",
      userMessage: expect.stringContaining("GOOGLE_CONFIG"),
    });
  });

  it("preserves a Clerk API response message", () => {
    expect(
      getGoogleAuthError({
        errors: [
          {
            code: "oauth_access_denied",
            longMessage: "Google access was denied for this account.",
          },
        ],
      }),
    ).toEqual({
      code: "oauth_access_denied",
      message: "Google access was denied for this account.",
      userMessage: "Google access was denied for this account.",
      cancelled: false,
    });
  });

  it("marks a dismissed account picker as cancelled", () => {
    expect(
      getGoogleAuthError({
        code: "GOOGLE_SIGN_IN_CANCELLED",
        message: "User cancelled the flow",
      }),
    ).toMatchObject({ cancelled: true });
  });

  it("maps activity lifecycle failures to a recovery step", () => {
    expect(
      getGoogleAuthError({ code: "E_ACTIVITY_UNAVAILABLE" }).userMessage,
    ).toContain("Close and reopen");
  });

  it("includes an unknown native code in the fallback", () => {
    expect(getGoogleAuthError({ code: "NATIVE_UNKNOWN" }).userMessage).toContain(
      "NATIVE_UNKNOWN",
    );
  });
});
