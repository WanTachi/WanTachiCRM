"use server";

import { revalidatePath } from "next/cache";
import { revalidateDashboard } from "@/lib/crm/dashboard";
import { permissionError, resolveCrmAccess, unavailableError, notFoundError } from "@/lib/crm/access";
import { archiveAccountForOrganization, listAccountsForOrganization } from "@/lib/crm/queries";
import { invalidRecordIdError, isCrmRecordId, validateAccountForm } from "@/lib/crm/validation";
import type { CrmAccount, CrmFormState, CrmResult } from "@/lib/crm/types";

export async function listAccountsAction(): Promise<CrmResult<CrmAccount[]>> {
  const access = await resolveCrmAccess();
  if (!access.ok) return access;
  if (!access.value.permissions.has("accounts.read")) {
    return { ok: false, error: permissionError("аккаунтам", "read") };
  }

  return listAccountsForOrganization(access.value.supabase, access.value.organizationId);
}

export async function createAccountAction(
  _previousState: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const access = await resolveCrmAccess();
  if (!access.ok) return { error: access.error };
  if (!access.value.permissions.has("accounts.manage")) {
    return { error: permissionError("аккаунтам", "manage") };
  }

  const parsed = validateAccountForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  try {
    const { error } = await access.value.supabase.from("crm_accounts").insert({
      organization_id: access.value.organizationId,
      ...parsed.value,
    });
    if (error) return { error: unavailableError("Не удалось создать аккаунт. Проверьте данные и попробуйте снова.") };
  } catch {
    return { error: unavailableError("Не удалось создать аккаунт. Попробуйте снова.") };
  }

  revalidatePath("/crm/accounts");
  revalidatePath("/crm/accounts/[accountId]", "page");
  revalidatePath("/crm/tasks/[taskId]", "page");
  revalidatePath("/crm/contacts/[contactId]", "page");
  revalidatePath("/crm/deals/[dealId]", "page");
  revalidatePath("/crm/contacts");
  revalidateDashboard();
  return { success: "Аккаунт создан." };
}

export async function updateAccountAction(
  _previousState: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const access = await resolveCrmAccess();
  if (!access.ok) return { error: access.error };
  if (!access.value.permissions.has("accounts.manage")) {
    return { error: permissionError("аккаунтам", "manage") };
  }
  if (!access.value.permissions.has("accounts.read")) {
    return { error: permissionError("аккаунтам", "read") };
  }

  const id = formData.get("id");
  if (!isCrmRecordId(id)) return { error: invalidRecordIdError("аккаунт") };
  const parsed = validateAccountForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  try {
    const { data, error } = await access.value.supabase
      .from("crm_accounts")
      .update(parsed.value)
      .eq("organization_id", access.value.organizationId)
      .eq("id", id)
      .is("archived_at", null)
      .select("id")
      .maybeSingle();

    if (error) return { error: unavailableError("Не удалось обновить аккаунт. Проверьте данные и попробуйте снова.") };
    if (!data) return { error: notFoundError("аккаунт") };
  } catch {
    return { error: unavailableError("Не удалось обновить аккаунт. Попробуйте снова.") };
  }

  revalidatePath("/crm/accounts");
  revalidatePath("/crm/accounts/[accountId]", "page");
  revalidatePath("/crm/tasks/[taskId]", "page");
  revalidatePath("/crm/contacts/[contactId]", "page");
  revalidatePath("/crm/deals/[dealId]", "page");
  revalidatePath("/crm/contacts");
  revalidateDashboard();
  return { success: "Изменения аккаунта сохранены." };
}

export async function archiveAccountAction(
  _previousState: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const access = await resolveCrmAccess();
  if (!access.ok) return { error: access.error };
  if (!access.value.permissions.has("accounts.manage")) {
    return { error: permissionError("аккаунтам", "manage") };
  }
  if (!access.value.permissions.has("accounts.read")) {
    return { error: permissionError("аккаунтам", "read") };
  }

  const id = formData.get("id");
  if (!isCrmRecordId(id)) return { error: invalidRecordIdError("аккаунт") };

  const result = await archiveAccountForOrganization(
    access.value.supabase,
    access.value.organizationId,
    id,
  );
  if (!result.ok) return { error: result.error };

  revalidatePath("/crm/accounts");
  revalidatePath("/crm/accounts/[accountId]", "page");
  revalidatePath("/crm/tasks/[taskId]", "page");
  revalidatePath("/crm/contacts/[contactId]", "page");
  revalidatePath("/crm/deals/[dealId]", "page");
  revalidatePath("/crm/contacts");
  revalidateDashboard();
  return { success: "Аккаунт архивирован." };
}
