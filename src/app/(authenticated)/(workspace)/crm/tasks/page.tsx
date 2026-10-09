import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";
import { CrmPageNotice } from "@/components/crm/crm-page-notice";
import { TaskForm } from "@/components/crm/task-form";
import { Card } from "@/components/ui/card";
import {
  listAccountsForOrganization,
  listAssignableMembersForOrganization,
  listContactsForOrganization,
  listDealsForOrganization,
  listTasksForOrganization,
} from "@/lib/crm/queries";
import { permissionError, resolveCrmAccess } from "@/lib/crm/access";
import { isCrmRecordId } from "@/lib/crm/validation";
import { createTaskAction, updateTaskAction } from "@/app/actions/crm/tasks";
import type { CrmAccount, CrmContact, CrmDeal, CrmMemberOption, CrmTask } from "@/lib/crm/types";

type TasksPageProps = { searchParams: Promise<{ edit?: string | string[]; q?: string | string[]; status?: string | string[] }> };

const statusLabels: Record<CrmTask["status"], string> = {
  open: "Открыта",
  in_progress: "В работе",
  completed: "Завершена",
  cancelled: "Отменена",
};
const priorityLabels: Record<CrmTask["priority"], string> = {
  low: "Низкий",
  normal: "Обычный",
  high: "Высокий",
  urgent: "Срочный",
};
const taskStatuses: Array<{ value: "all" | CrmTask["status"]; label: string }> = [
  { value: "all", label: "Все" },
  { value: "open", label: "Открытые" },
  { value: "in_progress", label: "В работе" },
  { value: "completed", label: "Завершённые" },
  { value: "cancelled", label: "Отменённые" },
];

export default async function TasksPage({ searchParams }: TasksPageProps) {
  const access = await resolveCrmAccess();
  if (!access.ok) return <CrmPageNotice title="Не удалось проверить доступ" message={access.error.message} />;

  const { supabase, organizationId, permissions, userId } = access.value;
  const canRead = permissions.has("tasks.read");
  const canManage = permissions.has("tasks.manage");
  const canReadAccounts = permissions.has("accounts.read");
  const canReadContacts = permissions.has("contacts.read");
  const canReadDeals = permissions.has("deals.read");
  const canAssignOwners = permissions.has("members.read");
  if (!canRead && !canManage) {
    return <CrmPageNotice title="Нет доступа к задачам" message={permissionError("задачам", "read").message} />;
  }

  const [tasksResult, accountsResult, contactsResult, dealsResult, membersResult, query] = await Promise.all([
    canRead ? listTasksForOrganization(supabase, organizationId) : Promise.resolve({ ok: true as const, value: [] as CrmTask[] }),
    canReadAccounts ? listAccountsForOrganization(supabase, organizationId) : Promise.resolve({ ok: true as const, value: [] as CrmAccount[] }),
    canReadContacts ? listContactsForOrganization(supabase, organizationId) : Promise.resolve({ ok: true as const, value: [] as CrmContact[] }),
    canReadDeals ? listDealsForOrganization(supabase, organizationId) : Promise.resolve({ ok: true as const, value: [] as CrmDeal[] }),
    canManage && canAssignOwners
      ? listAssignableMembersForOrganization(supabase, organizationId)
      : Promise.resolve({ ok: true as const, value: [] as CrmMemberOption[] }),
    searchParams,
  ]);

  if (!tasksResult.ok) return <CrmPageNotice title="Не удалось загрузить задачи" message={tasksResult.error.message} />;
  if (!accountsResult.ok) return <CrmPageNotice title="Не удалось загрузить аккаунты" message={accountsResult.error.message} />;
  if (!contactsResult.ok) return <CrmPageNotice title="Не удалось загрузить контакты" message={contactsResult.error.message} />;
  if (!dealsResult.ok) return <CrmPageNotice title="Не удалось загрузить сделки" message={dealsResult.error.message} />;
  if (!membersResult.ok) return <CrmPageNotice title="Не удалось загрузить участников" message={membersResult.error.message} />;

  const requestedEdit = Array.isArray(query.edit) ? query.edit[0] : query.edit;
  const editingTask = canRead && requestedEdit && isCrmRecordId(requestedEdit)
    ? tasksResult.value.find((task) => task.id === requestedEdit)
    : undefined;
  const querySearch = Array.isArray(query.q) ? query.q[0] : query.q;
  const searchTerm = querySearch?.trim() ?? "";
  const normalizedSearchTerm = searchTerm.toLocaleLowerCase("ru-RU");
  const queryStatus = Array.isArray(query.status) ? query.status[0] : query.status;
  const activeStatus = taskStatuses.some(({ value }) => value === queryStatus) ? queryStatus ?? "all" : "all";
  const accountNames = new Map(accountsResult.value.map((account) => [account.id, account.name]));
  const contactNames = new Map(contactsResult.value.map((contact) => [contact.id, [contact.first_name, contact.last_name].filter(Boolean).join(" ")]));
  const dealNames = new Map(dealsResult.value.map((deal) => [deal.id, deal.name]));
  const matchingTasks = tasksResult.value.filter((task) => {
    const relatedNames = [
      task.account_id ? accountNames.get(task.account_id) : null,
      task.contact_id ? contactNames.get(task.contact_id) : null,
      task.deal_id ? dealNames.get(task.deal_id) : null,
    ];
    const matchesSearch = !normalizedSearchTerm || [task.title, task.description, ...relatedNames]
      .some((value) => value?.toLocaleLowerCase("ru-RU").includes(normalizedSearchTerm));
    return matchesSearch && (activeStatus === "all" || task.status === activeStatus);
  });
  const taskCounts = Object.fromEntries(taskStatuses.map(({ value }) => [
    value,
    value === "all" ? tasksResult.value.length : tasksResult.value.filter((task) => task.status === value).length,
  ]));

  return (
    <PageContainer>
      <div className="page-heading-row">
        <div className="page-heading-copy">
          <p className="eyebrow">CRM / РАБОТА КОМАНДЫ</p>
          <h1 className="page-title">Задачи</h1>
          <p className="page-intro">Планируйте работу команды, сроки и следующие шаги по клиентам и сделкам.</p>
        </div>
        {canRead ? <span className="page-heading-meta">{tasksResult.value.length} всего</span> : null}
      </div>

      {requestedEdit && !editingTask ? <div className="crm-notice" role="status">Задача не найдена, архивирована или недоступна.</div> : null}
      {!canRead && canManage ? <div className="crm-notice" role="status">Вы можете создавать задачи, но не просматривать существующие.</div> : null}

      {canManage ? (
        <section className="crm-panel" aria-labelledby={editingTask ? "edit-task-heading" : "create-task-heading"}>
          <div className="crm-panel-heading">
            <h2 className="section-heading" id={editingTask ? "edit-task-heading" : "create-task-heading"}>
              {editingTask ? "Изменить задачу" : "Новая задача"}
            </h2>
            {editingTask ? <Link className="crm-text-link" href="/crm/tasks">Отмена</Link> : null}
          </div>
          <TaskForm
            key={editingTask?.id ?? "new-task"}
            task={editingTask}
            accounts={accountsResult.value}
            contacts={contactsResult.value}
            deals={dealsResult.value}
            members={membersResult.value}
            currentUserId={userId}
            canAssignOwners={canAssignOwners}
            canReadAccounts={canReadAccounts}
            canReadContacts={canReadContacts}
            canReadDeals={canReadDeals}
            action={editingTask ? updateTaskAction : createTaskAction}
          />
        </section>
      ) : null}

      {canRead ? (
        <section className="crm-section" aria-labelledby="tasks-list-heading">
          <div className="crm-list-heading">
            <div>
              <h2 className="section-heading" id="tasks-list-heading">Список задач</h2>
              <p className="section-description">Сроки и приоритеты команды</p>
            </div>
            <span className="crm-list-meta">{matchingTasks.length} показано</span>
          </div>
          <div className="data-toolbar">
            <div className="data-tabs" aria-label="Фильтр по статусу">
              {taskStatuses.map(({ value, label }) => {
                const href = buildTaskFilterHref(value, searchTerm);
                const active = value === activeStatus;
                return <Link className={`data-tab${active ? " data-tab--active" : ""}`} href={href} key={value} aria-current={active ? "page" : undefined}>{label}<span className="data-tab-count">{taskCounts[value]}</span></Link>;
              })}
            </div>
            <form className="data-search" action="/crm/tasks" method="get">
              <label className="sr-only" htmlFor="task-search">Поиск задач</label>
              <input id="task-search" name="q" type="search" placeholder="Поиск задач" defaultValue={searchTerm} />
              {activeStatus !== "all" ? <input type="hidden" name="status" value={activeStatus} /> : null}
              <button type="submit" className="search-submit">Найти</button>
            </form>
          </div>
          {matchingTasks.length === 0 ? (
            <Card className="crm-empty-state">
              <h3>{searchTerm || activeStatus !== "all" ? "Задач не найдено" : "Задач пока нет"}</h3>
              <p>{searchTerm || activeStatus !== "all" ? "Измените поиск или выберите другой статус." : canManage ? "Создайте задачу, чтобы зафиксировать следующий шаг команды." : "Когда в организации появятся задачи, они будут показаны здесь."}</p>
            </Card>
          ) : (
            <div className="table-scroll">
              <table className="data-table data-table--tasks">
                <caption className="sr-only">Задачи организации</caption>
                <thead><tr><th scope="col"><span className="sr-only">Состояние</span></th><th scope="col">Задача</th><th scope="col">Срок</th><th scope="col">Приоритет</th><th scope="col">Статус</th><th scope="col">Связи</th><th scope="col">Ответственный</th>{canManage ? <th scope="col"><span className="sr-only">Действия</span></th> : null}</tr></thead>
                <tbody>
                  {matchingTasks.map((task) => (
                    <tr key={task.id}>
                      <td><input className="task-checkbox" type="checkbox" checked={task.status === "completed"} disabled aria-label={`${task.title}: ${statusLabels[task.status]}`} title="Изменение статуса из списка пока недоступно" /></td>
                      <td><a className="table-primary crm-text-link" href={`/crm/tasks/${task.id}`}>{task.title}</a>{task.description ? <span className="table-secondary task-description">{task.description}</span> : null}</td>
                      <td>{task.due_at ? new Date(task.due_at).toLocaleDateString("ru-RU", { timeZone: "UTC" }) : <span className="table-secondary">Без срока</span>}</td>
                      <td><span className={`badge badge--priority-${task.priority}`}>{priorityLabels[task.priority]}</span></td>
                      <td><span className={`badge badge--status-${task.status}`}>{statusLabels[task.status]}</span></td>
                      <td><span className="table-secondary task-relations">{[
                        task.account_id ? accountNames.get(task.account_id) ?? "Аккаунт" : null,
                        task.contact_id ? contactNames.get(task.contact_id) ?? "Контакт" : null,
                        task.deal_id ? dealNames.get(task.deal_id) ?? "Сделка" : null,
                      ].filter(Boolean).join(" · ") || "—"}</span></td>
                      <td>{task.owner_user_id === userId ? "Вы" : task.owner_user_id ? "Участник команды" : <span className="table-secondary">Не назначен</span>}</td>
                      {canManage ? <td><div className="table-actions"><Link className="button-link button-link--secondary" href={`/crm/tasks?edit=${task.id}`}>Изменить</Link></div></td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </PageContainer>
  );
}

function buildTaskFilterHref(status: "all" | CrmTask["status"], searchTerm: string): string {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (searchTerm) params.set("q", searchTerm);
  const query = params.toString();
  return query ? `/crm/tasks?${query}` : "/crm/tasks";
}
