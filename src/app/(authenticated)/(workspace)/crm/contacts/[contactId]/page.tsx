import Link from "next/link";
import type { ReactNode } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { CrmPageNotice } from "@/components/crm/crm-page-notice";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { RelatedDealRecords, RelatedTaskRecords } from "@/components/crm/related-records";
import { DealForm } from "@/components/crm/deal-form";
import { TaskForm } from "@/components/crm/task-form";
import { ActivityForm } from "@/components/crm/activity-form";
import { Card } from "@/components/ui/card";
import { createDealAction } from "@/app/actions/crm/deals";
import { createTaskAction } from "@/app/actions/crm/tasks";
import { createActivityAction } from "@/app/actions/crm/activities";
import { notFoundError, permissionError, resolveCrmAccess } from "@/lib/crm/access";
import {
  getActiveAccountForOrganization,
  getActiveContactForOrganization,
  getContactActivityReferencesForOrganization,
  listActivitiesForContact,
  listActiveStagesForOrganization,
  listAssignableMembersForOrganization,
  listDealsForContact,
  listPipelinesForOrganization,
  listTasksForContact,
} from "@/lib/crm/queries";
import { isCrmRecordId } from "@/lib/crm/validation";
import { buildContact360ActivityLinks, getContactAccount } from "@/lib/crm/contact-360";
import type { CrmActivity, CrmDeal, CrmMemberOption, CrmPipeline, CrmPipelineStage, CrmTask } from "@/lib/crm/types";

type ContactPageProps = { params: Promise<{ contactId: string }> };

export default async function ContactDetailPage({ params }: ContactPageProps) {
  const access = await resolveCrmAccess();
  if (!access.ok) return <CrmPageNotice title="Не удалось проверить доступ" message={access.error.message} />;
  const { supabase, organizationId, permissions, userId } = access.value;
  if (!permissions.has("contacts.read")) {
    return <CrmPageNotice title="Нет доступа к контакту" message={permissionError("контактам", "read").message} />;
  }

  const { contactId } = await params;
  if (!isCrmRecordId(contactId)) return <CrmPageNotice title="Контакт не найден" message={notFoundError("контакт").message} />;
  const contactResult = await getActiveContactForOrganization(supabase, organizationId, contactId);
  if (!contactResult.ok) return <CrmPageNotice title="Не удалось загрузить контакт" message={contactResult.error.message} />;
  if (!contactResult.value) return <CrmPageNotice title="Контакт не найден" message={notFoundError("контакт").message} />;
  const contact = contactResult.value;

  const canReadAccounts = permissions.has("accounts.read");
  const canReadDeals = permissions.has("deals.read");
  const canReadTasks = permissions.has("tasks.read");
  const canReadActivities = permissions.has("activities.read");
  const canReadPipelines = permissions.has("pipelines.read");
  const canManageDeals = permissions.has("deals.manage");
  const canManageTasks = permissions.has("tasks.manage");
  const canManageActivities = permissions.has("activities.manage");
  const canCreateDeals = canManageDeals && canReadPipelines;
  const canAssignOwners = permissions.has("members.read");
  const loadPipelines = canReadPipelines && (canReadDeals || canCreateDeals);

  const [accountResult, dealsResult, tasksResult, activitiesResult, pipelinesResult, stagesResult, membersResult] = await Promise.all([
    canReadAccounts && contact.account_id
      ? getActiveAccountForOrganization(supabase, organizationId, contact.account_id)
      : Promise.resolve({ ok: true as const, value: null }),
    canReadDeals ? listDealsForContact(supabase, organizationId, contact.id) : empty<CrmDeal>(),
    canReadTasks ? listTasksForContact(supabase, organizationId, contact.id) : empty<CrmTask>(),
    canReadActivities ? listActivitiesForContact(supabase, organizationId, contact.id) : empty<CrmActivity>(),
    loadPipelines ? listPipelinesForOrganization(supabase, organizationId) : empty<CrmPipeline>(),
    loadPipelines ? listActiveStagesForOrganization(supabase, organizationId) : empty<CrmPipelineStage>(),
    (canCreateDeals || canManageTasks) && canAssignOwners
      ? listAssignableMembersForOrganization(supabase, organizationId)
      : empty<CrmMemberOption>(),
  ]);

  if (!accountResult.ok) return <CrmPageNotice title="Не удалось загрузить аккаунт" message={accountResult.error.message} />;
  if (!dealsResult.ok) return <CrmPageNotice title="Не удалось загрузить сделки" message={dealsResult.error.message} />;
  if (!tasksResult.ok) return <CrmPageNotice title="Не удалось загрузить задачи" message={tasksResult.error.message} />;
  if (!activitiesResult.ok) return <CrmPageNotice title="Не удалось загрузить активности" message={activitiesResult.error.message} />;
  if (!pipelinesResult.ok) return <CrmPageNotice title="Не удалось загрузить воронки" message={pipelinesResult.error.message} />;
  if (!stagesResult.ok) return <CrmPageNotice title="Не удалось загрузить этапы" message={stagesResult.error.message} />;
  if (!membersResult.ok) return <CrmPageNotice title="Не удалось загрузить участников" message={membersResult.error.message} />;

  const referencesResult = await getContactActivityReferencesForOrganization(
    supabase, organizationId, activitiesResult.value, permissions,
  );
  if (!referencesResult.ok) return <CrmPageNotice title="Не удалось загрузить связи активностей" message={referencesResult.error.message} />;

  const account = getContactAccount(contact, accountResult.value, canReadAccounts);
  const accounts = account ? [account] : [];
  const contacts = [contact];
  const pipelines = pipelinesResult.value;
  const stages = stagesResult.value;
  const hasPipelineWithStages = pipelines.some((pipeline) => stages.some((stage) => stage.pipeline_id === pipeline.id));
  const pipelineNames = new Map(pipelines.map((pipeline) => [pipeline.id, pipeline.name]));
  const stageNames = new Map(stages.map((stage) => [stage.id, stage.name]));
  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(" ");
  const prefillKey = `${contact.id}:${account?.id ?? ""}`;

  return (
    <PageContainer>
      <div className="page-heading-row">
        <div className="page-heading-copy">
          <p className="eyebrow">CRM / КЛИЕНТЫ</p>
          <h1 className="page-title">{fullName}</h1>
          <p className="page-intro">Контакт, связанные сделки, задачи и история взаимодействий.</p>
        </div>
        <div className="table-actions">
          <Link className="button-link button-link--secondary" href="/crm/contacts">Все контакты</Link>
          {permissions.has("contacts.manage") ? <Link className="button-link button-link--secondary" href={`/crm/contacts?edit=${contact.id}`}>Изменить контакт</Link> : null}
        </div>
      </div>

      <Card className="crm-panel">
        <div className="crm-record-details">
          <span>Имя: {contact.first_name}</span>
          <span>Фамилия: {contact.last_name || "не указана"}</span>
          <span>Email: {contact.email || "не указан"}</span>
          <span>Телефон: {contact.phone || "не указан"}</span>
          <span>Должность: {contact.job_title || "не указана"}</span>
          {canReadAccounts ? <span>Аккаунт: {account
            ? <Link className="crm-text-link" href={`/crm/accounts/${account.id}`}>{account.name}</Link>
            : contact.account_id ? "недоступен или архивирован" : "без аккаунта"}</span> : null}
          <span>Создан: {formatDate(contact.created_at)}</span>
          <span>Обновлён: {formatDate(contact.updated_at)}</span>
        </div>
      </Card>

      {canReadDeals ? (
        <section className="crm-section" aria-labelledby="contact-deals-heading">
          <div className="crm-list-heading">
            <div><h2 className="section-heading" id="contact-deals-heading">Сделки</h2><p className="section-description">Сделки, связанные с контактом</p></div>
            <span className="crm-list-meta">{dealsResult.value.length}</span>
          </div>
          {dealsResult.value.length === 0
            ? <Card className="crm-empty-state"><p>У контакта пока нет активных сделок.</p></Card>
            : <RelatedDealRecords deals={dealsResult.value} pipelineNames={pipelineNames} stageNames={stageNames} canManage={canCreateDeals} userId={userId} />}
        </section>
      ) : null}

      {canReadTasks ? (
        <section className="crm-section" aria-labelledby="contact-tasks-heading">
          <div className="crm-list-heading">
            <div><h2 className="section-heading" id="contact-tasks-heading">Задачи</h2><p className="section-description">Следующие шаги по контакту</p></div>
            <span className="crm-list-meta">{tasksResult.value.length}</span>
          </div>
          {tasksResult.value.length === 0
            ? <Card className="crm-empty-state"><p>У контакта пока нет активных задач.</p></Card>
            : <RelatedTaskRecords tasks={tasksResult.value} canManage={canManageTasks} userId={userId} />}
        </section>
      ) : null}

      {canReadActivities ? (
        <section className="crm-section" aria-labelledby="contact-activities-heading">
          <div className="crm-list-heading">
            <div><h2 className="section-heading" id="contact-activities-heading">История взаимодействий</h2><p className="section-description">Заметки, звонки, встречи и письма по контакту</p></div>
            <span className="crm-list-meta">{activitiesResult.value.length}</span>
          </div>
          <ActivityTimeline activities={activitiesResult.value} getLinks={(activity) => buildContact360ActivityLinks(activity, {
            ...referencesResult.value, canReadAccounts, canReadDeals, canReadTasks,
            canManageDeals: canCreateDeals, canManageTasks,
          })} />
        </section>
      ) : null}

      {canCreateDeals ? (
        <CreationSection title="Новая сделка" id="create-contact-deal">
          {hasPipelineWithStages ? <DealForm
            key={prefillKey} pipelines={pipelines} stages={stages} accounts={accounts} contacts={contacts}
            members={membersResult.value} currentUserId={userId} canAssignOwners={canAssignOwners}
            canReadAccounts={canReadAccounts} canReadContacts defaultAccountId={account?.id}
            defaultContactId={contact.id} action={createDealAction}
          /> : <div className="crm-empty-state"><p>Для создания сделки нужна активная воронка с этапами.</p><Link className="crm-text-link" href="/crm/pipelines">Перейти к воронкам</Link></div>}
        </CreationSection>
      ) : canManageDeals ? <div className="crm-notice" role="status">Для создания сделки нужно право чтения воронок.</div> : null}

      {canManageTasks ? (
        <CreationSection title="Новая задача" id="create-contact-task">
          <TaskForm
            key={prefillKey} accounts={accounts} contacts={contacts} deals={dealsResult.value}
            members={membersResult.value} currentUserId={userId} canAssignOwners={canAssignOwners}
            canReadAccounts={canReadAccounts} canReadContacts canReadDeals={canReadDeals}
            defaultAccountId={account?.id} defaultContactId={contact.id} action={createTaskAction}
          />
        </CreationSection>
      ) : null}

      {canManageActivities ? (
        <CreationSection title="Новая активность" id="create-contact-activity">
          <ActivityForm
            key={prefillKey} accounts={accounts} contacts={contacts} deals={dealsResult.value} tasks={tasksResult.value}
            canReadAccounts={canReadAccounts} canReadContacts canReadDeals={canReadDeals} canReadTasks={canReadTasks}
            defaultAccountId={account?.id} defaultContactId={contact.id} action={createActivityAction}
          />
        </CreationSection>
      ) : null}
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
