import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TaskDetailPage from "../src/app/(authenticated)/(workspace)/crm/tasks/[taskId]/page";
import { ActivityForm } from "../src/components/crm/activity-form";
import { TaskForm } from "../src/components/crm/task-form";
import { resolveCrmAccess } from "../src/lib/crm/access";
import * as queries from "../src/lib/crm/queries";
import type { CrmAccess, CrmAccount, CrmActivity, CrmContact, CrmDeal, CrmTask } from "../src/lib/crm/types";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("../src/lib/crm/access", () => ({
  resolveCrmAccess: vi.fn(),
  permissionError: () => ({ code: "forbidden", message: "Нет права чтения" }),
  notFoundError: () => ({ code: "not_found", message: "Задача не найдена" }),
}));
vi.mock("../src/app/actions/crm/tasks", () => ({ updateTaskAction: vi.fn() }));
vi.mock("../src/app/actions/crm/activities", () => ({ createActivityAction: vi.fn() }));
vi.mock("../src/lib/crm/queries", () => ({
  getActiveTaskForOrganization: vi.fn(),
  getActiveAccountForOrganization: vi.fn(),
  getActiveContactForOrganization: vi.fn(),
  getActiveDealForOrganization: vi.fn(),
  getActivityReferencesForOrganization: vi.fn(),
  listActivitiesForTask: vi.fn(),
  listAssignableMembersForOrganization: vi.fn(),
}));

const dates = { created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-01T12:00:00Z" };
const account: CrmAccount = { id: "a3000000-0000-4000-8000-000000000001", name: "Компания", website: null, phone: null, industry: null, ...dates };
const contact: CrmContact = {
  id: "a4000000-0000-4000-8000-000000000001", first_name: "Анна", last_name: "Иванова", email: null,
  phone: null, job_title: null, account_id: account.id, ...dates,
};
const deal: CrmDeal = {
  id: "a5000000-0000-4000-8000-000000000001", name: "Продление", description: null,
  pipeline_id: "a6000000-0000-4000-8000-000000000001", stage_id: "a7000000-0000-4000-8000-000000000001",
  account_id: account.id, contact_id: contact.id, amount: null, currency: null,
  expected_close_date: null, owner_user_id: null, ...dates,
};
const task: CrmTask = {
  id: "a8000000-0000-4000-8000-000000000001", title: "Подготовить звонок", description: "Связаться с клиентом",
  status: "open", priority: "high", due_at: "2026-10-15T23:59:59.999Z", owner_user_id: "current-user",
  account_id: account.id, contact_id: contact.id, deal_id: deal.id, created_by: null, ...dates,
};
const activity: CrmActivity = {
  id: "a9000000-0000-4000-8000-000000000001", type: "call", subject: "Первый звонок", body: null,
  occurred_at: dates.created_at, account_id: account.id, contact_id: contact.id, deal_id: deal.id,
  task_id: task.id, created_by: null, ...dates,
};
const serverSupabase = {} as CrmAccess["supabase"];
const readPermissions = ["tasks.read", "accounts.read", "contacts.read", "deals.read", "activities.read"];

function access(permissions = readPermissions) {
  vi.mocked(resolveCrmAccess).mockResolvedValue({ ok: true, value: {
    supabase: serverSupabase, organizationId: "server-org", userId: "current-user", permissions: new Set(permissions),
  } });
}

function page(id = task.id) {
  return TaskDetailPage({ params: Promise.resolve({ taskId: id }) });
}

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  const result: ReactElement<Record<string, unknown>>[] = [];
  Children.forEach(node, (child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return;
    result.push(child as ReactElement<Record<string, unknown>>, ...elements(child.props.children));
  });
  return result;
}

beforeEach(() => {
  vi.resetAllMocks();
  access();
  vi.mocked(queries.getActiveTaskForOrganization).mockResolvedValue({ ok: true, value: task });
  vi.mocked(queries.getActiveAccountForOrganization).mockResolvedValue({ ok: true, value: account });
  vi.mocked(queries.getActiveContactForOrganization).mockResolvedValue({ ok: true, value: contact });
  vi.mocked(queries.getActiveDealForOrganization).mockResolvedValue({ ok: true, value: deal });
  vi.mocked(queries.listActivitiesForTask).mockResolvedValue({ ok: true, value: [activity] });
  vi.mocked(queries.listAssignableMembersForOrganization).mockResolvedValue({ ok: true, value: [] });
  vi.mocked(queries.getActivityReferencesForOrganization).mockResolvedValue({ ok: true, value: {
    accountNames: new Map([[account.id, account.name]]),
    contactNames: new Map([[contact.id, "Анна Иванова"]]),
    dealNames: new Map([[deal.id, deal.name]]),
    taskNames: new Map([[task.id, task.title]]),
  } });
});

describe("Task 360 page", () => {
  it("requires tasks.read before looking up the task", async () => {
    access(["tasks.manage"]);
    expect(renderToStaticMarkup(await page())).toContain("Нет права чтения");
    expect(queries.getActiveTaskForOrganization).not.toHaveBeenCalled();
  });

  it("rejects malformed IDs and hides absent tasks behind the same not-found result", async () => {
    await expect(page("not-a-uuid")).rejects.toThrow("NOT_FOUND");
    expect(queries.getActiveTaskForOrganization).not.toHaveBeenCalled();
    vi.mocked(queries.getActiveTaskForOrganization).mockResolvedValueOnce({ ok: true, value: null });
    await expect(page()).rejects.toThrow("NOT_FOUND");
    expect(queries.getActiveTaskForOrganization).toHaveBeenCalledWith(serverSupabase, "server-org", task.id);
    expect(queries.listActivitiesForTask).not.toHaveBeenCalled();
  });

  it("renders real task relationships and activities for readers", async () => {
    const tree = await page();
    const html = renderToStaticMarkup(tree);
    for (const value of [task.title, task.description!, "Открыта", "Высокий", "Компания", "Анна Иванова", "Продление", "Первый звонок"]) {
      expect(html).toContain(value);
    }
    for (const href of [`/crm/accounts/${account.id}`, `/crm/contacts/${contact.id}`, `/crm/deals/${deal.id}`, `/crm/tasks/${task.id}`]) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).not.toContain("Изменить задачу");
    expect(elements(tree).filter((element) => element.type === TaskForm || element.type === ActivityForm)).toEqual([]);
    expect(queries.listActivitiesForTask).toHaveBeenCalledWith(serverSupabase, "server-org", task.id);
  });

  it("does not load unreadable related records or activities", async () => {
    access(["tasks.read"]);
    const html = renderToStaticMarkup(await page());
    for (const query of [queries.getActiveAccountForOrganization, queries.getActiveContactForOrganization, queries.getActiveDealForOrganization, queries.listActivitiesForTask]) {
      expect(query).not.toHaveBeenCalled();
    }
    for (const value of ["Компания", "Анна Иванова", "Продление", "Первый звонок"]) expect(html).not.toContain(value);
  });

  it("shows only permitted edit/create forms and passes Task 360 defaults to ActivityForm", async () => {
    access([...readPermissions, "tasks.manage", "activities.manage", "members.read"]);
    const tree = await page();
    const nodes = elements(tree);
    expect(nodes.some((element) => element.type === TaskForm)).toBe(true);
    const activityForm = nodes.find((element) => element.type === ActivityForm);
    expect(activityForm?.props).toMatchObject({
      accounts: [account], contacts: [contact], deals: [deal], tasks: [task],
      defaultAccountId: account.id, defaultContactId: contact.id, defaultDealId: deal.id, defaultTaskId: task.id,
    });
    expect(queries.listAssignableMembersForOrganization).toHaveBeenCalledWith(serverSupabase, "server-org");
  });

  it("keeps activity creation available without exposing an unreadable activity timeline", async () => {
    access(["tasks.read", "activities.manage"]);
    const tree = await page();
    const nodes = elements(tree);
    expect(nodes.some((element) => element.type === ActivityForm)).toBe(true);
    expect(queries.listActivitiesForTask).not.toHaveBeenCalled();
    expect(nodes.find((element) => element.type === ActivityForm)?.props).toMatchObject({
      accounts: [], contacts: [], deals: [], tasks: [task], defaultTaskId: task.id,
    });
  });
});
