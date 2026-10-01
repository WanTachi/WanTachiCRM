import { unstable_rethrow } from "next/navigation";
import { getOrganizationPermissions } from "@/lib/auth/permissions";
import { getWorkspaceOrganization } from "@/lib/auth/organizations";
import { requireAuthenticatedUser } from "@/lib/auth/guards";
import type { CrmAccess, CrmActionError, CrmResult } from "@/lib/crm/types";

export async function resolveCrmAccess(): Promise<CrmResult<CrmAccess>> {
  try {
    const { supabase, user } = await requireAuthenticatedUser();
    const workspace = await getWorkspaceOrganization(supabase, user);
    const permissions = await getOrganizationPermissions(
      supabase,
      user.id,
      workspace.organization.id,
    );

    return {
      ok: true,
      value: {
        supabase,
        userId: user.id,
        organizationId: workspace.organization.id,
        permissions,
      },
    };
  } catch (error) {
    unstable_rethrow(error);
    return {
      ok: false,
      error: {
        code: "unavailable",
        message: "Не удалось проверить доступ. Обновите страницу и попробуйте снова.",
      },
    };
  }
}

export function permissionError(resource: "аккаунтам" | "контактам", mode: "read" | "manage"): CrmActionError {
  const operation = mode === "read" ? "просматривать" : "изменять";
  return {
    code: "forbidden",
    message: `У вас нет разрешения ${operation} ${resource}.`,
  };
}

export function unavailableError(message: string): CrmActionError {
  return { code: "unavailable", message };
}

export function notFoundError(record: "аккаунт" | "контакт"): CrmActionError {
  return {
    code: "not_found",
    message: `Этот ${record} не найден, архивирован или недоступен в активной организации.`,
  };
}
