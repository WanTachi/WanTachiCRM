import { Children, isValidElement, type ComponentProps, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";
import { DealForm } from "../src/components/crm/deal-form";
import { Input } from "../src/components/ui/input";

// Shallow render in the existing Node test environment. Browser selection and
// rerender behavior must also be checked in a browser; this tests the React props.
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useActionState: () => [{}, vi.fn(), false],
  useState: (initial: unknown) => [typeof initial === "function" ? initial() : initial, vi.fn()],
}));

type Props = ComponentProps<typeof DealForm>;
type Select = ReactElement<SelectHTMLAttributes<HTMLSelectElement>>;
type InputElement = ReactElement<InputHTMLAttributes<HTMLInputElement>>;
const accountId = "a3000000-0000-4000-8000-000000000001";
const contactId = "a4000000-0000-4000-8000-000000000001";
const secondContactId = "a4000000-0000-4000-8000-000000000002";
const timestamps = { created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-01T12:00:00Z" };
const props: Props = {
  accounts: [{ id: accountId, name: "Test Company", website: null, phone: null, industry: null, ...timestamps }],
  contacts: [{
    id: contactId, first_name: "Test", last_name: "Contact", email: null, phone: null,
    job_title: null, account_id: accountId, ...timestamps,
  }],
  pipelines: [], stages: [], members: [], currentUserId: "current-user",
  canAssignOwners: false, canReadAccounts: true, canReadContacts: true,
  action: async () => ({}),
};

function select(name: string, overrides: Partial<Props> = {}): Select {
  let found: Select | undefined;
  function visit(node: ReactNode) {
    Children.forEach(node, (child) => {
      if (!isValidElement<{ name?: string; id?: string; type?: string; children?: ReactNode }>(child)) return;
      if (child.type === "select" && child.props.name === name) found = child as Select;
      visit(child.props.children);
    });
  }
  visit(DealForm({ ...props, ...overrides }));
  if (!found) throw new Error(`Missing select: ${name}`);
  return found;
}

function input(name: string, overrides: Partial<Props> = {}): InputElement {
  let found: InputElement | undefined;
  function visit(node: ReactNode) {
    Children.forEach(node, (child) => {
      if (!isValidElement<{ name?: string; id?: string; type?: string; children?: ReactNode }>(child)) return;
      if (!found && child.type === Input
        && (child.props.name === name || child.props.id?.endsWith(`-${name}`))
        && child.props.type !== "hidden") found = child as InputElement;
      visit(child.props.children);
    });
  }
  visit(DealForm({ ...props, ...overrides }));
  if (!found) throw new Error(`Missing input: ${name}`);
  return found;
}

describe("DealForm contact prefill", () => {
  it("prefills both Contact 360 relationships, and the contact without an account", () => {
    const defaults = { defaultAccountId: accountId, defaultContactId: contactId };
    expect(select("account_id", defaults).props.defaultValue).toBe(accountId);
    expect(select("contact_id", defaults).props.defaultValue).toBe(contactId);
    expect(select("contact_id", { defaultContactId: contactId, accounts: [] }).props.defaultValue).toBe(contactId);
  });

  it("remounts the uncontrolled select when the resolved contact default changes", () => {
    const empty = select("contact_id");
    const prefilled = select("contact_id", { defaultContactId: contactId });
    expect(prefilled.key).not.toBe(empty.key);
    const unavailable = select("contact_id", { defaultContactId: contactId, contacts: [] });
    expect(unavailable.props.defaultValue).toBe("");
    expect(prefilled.key).not.toBe(unavailable.key);
  });

  it("keeps the same identity on ordinary rerenders so manual selection is retained", () => {
    const defaults = { defaultContactId: contactId };
    expect(select("contact_id", defaults).key).toBe(select("contact_id", {
      ...defaults, contacts: props.contacts.map((contact) => ({ ...contact })),
    }).key);
  });

  it("keeps Account 360 and generic create forms unassociated unless a contact default is given", () => {
    expect(select("contact_id", { defaultAccountId: accountId }).props.defaultValue).toBe("");
    expect(select("contact_id").props.defaultValue).toBe("");
    expect(select("contact_id", { defaultContactId: secondContactId }).props.defaultValue).toBe("");
  });

  it("uses the saved deal contact, including an explicit empty association, before defaults", () => {
    const deal: NonNullable<Props["deal"]> = {
      id: "a5000000-0000-4000-8000-000000000001", name: "Existing deal", description: null,
      pipeline_id: "a6000000-0000-4000-8000-000000000001", stage_id: "a7000000-0000-4000-8000-000000000001",
      account_id: accountId, contact_id: contactId, owner_user_id: null,
      amount: null, currency: null, expected_close_date: null, ...timestamps,
    };
    expect(select("contact_id", { deal, defaultContactId: secondContactId }).props.defaultValue).toBe(contactId);
    expect(select("contact_id", { deal: { ...deal, contact_id: null }, defaultContactId: contactId }).props.defaultValue).toBe("");
  });

  it("locks Won amount and currency fields while preserving their submitted values", () => {
    const deal: NonNullable<Props["deal"]> = {
      id: "a5000000-0000-4000-8000-000000000001", name: "Won deal", description: null,
      pipeline_id: "a6000000-0000-4000-8000-000000000001", stage_id: "a7000000-0000-4000-8000-000000000001",
      account_id: null, contact_id: null, owner_user_id: null, amount: "1200.50", currency: "USD",
      expected_close_date: null, outcome: "won", closed_at: "2026-10-05T12:00:00Z", ...timestamps,
    };
    const amount = input("amount", { deal, lockFinancialFields: true });
    const currency = input("currency", { deal, lockFinancialFields: true });
    expect(amount.props.disabled).toBe(true);
    expect(currency.props.disabled).toBe(true);
    expect(amount.props.defaultValue).toBe("1200.50");
    expect(currency.props.defaultValue).toBe("USD");
  });
});
