import { describe, expect, it } from "vitest";
import { brand } from "../src/lib/config/brand";

describe("default brand configuration", () => {
  it("uses WanTachi as the default presentation brand", () => {
    expect(brand.name).toBe("WanTachi");
  });

  it("does not require a bundled logo asset", () => {
    expect(brand.logoPath).toBeNull();
    expect(brand.faviconPath).toBeNull();
  });
});
