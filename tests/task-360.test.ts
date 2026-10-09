import { describe, expect, it, vi } from "vitest";
import { buildTask360ActivityLinks } from "../src/lib/crm/task-360";
import { getActiveTaskForOrganization, listActivitiesForTask } from "../src/lib/crm/queries";
import type { CrmActivity, CrmTask } from "../src/lib/crm/types";
import type { createSupabaseServerClient } from "../src/lib/supabase/server";

const taskId = "a6000000-0000-4000-8000-000000000001";
const accountId = "a3000000-0000-4000-8000-000000000001";
const contactId = "a4000000-0000-4000-8000-000000000001";
const dealId = "a5000000-0000-4000-8000-000000000001";
const activityId = "a8000000-0000-4000-8000-000000000001";

const task: CrmTask = {
  id: taskId,
  title: "Подготовить звонок",
  description: "Связаться с клиентом",
  status: "open",
  priority: "high",
  due_at: "2026-10-15T23:59:59.999Z",
  owner_user_id: null,
  account_id: accountId,
  contact_id: contactId,
  deal_id: dealId,
  created_by: null,
  created_at: "2026-10-01T12:00:00Z",
  updated_at: "2026-10-01T12:00:00Z",
};
const activity: CrmActivity = {
  id: activityId,
  type: "call",
  subject: "Первый звонок",
  body: null,
  occurred_at: "2026-10-01T12:00:00Z",
  account_id: accountId,
  contact_id: contactId,
  deal_id: dealId,
  task_id: taskId,
  created_by: null,
  created_at: "2026-10-01T12:00:00Z",
  updated_at: "2026-10-01T12:00:00Z",
};

type ServerSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
function mockSupabase(data: unknown = [], error: { message: string } | null = null) {
  const query = Object.assign(Promise.resolve({ data, error }), {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
  });
  const from = vi.fn(() => query);
  return { supabase: { from } as unknown as ServerSupabase, query, from };
}

describe("Task 360 query boundaries", () => {
  it("loads only an active task from the server organization", async () => {
    const mock = mockSupabase(task);
    const result = await getActiveTaskForOrganization(mock.supabase, "server-org", taskId);

    expect(mock.from).toHaveBeenCalledWith("crm_tasks");
    expect(mock.query.eq.mock.calls).toEqual([["organization_id", "server-org"], ["id", taskId]]);
    expect(mock.query.is).toHaveBeenCalledWith("archived_at", null);
    expect(result).toEqual({ ok: true, value: task });
  });

  it("treats missing, archived and cross-tenant rows as not found", async () => {
    const mock = mockSupabase(null);
    expect(await getActiveTaskForOrganization(mock.supabase, "server-org", taskId)).toEqual({ ok: true, value: null });
    expect(mock.query.maybeSingle).toHaveBeenCalledOnce();
  });

  it("filters task activities by organization, task and active state", async () => {
    const mock = mockSupabase([activity]);
    const result = await listActivitiesForTask(mock.supabase, "server-org", taskId);

    expect(mock.from).toHaveBeenCalledWith("crm_activities");
    expect(mock.query.eq.mock.calls).toEqual([["organization_id", "server-org"], ["task_id", taskId]]);
    expect(mock.query.is).toHaveBeenCalledWith("archived_at", null);
    expect(mock.query.order.mock.calls).toEqual([
      ["occurred_at", { ascending: false }],
      ["created_at", { ascending: false }],
    ]);
    expect(result).toEqual({ ok: true, value: [activity] });
  });

  it("masks query errors instead of exposing database details", async () => {
    const mock = mockSupabase(null, { message: "private database details" });
    const result = await listActivitiesForTask(mock.supabase, "server-org", taskId);

    expect(result).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(JSON.stringify(result)).not.toContain("private database details");
  });
});

describe("Task 360 activity links", () => {
  const references = {
    accountNames: new Map([[accountId, "Компания"]]),
    contactNames: new Map([[contactId, "Анна Иванова"]]),
    dealNames: new Map([[dealId, "Продление"]]),
    taskNames: new Map([[taskId, task.title]]),
    canReadAccounts: true,
    canReadContacts: true,
    canReadDeals: true,
    canReadTasks: true,
  };

  it("links only active readable references to their detail routes", () => {
    expect(buildTask360ActivityLinks(activity, references)).toEqual([
      { label: "Аккаунт", value: "Компания", href: `/crm/accounts/${accountId}` },
      { label: "Контакт", value: "Анна Иванова", href: `/crm/contacts/${contactId}` },
      { label: "Сделка", value: "Продление", href: `/crm/deals/${dealId}` },
      { label: "Задача", value: task.title, href: `/crm/tasks/${taskId}` },
    ]);
  });

  it("hides names and links when the corresponding read permission is absent", () => {
    expect(buildTask360ActivityLinks(activity, { ...references, canReadTasks: false })).not.toContainEqual(
      expect.objectContaining({ label: "Задача" }),
    );
    expect(buildTask360ActivityLinks(activity, { ...references, canReadDeals: false })).not.toContainEqual(
      expect.objectContaining({ label: "Сделка" }),
    );
  });
});
