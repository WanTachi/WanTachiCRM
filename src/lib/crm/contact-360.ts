import type { CrmAccount, CrmActivity, CrmContact } from "./types";
import { getReadableActivityLink } from "./activity-links";

/** Only offer the actual linked account after it has been loaded with active tenant filters. */
export function getContactAccount(
  contact: Pick<CrmContact, "account_id">,
  account: CrmAccount | null,
  canReadAccounts: boolean,
): CrmAccount | null {
  return canReadAccounts && account && contact.account_id === account.id ? account : null;
}

export function buildContact360ActivityLinks(
  activity: CrmActivity,
  references: {
    accountNames: ReadonlyMap<string, string>;
    dealNames: ReadonlyMap<string, string>;
    taskNames: ReadonlyMap<string, string>;
    canReadAccounts: boolean;
    canReadDeals: boolean;
    canReadTasks: boolean;
    canManageDeals: boolean;
    canManageTasks: boolean;
  },
) {
  const links = [
    getReadableActivityLink("accounts", activity.account_id, references.accountNames, references.canReadAccounts),
    getReadableActivityLink("deals", activity.deal_id, references.dealNames, references.canReadDeals, references.canManageDeals),
    getReadableActivityLink("tasks", activity.task_id, references.taskNames, references.canReadTasks, references.canManageTasks),
  ];
  return links.filter((link) => link !== null);
}
