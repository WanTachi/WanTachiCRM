import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { CrmPageNotice } from "@/components/crm/crm-page-notice";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { ActivityForm } from "@/components/crm/activity-form";
import { TaskForm } from "@/components/crm/task-form";
import { Card } from "@/components/ui/card";
import { createActivityAction } from "@/app/actions/crm/activities";
import { updateTaskAction } from "@/app/actions/crm/tasks";
import { permissionError, resolveCrmAccess } from "@/lib/crm/access";
import { buildTask360ActivityLinks } from "@/lib/crm/task-360";
import { isCrmRecordId } from "@/lib/crm/validation";
import {
  getActiveAccountForOrganization,
  getActiveContactForOrganization,
  getActiveDealForOrganization,
  getActiveTaskForOrganization,
  getActivityReferencesForOrganization,
  listActivitiesForTask,
  listAssignableMembersForOrganization,
} from "@/lib/crm/queries";
import type { CrmActivity, CrmAccount, CrmContact, CrmDeal, CrmMemberOption } from "@/lib/crm/types";

const statusLabels = {
  open: "Открыта",
  in_progress: "В работе",
  completed: "Завершена",
  cancelled: "Отменена",
} as const;
const priorityLabels = {
  low: "Низкий",
  normal: "Обычный",
  high: "Высокий",
  urgent: "Срочный",
} as const;

type TaskPageProps = { params: Promise<{ taskId: string }> };

export default async function TaskDetailPage({ params }: TaskPageProps) {
  const access = await resolveCrmAccess();
  if (!access.ok) return <CrmPageNotice title="Не удалось проверить доступ" message={access.error.message} />;

  const { supabase, organizationId, permissions, userId } = access.value;
  if (!permissions.has("tasks.read")) {
    return <CrmPageNotice title="Нет доступа к задаче" message={permissionError("задачам", "read").message} />;
  }

  const { taskId } = await params;
  if (!isCrmRecordId(taskId)) notFound();

  const taskResult = await getActiveTaskForOrganization(supabase, organizationId, taskId);
  if (!taskResult.ok) return <CrmPageNotice title="Не удалось загрузить задачу" message={taskResult.error.message} />;
  if (!taskResult.value) notFound();
  const task = taskResult.value;

  const canReadAccounts = permissions.has("accounts.read");
  const canReadContacts = permissions.has("contacts.read");
  const canReadDeals = permissions.has("deals.read");
  const canReadActivities = permissions.has("activities.read");
  const canManageTasks = permissions.has("tasks.manage");
  const canManageActivities = permissions.has("activities.manage");
  const canAssignOwners = permissions.has("members.read");

  const [accountResult, contactResult, dealResult, activitiesResult, membersResult] = await Promise.all([
    canReadAccounts && task.account_id
      ? getActiveAccountForOrganization(supabase, organizationId, task.account_id)
      : emptyRecord<CrmAccount>(),
    canReadContacts && task.contact_id
      ? getActiveContactForOrganization(supabase, organizationId, task.contact_id)
      : emptyRecord<CrmContact>(),
    canReadDeals && task.deal_id
      ? getActiveDealForOrganization(supabase, organizationId, task.deal_id)
      : emptyRecord<CrmDeal>(),
    canReadActivities
      ? listActivitiesForTask(supabase, organizationId, task.id)
      : emptyList<CrmActivity>(),
    canManageTasks && canAssignOwners
      ? listAssignableMembersForOrganization(supabase, organizationId)
      : emptyList<CrmMemberOption>(),
  ]);

  if (!accountResult.ok) return <CrmPageNotice title="Не удалось загрузить аккаунт" message={accountResult.error.message} />;
  if (!contactResult.ok) return <CrmPageNotice title="Не удалось загрузить контакт" message={contactResult.error.message} />;
  if (!dealResult.ok) return <CrmPageNotice title="Не удалось загрузить сделку" message={dealResult.error.message} />;
  if (!activitiesResult.ok) return <CrmPageNotice title="Не удалось загрузить активности" message={activitiesResult.error.message} />;
  if (!membersResult.ok) return <CrmPageNotice title="Не удалось загрузить участников" message={membersResult.error.message} />;

  const referencesResult = await getActivityReferencesForOrganization(
    supabase,
    organizationId,
    activitiesResult.value,
    permissions,
  );
  if (!referencesResult.ok) return <CrmPageNotice title="Не удалось загрузить связи активностей" message={referencesResult.error.message} />;

  const account = accountResult.value;
  const contact = contactResult.value;
  const deal = dealResult.value;

  return (
    <PageContainer>
      <div className="page-heading-row">
        <div className="page-heading-copy">
          <p className="eyebrow">CRM / РАБОТА КОМАНДЫ</p>
          <h1 className="page-title">{task.title}</h1>
          <p className="page-intro">Задача, связанные записи и история взаимодействий.</p>
        </div>
        <div className="table-actions">
          <Link className="button-link button-link--secondary" href="/crm/tasks">Все задачи</Link>
          {canManageTasks ? <Link className="button-link button-link--secondary" href={`/crm/tasks?edit=${task.id}`}>Изменить задачу</Link> : null}
        </div>
      </div>

      <Card className="crm-panel">
        <div className="crm-record-details">
          <span>Статус: {statusLabels[task.status]}</span>
          <span>Приоритет: {priorityLabels[task.priority]}</span>
          <span>Срок: {task.due_at ? formatDate(task.due_at) : "не указан"}</span>
          <span>Ответственный: {formatOwner(task.owner_user_id, userId)}</span>
          {canReadAccounts ? <span>Аккаунт: {account
            ? <Link className="crm-text-link" href={`/crm/accounts/${account.id}`}>{account.name}</Link>
            : task.account_id ? "недоступен или архивирован" : "без аккаунта"}</span> : null}
          {canReadContacts ? <span>Контакт: {contact
            ? <Link className="crm-text-link" href={`/crm/contacts/${contact.id}`}>{formatContactName(contact)}</Link>
            : task.contact_id ? "недоступен или архивирован" : "без контакта"}</span> : null}
          {canReadDeals ? <span>Сделка: {deal
            ? <Link className="crm-text-link" href={`/crm/deals/${deal.id}`}>{deal.name}</Link>
            : task.deal_id ? "недоступна или архивирована" : "без сделки"}</span> : null}
          <span>Создана: {formatDate(task.created_at)}</span>
          <span>Обновлена: {formatDate(task.updated_at)}</span>
        </div>
        {task.description ? <p className="crm-record-body">{task.description}</p> : null}
      </Card>

      {canReadActivities ? (
        <section className="crm-section" aria-labelledby="task-activities-heading">
          <div className="crm-list-heading">
            <div>
              <h2 className="section-heading" id="task-activities-heading">История взаимодействий</h2>
              <p className="section-description">Заметки, звонки, встречи и письма по задаче</p>
            </div>
            <span className="crm-list-meta">{activitiesResult.value.length}</span>
          </div>
          <ActivityTimeline
            activities={activitiesResult.value}
            getLinks={(activity) => buildTask360ActivityLinks(activity, {
              ...referencesResult.value,
              canReadAccounts,
              canReadContacts,
              canReadDeals,
              canReadTasks: true,
            })}
          />
        </section>
      ) : null}

      {canManageTasks ? (
        <CreationSection title="Изменить задачу" id="edit-task-360">
          <TaskForm
            key={task.id}
            task={task}
            accounts={account ? [account] : []}
            contacts={contact ? [contact] : []}
            deals={deal ? [deal] : []}
            members={membersResult.value}
            currentUserId={userId}
            canAssignOwners={canAssignOwners}
            canReadAccounts={canReadAccounts}
            canReadContacts={canReadContacts}
            canReadDeals={canReadDeals}
            action={updateTaskAction}
          />
        </CreationSection>
      ) : null}

      {canManageActivities ? (
        <CreationSection title="Новая активность" id="create-task-activity">
          <ActivityForm
            key={`${task.id}:${account?.id ?? ""}:${contact?.id ?? ""}:${deal?.id ?? ""}`}
            accounts={account ? [account] : []}
            contacts={contact ? [contact] : []}
            deals={deal ? [deal] : []}
            tasks={[task]}
            canReadAccounts={canReadAccounts}
            canReadContacts={canReadContacts}
            canReadDeals={canReadDeals}
            canReadTasks
            defaultAccountId={account?.id}
            defaultContactId={contact?.id}
            defaultDealId={deal?.id}
            defaultTaskId={task.id}
            action={createActivityAction}
          />
        </CreationSection>
      ) : null}
    </PageContainer>
  );
}

function emptyRecord<T>() {
  return { ok: true as const, value: null as T | null };
}

function emptyList<T>() {
  return { ok: true as const, value: [] as T[] };
}

function CreationSection({ title, id, children }: { title: string; id: string; children: ReactNode }) {
  return <section className="crm-panel" aria-labelledby={id}><div className="crm-panel-heading"><h2 className="section-heading" id={id}>{title}</h2></div>{children}</section>;
}

function formatContactName(contact: CrmContact): string {
  return [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Без имени";
}

function formatOwner(ownerId: string | null, currentUserId: string): string {
  if (!ownerId) return "не назначен";
  return ownerId === currentUserId ? "Вы" : "участник команды";
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("ru-RU", { timeZone: "UTC" });
}
