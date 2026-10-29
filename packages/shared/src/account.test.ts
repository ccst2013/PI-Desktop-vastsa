import { describe, expect, it } from "vitest";
import {
  ACCOUNT_CAPTCHA_LENGTH,
  ACCOUNT_PASSWORD_MAX_LENGTH,
  ACCOUNT_USERNAME_MAX_LENGTH,
  SIGNED_OUT_ACCOUNT_STATE,
  accountErrorCodeOf,
  accountErrorKey,
  accountSessionExpired,
  isAccountInputError,
  validateAccountInput,
} from "./account.js";

describe("account input validation", () => {
  it("accepts a complete form", () => {
    expect(validateAccountInput("admin", "admin123", "4927", true)).toBeNull();
  });

  it("reports the first problem in field order", () => {
    expect(validateAccountInput("", "", "", true)).toBe(
      "account.error.usernameRequired",
    );
    expect(validateAccountInput("   ", "admin123", "4927", true)).toBe(
      "account.error.usernameRequired",
    );
    expect(validateAccountInput("admin", "", "4927", true)).toBe(
      "account.error.passwordRequired",
    );
    expect(validateAccountInput("admin", "admin123", "", true)).toBe(
      "account.error.captchaRequired",
    );
  });

  it("rejects a username or password past the bounds", () => {
    const longUsername = "a".repeat(ACCOUNT_USERNAME_MAX_LENGTH + 1);
    expect(validateAccountInput(longUsername, "admin123", "4927", true)).toBe(
      "account.error.usernameTooLong",
    );
    const longPassword = "a".repeat(ACCOUNT_PASSWORD_MAX_LENGTH + 1);
    expect(validateAccountInput("admin", longPassword, "4927", true)).toBe(
      "account.error.passwordTooLong",
    );
  });

  it("accepts a username exactly at the bound", () => {
    const maxUsername = "a".repeat(ACCOUNT_USERNAME_MAX_LENGTH);
    expect(validateAccountInput(maxUsername, "admin123", "4927", true)).toBeNull();
  });

  it("does not ask for a challenge the service disabled", () => {
    // `sys.account.captchaEnabled` off means the endpoint never checks the
    // answer, so requiring one here would make sign-in impossible.
    expect(validateAccountInput("admin", "admin123", "", false)).toBeNull();
  });

  it("requires the exact challenge length when the service enabled it", () => {
    expect(ACCOUNT_CAPTCHA_LENGTH).toBe(4);
    expect(validateAccountInput("admin", "admin123", "49", true)).toBe(
      "account.error.captchaWrong",
    );
    expect(validateAccountInput("admin", "admin123", "49271", true)).toBe(
      "account.error.captchaWrong",
    );
  });

  it("ignores surrounding whitespace in the answer", () => {
    expect(validateAccountInput("admin", "admin123", "  4927 ", true)).toBeNull();
  });
});

describe("account error keys", () => {
  it("maps every documented code to a catalog key", () => {
    const expected: Record<string, string> = {
      AUTH_REJECTED: "account.error.rejected",
      AUTH_CAPTCHA: "account.error.captchaWrong",
      AUTH_UNREACHABLE: "account.error.unreachable",
      AUTH_TIMEOUT: "account.error.timeout",
      AUTH_SERVICE_ERROR: "account.error.service",
      AUTH_MALFORMED: "account.error.malformed",
      AUTH_CLIENT: "account.error.client",
      ACCOUNT_STORE: "account.error.storage",
      SESSION_EXPIRED: "account.error.expired",
    };
    for (const [code, key] of Object.entries(expected)) {
      expect(accountErrorKey(code)).toBe(key);
    }
  });

  it("falls back for an unknown or absent code", () => {
    expect(accountErrorKey(undefined)).toBe("account.error.failed");
    expect(accountErrorKey("SOMETHING_NEW")).toBe("account.error.failed");
  });

  it("separates a fault in the input from a fault in the service", () => {
    // Only these two may be painted beside a field; everything else means the
    // request never reached a working service, and telling the user to retype
    // a password that was fine would be wrong.
    expect(isAccountInputError("AUTH_REJECTED")).toBe(true);
    expect(isAccountInputError("AUTH_CAPTCHA")).toBe(true);
    for (const code of [
      "AUTH_UNREACHABLE",
      "AUTH_TIMEOUT",
      "AUTH_SERVICE_ERROR",
      "AUTH_MALFORMED",
      "ACCOUNT_STORE",
      "SESSION_EXPIRED",
      undefined,
    ]) {
      expect(isAccountInputError(code)).toBe(false);
    }
  });
});

describe("accountErrorCodeOf", () => {
  it("reads the code off an AppError-shaped rejection", () => {
    expect(accountErrorCodeOf({ code: "AUTH_REJECTED", message: "no" })).toBe(
      "AUTH_REJECTED",
    );
  });

  it("falls back to AUTH_CLIENT for anything else", () => {
    expect(accountErrorCodeOf(new Error("boom"))).toBe("AUTH_CLIENT");
    expect(accountErrorCodeOf("boom")).toBe("AUTH_CLIENT");
    expect(accountErrorCodeOf(undefined)).toBe("AUTH_CLIENT");
    expect(accountErrorCodeOf({ code: "" })).toBe("AUTH_CLIENT");
  });
});

describe("account session expiry", () => {
  const now = 1_800_000_000;

  it("treats a signed-out account as expired", () => {
    expect(accountSessionExpired(SIGNED_OUT_ACCOUNT_STATE, now)).toBe(true);
  });

  it("compares the reported expiry against the clock", () => {
    expect(
      accountSessionExpired({ signedIn: true, expiresAt: now + 60 }, now),
    ).toBe(false);
    expect(
      accountSessionExpired({ signedIn: true, expiresAt: now }, now),
    ).toBe(true);
    expect(
      accountSessionExpired({ signedIn: true, expiresAt: now - 1 }, now),
    ).toBe(true);
  });

  it("does not invent an expiry the service never reported", () => {
    expect(
      accountSessionExpired({ signedIn: true, expiresAt: null }, now),
    ).toBe(false);
  });
});

describe("the signed-out state", () => {
  it("carries no identity and no credential", () => {
    expect(SIGNED_OUT_ACCOUNT_STATE).toEqual({
      signedIn: false,
      username: null,
      displayName: null,
      rememberMe: false,
      expiresAt: null,
      profile: null,
    });
  });
});
