"use server";

import { revalidatePath } from "next/cache";
import { isActiveOrganizationMember, listTasksForOrganization } from "@/lib/crm/queries";
import { notFoundError, permissionError, resolveCrmAccess, unavailableError } from "@/lib/crm/access";
import { invalidRecordIdError, isCrmRecordId, validateTaskForm } from "@/lib/crm/validation";
import type { CrmAccess, CrmActionError, CrmFormState, CrmResult, CrmTask, CrmTaskInput } from "@/lib/crm/types";

type ReferenceQuery = () => PromiseLike<{
  data: { id: string } | null;
  error: { message: string } | null;
}>;

async function validateReference(
  access: CrmAccess,
  id: string | null | undefined,
  permission: "accounts.read" | "contacts.read" | "deals.read",
  resource: "аккаунтам" | "контактам" | "сделкам",
  label: "аккаунт" | "контакт" | "сделка",
  query: ReferenceQuery,
): Promise<CrmActionError | null> {
  if (!id) return null;
  if (!access.permissions.has(permission)) return permissionError(resource, "read");

  try {
    const { data, error } = await query();
    if (error) return unavailableError(`Не удалось проверить связь с сущностью «${label}».`);
    if (!data) {
      return {
        code: "not_found",
        message: `Связь с сущностью «${label}» недоступна в активной организации.`,
      };
    }
    return null;
  } catch {
    return unavailableError(`Не удалось проверить связь с сущностью «${label}».`);
  }
}

async function validateTaskReferences(
  access: CrmAccess,
  task: CrmTaskInput,
): Promise<CrmActionError | null> {
  const checks = [
    validateReference(access, task.account_id, "accounts.read", "аккаунтам", "аккаунт", () =>
      access.supabase.from("crm_accounts").select("id").eq("organization_id", access.organizationId).eq("id", task.account_id ?? "").is("archived_at", null).maybeSingle()),
    validateReference(access, task.contact_id, "contacts.read", "контактам", "контакт", () =>
      access.supabase.from("crm_contacts").select("id").eq("organization_id", access.organizationId).eq("id", task.contact_id ?? "").is("archived_at", null).maybeSingle()),
    validateReference(access, task.deal_id, "deals.read", "сделкам", "сделка", () =>
      access.supabase.from("crm_deals").select("id").eq("organization_id", access.organizationId).eq("id", task.deal_id ?? "").is("archived_at", null).maybeSingle()),
  ];

  const errors = await Promise.all(checks);
  const referenceError = errors.find((error) => error !== null);
  if (referenceError) return referenceError;

  if (task.owner_user_id) {
    if (!access.permissions.has("members.read")) {
      return { code: "forbidden", message: "У вас нет разрешения назначать ответственных участников." };
    }
    const owner = await isActiveOrganizationMember(access.supabase, access.organizationId, task.owner_user_id);
    if (!owner.ok) return owner.error;
    if (!owner.value) {
      return { code: "invalid_input", message: "Ответственный должен быть активным участником организации." };
    }
  }

  return null;
}

export async function listTasksAction(): Promise<CrmResult<CrmTask[]>> {
  const access = await resolveCrmAccess();
  if (!access.ok) return access;
  if (!access.value.permissions.has("tasks.read")) {
    return { ok: false, error: permissionError("задачам", "read") };
  }

  return listTasksForOrganization(access.value.supabase, access.value.organizationId);
}

export async function createTaskAction(
  _previousState: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const access = await resolveCrmAccess();
  if (!access.ok) return { error: access.error };
  if (!access.value.permissions.has("tasks.manage")) {
    return { error: permissionError("задачам", "manage") };
  }

  const parsed = validateTaskForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const referenceError = await validateTaskReferences(access.value, parsed.value);
  if (referenceError) return { error: referenceError };

  try {
    const task = parsed.value;
    const row = {
      organization_id: access.value.organizationId,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      due_at: task.due_at,
      account_id: task.account_id ?? null,
      contact_id: task.contact_id ?? null,
      deal_id: task.deal_id ?? null,
      ...(task.owner_user_id !== undefined ? { owner_user_id: task.owner_user_id } : {}),
    };
    const { error } = await access.value.supabase.from("crm_tasks").insert(row);
    if (error) return { error: unavailableError("Не удалось создать задачу. Проверьте данные и попробуйте снова.") };
  } catch {
    return { error: unavailableError("Не удалось создать задачу. Попробуйте снова.") };
  }

  revalidatePath("/crm/tasks");
  revalidatePath("/crm/activities");
  return { success: "Задача создана." };
}

export async function updateTaskAction(
  _previousState: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const access = await resolveCrmAccess();
  if (!access.ok) return { error: access.error };
  if (!access.value.permissions.has("tasks.manage")) {
    return { error: permissionError("задачам", "manage") };
  }
  if (!access.value.permissions.has("tasks.read")) {
    return { error: permissionError("задачам", "read") };
  }

  const id = formData.get("id");
  if (!isCrmRecordId(id)) return { error: invalidRecordIdError("задачу") };
  const parsed = validateTaskForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const referenceError = await validateTaskReferences(access.value, parsed.value);
  if (referenceError) return { error: referenceError };

  const task = parsed.value;
  const updates = {
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    due_at: task.due_at,
    ...(task.account_id !== undefined ? { account_id: task.account_id } : {}),
    ...(task.contact_id !== undefined ? { contact_id: task.contact_id } : {}),
    ...(task.deal_id !== undefined ? { deal_id: task.deal_id } : {}),
    ...(task.owner_user_id !== undefined ? { owner_user_id: task.owner_user_id } : {}),
  };

  try {
    const { data, error } = await access.value.supabase
      .from("crm_tasks")
      .update(updates)
      .eq("organization_id", access.value.organizationId)
      .eq("id", id)
      .is("archived_at", null)
      .select("id")
      .maybeSingle();

    if (error) return { error: unavailableError("Не удалось обновить задачу. Проверьте данные и попробуйте снова.") };
    if (!data) return { error: notFoundError("задача") };
  } catch {
    return { error: unavailableError("Не удалось обновить задачу. Попробуйте снова.") };
  }

  revalidatePath("/crm/tasks");
  revalidatePath("/crm/activities");
  return { success: "Изменения задачи сохранены." };
}
