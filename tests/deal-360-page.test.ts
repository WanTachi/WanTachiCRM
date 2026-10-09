import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DealDetailPage from "../src/app/(authenticated)/(workspace)/crm/deals/[dealId]/page";
import { TaskForm } from "../src/components/crm/task-form";
import { ActivityForm } from "../src/components/crm/activity-form";
import { resolveCrmAccess } from "../src/lib/crm/access";
import * as queries from "../src/lib/crm/queries";
import type { CrmAccess, CrmAccount, CrmActivity, CrmContact, CrmDeal, CrmTask } from "../src/lib/crm/types";

// Only server boundaries are mocked; render the actual page and shared UI.
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("../src/lib/crm/access", () => ({
  resolveCrmAccess: vi.fn(), permissionError: () => ({ code: "forbidden", message: "Нет права чтения" }),
}));
vi.mock("../src/app/actions/crm/tasks", () => ({ createTaskAction: vi.fn() }));
vi.mock("../src/app/actions/crm/activities", () => ({ createActivityAction: vi.fn() }));
vi.mock("../src/lib/crm/queries", () => ({
  getActiveDealForOrganization: vi.fn(), getActiveAccountForOrganization: vi.fn(), getActiveContactForOrganization: vi.fn(),
  getActivePipelineForOrganization: vi.fn(), getActiveStageForPipeline: vi.fn(), getActivityReferencesForOrganization: vi.fn(),
  listTasksForDeal: vi.fn(), listActivitiesForDeal: vi.fn(), listAssignableMembersForOrganization: vi.fn(),
}));

const dates = { created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-01T12:00:00Z" };
const account: CrmAccount = { id: "a3000000-0000-4000-8000-000000000001", name: "Компания", website: null, phone: null, industry: null, ...dates };
const contact: CrmContact = {
  id: "a4000000-0000-4000-8000-000000000001", first_name: "Анна", last_name: "Иванова",
  email: null, phone: null, job_title: null, account_id: account.id, ...dates,
};
const deal: CrmDeal = {
  id: "a5000000-0000-4000-8000-000000000001", name: "Продление", description: "Условия продления",
  account_id: account.id, contact_id: contact.id, pipeline_id: "a6000000-0000-4000-8000-000000000001",
  stage_id: "a7000000-0000-4000-8000-000000000001", amount: "1200", currency: "USD",
  expected_close_date: null, owner_user_id: "current-user", ...dates,
};
const task: CrmTask = {
  id: "a8000000-0000-4000-8000-000000000001", title: "Позвонить", status: "open", priority: "normal",
  description: null, due_at: null, owner_user_id: null, account_id: account.id, contact_id: contact.id,
  deal_id: deal.id, created_by: null, ...dates,
};
const activity: CrmActivity = {
  id: "a9000000-0000-4000-8000-000000000001", type: "call", subject: "Первый звонок", body: null,
  account_id: account.id, contact_id: contact.id, deal_id: deal.id, task_id: task.id,
  created_by: null, occurred_at: dates.created_at, ...dates,
};
const serverSupabase = {} as CrmAccess["supabase"];
const readPermissions = ["deals.read", "accounts.read", "contacts.read", "pipelines.read", "tasks.read", "activities.read"];
function access(permissions = readPermissions) {
  vi.mocked(resolveCrmAccess).mockResolvedValue({ ok: true, value: {
    supabase: serverSupabase, organizationId: "server-org", userId: "current-user", permissions: new Set(permissions),
  } });
}
function page(id = deal.id) { return DealDetailPage({ params: Promise.resolve({ dealId: id }) }); }
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
  vi.mocked(queries.getActiveDealForOrganization).mockResolvedValue({ ok: true, value: deal });
  vi.mocked(queries.getActiveAccountForOrganization).mockResolvedValue({ ok: true, value: account });
  vi.mocked(queries.getActiveContactForOrganization).mockResolvedValue({ ok: true, value: contact });
  vi.mocked(queries.getActivePipelineForOrganization).mockResolvedValue({ ok: true, value: {
    id: deal.pipeline_id, name: "Продажи", description: null, owner_user_id: null, ...dates,
  } });
  vi.mocked(queries.getActiveStageForPipeline).mockResolvedValue({ ok: true, value: {
    id: deal.stage_id, pipeline_id: deal.pipeline_id, name: "Переговоры", position: 1, probability: null, ...dates,
  } });
  vi.mocked(queries.listTasksForDeal).mockResolvedValue({ ok: true, value: [task] });
  vi.mocked(queries.listActivitiesForDeal).mockResolvedValue({ ok: true, value: [activity] });
  vi.mocked(queries.listAssignableMembersForOrganization).mockResolvedValue({ ok: true, value: [] });
  vi.mocked(queries.getActivityReferencesForOrganization).mockResolvedValue({ ok: true, value: {
    accountNames: new Map([[account.id, account.name]]), contactNames: new Map([[contact.id, "Анна Иванова"]]),
    dealNames: new Map([[deal.id, deal.name]]), taskNames: new Map([[task.id, task.title]]),
  } });
});

describe("Deal 360 page with mocked server boundaries", () => {
  it("stops before queries without authenticated access or deals.read", async () => {
    vi.mocked(resolveCrmAccess).mockResolvedValueOnce({ ok: false, error: { code: "unavailable", message: "Войдите снова" } });
    expect(renderToStaticMarkup(await page())).toContain("Войдите снова");
    access(["deals.manage"]);
    expect(renderToStaticMarkup(await page())).toContain("Нет доступа к сделке");
    expect(queries.getActiveDealForOrganization).not.toHaveBeenCalled();
  });

  it("rejects malformed route IDs and uses one not-found result for hidden/absent deals", async () => {
    await expect(page("../../another-tenant")).rejects.toThrow("NOT_FOUND");
    expect(queries.getActiveDealForOrganization).not.toHaveBeenCalled();
    vi.mocked(queries.getActiveDealForOrganization).mockResolvedValueOnce({ ok: true, value: null });
    await expect(page()).rejects.toThrow("NOT_FOUND");
    expect(queries.getActiveDealForOrganization).toHaveBeenCalledWith(serverSupabase, "server-org", deal.id);
    expect(queries.listTasksForDeal).not.toHaveBeenCalled();
  });

  it("renders real relationships for readers, using detail destinations and no mutation forms", async () => {
    const tree = await page();
    const html = renderToStaticMarkup(tree);
    for (const text of ["Продление", "1200 USD", "Продажи", "Переговоры", "Позвонить", "Первый звонок", "Компания", "Анна Иванова"]) expect(html).toContain(text);
    for (const path of [`/crm/accounts/${account.id}`, `/crm/contacts/${contact.id}`, `/crm/pipelines/${deal.pipeline_id}`, `/crm/deals/${deal.id}`]) expect(html).toContain(`href="${path}"`);
    expect(html).not.toContain("Изменить сделку");
    expect(elements(tree).filter((element) => element.type === TaskForm || element.type === ActivityForm)).toEqual([]);
    expect(queries.getActiveStageForPipeline).toHaveBeenCalledWith(serverSupabase, "server-org", deal.pipeline_id, deal.stage_id);
    expect(queries.listTasksForDeal).toHaveBeenCalledWith(serverSupabase, "server-org", deal.id);
    expect(queries.listActivitiesForDeal).toHaveBeenCalledWith(serverSupabase, "server-org", deal.id);
  });

  it("does not load or expose related entities without their read permissions", async () => {
    access(["deals.read"]);
    const html = renderToStaticMarkup(await page());
    for (const query of [queries.getActiveAccountForOrganization, queries.getActiveContactForOrganization, queries.getActivePipelineForOrganization, queries.getActiveStageForPipeline, queries.listTasksForDeal, queries.listActivitiesForDeal, queries.listAssignableMembersForOrganization]) expect(query).not.toHaveBeenCalled();
    for (const text of ["Компания", "Анна Иванова", "Продажи", "Переговоры", "Позвонить", "Первый звонок"]) expect(html).not.toContain(text);
    expect(html).not.toContain(`/crm/accounts/${account.id}`);
    expect(html).not.toContain(`/crm/contacts/${contact.id}`);
  });

  it("still hides timeline references without read permission even if reference maps contain names", async () => {
    access(["deals.read", "activities.read"]);
    const html = renderToStaticMarkup(await page());
    expect(html).toContain("Первый звонок");
    for (const text of ["Компания", "Анна Иванова", "Позвонить"]) expect(html).not.toContain(text);
  });

  it("passes loaded Deal/Account/Contact defaults to existing forms and uses the existing deal editor", async () => {
    access([...readPermissions, "deals.manage", "tasks.manage", "activities.manage", "members.read"]);
    const tree = await page();
    const nodes = elements(tree);
    for (const component of [TaskForm, ActivityForm]) {
      const form = nodes.find((element) => element.type === component);
      expect(form?.props).toMatchObject({
        accounts: [account], contacts: [contact], deals: [deal],
        defaultAccountId: account.id, defaultContactId: contact.id, defaultDealId: deal.id,
      });
      expect(form?.props).not.toHaveProperty("organizationId");
    }
    expect(nodes.some((element) => element.props.href === `/crm/deals?edit=${deal.id}`)).toBe(true);
    expect(queries.listAssignableMembersForOrganization).toHaveBeenCalledWith(serverSupabase, "server-org");
  });

  it("allows manage-only creation while keeping unreadable tasks/activities and references hidden", async () => {
    access(["deals.read", "tasks.manage", "activities.manage"]);
    const nodes = elements(await page());
    for (const component of [TaskForm, ActivityForm]) {
      expect(nodes.find((element) => element.type === component)?.props).toMatchObject({
        accounts: [], contacts: [], deals: [deal], defaultAccountId: undefined,
        defaultContactId: undefined, defaultDealId: deal.id, canReadAccounts: false, canReadContacts: false,
      });
    }
    expect(queries.listTasksForDeal).not.toHaveBeenCalled();
    expect(queries.listActivitiesForDeal).not.toHaveBeenCalled();
    expect(queries.listAssignableMembersForOrganization).not.toHaveBeenCalled();
  });

  it("handles null optional fields and empty lists without inventing data", async () => {
    vi.mocked(queries.getActiveDealForOrganization).mockResolvedValueOnce({ ok: true, value: {
      ...deal, account_id: null, contact_id: null, amount: null, currency: null, description: null, owner_user_id: null,
    } });
    vi.mocked(queries.listTasksForDeal).mockResolvedValueOnce({ ok: true, value: [] });
    vi.mocked(queries.listActivitiesForDeal).mockResolvedValueOnce({ ok: true, value: [] });
    const html = renderToStaticMarkup(await page());
    for (const text of ["без аккаунта", "без контакта", "не указана", "не назначен", "нет активных задач", "Активностей пока нет"]) expect(html).toContain(text);
    expect(queries.getActiveAccountForOrganization).not.toHaveBeenCalled();
    expect(queries.getActiveContactForOrganization).not.toHaveBeenCalled();
  });

  it("does not prefill archived/unavailable relationships or display a stage of an unavailable pipeline", async () => {
    access([...readPermissions, "tasks.manage"]);
    vi.mocked(queries.getActiveAccountForOrganization).mockResolvedValueOnce({ ok: true, value: null });
    vi.mocked(queries.getActiveContactForOrganization).mockResolvedValueOnce({ ok: true, value: null });
    vi.mocked(queries.getActivePipelineForOrganization).mockResolvedValueOnce({ ok: true, value: null });
    const tree = await page();
    const form = elements(tree).find((element) => element.type === TaskForm);
    expect(form?.props).toMatchObject({ accounts: [], contacts: [], defaultAccountId: undefined, defaultContactId: undefined });
    const html = renderToStaticMarkup(tree);
    expect(html).not.toContain("Переговоры");
    expect(html).not.toContain(`/crm/pipelines/${deal.pipeline_id}`);
  });
});
