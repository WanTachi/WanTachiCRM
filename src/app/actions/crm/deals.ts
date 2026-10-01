"use server";

import { revalidatePath } from "next/cache";
import { notFoundError, permissionError, resolveCrmAccess, unavailableError } from "@/lib/crm/access";
import {
  getActivePipelineForOrganization,
  getActiveStageForPipeline,
  isActiveOrganizationMember,
  listDealsForOrganization,
} from "@/lib/crm/queries";
import {
  invalidRecordIdError,
  isCrmRecordId,
  isStageInPipeline,
  validateDealForm,
} from "@/lib/crm/validation";
import type { CrmActionError, CrmDealInput, CrmFormState, CrmResult } from "@/lib/crm/types";

async function validateDealReferences(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createSupabaseServerClient>>,
  organizationId: string,
  permissions: Set<string>,
  deal: CrmDealInput,
): Promise<CrmActionError | null> {
  if (!permissions.has("pipelines.read")) return permissionError("воронкам", "read");

  const pipeline = await getActivePipelineForOrganization(supabase, organizationId, deal.pipeline_id);
  if (!pipeline.ok) return pipeline.error;
  if (!pipeline.value) return notFoundError("воронка");

  const stage = await getActiveStageForPipeline(
    supabase,
    organizationId,
    deal.pipeline_id,
    deal.stage_id,
  );
  if (!stage.ok) return stage.error;
  if (!stage.value || !isStageInPipeline([stage.value], deal.pipeline_id, deal.stage_id)) {
    return { code: "invalid_input", message: "Выберите активный этап из выбранной воронки." };
  }

  if (deal.account_id) {
    if (!permissions.has("accounts.read")) return permissionError("аккаунтам", "read");
    try {
      const { data, error } = await supabase
        .from("crm_accounts")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("id", deal.account_id)
        .is("archived_at", null)
        .maybeSingle();
      if (error) return unavailableError("Не удалось проверить выбранный аккаунт.");
      if (!data) return { code: "not_found", message: "Выбранный аккаунт недоступен в активной организации." };
    } catch {
      return unavailableError("Не удалось проверить выбранный аккаунт.");
    }
  }

  if (deal.contact_id) {
    if (!permissions.has("contacts.read")) return permissionError("контактам", "read");
    try {
      const { data, error } = await supabase
        .from("crm_contacts")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("id", deal.contact_id)
        .is("archived_at", null)
        .maybeSingle();
      if (error) return unavailableError("Не удалось проверить выбранный контакт.");
      if (!data) return { code: "not_found", message: "Выбранный контакт недоступен в активной организации." };
    } catch {
      return unavailableError("Не удалось проверить выбранный контакт.");
    }
  }

  if (deal.owner_user_id) {
    const owner = await isActiveOrganizationMember(supabase, organizationId, deal.owner_user_id);
    if (!owner.ok) return owner.error;
    if (!owner.value) {
      return { code: "invalid_input", message: "Владелец должен быть активным участником организации." };
    }
  }

  return null;
}

function revalidateDealViews(pipelineId?: string) {
  revalidatePath("/crm/deals");
  revalidatePath("/crm/pipelines");
  if (pipelineId) revalidatePath(`/crm/pipelines/${pipelineId}`);
}

export async function listDealsAction() {
  const access = await resolveCrmAccess();
  if (!access.ok) return access;
  if (!access.value.permissions.has("deals.read")) {
    return { ok: false, error: permissionError("сделкам", "read") } satisfies CrmResult<never>;
  }
  return listDealsForOrganization(access.value.supabase, access.value.organizationId);
}

export async function createDealAction(
  _previousState: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const access = await resolveCrmAccess();
  if (!access.ok) return { error: access.error };
  if (!access.value.permissions.has("deals.manage")) {
    return { error: permissionError("сделкам", "manage") };
  }

  const parsed = validateDealForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const referenceError = await validateDealReferences(
    access.value.supabase,
    access.value.organizationId,
    access.value.permissions,
    parsed.value,
  );
  if (referenceError) return { error: referenceError };

  try {
    const row = {
      organization_id: access.value.organizationId,
      pipeline_id: parsed.value.pipeline_id,
      stage_id: parsed.value.stage_id,
      account_id: parsed.value.account_id ?? null,
      contact_id: parsed.value.contact_id ?? null,
      name: parsed.value.name,
      description: parsed.value.description,
      amount: parsed.value.amount,
      currency: parsed.value.currency,
      ...(parsed.value.owner_user_id !== undefined
        ? { owner_user_id: parsed.value.owner_user_id }
        : {}),
      expected_close_date: parsed.value.expected_close_date,
    };
    const { error } = await access.value.supabase.from("crm_deals").insert(row);
    if (error) return { error: unavailableError("Не удалось создать сделку. Проверьте выбранные данные и попробуйте снова.") };
  } catch {
    return { error: unavailableError("Не удалось создать сделку. Попробуйте снова.") };
  }

  revalidateDealViews(parsed.value.pipeline_id);
  return { success: "Сделка создана." };
}

export async function updateDealAction(
  _previousState: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const access = await resolveCrmAccess();
  if (!access.ok) return { error: access.error };
  if (!access.value.permissions.has("deals.manage")) {
    return { error: permissionError("сделкам", "manage") };
  }
  if (!access.value.permissions.has("deals.read")) {
    return { error: permissionError("сделкам", "read") };
  }

  const id = formData.get("id");
  if (!isCrmRecordId(id)) return { error: invalidRecordIdError("сделку") };
  const parsed = validateDealForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const referenceError = await validateDealReferences(
    access.value.supabase,
    access.value.organizationId,
    access.value.permissions,
    parsed.value,
  );
  if (referenceError) return { error: referenceError };

  try {
    const updates = {
      pipeline_id: parsed.value.pipeline_id,
      stage_id: parsed.value.stage_id,
      ...(parsed.value.account_id !== undefined ? { account_id: parsed.value.account_id } : {}),
      ...(parsed.value.contact_id !== undefined ? { contact_id: parsed.value.contact_id } : {}),
      name: parsed.value.name,
      description: parsed.value.description,
      amount: parsed.value.amount,
      currency: parsed.value.currency,
      ...(parsed.value.owner_user_id !== undefined
        ? { owner_user_id: parsed.value.owner_user_id }
        : {}),
      expected_close_date: parsed.value.expected_close_date,
    };
    const { data, error } = await access.value.supabase
      .from("crm_deals")
      .update(updates)
      .eq("organization_id", access.value.organizationId)
      .eq("id", id)
      .is("archived_at", null)
      .select("id")
      .maybeSingle();

    if (error) return { error: unavailableError("Не удалось обновить сделку. Проверьте выбранные данные и попробуйте снова.") };
    if (!data) return { error: notFoundError("сделка") };
  } catch {
    return { error: unavailableError("Не удалось обновить сделку. Попробуйте снова.") };
  }

  revalidateDealViews(parsed.value.pipeline_id);
  return { success: "Изменения сделки сохранены." };
}

export async function archiveDealAction(
  _previousState: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const access = await resolveCrmAccess();
  if (!access.ok) return { error: access.error };
  if (!access.value.permissions.has("deals.manage")) {
    return { error: permissionError("сделкам", "manage") };
  }
  if (!access.value.permissions.has("deals.read")) {
    return { error: permissionError("сделкам", "read") };
  }

  const id = formData.get("id");
  if (!isCrmRecordId(id)) return { error: invalidRecordIdError("сделку") };
  const pipelineIdValue = formData.get("pipeline_id");
  const pipelineId = isCrmRecordId(pipelineIdValue) ? pipelineIdValue : undefined;

  try {
    const { count, error } = await access.value.supabase
      .from("crm_deals")
      .update({ archived_at: new Date().toISOString() }, { count: "exact" })
      .eq("organization_id", access.value.organizationId)
      .eq("id", id)
      .is("archived_at", null);

    if (error) return { error: unavailableError("Не удалось архивировать сделку. Попробуйте снова.") };
    if (count !== 1) return { error: notFoundError("сделка") };
  } catch {
    return { error: unavailableError("Не удалось архивировать сделку. Попробуйте снова.") };
  }

  revalidateDealViews(pipelineId);
  return { success: "Сделка архивирована." };
}
