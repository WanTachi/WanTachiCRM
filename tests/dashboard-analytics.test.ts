import { describe, expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { revalidatePath } from "next/cache";
import {
  aggregateDashboardDeals,
  formatDashboardAmount,
  getDashboardPeriodRange,
  loadDashboardData,
  parseDashboardPeriod,
  revalidateDashboard,
} from "../src/lib/crm/dashboard";
import type { CrmDashboardDeal } from "../src/lib/crm/types";
import type { createSupabaseServerClient } from "../src/lib/supabase/server";

const now = new Date("2026-10-09T15:30:00.000Z");
const range = getDashboardPeriodRange(7, now);

type ServerSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function createSupabaseMock(responses: Record<string, { data: unknown; count?: number | null; error: { message: string } | null }>) {
  const queries = new Map<string, ReturnType<typeof makeQuery>>();
  const from = vi.fn((table: string) => {
    const query = makeQuery(responses[table] ?? { data: null, error: null });
    queries.set(table, query);
    return query;
  });
  return {
    supabase: { from } as unknown as ServerSupabase,
    from,
    query: (table: string) => queries.get(table),
  };
}

function makeQuery(response: { data: unknown; count?: number | null; error: { message: string } | null }) {
  return Object.assign(Promise.resolve(response), {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
  });
}

function access(supabase: ServerSupabase, permissions: string[]) {
  return {
    supabase,
    userId: "user-1",
    organizationId: "server-org",
    permissions: new Set(permissions),
  };
}

describe("dashboard period and deal aggregation", () => {
  it("accepts only the allowlisted periods and uses UTC calendar boundaries", () => {
    expect(parseDashboardPeriod("7")).toBe(7);
    expect(parseDashboardPeriod(["90", "7"])).toBe(90);
    expect(parseDashboardPeriod("365")).toBe(30);
    expect(getDashboardPeriodRange(7, now)).toEqual({
      start: "2026-10-03T00:00:00.000Z",
      end: "2026-10-10T00:00:00.000Z",
      startMs: Date.parse("2026-10-03T00:00:00.000Z"),
      endMs: Date.parse("2026-10-10T00:00:00.000Z"),
    });
  });

  it("keeps active deal count, creation activity and currencies separate", () => {
    const deals: CrmDashboardDeal[] = [
      { amount: "120000", currency: "usd", created_at: "2026-10-09T12:00:00.000Z" },
      { amount: 500, currency: "AED", created_at: "2026-10-04T09:00:00.000Z" },
      { amount: 250, currency: "USD", created_at: "2026-10-01T09:00:00.000Z" },
      { amount: null, currency: "EUR", created_at: "2026-10-05T09:00:00.000Z" },
      { amount: -10, currency: "USD", created_at: "2026-10-06T09:00:00.000Z" },
      { amount: "100", currency: "USDX", created_at: "2026-10-07T09:00:00.000Z" },
      { amount: null, currency: null, created_at: "2026-10-03T00:00:00.000Z" },
      { amount: null, currency: null, created_at: "2026-10-10T00:00:00.000Z" },
      { amount: "0.1", currency: "EUR", created_at: "2026-10-08T09:00:00.000Z" },
      { amount: "0.2", currency: "EUR", created_at: "2026-10-08T10:00:00.000Z" },
    ];

    const result = aggregateDashboardDeals(deals, 7, range);

    expect(result.activeCount).toBe(10);
    expect(result.pipelineByCurrency).toEqual([
      { currency: "USD", amount: "120250" },
      { currency: "AED", amount: "500" },
      { currency: "Без валюты", amount: "100" },
      { currency: "EUR", amount: "0.3" },
    ]);
    expect(result.createdDeals.find((point) => point.date === "2026-10-04")?.count).toBe(1);
    expect(result.createdDeals.find((point) => point.date === "2026-10-09")?.count).toBe(1);
    expect(result.createdDeals.find((point) => point.date === "2026-10-03")?.count).toBe(1);
    expect(result.createdDeals.find((point) => point.date === "2026-10-01")).toBeUndefined();
    expect(result.createdDeals.find((point) => point.date === "2026-10-10")).toBeUndefined();
  });

  it("returns an honest empty chart for an empty period", () => {
    const result = aggregateDashboardDeals([], 7, range);
    expect(result.activeCount).toBe(0);
    expect(result.pipelineByCurrency).toEqual([]);
    expect(result.maxCreatedDeals).toBe(0);
    expect(result.createdDeals).toHaveLength(7);
    expect(result.createdDeals.every((point) => point.count === 0)).toBe(true);
  });

  it("formats decimal and large pipeline amounts without binary floating-point artifacts", () => {
    expect(formatDashboardAmount("0.300")).toBe("0,3");
    expect(formatDashboardAmount("12345678901234567890.125")).toBe("12 345 678 901 234 567 890,13");
  });
});

describe("dashboard query boundaries and permissions", () => {
  const deals = [{ amount: "120000", currency: "USD", created_at: "2026-10-09T12:00:00.000Z" }];

  it("queries only permitted metrics and scopes every query to the server organization", async () => {
    const mock = createSupabaseMock({
      crm_deals: { data: deals, count: deals.length, error: null },
      crm_accounts: { data: null, count: 2, error: null },
      crm_tasks: { data: null, count: 3, error: null },
    });

    const result = await loadDashboardData(access(mock.supabase, ["deals.read", "accounts.read"]), 7, now);

    expect(mock.from).toHaveBeenCalledTimes(2);
    expect(result.deals.status).toBe("available");
    expect(result.accounts).toMatchObject({ status: "available", value: 2 });
    expect(result.tasks.status).toBe("forbidden");
    expect(mock.query("crm_deals")?.eq).toHaveBeenCalledWith("organization_id", "server-org");
    expect(mock.query("crm_deals")?.is).toHaveBeenCalledWith("archived_at", null);
    expect(mock.query("crm_accounts")?.eq).toHaveBeenCalledWith("organization_id", "server-org");
    expect(mock.query("crm_accounts")?.is).toHaveBeenCalledWith("archived_at", null);
    expect(mock.query("crm_accounts")?.gte).toHaveBeenCalledWith("created_at", range.start);
    expect(mock.query("crm_accounts")?.lt).toHaveBeenCalledWith("created_at", range.end);
  });

  it("does not expose counts when the corresponding permission is absent", async () => {
    const mock = createSupabaseMock({
      crm_deals: { data: deals, count: deals.length, error: null },
      crm_accounts: { data: null, count: 99, error: null },
      crm_tasks: { data: null, count: 99, error: null },
    });

    const result = await loadDashboardData(access(mock.supabase, []), 30, now);

    expect(mock.from).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      deals: { status: "forbidden" },
      accounts: { status: "forbidden" },
      tasks: { status: "forbidden" },
    });
  });

  it("counts only active completed tasks and does not apply a false completion-date filter", async () => {
    const mock = createSupabaseMock({
      crm_tasks: { data: null, count: 3, error: null },
    });

    const result = await loadDashboardData(access(mock.supabase, ["tasks.read"]), 7, now);
    const taskQuery = mock.query("crm_tasks");

    expect(result.tasks).toEqual({ status: "available", value: 3 });
    expect(taskQuery?.eq).toHaveBeenCalledWith("organization_id", "server-org");
    expect(taskQuery?.eq).toHaveBeenCalledWith("status", "completed");
    expect(taskQuery?.is).toHaveBeenCalledWith("archived_at", null);
    expect(taskQuery?.gte).not.toHaveBeenCalled();
  });

  it("pages through more than one Supabase response page instead of truncating at the server limit", async () => {
    const rows = Array.from({ length: 1001 }, (_, index) => ({
      id: `deal-${index}`,
      amount: "1",
      currency: "USD",
      created_at: "2026-10-09T12:00:00.000Z",
    }));
    const queries: Array<{ range: ReturnType<typeof vi.fn> }> = [];
    const from = vi.fn(() => {
      const query = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn((start: number, end: number) => Promise.resolve({
          data: rows.slice(start, end + 1),
          count: rows.length,
          error: null,
        })),
      };
      queries.push(query);
      return query;
    });
    const supabase = { from } as unknown as ServerSupabase;

    const result = await loadDashboardData(access(supabase, ["deals.read"]), 7, now);

    expect(result.deals).toMatchObject({ status: "available", value: { activeCount: 1001 } });
    expect(queries.map((query) => query.range.mock.calls[0])).toEqual([
      [0, 499],
      [500, 999],
      [1000, 1499],
    ]);
  });

  it("turns query failures into an unavailable state without exposing database details", async () => {
    const mock = createSupabaseMock({
      crm_deals: { data: null, error: { message: "private database details" } },
    });

    const result = await loadDashboardData(access(mock.supabase, ["deals.read"]), 7, now);

    expect(result.deals).toEqual({ status: "unavailable" });
    expect(JSON.stringify(result)).not.toContain("private database details");
  });

  it("does not turn a missing exact count into a genuine zero", async () => {
    const mock = createSupabaseMock({
      crm_accounts: { data: null, count: null, error: null },
      crm_tasks: { data: null, count: null, error: null },
    });

    const result = await loadDashboardData(access(mock.supabase, ["accounts.read", "tasks.read"]), 7, now);

    expect(result.accounts).toEqual({ status: "unavailable" });
    expect(result.tasks).toEqual({ status: "unavailable" });
  });
});

describe("dashboard revalidation", () => {
  it("invalidates only the dashboard page", () => {
    revalidateDashboard();
    expect(revalidatePath).toHaveBeenCalledWith("/", "page");
  });
});
