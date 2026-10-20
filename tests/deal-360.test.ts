import { describe, expect, it, vi } from "vitest";
import { buildDeal360ActivityLinks, getDealRelationships } from "../src/lib/crm/deal-360";
import { getReadableActivityLink } from "../src/lib/crm/activity-links";
import {
  getActiveDealForOrganization, getActiveDealOutcomeForOrganization, getActiveStageForPipeline, getActivityReferencesForOrganization,
  listDealOutcomeEventsForOrganization,
  listActivitiesForDeal, listTasksForDeal,
} from "../src/lib/crm/queries";
import type { CrmAccount, CrmActivity, CrmContact } from "../src/lib/crm/types";
import type { createSupabaseServerClient } from "../src/lib/supabase/server";

const accountId = "a3000000-0000-4000-8000-000000000001";
const contactId = "a4000000-0000-4000-8000-000000000001";
const dealId = "a5000000-0000-4000-8000-000000000001";
const taskId = "a6000000-0000-4000-8000-000000000001";
const dates = { created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-01T12:00:00Z" };
const account: CrmAccount = { id: accountId, name: "Компания", website: null, phone: null, industry: null, ...dates };
const contact: CrmContact = {
  id: contactId, first_name: "Анна", last_name: "Иванова", email: null, phone: null, job_title: null,
  account_id: null, ...dates,
};
const activity: CrmActivity = {
  id: "a8000000-0000-4000-8000-000000000001", type: "note", subject: null, body: "Обсудить условия",
  occurred_at: dates.created_at, account_id: accountId, contact_id: contactId, deal_id: dealId,
  task_id: taskId, created_by: null, ...dates,
};
const references = {
  accountNames: new Map([[accountId, "Компания"]]), contactNames: new Map([[contactId, "Анна Иванова"]]),
  dealNames: new Map([[dealId, "Продление"]]), taskNames: new Map([[taskId, "Позвонить"]]),
  canReadAccounts: true, canReadContacts: true, canReadDeals: true, canReadTasks: true, canManageTasks: false,
};

type ServerSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
function mockSupabase(data: unknown = [], error: { message: string } | null = null) {
  const query = Object.assign(Promise.resolve({ data, error }), {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockReturnThis(),
  });
  const from = vi.fn(() => query);
  return { supabase: { from } as unknown as ServerSupabase, query, from };
}

describe("Deal 360 relationships", () => {
  it("uses independently loaded account/contact records, without inferring the account from the contact", () => {
    const deal = { account_id: accountId, contact_id: contactId };
    const records = { account, contact, canReadAccounts: true, canReadContacts: true };
    expect(getDealRelationships(deal, records)).toEqual({ account, contact });
    expect(getDealRelationships({ ...deal, account_id: null }, records)).toEqual({ account: null, contact });
    expect(getDealRelationships(deal, { ...records, account: { ...account, id: taskId } }).account).toBeNull();
    expect(getDealRelationships(deal, { ...records, contact: { ...contact, id: taskId } }).contact).toBeNull();
    expect(getDealRelationships(deal, { ...records, account: null, contact: null })).toEqual({ account: null, contact: null });
    expect(getDealRelationships(deal, { ...records, canReadAccounts: false, canReadContacts: false }))
      .toEqual({ account: null, contact: null });
  });

  it("links real readable records to their detail pages and retains the existing Task destination", () => {
    expect(buildDeal360ActivityLinks(activity, references)).toEqual([
      { label: "Аккаунт", value: "Компания", href: `/crm/accounts/${accountId}` },
      { label: "Контакт", value: "Анна Иванова", href: `/crm/contacts/${contactId}` },
      { label: "Сделка", value: "Продление", href: `/crm/deals/${dealId}` },
      { label: "Задача", value: "Позвонить", href: `/crm/tasks/${taskId}` },
    ]);
  });

  it.each([
    { permission: "canReadAccounts", label: "Аккаунт" },
    { permission: "canReadContacts", label: "Контакт" },
    { permission: "canReadDeals", label: "Сделка" },
    { permission: "canReadTasks", label: "Задача" },
  ])("hides $label names and links without read permission even if supplied", ({ permission, label }) => {
    expect(buildDeal360ActivityLinks(activity, { ...references, [permission]: false, canManageTasks: true })
      .some((link) => link.label === label)).toBe(false);
  });

  it("does not generate links for missing, archived or malformed references", () => {
    expect(buildDeal360ActivityLinks(activity, {
      ...references, accountNames: new Map(), contactNames: new Map(), dealNames: new Map(), taskNames: new Map(),
    })).toEqual([]);
    expect(getReadableActivityLink("deals", "../../admin", new Map([["../../admin", "Unsafe"]]), true)).toBeNull();
    expect(buildDeal360ActivityLinks({ ...activity, account_id: null, contact_id: null, deal_id: null, task_id: null }, references)).toEqual([]);
  });

  it("does not substitute the deal's associations for different associations stored on an activity", () => {
    expect(buildDeal360ActivityLinks({ ...activity, account_id: taskId, contact_id: taskId }, references)
      .map((link) => link.label)).toEqual(["Сделка", "Задача"]);
  });
});

describe("Deal 360 query boundaries (mocked; not PostgreSQL RLS tests)", () => {
  it.each([
    { table: "crm_deals", column: "id", query: getActiveDealForOrganization },
    { table: "crm_tasks", column: "deal_id", query: listTasksForDeal },
    { table: "crm_activities", column: "deal_id", query: listActivitiesForDeal },
  ])("filters $table by the server organization, deal and active state", async (entry) => {
    const mock = mockSupabase();
    await entry.query(mock.supabase, "server-org", dealId);
    expect(mock.from).toHaveBeenCalledWith(entry.table);
    expect(mock.query.eq.mock.calls).toEqual([["organization_id", "server-org"], [entry.column, dealId]]);
    expect(mock.query.is).toHaveBeenCalledWith("archived_at", null);
  });

  it("returns the same absent result when the database hides an archived, foreign or missing deal", async () => {
    const mock = mockSupabase(null);
    expect(await getActiveDealForOrganization(mock.supabase, "server-org", dealId)).toEqual({ ok: true, value: null });
    expect(mock.query.maybeSingle).toHaveBeenCalledOnce();
  });

  it("scopes the stage lookup to both tenant and pipeline", async () => {
    const mock = mockSupabase(null);
    await getActiveStageForPipeline(mock.supabase, "server-org", "pipeline", "stage");
    expect(mock.query.eq.mock.calls).toEqual([["organization_id", "server-org"], ["pipeline_id", "pipeline"], ["id", "stage"]]);
    expect(mock.query.is).toHaveBeenCalledWith("archived_at", null);
  });

  it("orders the timeline by occurrence, then creation, and tasks by due date", async () => {
    const activities = mockSupabase();
    await listActivitiesForDeal(activities.supabase, "server-org", dealId);
    expect(activities.query.order.mock.calls).toEqual([["occurred_at", { ascending: false }], ["created_at", { ascending: false }]]);
    const tasks = mockSupabase();
    await listTasksForDeal(tasks.supabase, "server-org", dealId);
    expect(tasks.query.order.mock.calls).toEqual([["due_at", { ascending: true, nullsFirst: false }], ["created_at", { ascending: false }]]);
  });

  it("scopes outcome state and history to the active server organization and deal", async () => {
    const state = mockSupabase({ outcome: "won", closed_at: "2026-10-05T12:00:00Z" });
    expect(await getActiveDealOutcomeForOrganization(state.supabase, "server-org", dealId)).toMatchObject({ ok: true });
    expect(state.query.eq.mock.calls).toEqual([["organization_id", "server-org"], ["id", dealId]]);
    expect(state.query.is).toHaveBeenCalledWith("archived_at", null);

    const history = mockSupabase([]);
    expect(await listDealOutcomeEventsForOrganization(history.supabase, "server-org", dealId)).toEqual({ ok: true, value: [] });
    expect(history.query.eq.mock.calls).toEqual([["organization_id", "server-org"], ["deal_id", dealId]]);
    expect(history.query.order.mock.calls).toEqual([
      ["changed_at", { ascending: true }], ["id", { ascending: true }],
    ]);
  });

  it.each([getActiveDealForOrganization, getActiveDealOutcomeForOrganization, listDealOutcomeEventsForOrganization, listTasksForDeal, listActivitiesForDeal])("masks database errors", async (query) => {
    const mock = mockSupabase(null, { message: "private database details" });
    const result = await query(mock.supabase, "server-org", dealId);
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(JSON.stringify(result)).not.toContain("private database details");
  });

  it.each([
    { permission: "accounts.read", table: "crm_accounts", id: accountId, row: { id: accountId, name: "Компания" }, map: "accountNames", name: "Компания" },
    { permission: "contacts.read", table: "crm_contacts", id: contactId, row: { id: contactId, first_name: "Анна", last_name: "Иванова" }, map: "contactNames", name: "Анна Иванова" },
    { permission: "deals.read", table: "crm_deals", id: dealId, row: { id: dealId, name: "Продление" }, map: "dealNames", name: "Продление" },
    { permission: "tasks.read", table: "crm_tasks", id: taskId, row: { id: taskId, title: "Позвонить" }, map: "taskNames", name: "Позвонить" },
  ] as const)("batches only $permission references with tenant and archive filters", async (entry) => {
    const mock = mockSupabase([entry.row]);
    const result = await getActivityReferencesForOrganization(mock.supabase, "server-org", [activity, activity], new Set([entry.permission]));
    expect(mock.from.mock.calls).toEqual([[entry.table]]);
    expect(mock.query.eq).toHaveBeenCalledWith("organization_id", "server-org");
    expect(mock.query.in).toHaveBeenCalledWith("id", [entry.id]);
    expect(mock.query.is).toHaveBeenCalledWith("archived_at", null);
    expect(result.ok && result.value[entry.map].get(entry.id)).toBe(entry.name);
  });

  it("masks errors in timeline reference loading", async () => {
    const mock = mockSupabase(null, { message: "private database details" });
    const result = await getActivityReferencesForOrganization(mock.supabase, "server-org", [activity], new Set(["contacts.read"]));
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(JSON.stringify(result)).not.toContain("private database details");
  });
});
