import type { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  CrmAccount,
  CrmContact,
  CrmDeal,
  CrmTask,
  CrmActivity,
  CrmMemberOption,
  CrmPipeline,
  CrmPipelineStage,
  CrmPipelineWithStageCount,
  CrmDashboardDeal,
  CrmResult,
} from "@/lib/crm/types";

type ServerSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export async function getActiveContactForOrganization(
  supabase: ServerSupabase,
  organizationId: string,
  contactId: string,
): Promise<CrmResult<CrmContact | null>> {
  try {
    const { data, error } = await supabase
      .from("crm_contacts")
      .select("id, first_name, last_name, email, phone, job_title, account_id, created_at, updated_at")
      .eq("organization_id", organizationId)
      .eq("id", contactId)
      .is("archived_at", null)
      .maybeSingle();
    if (error) return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить контакт." } };
    return { ok: true, value: data as CrmContact | null };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить контакт." } };
  }
}

export async function listDealsForContact(
  supabase: ServerSupabase,
  organizationId: string,
  contactId: string,
): Promise<CrmResult<CrmDeal[]>> {
  try {
    const { data, error } = await supabase
      .from("crm_deals")
      .select("id, pipeline_id, stage_id, account_id, contact_id, name, description, amount, currency, owner_user_id, expected_close_date, created_at, updated_at")
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId)
      .is("archived_at", null)
      .order("created_at", { ascending: false });
    if (error) return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить сделки контакта." } };
    return { ok: true, value: (data ?? []) as CrmDeal[] };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить сделки контакта." } };
  }
}

export async function listTasksForContact(
  supabase: ServerSupabase,
  organizationId: string,
  contactId: string,
): Promise<CrmResult<CrmTask[]>> {
  try {
    const { data, error } = await supabase
      .from("crm_tasks")
      .select("id, title, description, status, priority, due_at, owner_user_id, account_id, contact_id, deal_id, created_by, created_at, updated_at")
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId)
      .is("archived_at", null)
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить задачи контакта." } };
    return { ok: true, value: (data ?? []) as CrmTask[] };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить задачи контакта." } };
  }
}

export async function listActivitiesForContact(
  supabase: ServerSupabase,
  organizationId: string,
  contactId: string,
): Promise<CrmResult<CrmActivity[]>> {
  try {
    const { data, error } = await supabase
      .from("crm_activities")
      .select("id, type, subject, body, occurred_at, account_id, contact_id, deal_id, task_id, created_by, created_at, updated_at")
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId)
      .is("archived_at", null)
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить активности контакта." } };
    return { ok: true, value: (data ?? []) as CrmActivity[] };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить активности контакта." } };
  }
}

export async function getActiveTaskForOrganization(
  supabase: ServerSupabase,
  organizationId: string,
  taskId: string,
): Promise<CrmResult<CrmTask | null>> {
  try {
    const { data, error } = await supabase
      .from("crm_tasks")
      .select("id, title, description, status, priority, due_at, owner_user_id, account_id, contact_id, deal_id, created_by, created_at, updated_at")
      .eq("organization_id", organizationId)
      .eq("id", taskId)
      .is("archived_at", null)
      .maybeSingle();
    if (error) return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить задачу." } };
    return { ok: true, value: data as CrmTask | null };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить задачу." } };
  }
}

/** Resolve references from an already tenant-scoped timeline, with independent read permissions. */
export async function getActivityReferencesForOrganization(
  supabase: ServerSupabase,
  organizationId: string,
  activities: CrmActivity[],
  permissions: ReadonlySet<string>,
): Promise<CrmResult<{
  accountNames: Map<string, string>;
  contactNames: Map<string, string>;
  dealNames: Map<string, string>;
  taskNames: Map<string, string>;
}>> {
  const sources = [
    { table: "crm_accounts", key: "account_id", permission: "accounts.read", column: "name" },
    { table: "crm_deals", key: "deal_id", permission: "deals.read", column: "name" },
    { table: "crm_tasks", key: "task_id", permission: "tasks.read", column: "title" },
    { table: "crm_contacts", key: "contact_id", permission: "contacts.read", column: "first_name, last_name" },
  ] as const;
  try {
    const [accountNames, dealNames, taskNames, contactNames] = await Promise.all(sources.map(async (source) => {
      const names = new Map<string, string>();
      if (!permissions.has(source.permission)) return names;
      const ids = [...new Set(activities.map((activity) => activity[source.key]).filter((id): id is string => Boolean(id)))];
      if (ids.length === 0) return names;
      const { data, error } = await supabase.from(source.table)
        .select(`id, ${source.column}`)
        .eq("organization_id", organizationId)
        .in("id", ids)
        .is("archived_at", null);
      if (error) throw new Error("Unable to load activity references.");
      for (const row of (data ?? []) as unknown as Array<{ id: string; name?: string; title?: string; first_name?: string; last_name?: string | null }>) {
        const name = source.table === "crm_contacts"
          ? [row.first_name, row.last_name].filter(Boolean).join(" ")
          : row[source.column as "name" | "title"];
        if (name !== undefined) names.set(row.id, name);
      }
      return names;
    }));
    return { ok: true, value: { accountNames, contactNames, dealNames, taskNames } };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить связи активностей." } };
  }
}

export async function listTasksForDeal(
  supabase: ServerSupabase,
  organizationId: string,
  dealId: string,
): Promise<CrmResult<CrmTask[]>> {
  try {
    const { data, error } = await supabase.from("crm_tasks")
      .select("id, title, description, status, priority, due_at, owner_user_id, account_id, contact_id, deal_id, created_by, created_at, updated_at")
      .eq("organization_id", organizationId)
      .eq("deal_id", dealId)
      .is("archived_at", null)
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить задачи сделки." } };
    return { ok: true, value: (data ?? []) as CrmTask[] };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить задачи сделки." } };
  }
}

export async function listActivitiesForDeal(
  supabase: ServerSupabase,
  organizationId: string,
  dealId: string,
): Promise<CrmResult<CrmActivity[]>> {
  try {
    const { data, error } = await supabase.from("crm_activities")
      .select("id, type, subject, body, occurred_at, account_id, contact_id, deal_id, task_id, created_by, created_at, updated_at")
      .eq("organization_id", organizationId)
      .eq("deal_id", dealId)
      .is("archived_at", null)
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить активности сделки." } };
    return { ok: true, value: (data ?? []) as CrmActivity[] };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить активности сделки." } };
  }
}

export async function listActivitiesForTask(
  supabase: ServerSupabase,
  organizationId: string,
  taskId: string,
): Promise<CrmResult<CrmActivity[]>> {
  try {
    const { data, error } = await supabase.from("crm_activities")
      .select("id, type, subject, body, occurred_at, account_id, contact_id, deal_id, task_id, created_by, created_at, updated_at")
      .eq("organization_id", organizationId)
      .eq("task_id", taskId)
      .is("archived_at", null)
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить активности задачи." } };
    return { ok: true, value: (data ?? []) as CrmActivity[] };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить активности задачи." } };
  }
}

export async function listTasksForOrganization(
  supabase: ServerSupabase,
  organizationId: string,
): Promise<CrmResult<CrmTask[]>> {
  try {
    const { data, error } = await supabase
      .from("crm_tasks")
      .select("id, title, description, status, priority, due_at, owner_user_id, account_id, contact_id, deal_id, created_by, created_at, updated_at")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить задачи." } };
    return { ok: true, value: (data ?? []) as CrmTask[] };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить задачи." } };
  }
}

export async function listActivitiesForOrganization(
  supabase: ServerSupabase,
  organizationId: string,
): Promise<CrmResult<CrmActivity[]>> {
  try {
    const { data, error } = await supabase
      .from("crm_activities")
      .select("id, type, subject, body, occurred_at, account_id, contact_id, deal_id, task_id, created_by, created_at, updated_at")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("occurred_at", { ascending: false });

    if (error) return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить активности." } };
    return { ok: true, value: (data ?? []) as CrmActivity[] };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить активности." } };
  }
}

export async function listPipelinesForOrganization(
  supabase: ServerSupabase,
  organizationId: string,
): Promise<CrmResult<CrmPipeline[]>> {
  try {
    const { data, error } = await supabase
      .from("crm_pipelines")
      .select("id, name, description, owner_user_id, created_at, updated_at")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("created_at", { ascending: false });

    if (error) return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить воронки." } };
    return { ok: true, value: (data ?? []) as CrmPipeline[] };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить воронки." } };
  }
}

export async function listPipelinesWithStageCountsForOrganization(
  supabase: ServerSupabase,
  organizationId: string,
): Promise<CrmResult<CrmPipelineWithStageCount[]>> {
  const pipelines = await listPipelinesForOrganization(supabase, organizationId);
  if (!pipelines.ok) return pipelines;
  if (pipelines.value.length === 0) return { ok: true, value: [] };

  try {
    const pipelineIds = pipelines.value.map((pipeline) => pipeline.id);
    const { data, error } = await supabase
      .from("crm_pipeline_stages")
      .select("pipeline_id")
      .eq("organization_id", organizationId)
      .in("pipeline_id", pipelineIds)
      .is("archived_at", null);

    if (error) return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить этапы воронок." } };
    const stageCounts = new Map<string, number>();
    for (const row of data ?? []) {
      stageCounts.set(row.pipeline_id, (stageCounts.get(row.pipeline_id) ?? 0) + 1);
    }
    return {
      ok: true,
      value: pipelines.value.map((pipeline) => ({
        ...pipeline,
        active_stage_count: stageCounts.get(pipeline.id) ?? 0,
      })),
    };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить этапы воронок." } };
  }
}

export async function getActivePipelineForOrganization(
  supabase: ServerSupabase,
  organizationId: string,
  pipelineId: string,
): Promise<CrmResult<CrmPipeline | null>> {
  try {
    const { data, error } = await supabase
      .from("crm_pipelines")
      .select("id, name, description, owner_user_id, created_at, updated_at")
      .eq("organization_id", organizationId)
      .eq("id", pipelineId)
      .is("archived_at", null)
      .maybeSingle();

    if (error) return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить воронку." } };
    return { ok: true, value: data as CrmPipeline | null };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить воронку." } };
  }
}

export async function listStagesForPipeline(
  supabase: ServerSupabase,
  organizationId: string,
  pipelineId: string,
): Promise<CrmResult<CrmPipelineStage[]>> {
  try {
    const { data, error } = await supabase
      .from("crm_pipeline_stages")
      .select("id, pipeline_id, name, position, probability, created_at, updated_at")
      .eq("organization_id", organizationId)
      .eq("pipeline_id", pipelineId)
      .is("archived_at", null)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить этапы воронки." } };
    return { ok: true, value: (data ?? []) as CrmPipelineStage[] };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить этапы воронки." } };
  }
}

export async function listActiveStagesForOrganization(
  supabase: ServerSupabase,
  organizationId: string,
): Promise<CrmResult<CrmPipelineStage[]>> {
  try {
    const { data, error } = await supabase
      .from("crm_pipeline_stages")
      .select("id, pipeline_id, name, position, probability, created_at, updated_at")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("position", { ascending: true });

    if (error) return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить этапы воронок." } };
    return { ok: true, value: (data ?? []) as CrmPipelineStage[] };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить этапы воронок." } };
  }
}

export async function getActiveStageForPipeline(
  supabase: ServerSupabase,
  organizationId: string,
  pipelineId: string,
  stageId: string,
): Promise<CrmResult<CrmPipelineStage | null>> {
  try {
    const { data, error } = await supabase
      .from("crm_pipeline_stages")
      .select("id, pipeline_id, name, position, probability, created_at, updated_at")
      .eq("organization_id", organizationId)
      .eq("pipeline_id", pipelineId)
      .eq("id", stageId)
      .is("archived_at", null)
      .maybeSingle();

    if (error) return { ok: false, error: { code: "unavailable", message: "Не удалось проверить выбранный этап." } };
    return { ok: true, value: data as CrmPipelineStage | null };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Не удалось проверить выбранный этап." } };
  }
}

export async function listDealsForOrganization(
  supabase: ServerSupabase,
  organizationId: string,
): Promise<CrmResult<CrmDeal[]>> {
  try {
    const { data, error } = await supabase
      .from("crm_deals")
      .select("id, pipeline_id, stage_id, account_id, contact_id, name, description, amount, currency, owner_user_id, expected_close_date, created_at, updated_at")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("created_at", { ascending: false });

    if (error) return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить сделки." } };
    return { ok: true, value: (data ?? []) as CrmDeal[] };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить сделки." } };
  }
}

export async function listDashboardDealsForOrganization(
  supabase: ServerSupabase,
  organizationId: string,
): Promise<CrmResult<CrmDashboardDeal[]>> {
  try {
    const pageSize = 500;
    const deals: CrmDashboardDeal[] = [];
    let offset = 0;
    let total = 0;

    while (true) {
      const { data, error, count } = await supabase
        .from("crm_deals")
        .select("id, amount, currency, created_at", { count: "exact" })
        .eq("organization_id", organizationId)
        .is("archived_at", null)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error || count === null || count === undefined) {
        return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить аналитику сделок." } };
      }

      const page = (data ?? []) as CrmDashboardDeal[];
      deals.push(...page);
      total = count;
      if (deals.length >= total) break;
      if (page.length === 0) {
        return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить аналитику сделок." } };
      }
      offset += page.length;
    }

    return { ok: true, value: deals };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить аналитику сделок." } };
  }
}

export async function countDashboardAccountsForOrganization(
  supabase: ServerSupabase,
  organizationId: string,
  periodStart: string,
  periodEnd: string,
): Promise<CrmResult<number>> {
  try {
    const { count, error } = await supabase
      .from("crm_accounts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .gte("created_at", periodStart)
      .lt("created_at", periodEnd);

    if (error || count === null || count === undefined) {
      return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить аналитику аккаунтов." } };
    }
    return { ok: true, value: count };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить аналитику аккаунтов." } };
  }
}

export async function countCompletedTasksForOrganization(
  supabase: ServerSupabase,
  organizationId: string,
): Promise<CrmResult<number>> {
  try {
    const { count, error } = await supabase
      .from("crm_tasks")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "completed")
      .is("archived_at", null);

    if (error || count === null || count === undefined) {
      return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить аналитику задач." } };
    }
    return { ok: true, value: count };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить аналитику задач." } };
  }
}

export async function getActiveDealForOrganization(
  supabase: ServerSupabase,
  organizationId: string,
  dealId: string,
): Promise<CrmResult<CrmDeal | null>> {
  try {
    const { data, error } = await supabase
      .from("crm_deals")
      .select("id, pipeline_id, stage_id, account_id, contact_id, name, description, amount, currency, owner_user_id, expected_close_date, created_at, updated_at")
      .eq("organization_id", organizationId)
      .eq("id", dealId)
      .is("archived_at", null)
      .maybeSingle();

    if (error) return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить сделку." } };
    return { ok: true, value: data as CrmDeal | null };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить сделку." } };
  }
}

export async function listAssignableMembersForOrganization(
  supabase: ServerSupabase,
  organizationId: string,
): Promise<CrmResult<CrmMemberOption[]>> {
  try {
    const { data, error } = await supabase
      .from("memberships")
      .select("user_id")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .order("created_at", { ascending: true });

    if (error) return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить список владельцев." } };
    return { ok: true, value: (data ?? []) as CrmMemberOption[] };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить список владельцев." } };
  }
}

export async function isActiveOrganizationMember(
  supabase: ServerSupabase,
  organizationId: string,
  userId: string,
): Promise<CrmResult<boolean>> {
  try {
    const { data, error } = await supabase
      .from("memberships")
      .select("user_id")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();

    if (error) return { ok: false, error: { code: "unavailable", message: "Не удалось проверить выбранного владельца." } };
    return { ok: true, value: Boolean(data) };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Не удалось проверить выбранного владельца." } };
  }
}

export async function listAccountsForOrganization(
  supabase: ServerSupabase,
  organizationId: string,
): Promise<CrmResult<CrmAccount[]>> {
  try {
    const { data, error } = await supabase
      .from("crm_accounts")
      .select("id, name, website, phone, industry, created_at, updated_at")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("name", { ascending: true });

    if (error) {
      return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить аккаунты." } };
    }
    return { ok: true, value: (data ?? []) as CrmAccount[] };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить аккаунты." } };
  }
}

export async function archiveAccountForOrganization(
  supabase: ServerSupabase,
  organizationId: string,
  accountId: string,
): Promise<CrmResult<void>> {
  try {
    const { count, error } = await supabase
      .from("crm_accounts")
      .update({ archived_at: new Date().toISOString() }, { count: "exact" })
      .eq("organization_id", organizationId)
      .eq("id", accountId)
      .is("archived_at", null);

    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[crm.accounts.archive] Supabase UPDATE failed", {
          count,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
          },
        });
      }
      return {
        ok: false,
        error: { code: "unavailable", message: "Не удалось архивировать аккаунт. Попробуйте снова." },
      };
    }
    if (count !== 1) {
      if (process.env.NODE_ENV === "development") {
        console.error("[crm.accounts.archive] Supabase UPDATE affected an unexpected number of rows", {
          count,
        });
      }
      return {
        ok: false,
        error: {
          code: "not_found",
          message: "Этот аккаунт не найден, архивирован или недоступен в активной организации.",
        },
      };
    }

    return { ok: true, value: undefined };
  } catch (error: unknown) {
    if (process.env.NODE_ENV === "development") {
      console.error("[crm.accounts.archive] Supabase UPDATE threw unexpectedly", error);
    }
    return {
      ok: false,
      error: { code: "unavailable", message: "Не удалось архивировать аккаунт. Попробуйте снова." },
    };
  }
}

export async function listContactsForOrganization(
  supabase: ServerSupabase,
  organizationId: string,
): Promise<CrmResult<CrmContact[]>> {
  try {
    const { data, error } = await supabase
      .from("crm_contacts")
      .select("id, first_name, last_name, email, phone, job_title, account_id, created_at, updated_at")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("last_name", { ascending: true, nullsFirst: true })
      .order("first_name", { ascending: true });

    if (error) {
      return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить контакты." } };
    }
    return { ok: true, value: (data ?? []) as CrmContact[] };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить контакты." } };
  }
}

export async function getActiveAccountForOrganization(
  supabase: ServerSupabase,
  organizationId: string,
  accountId: string,
): Promise<CrmResult<CrmAccount | null>> {
  try {
    const { data, error } = await supabase
      .from("crm_accounts")
      .select("id, name, website, phone, industry, created_at, updated_at")
      .eq("organization_id", organizationId)
      .eq("id", accountId)
      .is("archived_at", null)
      .maybeSingle();

    if (error) return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить аккаунт." } };
    return { ok: true, value: data as CrmAccount | null };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить аккаунт." } };
  }
}

export async function listContactsForAccount(
  supabase: ServerSupabase,
  organizationId: string,
  accountId: string,
): Promise<CrmResult<CrmContact[]>> {
  try {
    const { data, error } = await supabase
      .from("crm_contacts")
      .select("id, first_name, last_name, email, phone, job_title, account_id, created_at, updated_at")
      .eq("organization_id", organizationId)
      .eq("account_id", accountId)
      .is("archived_at", null)
      .order("last_name", { ascending: true, nullsFirst: true })
      .order("first_name", { ascending: true });

    if (error) return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить контакты аккаунта." } };
    return { ok: true, value: (data ?? []) as CrmContact[] };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить контакты аккаунта." } };
  }
}

export async function listDealsForAccount(
  supabase: ServerSupabase,
  organizationId: string,
  accountId: string,
): Promise<CrmResult<CrmDeal[]>> {
  try {
    const { data, error } = await supabase
      .from("crm_deals")
      .select("id, pipeline_id, stage_id, account_id, contact_id, name, description, amount, currency, owner_user_id, expected_close_date, created_at, updated_at")
      .eq("organization_id", organizationId)
      .eq("account_id", accountId)
      .is("archived_at", null)
      .order("created_at", { ascending: false });

    if (error) return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить сделки аккаунта." } };
    return { ok: true, value: (data ?? []) as CrmDeal[] };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить сделки аккаунта." } };
  }
}

export async function listTasksForAccount(
  supabase: ServerSupabase,
  organizationId: string,
  accountId: string,
): Promise<CrmResult<CrmTask[]>> {
  try {
    const { data, error } = await supabase
      .from("crm_tasks")
      .select("id, title, description, status, priority, due_at, owner_user_id, account_id, contact_id, deal_id, created_by, created_at, updated_at")
      .eq("organization_id", organizationId)
      .eq("account_id", accountId)
      .is("archived_at", null)
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить задачи аккаунта." } };
    return { ok: true, value: (data ?? []) as CrmTask[] };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить задачи аккаунта." } };
  }
}

export async function listActivitiesForAccount(
  supabase: ServerSupabase,
  organizationId: string,
  accountId: string,
): Promise<CrmResult<CrmActivity[]>> {
  try {
    const { data, error } = await supabase
      .from("crm_activities")
      .select("id, type, subject, body, occurred_at, account_id, contact_id, deal_id, task_id, created_by, created_at, updated_at")
      .eq("organization_id", organizationId)
      .eq("account_id", accountId)
      .is("archived_at", null)
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить активности аккаунта." } };
    return { ok: true, value: (data ?? []) as CrmActivity[] };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Не удалось загрузить активности аккаунта." } };
  }
}
