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

export function permissionError(
  resource: "аккаунтам" | "контактам" | "воронкам" | "этапам" | "сделкам",
  mode: "read" | "manage",
): CrmActionError {
  const operation = mode === "read" ? "просматривать" : "изменять";
  const resourceName = {
    аккаунтам: "аккаунты",
    контактам: "контакты",
    воронкам: "воронки",
    этапам: "этапы",
    сделкам: "сделки",
  }[resource];
  return { code: "forbidden", message: `У вас нет разрешения ${operation} ${resourceName}.` };
}

export function unavailableError(message: string): CrmActionError {
  return { code: "unavailable", message };
}

export function notFoundError(record: "аккаунт" | "контакт" | "воронка" | "этап" | "сделка"): CrmActionError {
  const feminine = record === "воронка" || record === "сделка";
  const article = feminine ? "Эта" : "Этот";
  const unavailable = feminine ? "не найдена, архивирована или недоступна" : "не найден, архивирован или недоступен";
  return {
    code: "not_found",
    message: `${article} ${record} ${unavailable} в активной организации.`,
  };
}
