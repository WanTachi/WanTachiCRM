import { describe, expect, it, vi } from "vitest";
import { buildContact360ActivityLinks, getContactAccount } from "../src/lib/crm/contact-360";
import { getReadableActivityLink } from "../src/lib/crm/activity-links";
import {
  getActiveContactForOrganization,
  getContactActivityReferencesForOrganization,
  listActivitiesForContact,
  listDealsForContact,
  listTasksForContact,
} from "../src/lib/crm/queries";
import { validateActivityForm, validateDealForm, validateTaskForm } from "../src/lib/crm/validation";
import type { CrmAccount, CrmActivity } from "../src/lib/crm/types";
import type { createSupabaseServerClient } from "../src/lib/supabase/server";

const accountId = "a3000000-0000-4000-8000-000000000001";
const contactId = "a4000000-0000-4000-8000-000000000001";
const dealId = "a5000000-0000-4000-8000-000000000001";
const taskId = "a6000000-0000-4000-8000-000000000001";
const activity: CrmActivity = {
  id: "a8000000-0000-4000-8000-000000000001", type: "call", subject: "Звонок", body: null,
  occurred_at: "2026-10-01T12:00:00.000Z", account_id: accountId, contact_id: contactId,
  deal_id: dealId, task_id: taskId, created_by: null,
  created_at: "2026-10-01T12:00:00.000Z", updated_at: "2026-10-01T12:00:00.000Z",
};
const account: CrmAccount = {
  id: accountId, name: "Компания", website: null, phone: null, industry: null,
  created_at: activity.created_at, updated_at: activity.updated_at,
};
const references = {
  accountNames: new Map([[accountId, "Компания"]]),
  dealNames: new Map([[dealId, "Продление"]]),
  taskNames: new Map([[taskId, "Позвонить"]]),
  canReadAccounts: true, canReadDeals: true, canReadTasks: true,
  canManageDeals: true, canManageTasks: false,
};

type ServerSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
function mockSupabase(data: unknown = [], error: { message: string } | null = null) {
  const query = Object.assign(Promise.resolve({ data, error }), {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockReturnThis(),
  });
  const from = vi.fn(() => query);
  return { supabase: { from } as unknown as ServerSupabase, query, from };
}

describe("Contact 360 related model", () => {
  it("prefills only the contact's actual, readable, active account", () => {
    expect(getContactAccount({ account_id: accountId }, account, true)).toBe(account);
    expect(getContactAccount({ account_id: null }, account, true)).toBeNull();
    expect(getContactAccount({ account_id: dealId }, account, true)).toBeNull();
    expect(getContactAccount({ account_id: accountId }, null, true)).toBeNull();
    expect(getContactAccount({ account_id: accountId }, account, false)).toBeNull();
  });

  it("links readable accounts to Account 360 and uses supported deal/task destinations", () => {
    expect(buildContact360ActivityLinks(activity, references)).toEqual([
      { label: "Аккаунт", value: "Компания", href: `/crm/accounts/${accountId}` },
      { label: "Сделка", value: "Продление", href: `/crm/deals?edit=${dealId}` },
      { label: "Задача", value: "Позвонить", href: "/crm/tasks" },
    ]);
  });

  it("hides names and links without read permission even if a name map was supplied", () => {
    expect(buildContact360ActivityLinks(activity, {
      ...references, canReadAccounts: false, canReadDeals: false, canReadTasks: false,
      canManageDeals: true, canManageTasks: true,
    })).toEqual([]);
  });

  it("does not fabricate links for missing, archived or inaccessible references", () => {
    expect(buildContact360ActivityLinks(activity, {
      ...references, accountNames: new Map(), dealNames: new Map(), taskNames: new Map(),
    })).toEqual([]);
    expect(buildContact360ActivityLinks({ ...activity, account_id: null, deal_id: null, task_id: null }, references)).toEqual([]);
  });

  it("uses each activity's account, not an inferred contact account", () => {
    expect(buildContact360ActivityLinks({ ...activity, account_id: taskId }, references)).toEqual(
      buildContact360ActivityLinks({ ...activity, account_id: null }, references),
    );
  });

  it("allows read-only Contact 360 navigation and rejects malformed route identifiers", () => {
    expect(getReadableActivityLink("contacts", contactId, new Map([[contactId, "Анна"]]), true, false)?.href)
      .toBe(`/crm/contacts/${contactId}`);
    const id = "../../settings?secret=value";
    expect(getReadableActivityLink("contacts", id, new Map([[id, "Unsafe"]]), true, true)).toBeNull();
  });
});

describe("Contact 360 query boundaries (mocked; not RLS tests)", () => {
  it.each([
    { table: "crm_contacts", column: "id", query: getActiveContactForOrganization },
    { table: "crm_deals", column: "contact_id", query: listDealsForContact },
    { table: "crm_tasks", column: "contact_id", query: listTasksForContact },
    { table: "crm_activities", column: "contact_id", query: listActivitiesForContact },
  ])("scopes $table to the supplied server organization and contact, excluding archives", async (entry) => {
    const mock = mockSupabase();
    await entry.query(mock.supabase, "active-organization", contactId);
    expect(mock.from).toHaveBeenCalledWith(entry.table);
    expect(mock.query.eq).toHaveBeenCalledWith("organization_id", "active-organization");
    expect(mock.query.eq).toHaveBeenCalledWith(entry.column, contactId);
    expect(mock.query.is).toHaveBeenCalledWith("archived_at", null);
  });

  it("returns the same absent result for a hidden or nonexistent contact", async () => {
    const mock = mockSupabase(null);
    expect(await getActiveContactForOrganization(mock.supabase, "active-organization", contactId))
      .toEqual({ ok: true, value: null });
    expect(mock.query.maybeSingle).toHaveBeenCalledOnce();
  });

  it("orders the timeline by occurrence and then creation, newest first", async () => {
    const mock = mockSupabase();
    await listActivitiesForContact(mock.supabase, "active-organization", contactId);
    expect(mock.query.order.mock.calls).toEqual([
      ["occurred_at", { ascending: false }], ["created_at", { ascending: false }],
    ]);
  });

  it("does not leak database error details", async () => {
    const mock = mockSupabase(null, { message: "private database details" });
    for (const query of [getActiveContactForOrganization, listDealsForContact, listTasksForContact, listActivitiesForContact]) {
      const result = await query(mock.supabase, "active-organization", contactId);
      expect(result).toMatchObject({ ok: false, error: { code: "unavailable" } });
      expect(JSON.stringify(result)).not.toContain("private database details");
    }
  });

  it("batches permitted timeline references and deduplicates IDs", async () => {
    const mock = mockSupabase([{ id: accountId, name: "Компания" }]);
    const result = await getContactActivityReferencesForOrganization(
      mock.supabase, "active-organization", [activity, activity], new Set(["accounts.read"]),
    );
    expect(mock.from.mock.calls).toEqual([["crm_accounts"]]);
    expect(mock.query.in).toHaveBeenCalledWith("id", [accountId]);
    expect(mock.query.eq).toHaveBeenCalledWith("organization_id", "active-organization");
    expect(mock.query.is).toHaveBeenCalledWith("archived_at", null);
    expect(result).toEqual({ ok: true, value: {
      accountNames: new Map([[accountId, "Компания"]]), dealNames: new Map(), taskNames: new Map(),
    } });
  });

  it("does not query references without permission or without activity links", async () => {
    const mock = mockSupabase();
    await getContactActivityReferencesForOrganization(mock.supabase, "active-organization", [activity], new Set());
    await getContactActivityReferencesForOrganization(mock.supabase, "active-organization", [], new Set(["accounts.read", "deals.read", "tasks.read"]));
    expect(mock.from).not.toHaveBeenCalled();
  });
});

describe("Contact 360 prefilled inputs still use existing validation", () => {
  it.each([validateDealForm, validateTaskForm, validateActivityForm])("validates relationship IDs and excludes client organization input", (validate) => {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      name: "Сделка", title: "Задача", status: "open", priority: "normal", type: "note",
      pipeline_id: dealId, stage_id: taskId, contact_id: contactId, account_id: accountId,
      organization_id: "untrusted-tenant",
    })) form.set(key, value);
    const result = validate(form);
    expect(result).toMatchObject({ ok: true, value: { contact_id: contactId, account_id: accountId } });
    if (result.ok) expect(result.value).not.toHaveProperty("organization_id");
    form.set("contact_id", "invalid");
    expect(validate(form)).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    form.set("contact_id", contactId);
    form.set("account_id", "invalid");
    expect(validate(form)).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    form.delete("account_id");
    expect(validate(form)).toMatchObject({ ok: true, value: { contact_id: contactId, account_id: undefined } });
  });
});
