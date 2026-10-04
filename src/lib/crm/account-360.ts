import type { CrmActivity } from "@/lib/crm/types";
import { getReadableActivityLink } from "./activity-links";

export type Account360ActivityLink = {
  label: string;
  value: string;
  href?: string;
};

export function buildAccount360ActivityLinks(
  activity: CrmActivity,
  references: {
    contactNames: ReadonlyMap<string, string>;
    dealNames: ReadonlyMap<string, string>;
    taskNames: ReadonlyMap<string, string>;
    canReadContacts: boolean;
    canReadDeals: boolean;
    canReadTasks: boolean;
    canManageContacts: boolean;
    canManageDeals: boolean;
    canManageTasks: boolean;
  },
): Account360ActivityLink[] {
  const links: Array<Account360ActivityLink | null> = [
    activity.contact_id ? {
      label: "Контакт",
      value: references.contactNames.get(activity.contact_id) ?? "недоступен или архивирован",
      href: getReadableActivityLink("contacts", activity.contact_id, references.contactNames, references.canReadContacts)?.href,
    } : null,
    activity.deal_id ? {
      label: "Сделка",
      value: references.dealNames.get(activity.deal_id) ?? "недоступна или архивирована",
      href: references.canReadDeals ? (references.canManageDeals ? `/crm/deals?edit=${activity.deal_id}` : "/crm/deals") : undefined,
    } : null,
    activity.task_id ? {
      label: "Задача",
      value: references.taskNames.get(activity.task_id) ?? "недоступна или архивирована",
      href: references.canReadTasks ? (references.canManageTasks ? `/crm/tasks?edit=${activity.task_id}` : "/crm/tasks") : undefined,
    } : null,
  ];
  return links.filter((link): link is Account360ActivityLink => link !== null);
}
