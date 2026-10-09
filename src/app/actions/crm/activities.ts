"use server";

import { revalidatePath } from "next/cache";
import { permissionError, resolveCrmAccess, unavailableError } from "@/lib/crm/access";
import { listActivitiesForOrganization } from "@/lib/crm/queries";
import { validateActivityForm } from "@/lib/crm/validation";
import type { CrmAccess, CrmActionError, CrmActivity, CrmActivityInput, CrmFormState, CrmResult } from "@/lib/crm/types";

type ActivityReferenceQuery = () => PromiseLike<{
  data: { id: string } | null;
  error: { message: string } | null;
}>;

async function validateReference(
  access: CrmAccess,
  id: string | null | undefined,
  permission: "accounts.read" | "contacts.read" | "deals.read" | "tasks.read",
  resource: "аккаунтам" | "контактам" | "сделкам" | "задачам",
  label: "аккаунт" | "контакт" | "сделку" | "задачу",
  query: ActivityReferenceQuery,
): Promise<CrmActionError | null> {
  if (!id) return null;
  if (!access.permissions.has(permission)) return permissionError(resource, "read");

  try {
    const { data, error } = await query();
    if (error) return unavailableError(`Не удалось проверить выбранную связь: ${label}.`);
    if (!data) {
      return {
        code: "not_found",
        message: `Выбранная связь с сущностью «${label}» недоступна в активной организации.`,
      };
    }
    return null;
  } catch {
    return unavailableError(`Не удалось проверить выбранную связь: ${label}.`);
  }
}

async function validateActivityReferences(
  access: CrmAccess,
  activity: CrmActivityInput,
): Promise<CrmActionError | null> {
  const checks = [
    validateReference(access, activity.account_id, "accounts.read", "аккаунтам", "аккаунт", () =>
      access.supabase.from("crm_accounts").select("id").eq("organization_id", access.organizationId).eq("id", activity.account_id ?? "").is("archived_at", null).maybeSingle()),
    validateReference(access, activity.contact_id, "contacts.read", "контактам", "контакт", () =>
      access.supabase.from("crm_contacts").select("id").eq("organization_id", access.organizationId).eq("id", activity.contact_id ?? "").is("archived_at", null).maybeSingle()),
    validateReference(access, activity.deal_id, "deals.read", "сделкам", "сделку", () =>
      access.supabase.from("crm_deals").select("id").eq("organization_id", access.organizationId).eq("id", activity.deal_id ?? "").is("archived_at", null).maybeSingle()),
    validateReference(access, activity.task_id, "tasks.read", "задачам", "задачу", () =>
      access.supabase.from("crm_tasks").select("id").eq("organization_id", access.organizationId).eq("id", activity.task_id ?? "").is("archived_at", null).maybeSingle()),
  ];

  const errors = await Promise.all(checks);
  return errors.find((error) => error !== null) ?? null;
}

export async function listActivitiesAction(): Promise<CrmResult<CrmActivity[]>> {
  const access = await resolveCrmAccess();
  if (!access.ok) return access;
  if (!access.value.permissions.has("activities.read")) {
    return { ok: false, error: permissionError("активностям", "read") };
  }

  return listActivitiesForOrganization(access.value.supabase, access.value.organizationId);
}

export async function createActivityAction(
  _previousState: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const access = await resolveCrmAccess();
  if (!access.ok) return { error: access.error };
  if (!access.value.permissions.has("activities.manage")) {
    return { error: permissionError("активностям", "manage") };
  }

  const parsed = validateActivityForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const referenceError = await validateActivityReferences(access.value, parsed.value);
  if (referenceError) return { error: referenceError };

  try {
    const activity = parsed.value;
    const row = {
      organization_id: access.value.organizationId,
      type: activity.type,
      subject: activity.subject,
      body: activity.body,
      ...(activity.occurred_at ? { occurred_at: activity.occurred_at } : {}),
      account_id: activity.account_id ?? null,
      contact_id: activity.contact_id ?? null,
      deal_id: activity.deal_id ?? null,
      task_id: activity.task_id ?? null,
    };
    const { error } = await access.value.supabase.from("crm_activities").insert(row);
    if (error) return { error: unavailableError("Не удалось создать активность. Проверьте данные и попробуйте снова.") };
  } catch {
    return { error: unavailableError("Не удалось создать активность. Попробуйте снова.") };
  }

  revalidatePath("/crm/activities");
  revalidatePath("/crm/accounts/[accountId]", "page");
  revalidatePath("/crm/contacts/[contactId]", "page");
  revalidatePath("/crm/deals/[dealId]", "page");
  return { success: "Активность создана." };
}
