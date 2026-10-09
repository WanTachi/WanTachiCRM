import type { CrmAccount, CrmActivity, CrmContact, CrmDeal } from "./types";
import { getReadableActivityLink } from "./activity-links";

/** Inputs must already be loaded through active, organization-scoped queries. */
export function getDealRelationships(
  deal: Pick<CrmDeal, "account_id" | "contact_id">,
  records: { account: CrmAccount | null; contact: CrmContact | null; canReadAccounts: boolean; canReadContacts: boolean },
) {
  return {
    account: records.canReadAccounts && records.account?.id === deal.account_id ? records.account : null,
    contact: records.canReadContacts && records.contact?.id === deal.contact_id ? records.contact : null,
  };
}

export function buildDeal360ActivityLinks(
  activity: CrmActivity,
  references: {
    accountNames: ReadonlyMap<string, string>;
    contactNames: ReadonlyMap<string, string>;
    dealNames: ReadonlyMap<string, string>;
    taskNames: ReadonlyMap<string, string>;
    canReadAccounts: boolean;
    canReadContacts: boolean;
    canReadDeals: boolean;
    canReadTasks: boolean;
    canManageTasks: boolean;
  },
) {
  return [
    getReadableActivityLink("accounts", activity.account_id, references.accountNames, references.canReadAccounts),
    getReadableActivityLink("contacts", activity.contact_id, references.contactNames, references.canReadContacts),
    getReadableActivityLink("deals", activity.deal_id, references.dealNames, references.canReadDeals),
    getReadableActivityLink("tasks", activity.task_id, references.taskNames, references.canReadTasks, references.canManageTasks),
  ].filter((link) => link !== null);
}
