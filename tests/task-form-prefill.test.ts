import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode, type SelectHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";
import { TaskForm } from "../src/components/crm/task-form";

// Shallow render in the existing Node test environment. Browser selection and
// rerender behavior are also checked manually because this suite has no DOM.
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useActionState: () => [{}, vi.fn(), false],
}));

type Props = ComponentProps<typeof TaskForm>;
type Select = ReactElement<SelectHTMLAttributes<HTMLSelectElement>>;
const accountId = "a3000000-0000-4000-8000-000000000001";
const contactId = "a4000000-0000-4000-8000-000000000001";
const secondContactId = "a4000000-0000-4000-8000-000000000002";
const dealId = "a5000000-0000-4000-8000-000000000001";
const timestamps = { created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-01T12:00:00Z" };
const props: Props = {
  accounts: [{ id: accountId, name: "Test Company", website: null, phone: null, industry: null, ...timestamps }],
  contacts: [{
    id: contactId, first_name: "Ванек", last_name: "Кириешкин", email: null, phone: null,
    job_title: null, account_id: accountId, ...timestamps,
  }],
  deals: [{
    id: dealId, name: "Продление", description: null, pipeline_id: "a6000000-0000-4000-8000-000000000001",
    stage_id: "a7000000-0000-4000-8000-000000000001", account_id: accountId, contact_id: contactId,
    amount: null, currency: null, expected_close_date: null, owner_user_id: null, ...timestamps,
  }],
  members: [], currentUserId: "current-user", canAssignOwners: false,
  canReadAccounts: true, canReadContacts: true, canReadDeals: true,
  action: async () => ({}),
};

function select(name: string, overrides: Partial<Props> = {}): Select {
  let found: Select | undefined;
  function visit(node: ReactNode) {
    Children.forEach(node, (child) => {
      if (!isValidElement<{ name?: string; children?: ReactNode }>(child)) return;
      if (child.type === "select" && child.props.name === name) found = child as Select;
      visit(child.props.children);
    });
  }
  visit(TaskForm({ ...props, ...overrides }));
  if (!found) throw new Error(`Missing select: ${name}`);
  return found;
}

describe("TaskForm contact prefill", () => {
  it("prefills the Contact 360 account and contact", () => {
    const defaults = { defaultAccountId: accountId, defaultContactId: contactId };
    expect(select("account_id", defaults).props.defaultValue).toBe(accountId);
    expect(select("contact_id", defaults).props.defaultValue).toBe(contactId);
  });

  it("remounts the uncontrolled contact select when the resolved prefill changes", () => {
    const empty = select("contact_id");
    const prefilled = select("contact_id", { defaultContactId: contactId });
    expect(prefilled.key).not.toBe(empty.key);
    const unavailable = select("contact_id", { defaultContactId: contactId, contacts: [] });
    expect(unavailable.props.defaultValue).toBe("");
    expect(prefilled.key).not.toBe(unavailable.key);
  });

  it("keeps the same select identity during ordinary rerenders", () => {
    const defaults = { defaultContactId: contactId };
    expect(select("contact_id", defaults).key).toBe(select("contact_id", {
      ...defaults, contacts: props.contacts.map((contact) => ({ ...contact })),
    }).key);
  });

  it("keeps Account 360 and generic task creation without a contact default", () => {
    expect(select("contact_id", { defaultAccountId: accountId }).props.defaultValue).toBe("");
    expect(select("contact_id").props.defaultValue).toBe("");
    expect(select("contact_id", { defaultContactId: secondContactId }).props.defaultValue).toBe("");
  });

  it("uses the saved task contact before a create-form default", () => {
    const task: NonNullable<Props["task"]> = {
      id: "a8000000-0000-4000-8000-000000000001", title: "Позвонить", description: null,
      status: "open", priority: "normal", due_at: null, owner_user_id: null,
      account_id: accountId, contact_id: contactId, deal_id: dealId, created_by: null, ...timestamps,
    };
    expect(select("contact_id", { task, defaultContactId: secondContactId }).props.defaultValue).toBe(contactId);
    expect(select("contact_id", { task: { ...task, contact_id: null }, defaultContactId: contactId }).props.defaultValue).toBe("");
  });
});
