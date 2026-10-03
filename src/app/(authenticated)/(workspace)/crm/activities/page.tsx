import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";
import { CrmPageNotice } from "@/components/crm/crm-page-notice";
import { ActivityForm } from "@/components/crm/activity-form";
import { Card } from "@/components/ui/card";
import {
  listAccountsForOrganization,
  listActivitiesForOrganization,
  listContactsForOrganization,
  listDealsForOrganization,
  listTasksForOrganization,
} from "@/lib/crm/queries";
import { permissionError, resolveCrmAccess } from "@/lib/crm/access";
import { createActivityAction } from "@/app/actions/crm/activities";
import type { CrmAccount, CrmActivity, CrmContact, CrmDeal, CrmTask } from "@/lib/crm/types";

const activityLabels: Record<CrmActivity["type"], string> = {
  note: "Заметка",
  call: "Звонок",
  meeting: "Встреча",
  email: "Письмо",
  other: "Другое",
};

export default async function ActivitiesPage() {
  const access = await resolveCrmAccess();
  if (!access.ok) return <CrmPageNotice title="Не удалось проверить доступ" message={access.error.message} />;

  const { supabase, organizationId, permissions } = access.value;
  const canRead = permissions.has("activities.read");
  const canManage = permissions.has("activities.manage");
  const canReadAccounts = permissions.has("accounts.read");
  const canReadContacts = permissions.has("contacts.read");
  const canReadDeals = permissions.has("deals.read");
  const canReadTasks = permissions.has("tasks.read");
  if (!canRead && !canManage) {
    return <CrmPageNotice title="Нет доступа к активностям" message={permissionError("активностям", "read").message} />;
  }

  const [activitiesResult, accountsResult, contactsResult, dealsResult, tasksResult] = await Promise.all([
    canRead ? listActivitiesForOrganization(supabase, organizationId) : Promise.resolve({ ok: true as const, value: [] as CrmActivity[] }),
    canReadAccounts ? listAccountsForOrganization(supabase, organizationId) : Promise.resolve({ ok: true as const, value: [] as CrmAccount[] }),
    canReadContacts ? listContactsForOrganization(supabase, organizationId) : Promise.resolve({ ok: true as const, value: [] as CrmContact[] }),
    canReadDeals ? listDealsForOrganization(supabase, organizationId) : Promise.resolve({ ok: true as const, value: [] as CrmDeal[] }),
    canReadTasks ? listTasksForOrganization(supabase, organizationId) : Promise.resolve({ ok: true as const, value: [] as CrmTask[] }),
  ]);

  if (!activitiesResult.ok) return <CrmPageNotice title="Не удалось загрузить активности" message={activitiesResult.error.message} />;
  if (!accountsResult.ok) return <CrmPageNotice title="Не удалось загрузить аккаунты" message={accountsResult.error.message} />;
  if (!contactsResult.ok) return <CrmPageNotice title="Не удалось загрузить контакты" message={contactsResult.error.message} />;
  if (!dealsResult.ok) return <CrmPageNotice title="Не удалось загрузить сделки" message={dealsResult.error.message} />;
  if (!tasksResult.ok) return <CrmPageNotice title="Не удалось загрузить задачи" message={tasksResult.error.message} />;

  const accountNames = new Map(accountsResult.value.map((account) => [account.id, account.name]));
  const contactNames = new Map(contactsResult.value.map((contact) => [contact.id, [contact.first_name, contact.last_name].filter(Boolean).join(" ")]));
  const dealNames = new Map(dealsResult.value.map((deal) => [deal.id, deal.name]));
  const taskNames = new Map(tasksResult.value.map((task) => [task.id, task.title]));

  return (
    <PageContainer>
      <div className="page-heading-row">
        <div className="page-heading-copy">
          <p className="eyebrow">CRM / ВЗАИМОДЕЙСТВИЯ</p>
          <h1 className="page-title">Активности</h1>
          <p className="page-intro">Фиксируйте заметки, звонки, встречи и письма в карточках клиентов и задач.</p>
        </div>
        {canRead ? <span className="page-heading-meta">{activitiesResult.value.length} всего</span> : null}
      </div>

      {!canRead && canManage ? <div className="crm-notice" role="status">Вы можете добавлять активности, но не просматривать существующие.</div> : null}

      {canManage ? (
        <section className="crm-panel" aria-labelledby="create-activity-heading">
          <div className="crm-panel-heading">
            <h2 className="section-heading" id="create-activity-heading">Новая активность</h2>
          </div>
          <ActivityForm
            accounts={accountsResult.value}
            contacts={contactsResult.value}
            deals={dealsResult.value}
            tasks={tasksResult.value}
            canReadAccounts={canReadAccounts}
            canReadContacts={canReadContacts}
            canReadDeals={canReadDeals}
            canReadTasks={canReadTasks}
            action={createActivityAction}
          />
        </section>
      ) : null}

      {canRead ? (
        <section className="crm-section" aria-labelledby="activities-list-heading">
          <div className="crm-list-heading">
            <h2 className="section-heading" id="activities-list-heading">История активностей</h2>
            <span className="crm-list-meta">{activitiesResult.value.length} показано</span>
          </div>
          {activitiesResult.value.length === 0 ? (
            <Card className="crm-empty-state">
              <h3>Активностей пока нет</h3>
              <p>{canManage ? "Добавьте заметку, звонок или встречу, чтобы сохранить историю взаимодействий." : "Когда команда добавит активности, они появятся здесь."}</p>
            </Card>
          ) : (
            <div className="crm-record-list">
              {activitiesResult.value.map((activity) => (
                <Card className="crm-record" key={activity.id}>
                  <div className="crm-record-main">
                    <h3>{activity.subject || activityLabels[activity.type]}</h3>
                    <div className="crm-record-details">
                      <span>Тип: {activityLabels[activity.type]}</span>
                      <span>Событие: {formatOccurredAt(activity.occurred_at)}</span>
                      {activity.account_id ? <Association href={canReadAccounts ? `/crm/accounts/${activity.account_id}` : undefined} label="Аккаунт" value={accountNames.get(activity.account_id) ?? "недоступен или архивирован"} /> : null}
                      {activity.contact_id ? <Association href={canReadContacts ? `/crm/contacts?edit=${activity.contact_id}` : undefined} label="Контакт" value={contactNames.get(activity.contact_id) ?? "недоступен или архивирован"} /> : null}
                      {activity.deal_id ? <Association href={canReadDeals ? `/crm/deals?edit=${activity.deal_id}` : undefined} label="Сделка" value={dealNames.get(activity.deal_id) ?? "недоступна или архивирована"} /> : null}
                      {activity.task_id ? <Association href={canReadTasks ? `/crm/tasks?edit=${activity.task_id}` : undefined} label="Задача" value={taskNames.get(activity.task_id) ?? "недоступна или архивирована"} /> : null}
                    </div>
                    {activity.body ? <p className="crm-record-body">{activity.body}</p> : null}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </PageContainer>
  );
}

function Association({ href, label, value }: { href?: string; label: string; value: string }) {
  return (
    <span>
      {label}: {href ? <Link className="crm-text-link" href={href}>{value}</Link> : value}
    </span>
  );
}

function formatOccurredAt(value: string): string {
  return `${new Date(value).toLocaleString("ru-RU", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  })} UTC`;
}
