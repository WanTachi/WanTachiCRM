import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const globalStyles = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

function cssRule(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return globalStyles.match(new RegExp(`${escapedSelector} \\{([^}]*)\\}`))?.[1] ?? "";
}

describe("dashboard deal chart layout", () => {
  it("gives the responsive chart a definite plot track for percentage bars", () => {
    const chart = cssRule(".sales-chart");
    const labels = cssRule(".sales-chart-y-labels");
    const plot = cssRule(".sales-chart-plot");

    expect(chart).toMatch(/height:\s*clamp\(14rem,\s*32vw,\s*20\.25rem\)/);
    expect(chart).toMatch(/grid-template-columns:\s*3rem\s+minmax\(0,\s*1fr\)/);
    expect(chart).toMatch(/grid-template-rows:\s*minmax\(0,\s*1fr\)/);
    expect(labels).toMatch(/height:\s*100%/);
    expect(plot).toMatch(/height:\s*100%/);
    expect(plot).toMatch(/min-height:\s*0/);
  });

  it("lets empty and unavailable states fill the chart without forcing a larger broken row", () => {
    const emptyState = cssRule(".sales-chart-empty, .sales-chart--message");
    expect(emptyState).toMatch(/min-height:\s*0/);
    expect(emptyState).toMatch(/grid-column:\s*1\s*\/\s*-1/);
  });
});
