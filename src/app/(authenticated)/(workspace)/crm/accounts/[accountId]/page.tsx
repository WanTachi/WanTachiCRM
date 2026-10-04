import Link from "next/link";
import type { ReactNode } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { CrmPageNotice } from "@/components/crm/crm-page-notice";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { RelatedDealRecords, RelatedTaskRecords } from "@/components/crm/related-records";
import { ContactForm } from "@/components/crm/contact-form";
import { DealForm } from "@/components/crm/deal-form";
import { TaskForm } from "@/components/crm/task-form";
import { ActivityForm } from "@/components/crm/activity-form";
import { Card } from "@/components/ui/card";
import { createContactAction } from "@/app/actions/crm/contacts";
import { createDealAction } from "@/app/actions/crm/deals";
import { createTaskAction } from "@/app/actions/crm/tasks";
import { createActivityAction } from "@/app/actions/crm/activities";
import { notFoundError, permissionError, resolveCrmAccess } from "@/lib/crm/access";
import {
  getActiveAccountForOrganization,
  listActivitiesForAccount,
  listActiveStagesForOrganization,
  listAssignableMembersForOrganization,
  listContactsForAccount,
  listDealsForAccount,
  listPipelinesForOrganization,
  listTasksForAccount,
} from "@/lib/crm/queries";
import { isCrmRecordId } from "@/lib/crm/validation";
import { buildAccount360ActivityLinks } from "@/lib/crm/account-360";
import type { CrmActivity, CrmContact, CrmDeal, CrmMemberOption, CrmPipeline, CrmPipelineStage, CrmTask } from "@/lib/crm/types";

type AccountPageProps = { params: Promise<{ accountId: string }> };

export default async function AccountDetailPage({ params }: AccountPageProps) {
  const access = await resolveCrmAccess();
  if (!access.ok) return <CrmPageNotice title="Не удалось проверить доступ" message={access.error.message} />;

  const { supabase, organizationId, permissions, userId } = access.value;
  if (!permissions.has("accounts.read")) {
    return <CrmPageNotice title="Нет доступа к аккаунту" message={permissionError("аккаунтам", "read").message} />;
  }

  const { accountId } = await params;
  if (!isCrmRecordId(accountId)) {
    return <CrmPageNotice title="Аккаунт не найден" message={notFoundError("аккаунт").message} />;
  }

  const accountResult = await getActiveAccountForOrganization(supabase, organizationId, accountId);
  if (!accountResult.ok) return <CrmPageNotice title="Не удалось загрузить аккаунт" message={accountResult.error.message} />;
  if (!accountResult.value) return <CrmPageNotice title="Аккаунт не найден" message={notFoundError("аккаунт").message} />;
  const account = accountResult.value;

  const canReadContacts = permissions.has("contacts.read");
  const canReadDeals = permissions.has("deals.read");
  const canReadTasks = permissions.has("tasks.read");
  const canReadActivities = permissions.has("activities.read");
  const canReadPipelines = permissions.has("pipelines.read");
  const canAssignOwners = permissions.has("members.read");
  const canCreateDeals = permissions.has("deals.manage") && canReadPipelines;
  const canCreateTasks = permissions.has("tasks.manage");
  const canCreateActivities = permissions.has("activities.manage");
  const canManageDeals = permissions.has("deals.manage");
  const canManageTasks = permissions.has("tasks.manage");

  const [contactsResult, dealsResult, tasksResult, activitiesResult, pipelinesResult, stagesResult, membersResult] = await Promise.all([
    canReadContacts ? listContactsForAccount(supabase, organizationId, account.id) : Promise.resolve({ ok: true as const, value: [] as CrmContact[] }),
    canReadDeals ? listDealsForAccount(supabase, organizationId, account.id) : Promise.resolve({ ok: true as const, value: [] as CrmDeal[] }),
    canReadTasks ? listTasksForAccount(supabase, organizationId, account.id) : Promise.resolve({ ok: true as const, value: [] as CrmTask[] }),
    canReadActivities ? listActivitiesForAccount(supabase, organizationId, account.id) : Promise.resolve({ ok: true as const, value: [] as CrmActivity[] }),
    canReadPipelines ? listPipelinesForOrganization(supabase, organizationId) : Promise.resolve({ ok: true as const, value: [] as CrmPipeline[] }),
    canReadPipelines ? listActiveStagesForOrganization(supabase, organizationId) : Promise.resolve({ ok: true as const, value: [] as CrmPipelineStage[] }),
    (canCreateDeals || canCreateTasks) && canAssignOwners
      ? listAssignableMembersForOrganization(supabase, organizationId)
      : Promise.resolve({ ok: true as const, value: [] as CrmMemberOption[] }),
  ]);

  if (!contactsResult.ok) return <CrmPageNotice title="Не удалось загрузить контакты" message={contactsResult.error.message} />;
  if (!dealsResult.ok) return <CrmPageNotice title="Не удалось загрузить сделки" message={dealsResult.error.message} />;
  if (!tasksResult.ok) return <CrmPageNotice title="Не удалось загрузить задачи" message={tasksResult.error.message} />;
  if (!activitiesResult.ok) return <CrmPageNotice title="Не удалось загрузить активности" message={activitiesResult.error.message} />;
  if (!pipelinesResult.ok) return <CrmPageNotice title="Не удалось загрузить воронки" message={pipelinesResult.error.message} />;
  if (!stagesResult.ok) return <CrmPageNotice title="Не удалось загрузить этапы" message={stagesResult.error.message} />;
  if (!membersResult.ok) return <CrmPageNotice title="Не удалось загрузить участников" message={membersResult.error.message} />;

  const pipelines = pipelinesResult.value;
  const stages = stagesResult.value;
  const pipelineNames = new Map(pipelines.map((pipeline) => [pipeline.id, pipeline.name]));
  const stageNames = new Map(stages.map((stage) => [stage.id, stage.name]));
  const members = membersResult.value;
  const contactNames = new Map(contactsResult.value.map((contact) => [contact.id, formatContactName(contact)]));
  const dealNames = new Map(dealsResult.value.map((deal) => [deal.id, deal.name]));
  const taskNames = new Map(tasksResult.value.map((task) => [task.id, task.title]));
  const canManageContacts = permissions.has("contacts.manage");

  return (
    <PageContainer>
      <div className="page-heading-row">
        <div className="page-heading-copy">
          <p className="eyebrow">CRM / КЛИЕНТЫ</p>
          <h1 className="page-title">{account.name}</h1>
          <p className="page-intro">Единая карточка компании, связанных продаж и истории взаимодействий.</p>
        </div>
        <div className="table-actions">
          <Link className="button-link button-link--secondary" href="/crm/accounts">Все аккаунты</Link>
          {permissions.has("accounts.manage") ? <Link className="button-link button-link--secondary" href={`/crm/accounts?edit=${account.id}`}>Изменить</Link> : null}
        </div>
      </div>

      <Card className="crm-panel">
        <div className="crm-record-details">
          <span>Сфера: {account.industry || "не указана"}</span>
          <span>Телефон: {account.phone || "не указан"}</span>
          <span>Сайт: {account.website || "не указан"}</span>
          <span>Обновлён: {formatDate(account.updated_at)}</span>
        </div>
      </Card>

      {canReadContacts ? <section className="crm-section" aria-labelledby="account-contacts-heading">
        <div className="crm-list-heading">
          <div><h2 className="section-heading" id="account-contacts-heading">Контакты</h2><p className="section-description">Люди, связанные с аккаунтом</p></div>
          <span className="crm-list-meta">{contactsResult.value.length}</span>
        </div>
        {contactsResult.value.length === 0 ? <EmptyText text="У аккаунта пока нет активных контактов." /> : (
          <div className="crm-record-list">
            {contactsResult.value.map((contact) => <Card className="crm-record" key={contact.id}><div className="crm-record-main"><h3><Link className="crm-text-link" href={`/crm/contacts/${contact.id}`}>{formatContactName(contact)}</Link></h3><div className="crm-record-details"><span>{contact.job_title || "Должность не указана"}</span><span>{contact.email || "Email не указан"}</span><span>{contact.phone || "Телефон не указан"}</span></div></div></Card>)}
          </div>
        )}
      </section> : null}

      {canReadDeals ? <section className="crm-section" aria-labelledby="account-deals-heading">
        <div className="crm-list-heading"><div><h2 className="section-heading" id="account-deals-heading">Сделки</h2><p className="section-description">Активные возможности аккаунта</p></div><span className="crm-list-meta">{dealsResult.value.length}</span></div>
        {dealsResult.value.length === 0 ? <EmptyText text="У аккаунта пока нет активных сделок." /> : <RelatedDealRecords deals={dealsResult.value} pipelineNames={pipelineNames} stageNames={stageNames} canManage={canManageDeals} userId={userId} />}
      </section> : null}

      {canReadTasks ? <section className="crm-section" aria-labelledby="account-tasks-heading">
        <div className="crm-list-heading"><div><h2 className="section-heading" id="account-tasks-heading">Задачи</h2><p className="section-description">Следующие шаги команды</p></div><span className="crm-list-meta">{tasksResult.value.length}</span></div>
        {tasksResult.value.length === 0 ? <EmptyText text="У аккаунта пока нет активных задач." /> : <RelatedTaskRecords tasks={tasksResult.value} canManage={canManageTasks} userId={userId} />}
      </section> : null}

      {canReadActivities ? <section className="crm-section" aria-labelledby="account-activity-heading"><div className="crm-list-heading"><div><h2 className="section-heading" id="account-activity-heading">История взаимодействий</h2><p className="section-description">Хронология активностей по аккаунту</p></div><span className="crm-list-meta">{activitiesResult.value.length}</span></div><ActivityTimeline activities={activitiesResult.value} getLinks={(activity) => buildAccount360ActivityLinks(activity, { contactNames, dealNames, taskNames, canReadContacts, canReadDeals, canReadTasks, canManageContacts, canManageDeals, canManageTasks })} /></section> : null}

      {canManageContacts ? <CreationSection title="Новый контакт" id="create-account-contact"><ContactForm accounts={[account]} canReadAccounts defaultAccountId={account.id} action={createContactAction} /></CreationSection> : null}
      {canCreateDeals ? <CreationSection title="Новая сделка" id="create-account-deal"><DealForm pipelines={pipelines} stages={stages} accounts={[account]} contacts={contactsResult.value} members={members} currentUserId={userId} canAssignOwners={canAssignOwners} canReadAccounts canReadContacts={canReadContacts} defaultAccountId={account.id} action={createDealAction} /></CreationSection> : permissions.has("deals.manage") ? <div className="crm-notice" role="status">Для создания сделки нужно право чтения воронок.</div> : null}
      {canCreateTasks ? <CreationSection title="Новая задача" id="create-account-task"><TaskForm accounts={[account]} contacts={contactsResult.value} deals={dealsResult.value} members={members} currentUserId={userId} canAssignOwners={canAssignOwners} canReadAccounts canReadContacts={canReadContacts} canReadDeals={canReadDeals} defaultAccountId={account.id} action={createTaskAction} /></CreationSection> : null}
      {canCreateActivities ? <CreationSection title="Новая активность" id="create-account-activity"><ActivityForm accounts={[account]} contacts={contactsResult.value} deals={dealsResult.value} tasks={tasksResult.value} canReadAccounts canReadContacts={canReadContacts} canReadDeals={canReadDeals} canReadTasks={canReadTasks} defaultAccountId={account.id} action={createActivityAction} /></CreationSection> : null}
    </PageContainer>
  );
}

function CreationSection({ title, id, children }: { title: string; id: string; children: ReactNode }) {
  return <section className="crm-panel" aria-labelledby={id}><div className="crm-panel-heading"><h2 className="section-heading" id={id}>{title}</h2></div>{children}</section>;
}

function EmptyText({ text }: { text: string }) {
  return <Card className="crm-empty-state"><p>{text}</p></Card>;
}

function formatContactName(contact: CrmContact): string {
  return [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Без имени";
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("ru-RU", { timeZone: "UTC" });
}
