import type { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CrmAccount, CrmContact, CrmResult } from "@/lib/crm/types";

type ServerSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

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
