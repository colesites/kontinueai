import { describe, expect, it } from "@jest/globals";

import {
  getSignInVerificationStep,
  verificationCopy,
} from "./sign-in-verification";

describe("getSignInVerificationStep", () => {
  it("maps Client Trust to the available email factor", () => {
    expect(
      getSignInVerificationStep("needs_client_trust", [
        {
          strategy: "email_code",
          safeIdentifier: "p***@gmail.com",
        },
      ]),
    ).toEqual({
      reason: "client_trust",
      strategy: "email_code",
      safeIdentifier: "p***@gmail.com",
    });
  });

  it("supports authenticator-app MFA", () => {
    expect(
      getSignInVerificationStep("needs_second_factor", [
        { strategy: "totp" },
        { strategy: "backup_code" },
      ]),
    ).toEqual({ reason: "mfa", strategy: "totp" });
  });

  it("prefers email when multiple delivery factors are available", () => {
    expect(
      getSignInVerificationStep("needs_second_factor", [
        { strategy: "phone_code" },
        { strategy: "email_code" },
      ])?.strategy,
    ).toBe("email_code");
  });

  it("does not invent a verification step for a completed sign-in", () => {
    expect(
      getSignInVerificationStep("complete", [{ strategy: "email_code" }]),
    ).toBeNull();
  });

  it("explains that Client Trust verifies this device", () => {
    const copy = verificationCopy({
      reason: "client_trust",
      strategy: "email_code",
      safeIdentifier: "p***@gmail.com",
    });

    expect(copy.title).toBe("Verify this device");
    expect(copy.subtitle).toContain("p***@gmail.com");
  });
});
