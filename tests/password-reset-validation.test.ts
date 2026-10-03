import { describe, expect, it } from "vitest";
import {
  getEmailConfirmationRedirectUrl,
  getPasswordRecoveryRedirectUrl,
  validateNewPassword,
  validatePasswordResetEmail,
} from "../src/lib/auth/password-reset-validation";
import { isPublicAuthPath } from "../src/lib/auth/public-routes";

describe("password reset input validation", () => {
  it("normalizes a valid email", () => {
    expect(validatePasswordResetEmail("  Person@Example.com ")).toEqual({
      ok: true,
      email: "person@example.com",
    });
  });

  it.each(["", "not-an-email", "person@example", "person @example.com"])(
    "rejects invalid email %s",
    (email) => expect(validatePasswordResetEmail(email)).toMatchObject({ ok: false }),
  );

  it("requires a 10-character password and matching confirmation", () => {
    expect(validateNewPassword("short", "short")).toMatchObject({ ok: false });
    expect(validateNewPassword("long-enough-password", "different-password")).toMatchObject({ ok: false });
    expect(validateNewPassword("long-enough-password", "long-enough-password")).toEqual({
      ok: true,
      password: "long-enough-password",
    });
  });

  it("builds the exact recovery callback from the configured site URL", () => {
    expect(getPasswordRecoveryRedirectUrl("http://localhost:3000/")).toBe("http://localhost:3000/auth/recovery");
    expect(getPasswordRecoveryRedirectUrl("https://crm.example.com")).toBe("https://crm.example.com/auth/recovery");
  });

  it("builds the email confirmation callback without a duplicate slash", () => {
    expect(getEmailConfirmationRedirectUrl("http://localhost:3000/")).toBe("http://localhost:3000/auth/confirm");
    expect(getEmailConfirmationRedirectUrl("https://crm.example.com")).toBe("https://crm.example.com/auth/confirm");
  });

  it("allows only the password recovery routes through the auth proxy", () => {
    expect(isPublicAuthPath("/auth/recovery")).toBe(true);
    expect(isPublicAuthPath("/forgot-password")).toBe(true);
    expect(isPublicAuthPath("/reset-password")).toBe(true);
    expect(isPublicAuthPath("/crm/accounts")).toBe(false);
  });
});
