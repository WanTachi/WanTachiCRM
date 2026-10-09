import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode, type SelectHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";
import { ActivityForm } from "../src/components/crm/activity-form";

// Shallow render in the existing Node test environment. Browser selection and
// rerender behavior are also checked manually because this suite has no DOM.
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useActionState: () => [{}, vi.fn(), false],
}));

type Props = ComponentProps<typeof ActivityForm>;
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
  }], tasks: [], canReadAccounts: true, canReadContacts: true,
  canReadDeals: true, canReadTasks: true, action: async () => ({}),
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
  visit(ActivityForm({ ...props, ...overrides }));
  if (!found) throw new Error(`Missing select: ${name}`);
  return found;
}

describe("ActivityForm contact prefill", () => {
  it("prefills Deal 360 relationships and ignores unavailable deal defaults", () => {
    const defaults = { defaultAccountId: accountId, defaultContactId: contactId, defaultDealId: dealId };
    expect(select("deal_id", defaults).props.defaultValue).toBe(dealId);
    expect(select("account_id", defaults).props.defaultValue).toBe(accountId);
    expect(select("contact_id", defaults).props.defaultValue).toBe(contactId);
    expect(select("deal_id").props.defaultValue).toBe("");
    expect(select("deal_id", { defaultDealId: dealId, deals: [] }).props.defaultValue).toBe("");
  });

  it("updates deal prefill only when its effective default changes", () => {
    const prefilled = select("deal_id", { defaultDealId: dealId });
    expect(prefilled.key).not.toBe(select("deal_id").key);
    expect(prefilled.key).toBe(select("deal_id", { defaultDealId: dealId, deals: props.deals.map((deal) => ({ ...deal })) }).key);
  });

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

  it("keeps Account 360 and generic activity creation without a contact default", () => {
    expect(select("contact_id", { defaultAccountId: accountId }).props.defaultValue).toBe("");
    expect(select("contact_id").props.defaultValue).toBe("");
    expect(select("contact_id", { defaultContactId: secondContactId }).props.defaultValue).toBe("");
  });
});
