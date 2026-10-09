import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { CrmPageNotice } from "@/components/crm/crm-page-notice";
import { RelatedTaskRecords } from "@/components/crm/related-records";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { TaskForm } from "@/components/crm/task-form";
import { ActivityForm } from "@/components/crm/activity-form";
import { Card } from "@/components/ui/card";
import { createTaskAction } from "@/app/actions/crm/tasks";
import { createActivityAction } from "@/app/actions/crm/activities";
import { permissionError, resolveCrmAccess } from "@/lib/crm/access";
import { isCrmRecordId } from "@/lib/crm/validation";
import { buildDeal360ActivityLinks, getDealRelationships } from "@/lib/crm/deal-360";
import {
  getActiveAccountForOrganization,
  getActiveContactForOrganization,
  getActiveDealForOrganization,
  getActivePipelineForOrganization,
  getActiveStageForPipeline,
  getActivityReferencesForOrganization,
  listActivitiesForDeal,
  listAssignableMembersForOrganization,
  listTasksForDeal,
} from "@/lib/crm/queries";
import type { CrmActivity, CrmMemberOption, CrmTask } from "@/lib/crm/types";

export default async function DealDetailPage({ params }: { params: Promise<{ dealId: string }> }) {
  const access = await resolveCrmAccess();
  if (!access.ok) return <CrmPageNotice title="Не удалось проверить доступ" message={access.error.message} />;
  const { supabase, organizationId, permissions, userId } = access.value;
  if (!permissions.has("deals.read")) {
    return <CrmPageNotice title="Нет доступа к сделке" message={permissionError("сделкам", "read").message} />;
  }

  const { dealId } = await params;
  if (!isCrmRecordId(dealId)) notFound();
  const dealResult = await getActiveDealForOrganization(supabase, organizationId, dealId);
  if (!dealResult.ok) return <CrmPageNotice title="Не удалось загрузить сделку" message={dealResult.error.message} />;
  if (!dealResult.value) notFound();
  const deal = dealResult.value;

  const canReadAccounts = permissions.has("accounts.read");
  const canReadContacts = permissions.has("contacts.read");
  const canReadPipelines = permissions.has("pipelines.read");
  const canReadTasks = permissions.has("tasks.read");
  const canReadActivities = permissions.has("activities.read");
  const canManageDeals = permissions.has("deals.manage");
  const canManageTasks = permissions.has("tasks.manage");
  const canManageActivities = permissions.has("activities.manage");
  const canAssignOwners = permissions.has("members.read");

  const [accountResult, contactResult, pipelineResult, stageResult, tasksResult, activitiesResult, membersResult] = await Promise.all([
    canReadAccounts && deal.account_id
      ? getActiveAccountForOrganization(supabase, organizationId, deal.account_id)
      : { ok: true as const, value: null },
    canReadContacts && deal.contact_id
      ? getActiveContactForOrganization(supabase, organizationId, deal.contact_id)
      : { ok: true as const, value: null },
    canReadPipelines
      ? getActivePipelineForOrganization(supabase, organizationId, deal.pipeline_id)
      : { ok: true as const, value: null },
    canReadPipelines
      ? getActiveStageForPipeline(supabase, organizationId, deal.pipeline_id, deal.stage_id)
      : { ok: true as const, value: null },
    canReadTasks ? listTasksForDeal(supabase, organizationId, deal.id) : empty<CrmTask>(),
    canReadActivities ? listActivitiesForDeal(supabase, organizationId, deal.id) : empty<CrmActivity>(),
    canManageTasks && canAssignOwners
      ? listAssignableMembersForOrganization(supabase, organizationId)
      : empty<CrmMemberOption>(),
  ]);

  if (!accountResult.ok) return <CrmPageNotice title="Не удалось загрузить аккаунт" message={accountResult.error.message} />;
  if (!contactResult.ok) return <CrmPageNotice title="Не удалось загрузить контакт" message={contactResult.error.message} />;
  if (!pipelineResult.ok) return <CrmPageNotice title="Не удалось загрузить воронку" message={pipelineResult.error.message} />;
  if (!stageResult.ok) return <CrmPageNotice title="Не удалось загрузить этап" message={stageResult.error.message} />;
  if (!tasksResult.ok) return <CrmPageNotice title="Не удалось загрузить задачи" message={tasksResult.error.message} />;
  if (!activitiesResult.ok) return <CrmPageNotice title="Не удалось загрузить активности" message={activitiesResult.error.message} />;
  if (!membersResult.ok) return <CrmPageNotice title="Не удалось загрузить участников" message={membersResult.error.message} />;

  const referencesResult = await getActivityReferencesForOrganization(supabase, organizationId, activitiesResult.value, permissions);
  if (!referencesResult.ok) return <CrmPageNotice title="Не удалось загрузить связи активностей" message={referencesResult.error.message} />;
  const { account, contact } = getDealRelationships(deal, {
    account: accountResult.value, contact: contactResult.value, canReadAccounts, canReadContacts,
  });
  const pipeline = pipelineResult.value;
  const stage = pipeline ? stageResult.value : null;
  const accounts = account ? [account] : [];
  const contacts = contact ? [contact] : [];
  const prefillKey = `${deal.id}:${account?.id ?? ""}:${contact?.id ?? ""}`;

  return (
    <PageContainer>
      <div className="page-heading-row">
        <div className="page-heading-copy">
          <p className="eyebrow">CRM / ПРОДАЖИ</p>
          <h1 className="page-title">{deal.name}</h1>
          <p className="page-intro">Сделка, клиент, следующие шаги и история взаимодействий.</p>
        </div>
        <div className="table-actions">
          <Link className="button-link button-link--secondary" href="/crm/deals">Все сделки</Link>
          {canManageDeals ? <Link className="button-link button-link--secondary" href={`/crm/deals?edit=${deal.id}`}>Изменить сделку</Link> : null}
        </div>
      </div>

      <Card className="crm-panel">
        <div className="crm-record-details">
          <span>Сумма: {deal.amount === null || deal.amount === "" ? "не указана" : `${deal.amount} ${deal.currency ?? ""}`.trim()}</span>
          {canReadPipelines ? <>
            <span>Воронка: {pipeline ? <Link className="crm-text-link" href={`/crm/pipelines/${pipeline.id}`}>{pipeline.name}</Link> : "недоступна или архивирована"}</span>
            <span>Этап: {stage?.name ?? "недоступен или архивирован"}</span>
          </> : null}
          <span>Ожидаемое закрытие: {deal.expected_close_date ? formatDate(deal.expected_close_date) : "не указано"}</span>
          <span>Владелец: {deal.owner_user_id === userId ? "Вы" : deal.owner_user_id ? "участник команды" : "не назначен"}</span>
          {canReadAccounts ? <span>Аккаунт: {account
            ? <Link className="crm-text-link" href={`/crm/accounts/${account.id}`}>{account.name}</Link>
            : deal.account_id ? "недоступен или архивирован" : "без аккаунта"}</span> : null}
          {canReadContacts ? <span>Контакт: {contact
            ? <Link className="crm-text-link" href={`/crm/contacts/${contact.id}`}>{[contact.first_name, contact.last_name].filter(Boolean).join(" ")}</Link>
            : deal.contact_id ? "недоступен или архивирован" : "без контакта"}</span> : null}
          <span>Создана: {formatDate(deal.created_at)}</span>
          <span>Обновлена: {formatDate(deal.updated_at)}</span>
        </div>
        {deal.description ? <p className="crm-record-body">{deal.description}</p> : null}
      </Card>

      {canReadTasks ? <section className="crm-section" aria-labelledby="deal-tasks-heading">
        <div className="crm-list-heading">
          <div><h2 className="section-heading" id="deal-tasks-heading">Задачи</h2><p className="section-description">Следующие шаги по сделке</p></div>
          <span className="crm-list-meta">{tasksResult.value.length}</span>
        </div>
        {tasksResult.value.length === 0 ? <Card className="crm-empty-state"><p>У сделки пока нет активных задач.</p></Card>
          : <RelatedTaskRecords tasks={tasksResult.value} canManage={canManageTasks} userId={userId} />}
      </section> : null}

      {canReadActivities ? <section className="crm-section" aria-labelledby="deal-activities-heading">
        <div className="crm-list-heading">
          <div><h2 className="section-heading" id="deal-activities-heading">История взаимодействий</h2><p className="section-description">Заметки, звонки, встречи и письма по сделке</p></div>
          <span className="crm-list-meta">{activitiesResult.value.length}</span>
        </div>
        <ActivityTimeline activities={activitiesResult.value} getLinks={(activity) => buildDeal360ActivityLinks(activity, {
          ...referencesResult.value, canReadAccounts, canReadContacts, canReadDeals: true, canReadTasks, canManageTasks,
        })} />
      </section> : null}

      {canManageTasks ? <CreationSection title="Новая задача" id="create-deal-task">
        <TaskForm key={prefillKey} accounts={accounts} contacts={contacts} deals={[deal]}
          members={membersResult.value} currentUserId={userId} canAssignOwners={canAssignOwners}
          canReadAccounts={canReadAccounts} canReadContacts={canReadContacts} canReadDeals
          defaultAccountId={account?.id} defaultContactId={contact?.id} defaultDealId={deal.id} action={createTaskAction} />
      </CreationSection> : null}

      {canManageActivities ? <CreationSection title="Новая активность" id="create-deal-activity">
        <ActivityForm key={prefillKey} accounts={accounts} contacts={contacts} deals={[deal]} tasks={tasksResult.value}
          canReadAccounts={canReadAccounts} canReadContacts={canReadContacts} canReadDeals canReadTasks={canReadTasks}
          defaultAccountId={account?.id} defaultContactId={contact?.id} defaultDealId={deal.id} action={createActivityAction} />
      </CreationSection> : null}
    </PageContainer>
  );
}

function empty<T>() {
  return { ok: true as const, value: [] as T[] };
}

function CreationSection({ title, id, children }: { title: string; id: string; children: ReactNode }) {
  return <section className="crm-panel" aria-labelledby={id}><div className="crm-panel-heading"><h2 className="section-heading" id={id}>{title}</h2></div>{children}</section>;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("ru-RU", { timeZone: "UTC" });
}
