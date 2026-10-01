"use server";

import { revalidatePath } from "next/cache";
import { notFoundError, permissionError, resolveCrmAccess, unavailableError } from "@/lib/crm/access";
import {
  getActivePipelineForOrganization,
  isActiveOrganizationMember,
} from "@/lib/crm/queries";
import {
  invalidRecordIdError,
  isCrmRecordId,
  validatePipelineForm,
  validatePipelineStageForm,
} from "@/lib/crm/validation";
import type { CrmFormState } from "@/lib/crm/types";

function revalidatePipelineViews(pipelineId?: string) {
  revalidatePath("/crm/pipelines");
  revalidatePath("/crm/deals");
  if (pipelineId) revalidatePath(`/crm/pipelines/${pipelineId}`);
}

async function validatePipelineOwner(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createSupabaseServerClient>>,
  organizationId: string,
  ownerUserId: string | null | undefined,
): Promise<CrmFormState["error"] | null> {
  if (!ownerUserId) return null;
  const result = await isActiveOrganizationMember(supabase, organizationId, ownerUserId);
  if (!result.ok) return result.error;
  if (!result.value) {
    return { code: "invalid_input", message: "Владелец должен быть активным участником организации." };
  }
  return null;
}

export async function createPipelineAction(
  _previousState: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const access = await resolveCrmAccess();
  if (!access.ok) return { error: access.error };
  if (!access.value.permissions.has("pipelines.manage")) {
    return { error: permissionError("воронкам", "manage") };
  }

  const parsed = validatePipelineForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const ownerError = await validatePipelineOwner(
    access.value.supabase,
    access.value.organizationId,
    parsed.value.owner_user_id,
  );
  if (ownerError) return { error: ownerError };

  try {
    const row = {
      organization_id: access.value.organizationId,
      name: parsed.value.name,
      description: parsed.value.description,
      ...(parsed.value.owner_user_id !== undefined
        ? { owner_user_id: parsed.value.owner_user_id }
        : {}),
    };
    const { error } = await access.value.supabase.from("crm_pipelines").insert(row);
    if (error) return { error: unavailableError("Не удалось создать воронку. Проверьте данные и попробуйте снова.") };
  } catch {
    return { error: unavailableError("Не удалось создать воронку. Попробуйте снова.") };
  }

  revalidatePipelineViews();
  return { success: "Воронка создана." };
}

export async function updatePipelineAction(
  _previousState: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const access = await resolveCrmAccess();
  if (!access.ok) return { error: access.error };
  if (!access.value.permissions.has("pipelines.manage")) {
    return { error: permissionError("воронкам", "manage") };
  }
  if (!access.value.permissions.has("pipelines.read")) {
    return { error: permissionError("воронкам", "read") };
  }

  const id = formData.get("id");
  if (!isCrmRecordId(id)) return { error: invalidRecordIdError("воронку") };
  const parsed = validatePipelineForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const ownerError = await validatePipelineOwner(
    access.value.supabase,
    access.value.organizationId,
    parsed.value.owner_user_id,
  );
  if (ownerError) return { error: ownerError };

  try {
    const updates = {
      name: parsed.value.name,
      description: parsed.value.description,
      ...(parsed.value.owner_user_id !== undefined
        ? { owner_user_id: parsed.value.owner_user_id }
        : {}),
    };
    const { data, error } = await access.value.supabase
      .from("crm_pipelines")
      .update(updates)
      .eq("organization_id", access.value.organizationId)
      .eq("id", id)
      .is("archived_at", null)
      .select("id")
      .maybeSingle();

    if (error) return { error: unavailableError("Не удалось обновить воронку. Проверьте данные и попробуйте снова.") };
    if (!data) return { error: notFoundError("воронка") };
  } catch {
    return { error: unavailableError("Не удалось обновить воронку. Попробуйте снова.") };
  }

  revalidatePipelineViews(id);
  return { success: "Изменения воронки сохранены." };
}

export async function archivePipelineAction(
  _previousState: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const access = await resolveCrmAccess();
  if (!access.ok) return { error: access.error };
  if (!access.value.permissions.has("pipelines.manage")) {
    return { error: permissionError("воронкам", "manage") };
  }
  if (!access.value.permissions.has("pipelines.read")) {
    return { error: permissionError("воронкам", "read") };
  }

  const id = formData.get("id");
  if (!isCrmRecordId(id)) return { error: invalidRecordIdError("воронку") };

  try {
    const { count, error } = await access.value.supabase
      .from("crm_pipelines")
      .update({ archived_at: new Date().toISOString() }, { count: "exact" })
      .eq("organization_id", access.value.organizationId)
      .eq("id", id)
      .is("archived_at", null);

    if (error) return { error: unavailableError("Не удалось архивировать воронку. Попробуйте снова.") };
    if (count !== 1) return { error: notFoundError("воронка") };
  } catch {
    return { error: unavailableError("Не удалось архивировать воронку. Попробуйте снова.") };
  }

  revalidatePipelineViews(id);
  return { success: "Воронка архивирована." };
}

export async function createStageAction(
  _previousState: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const access = await resolveCrmAccess();
  if (!access.ok) return { error: access.error };
  if (!access.value.permissions.has("pipelines.manage")) {
    return { error: permissionError("этапам", "manage") };
  }
  if (!access.value.permissions.has("pipelines.read")) {
    return { error: permissionError("воронкам", "read") };
  }

  const parsed = validatePipelineStageForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const pipeline = await getActivePipelineForOrganization(
    access.value.supabase,
    access.value.organizationId,
    parsed.value.pipeline_id,
  );
  if (!pipeline.ok) return { error: pipeline.error };
  if (!pipeline.value) return { error: notFoundError("воронка") };

  try {
    const { error } = await access.value.supabase.from("crm_pipeline_stages").insert({
      organization_id: access.value.organizationId,
      ...parsed.value,
    });
    if (error) return { error: unavailableError("Не удалось создать этап. Проверьте данные и попробуйте снова.") };
  } catch {
    return { error: unavailableError("Не удалось создать этап. Попробуйте снова.") };
  }

  revalidatePipelineViews(parsed.value.pipeline_id);
  return { success: "Этап создан." };
}

export async function updateStageAction(
  _previousState: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const access = await resolveCrmAccess();
  if (!access.ok) return { error: access.error };
  if (!access.value.permissions.has("pipelines.manage")) {
    return { error: permissionError("этапам", "manage") };
  }
  if (!access.value.permissions.has("pipelines.read")) {
    return { error: permissionError("воронкам", "read") };
  }

  const id = formData.get("id");
  if (!isCrmRecordId(id)) return { error: invalidRecordIdError("этап") };
  const parsed = validatePipelineStageForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const pipeline = await getActivePipelineForOrganization(
    access.value.supabase,
    access.value.organizationId,
    parsed.value.pipeline_id,
  );
  if (!pipeline.ok) return { error: pipeline.error };
  if (!pipeline.value) return { error: notFoundError("воронка") };

  try {
    const { data, error } = await access.value.supabase
      .from("crm_pipeline_stages")
      .update({
        name: parsed.value.name,
        position: parsed.value.position,
        probability: parsed.value.probability,
      })
      .eq("organization_id", access.value.organizationId)
      .eq("pipeline_id", parsed.value.pipeline_id)
      .eq("id", id)
      .is("archived_at", null)
      .select("id")
      .maybeSingle();

    if (error) return { error: unavailableError("Не удалось обновить этап. Проверьте данные и попробуйте снова.") };
    if (!data) return { error: notFoundError("этап") };
  } catch {
    return { error: unavailableError("Не удалось обновить этап. Попробуйте снова.") };
  }

  revalidatePipelineViews(parsed.value.pipeline_id);
  return { success: "Изменения этапа сохранены." };
}

export async function archiveStageAction(
  _previousState: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const access = await resolveCrmAccess();
  if (!access.ok) return { error: access.error };
  if (!access.value.permissions.has("pipelines.manage")) {
    return { error: permissionError("этапам", "manage") };
  }
  if (!access.value.permissions.has("pipelines.read")) {
    return { error: permissionError("воронкам", "read") };
  }

  const id = formData.get("id");
  if (!isCrmRecordId(id)) return { error: invalidRecordIdError("этап") };
  const pipelineId = formData.get("pipeline_id");
  if (!isCrmRecordId(pipelineId)) return { error: invalidRecordIdError("воронку") };
  const pipeline = await getActivePipelineForOrganization(
    access.value.supabase,
    access.value.organizationId,
    pipelineId,
  );
  if (!pipeline.ok) return { error: pipeline.error };
  if (!pipeline.value) return { error: notFoundError("воронка") };

  try {
    const { count, error } = await access.value.supabase
      .from("crm_pipeline_stages")
      .update({ archived_at: new Date().toISOString() }, { count: "exact" })
      .eq("organization_id", access.value.organizationId)
      .eq("pipeline_id", pipelineId)
      .eq("id", id)
      .is("archived_at", null);

    if (error) return { error: unavailableError("Не удалось архивировать этап. Попробуйте снова.") };
    if (count !== 1) return { error: notFoundError("этап") };
  } catch {
    return { error: unavailableError("Не удалось архивировать этап. Попробуйте снова.") };
  }

  revalidatePipelineViews(pipelineId);
  return { success: "Этап архивирован." };
}
