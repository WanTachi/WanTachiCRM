import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../src/lib/crm/access", () => ({
  resolveCrmAccess: vi.fn(),
  permissionError: (resource: string, mode: string) => ({ code: "forbidden", message: `${mode}:${resource}` }),
  unavailableError: (message: string) => ({ code: "unavailable", message }),
  notFoundError: () => ({ code: "not_found", message: "Сделка не найдена" }),
}));
vi.mock("../src/lib/crm/queries", () => ({
  getActiveDealForOrganization: vi.fn(),
  getActiveDealOutcomeForOrganization: vi.fn(),
  getActivePipelineForOrganization: vi.fn(),
  getActiveStageForPipeline: vi.fn(),
  isActiveOrganizationMember: vi.fn(),
  listDealsForOrganization: vi.fn(),
}));

import { changeDealOutcomeAction } from "../src/app/actions/crm/deals";
import { DealOutcomeControls } from "../src/components/crm/deal-outcome-controls";
import { resolveCrmAccess } from "../src/lib/crm/access";
import { getActiveDealForOrganization } from "../src/lib/crm/queries";
import { isFinitePositiveDealAmount, isValidDealCurrency } from "../src/lib/crm/deal-outcomes";
import type { CrmAccess, CrmDeal } from "../src/lib/crm/types";

const dealId = "a5000000-0000-4000-8000-000000000001";
const pipelineId = "a6000000-0000-4000-8000-000000000001";
const deal: CrmDeal = {
  id: dealId, name: "Renewal", description: null, pipeline_id: pipelineId,
  stage_id: "a7000000-0000-4000-8000-000000000001", account_id: null, contact_id: null,
  amount: "1200.50", currency: "USD", owner_user_id: null, expected_close_date: null,
  created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-01T12:00:00Z",
};

type Supabase = CrmAccess["supabase"];

function form(outcome: string, id = dealId) {
  const data = new FormData();
  data.set("id", id);
  data.set("outcome", outcome);
  return data;
}

function mockAccess(permissions = ["deals.read", "deals.manage"]) {
  const query = Object.assign(Promise.resolve({ count: 1, error: null }), {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
  });
  const supabase = { from: vi.fn(() => query) } as unknown as Supabase;
  vi.mocked(resolveCrmAccess).mockResolvedValue({ ok: true, value: {
    supabase, userId: "user-1", organizationId: "org-1", permissions: new Set(permissions),
  } });
  vi.mocked(getActiveDealForOrganization).mockResolvedValue({ ok: true, value: deal });
  return { supabase, query };
}

beforeEach(() => vi.resetAllMocks());

describe("Deal outcome application action", () => {
  it("requires deals.manage on the server", async () => {
    const { supabase } = mockAccess(["deals.read"]);
    const result = await changeDealOutcomeAction({}, form("won"));
    expect(result.error?.code).toBe("forbidden");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects Won before writing when the current amount or currency is invalid", async () => {
    const { supabase } = mockAccess();
    vi.mocked(getActiveDealForOrganization).mockResolvedValueOnce({ ok: true, value: { ...deal, amount: "0", currency: null } });
    const result = await changeDealOutcomeAction({}, form("won"));
    expect(result.error?.code).toBe("invalid_input");
    expect(result.error?.message).toContain("положительную сумму");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it.each(["won", "lost", "open"])("updates only the requested outcome for %s", async (outcome) => {
    const { supabase, query } = mockAccess();
    const result = await changeDealOutcomeAction({}, form(outcome));
    expect(result).toEqual({ success: "Статус сделки обновлён." });
    expect(supabase.from).toHaveBeenCalledWith("crm_deals");
    expect(query.update).toHaveBeenCalledWith({ outcome }, { count: "exact" });
    expect(query.eq).toHaveBeenCalledWith("organization_id", "org-1");
    expect(query.eq).toHaveBeenCalledWith("id", dealId);
    expect(query.is).toHaveBeenCalledWith("archived_at", null);
  });

  it("reports a clear migration-unavailable error without exposing Postgres details", async () => {
    mockAccess();
    const failingQuery = Object.assign(Promise.resolve({ count: null, error: { code: "42703", message: "column outcome does not exist" } }), {
      update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
    });
    vi.mocked(resolveCrmAccess).mockResolvedValueOnce({ ok: true, value: {
      supabase: { from: vi.fn(() => failingQuery) } as unknown as Supabase,
      userId: "user-1", organizationId: "org-1", permissions: new Set(["deals.read", "deals.manage"]),
    } });
    const result = await changeDealOutcomeAction({}, form("lost"));
    expect(result.error?.message).toContain("примените обновление базы данных Deal Outcomes");
    expect(result.error?.message).not.toContain("42703");
  });
});

describe("Deal outcome validation helpers", () => {
  it("accepts exact positive decimal amounts and three-letter currencies only", () => {
    expect(isFinitePositiveDealAmount("1200.50")).toBe(true);
    expect(isFinitePositiveDealAmount("0.0001")).toBe(true);
    expect(isFinitePositiveDealAmount("0")).toBe(false);
    expect(isFinitePositiveDealAmount("Infinity")).toBe(false);
    expect(isFinitePositiveDealAmount("-Infinity")).toBe(false);
    expect(isFinitePositiveDealAmount("NaN")).toBe(false);
    expect(isValidDealCurrency("usd")).toBe(true);
    expect(isValidDealCurrency("USDX")).toBe(false);
  });

  it("offers only explicit transitions from the current status", () => {
    const html = renderToStaticMarkup(createElement(DealOutcomeControls, { dealId, outcome: "open", action: changeDealOutcomeAction }));
    expect(html).toContain('value="won"');
    expect(html).toContain('value="lost"');
    expect(html).not.toContain('value="open"');
    expect(html).toContain("Переход между статусами не меняет этап воронки");
  });

  it("offers reopen from closed outcomes", () => {
    const html = renderToStaticMarkup(createElement(DealOutcomeControls, { dealId, outcome: "won", action: changeDealOutcomeAction }));
    expect(html).toContain('value="open"');
    expect(html).toContain("Открыть заново");
    expect(html).toContain('value="lost"');
    expect(html).not.toContain('value="won"');
  });
});
