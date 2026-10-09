"use server";

import { revalidatePath } from "next/cache";
import { permissionError, resolveCrmAccess, unavailableError, notFoundError } from "@/lib/crm/access";
import { listContactsForOrganization } from "@/lib/crm/queries";
import { invalidRecordIdError, isCrmRecordId, validateContactForm } from "@/lib/crm/validation";
import type { CrmAccess, CrmActionError, CrmContact, CrmFormState, CrmResult } from "@/lib/crm/types";

async function validateAccountAssociation(
  access: CrmAccess,
  accountId: string | null | undefined,
): Promise<CrmActionError | null> {
  if (accountId === null || accountId === undefined) return null;
  if (!access.permissions.has("accounts.read")) return permissionError("аккаунтам", "read");

  try {
    const { data, error } = await access.supabase
      .from("crm_accounts")
      .select("id")
      .eq("organization_id", access.organizationId)
      .eq("id", accountId)
      .is("archived_at", null)
      .maybeSingle();

    if (error) return unavailableError("Не удалось проверить выбранный аккаунт.");
    if (!data) {
      return {
        code: "not_found",
        message: "Выбранный аккаунт не найден или недоступен в активной организации.",
      };
    }
    return null;
  } catch {
    return unavailableError("Не удалось проверить выбранный аккаунт.");
  }
}

export async function listContactsAction(): Promise<CrmResult<CrmContact[]>> {
  const access = await resolveCrmAccess();
  if (!access.ok) return access;
  if (!access.value.permissions.has("contacts.read")) {
    return { ok: false, error: permissionError("контактам", "read") };
  }

  return listContactsForOrganization(access.value.supabase, access.value.organizationId);
}

export async function createContactAction(
  _previousState: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const access = await resolveCrmAccess();
  if (!access.ok) return { error: access.error };
  if (!access.value.permissions.has("contacts.manage")) {
    return { error: permissionError("контактам", "manage") };
  }

  const parsed = validateContactForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const associationError = await validateAccountAssociation(access.value, parsed.value.account_id);
  if (associationError) return { error: associationError };

  try {
    const { error } = await access.value.supabase.from("crm_contacts").insert({
      organization_id: access.value.organizationId,
      ...parsed.value,
      account_id: parsed.value.account_id ?? null,
    });
    if (error) return { error: unavailableError("Не удалось создать контакт. Проверьте данные и попробуйте снова.") };
  } catch {
    return { error: unavailableError("Не удалось создать контакт. Попробуйте снова.") };
  }

  revalidatePath("/crm/contacts");
  revalidatePath("/crm/accounts/[accountId]", "page");
  revalidatePath("/crm/contacts/[contactId]", "page");
  revalidatePath("/crm/deals/[dealId]", "page");
  return { success: "Контакт создан." };
}

export async function updateContactAction(
  _previousState: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const access = await resolveCrmAccess();
  if (!access.ok) return { error: access.error };
  if (!access.value.permissions.has("contacts.manage")) {
    return { error: permissionError("контактам", "manage") };
  }
  if (!access.value.permissions.has("contacts.read")) {
    return { error: permissionError("контактам", "read") };
  }

  const id = formData.get("id");
  if (!isCrmRecordId(id)) return { error: invalidRecordIdError("контакт") };
  const parsed = validateContactForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  let existingAccountId: string | null;
  try {
    const { data, error } = await access.value.supabase
      .from("crm_contacts")
      .select("account_id")
      .eq("organization_id", access.value.organizationId)
      .eq("id", id)
      .is("archived_at", null)
      .maybeSingle();
    if (error) return { error: unavailableError("Не удалось проверить контакт. Попробуйте снова.") };
    if (!data) return { error: notFoundError("контакт") };
    existingAccountId = data.account_id;
  } catch {
    return { error: unavailableError("Не удалось проверить контакт. Попробуйте снова.") };
  }

  const changedAccountAssociation =
    parsed.value.account_id !== undefined && parsed.value.account_id !== existingAccountId;
  if (changedAccountAssociation) {
    const associationError = await validateAccountAssociation(access.value, parsed.value.account_id);
    if (associationError) return { error: associationError };
  }

  const updates = {
    first_name: parsed.value.first_name,
    last_name: parsed.value.last_name,
    email: parsed.value.email,
    phone: parsed.value.phone,
    job_title: parsed.value.job_title,
    ...(parsed.value.account_id !== undefined ? { account_id: parsed.value.account_id } : {}),
  };

  try {
    const { data, error } = await access.value.supabase
      .from("crm_contacts")
      .update(updates)
      .eq("organization_id", access.value.organizationId)
      .eq("id", id)
      .is("archived_at", null)
      .select("id")
      .maybeSingle();

    if (error) return { error: unavailableError("Не удалось обновить контакт. Проверьте данные и попробуйте снова.") };
    if (!data) return { error: notFoundError("контакт") };
  } catch {
    return { error: unavailableError("Не удалось обновить контакт. Попробуйте снова.") };
  }

  revalidatePath("/crm/contacts");
  revalidatePath("/crm/accounts/[accountId]", "page");
  revalidatePath("/crm/contacts/[contactId]", "page");
  revalidatePath("/crm/deals/[dealId]", "page");
  return { success: "Изменения контакта сохранены." };
}

export async function archiveContactAction(
  _previousState: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const access = await resolveCrmAccess();
  if (!access.ok) return { error: access.error };
  if (!access.value.permissions.has("contacts.manage")) {
    return { error: permissionError("контактам", "manage") };
  }
  if (!access.value.permissions.has("contacts.read")) {
    return { error: permissionError("контактам", "read") };
  }

  const id = formData.get("id");
  if (!isCrmRecordId(id)) return { error: invalidRecordIdError("контакт") };

  try {
    const { data, error } = await access.value.supabase
      .from("crm_contacts")
      .update({ archived_at: new Date().toISOString() })
      .eq("organization_id", access.value.organizationId)
      .eq("id", id)
      .is("archived_at", null)
      .select("id")
      .maybeSingle();

    if (error) return { error: unavailableError("Не удалось архивировать контакт. Попробуйте снова.") };
    if (!data) return { error: notFoundError("контакт") };
  } catch {
    return { error: unavailableError("Не удалось архивировать контакт. Попробуйте снова.") };
  }

  revalidatePath("/crm/contacts");
  revalidatePath("/crm/accounts/[accountId]", "page");
  revalidatePath("/crm/contacts/[contactId]", "page");
  revalidatePath("/crm/deals/[dealId]", "page");
  return { success: "Контакт архивирован." };
}
