import { describe, expect, it } from "vitest";
import { isSafeReturnPath } from "../src/lib/auth/return-path";

describe("post-auth return paths", () => {
  it("allows a local workspace path and its query", () => {
    expect(isSafeReturnPath("/settings?tab=profile")).toBe(true);
  });

  it.each(["https://attacker.invalid", "//attacker.invalid", "/\\attacker.invalid", "/login", "/auth/confirm", null])(
    "rejects unsafe or authentication return path %s",
    (path) => expect(isSafeReturnPath(path)).toBe(false),
  );
});
