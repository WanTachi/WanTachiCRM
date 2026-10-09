import { isCrmRecordId } from "./validation";

/** Names must come from active, organization-scoped queries; this is presentation, not authorization. */
export function getReadableActivityLink(
  entity: "accounts" | "contacts" | "deals" | "tasks",
  id: string | null,
  names: ReadonlyMap<string, string>,
  canRead: boolean,
  canManage = false,
): { label: string; value: string; href: string } | null {
  if (!canRead || !isCrmRecordId(id)) return null;
  const value = names.get(id);
  if (value === undefined) return null;
  const labels = { accounts: "Аккаунт", contacts: "Контакт", deals: "Сделка", tasks: "Задача" };
  const href = entity === "accounts" || entity === "contacts" || entity === "deals" || entity === "tasks"
    ? `/crm/${entity}/${id}`
    : canManage ? `/crm/${entity}?edit=${id}` : `/crm/${entity}`;
  return { label: labels[entity], value, href };
}
