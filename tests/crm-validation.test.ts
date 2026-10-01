import { describe, expect, it } from "vitest";
import { isCrmRecordId, validateAccountForm, validateContactForm } from "../src/lib/crm/validation";

describe("CRM form validation", () => {
  it("trims account fields and normalizes blank optional values", () => {
    const formData = new FormData();
    formData.set("name", "  WanTachi  ");
    formData.set("website", "");
    formData.set("phone", " +971 50 000 0000 ");
    formData.set("industry", "");

    expect(validateAccountForm(formData)).toEqual({
      ok: true,
      value: { name: "WanTachi", website: null, phone: "+971 50 000 0000", industry: null },
    });
  });

  it("rejects a missing or overlong account name", () => {
    const missing = new FormData();
    expect(validateAccountForm(missing)).toMatchObject({ ok: false, error: { code: "invalid_input" } });

    const overlong = new FormData();
    overlong.set("name", "a".repeat(161));
    expect(validateAccountForm(overlong)).toMatchObject({ ok: false, error: { code: "invalid_input" } });
  });

  it("allows a contact without an account and normalizes empty fields", () => {
    const formData = new FormData();
    formData.set("first_name", " Lin ");
    formData.set("last_name", "");
    formData.set("email", "");
    formData.set("phone", "");
    formData.set("job_title", "");
    formData.set("account_id", "");

    expect(validateContactForm(formData)).toEqual({
      ok: true,
      value: {
        first_name: "Lin",
        last_name: null,
        email: null,
        phone: null,
        job_title: null,
        account_id: null,
      },
    });
  });

  it("keeps the account association unspecified when an edit form omits it", () => {
    const formData = new FormData();
    formData.set("first_name", "Ada");
    formData.set("organization_id", "attacker-controlled-value");

    const result = validateContactForm(formData);
    expect(result).toMatchObject({ ok: true, value: { account_id: undefined } });
    if (result.ok) expect(result.value).not.toHaveProperty("organization_id");
  });

  it("validates email and account identifiers", () => {
    const invalidEmail = new FormData();
    invalidEmail.set("first_name", "Ada");
    invalidEmail.set("email", "not-an-email");
    expect(validateContactForm(invalidEmail)).toMatchObject({ ok: false, error: { code: "invalid_input" } });

    const invalidAccount = new FormData();
    invalidAccount.set("first_name", "Ada");
    invalidAccount.set("account_id", "not-a-uuid");
    expect(validateContactForm(invalidAccount)).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(isCrmRecordId("a0000000-0000-4000-8000-000000000001")).toBe(true);
    expect(isCrmRecordId("/crm/accounts")).toBe(false);
  });
});
