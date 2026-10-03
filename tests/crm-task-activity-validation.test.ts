import { describe, expect, it } from "vitest";
import { validateActivityForm, validateTaskForm } from "../src/lib/crm/validation";

const accountId = "a3000000-0000-4000-8000-000000000001";
const contactId = "a4000000-0000-4000-8000-000000000001";
const dealId = "a5000000-0000-4000-8000-000000000001";
const taskId = "a6000000-0000-4000-8000-000000000001";
const ownerId = "a7000000-0000-4000-8000-000000000001";

function taskForm(values: Record<string, string> = {}) {
  const form = new FormData();
  form.set("title", "  Follow up  ");
  form.set("description", "  Send the revised proposal  ");
  form.set("status", "in_progress");
  form.set("priority", "high");
  form.set("due_date", "2026-10-15");
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

function activityForm(values: Record<string, string> = {}) {
  const form = new FormData();
  form.set("type", "meeting");
  form.set("subject", "  Quarterly review  ");
  form.set("body", "  Discussed next steps  ");
  form.set("occurred_date", "2026-10-01");
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

describe("Tasks and Activities validation", () => {
  it("validates task fields and normalizes supported associations", () => {
    expect(validateTaskForm(taskForm({
      owner_user_id: ownerId,
      account_id: accountId,
      contact_id: contactId,
      deal_id: dealId,
    }))).toEqual({
      ok: true,
      value: {
        title: "Follow up",
        description: "Send the revised proposal",
        status: "in_progress",
        priority: "high",
        due_at: "2026-10-15T23:59:59.999Z",
        owner_user_id: ownerId,
        account_id: accountId,
        contact_id: contactId,
        deal_id: dealId,
      },
    });
  });

  it("allows an unassigned task without optional links or deadline", () => {
    const result = validateTaskForm(taskForm({
      description: "",
      status: "open",
      priority: "normal",
      due_date: "",
      owner_user_id: "",
      account_id: "",
      contact_id: "",
      deal_id: "",
    }));

    expect(result).toMatchObject({
      ok: true,
      value: {
        description: null,
        status: "open",
        priority: "normal",
        due_at: null,
        owner_user_id: null,
        account_id: null,
        contact_id: null,
        deal_id: null,
      },
    });
  });

  it("rejects invalid task status, priority, date and identifiers", () => {
    expect(validateTaskForm(taskForm({ title: "  " }))).toMatchObject({ ok: false });
    expect(validateTaskForm(taskForm({ status: "archived" }))).toMatchObject({ ok: false });
    expect(validateTaskForm(taskForm({ priority: "critical" }))).toMatchObject({ ok: false });
    expect(validateTaskForm(taskForm({ due_date: "2026-02-30" }))).toMatchObject({ ok: false });
    expect(validateTaskForm(taskForm({ account_id: "not-a-uuid" }))).toMatchObject({ ok: false });
    expect(validateTaskForm(taskForm({ owner_user_id: "not-a-uuid" }))).toMatchObject({ ok: false });
  });

  it("does not accept a client-supplied organization id for either record type", () => {
    const task = validateTaskForm(taskForm({ organization_id: "attacker-controlled" }));
    const activity = validateActivityForm(activityForm({ organization_id: "attacker-controlled" }));

    expect(task.ok).toBe(true);
    expect(activity.ok).toBe(true);
    if (task.ok) expect(task.value).not.toHaveProperty("organization_id");
    if (activity.ok) expect(activity.value).not.toHaveProperty("organization_id");
  });

  it("validates activity types, content, date and all optional links", () => {
    expect(validateActivityForm(activityForm({
      account_id: accountId,
      contact_id: contactId,
      deal_id: dealId,
      task_id: taskId,
    }))).toEqual({
      ok: true,
      value: {
        type: "meeting",
        subject: "Quarterly review",
        body: "Discussed next steps",
        occurred_at: "2026-10-01T12:00:00.000Z",
        account_id: accountId,
        contact_id: contactId,
        deal_id: dealId,
        task_id: taskId,
      },
    });
  });

  it("allows an unlinked activity and leaves its timestamp to the database by default", () => {
    const result = validateActivityForm(activityForm({ subject: "", body: "", occurred_date: "" }));
    expect(result).toMatchObject({
      ok: true,
      value: {
        subject: null,
        body: null,
        occurred_at: null,
        account_id: undefined,
        contact_id: undefined,
        deal_id: undefined,
        task_id: undefined,
      },
    });
  });

  it("rejects unknown activity types, invalid dates and malformed references", () => {
    expect(validateActivityForm(activityForm({ type: "sms" }))).toMatchObject({ ok: false });
    expect(validateActivityForm(activityForm({ occurred_date: "2026-02-30" }))).toMatchObject({ ok: false });
    expect(validateActivityForm(activityForm({ deal_id: "not-a-uuid" }))).toMatchObject({ ok: false });
  });
});
