import type { CrmActivity } from "./types";
import { getReadableActivityLink } from "./activity-links";

/** Activity references are resolved from active, organization-scoped records before this helper is called. */
export function buildTask360ActivityLinks(
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
  },
) {
  return [
    getReadableActivityLink("accounts", activity.account_id, references.accountNames, references.canReadAccounts),
    getReadableActivityLink("contacts", activity.contact_id, references.contactNames, references.canReadContacts),
    getReadableActivityLink("deals", activity.deal_id, references.dealNames, references.canReadDeals),
    getReadableActivityLink("tasks", activity.task_id, references.taskNames, references.canReadTasks),
  ].filter((link) => link !== null);
}
