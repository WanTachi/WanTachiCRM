import { describe, expect, it } from "vitest";
import { buildAccount360ActivityLinks } from "../src/lib/crm/account-360";
import type { CrmActivity } from "../src/lib/crm/types";

const activity: CrmActivity = {
  id: "a8000000-0000-4000-8000-000000000001",
  type: "note",
  subject: "Следующий шаг",
  body: "Позвонить клиенту",
  occurred_at: "2026-10-01T12:00:00.000Z",
  account_id: "a3000000-0000-4000-8000-000000000001",
  contact_id: "a4000000-0000-4000-8000-000000000001",
  deal_id: "a5000000-0000-4000-8000-000000000001",
  task_id: "a6000000-0000-4000-8000-000000000001",
  created_by: null,
  created_at: "2026-10-01T12:00:00.000Z",
  updated_at: "2026-10-01T12:00:00.000Z",
};

describe("Account 360 helpers", () => {
  it("links available deals to Deal 360 for read-only users and hides unavailable deal links", () => {
    const references = {
      contactNames: new Map(), dealNames: new Map([[activity.deal_id!, "Продление"]]), taskNames: new Map(),
      canReadContacts: false, canReadDeals: true, canReadTasks: false,
      canManageContacts: false, canManageDeals: false, canManageTasks: false,
    };
    expect(buildAccount360ActivityLinks(activity, references)[1].href).toBe(`/crm/deals/${activity.deal_id}`);
    expect(buildAccount360ActivityLinks(activity, { ...references, canReadDeals: false })[1].href).toBeUndefined();
    expect(buildAccount360ActivityLinks(activity, { ...references, dealNames: new Map() })[1].href).toBeUndefined();
  });

  it("builds only permitted links for activity references", () => {
    const links = buildAccount360ActivityLinks(activity, {
      contactNames: new Map([[activity.contact_id!, "Анна Иванова"]]),
      dealNames: new Map([[activity.deal_id!, "Продление"]]),
      taskNames: new Map([[activity.task_id!, "Позвонить"]]),
      canReadContacts: true,
      canReadDeals: false,
      canReadTasks: true,
      canManageContacts: true,
      canManageDeals: false,
      canManageTasks: false,
    });

    expect(links).toEqual([
      { label: "Контакт", value: "Анна Иванова", href: `/crm/contacts/${activity.contact_id}` },
      { label: "Сделка", value: "Продление", href: undefined },
      { label: "Задача", value: "Позвонить", href: "/crm/tasks" },
    ]);
  });

  it("does not invent links for unavailable references", () => {
    expect(buildAccount360ActivityLinks({ ...activity, contact_id: null, deal_id: null, task_id: null }, {
      contactNames: new Map(),
      dealNames: new Map(),
      taskNames: new Map(),
      canReadContacts: true,
      canReadDeals: true,
      canReadTasks: true,
      canManageContacts: false,
      canManageDeals: false,
      canManageTasks: false,
    })).toEqual([]);
  });

  it("links read-only contacts to Contact 360 and suppresses unavailable contact links", () => {
    const references = {
      contactNames: new Map([[activity.contact_id!, "Анна"]]), dealNames: new Map(), taskNames: new Map(),
      canReadContacts: true, canReadDeals: false, canReadTasks: false,
      canManageContacts: false, canManageDeals: false, canManageTasks: false,
    };
    expect(buildAccount360ActivityLinks(activity, references)[0].href).toBe(`/crm/contacts/${activity.contact_id}`);
    expect(buildAccount360ActivityLinks(activity, { ...references, canReadContacts: false })[0].href).toBeUndefined();
    expect(buildAccount360ActivityLinks(activity, { ...references, contactNames: new Map() })[0].href).toBeUndefined();
  });
});
