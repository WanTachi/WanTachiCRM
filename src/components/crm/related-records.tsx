import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { CrmDeal, CrmTask } from "@/lib/crm/types";

const statusLabels: Record<CrmTask["status"], string> = {
  open: "Открыта", in_progress: "В работе", completed: "Завершена", cancelled: "Отменена",
};
const priorityLabels: Record<CrmTask["priority"], string> = {
  low: "Низкий", normal: "Обычный", high: "Высокий", urgent: "Срочный",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("ru-RU", { timeZone: "UTC" });
}

function formatOwner(ownerId: string | null, currentUserId: string): string {
  if (!ownerId) return "не назначен";
  return ownerId === currentUserId ? "Вы" : "участник команды";
}

export function RelatedDealRecords({ deals, pipelineNames, stageNames, canManage, userId }: {
  deals: CrmDeal[];
  pipelineNames: ReadonlyMap<string, string>;
  stageNames: ReadonlyMap<string, string>;
  canManage: boolean;
  userId: string;
}) {
  return <div className="crm-record-list">{deals.map((deal) => (
    <Card className="crm-record" key={deal.id}>
      <div className="crm-record-main">
        <div className="crm-title-row">
          <h3><a className="crm-text-link" href={`/crm/deals/${deal.id}`}>{deal.name}</a></h3>
          {canManage ? <Link className="crm-text-link" href={`/crm/deals?edit=${deal.id}`}>Изменить</Link> : null}
        </div>
        <div className="crm-record-details">
          <span>{deal.amount === null || deal.amount === "" ? "Сумма не указана" : `${deal.amount} ${deal.currency || ""}`.trim()}</span>
          <span>{pipelineNames.get(deal.pipeline_id) || "Воронка недоступна"} / {stageNames.get(deal.stage_id) || "Этап недоступен"}</span>
          <span>Закрытие: {deal.expected_close_date ? formatDate(deal.expected_close_date) : "не указано"}</span>
          <span>Владелец: {formatOwner(deal.owner_user_id, userId)}</span>
        </div>
      </div>
    </Card>
  ))}</div>;
}

export function RelatedTaskRecords({ tasks, canManage, userId }: {
  tasks: CrmTask[];
  canManage: boolean;
  userId: string;
}) {
  return <div className="crm-record-list">{tasks.map((task) => (
    <Card className="crm-record" key={task.id}>
      <div className="crm-record-main">
        <div className="crm-title-row">
          <h3><a className="crm-text-link" href={`/crm/tasks/${task.id}`}>{task.title}</a></h3>
          {canManage ? <Link className="crm-text-link" href={`/crm/tasks?edit=${task.id}`}>Изменить</Link> : null}
        </div>
        <div className="crm-record-details">
          <span className={`badge badge--status-${task.status}`}>{statusLabels[task.status]}</span>
          <span className={`badge badge--priority-${task.priority}`}>{priorityLabels[task.priority]}</span>
          <span>Срок: {task.due_at ? formatDate(task.due_at) : "не указан"}</span>
          <span>Ответственный: {formatOwner(task.owner_user_id, userId)}</span>
        </div>
        {task.description ? <p className="crm-record-body">{task.description}</p> : null}
      </div>
    </Card>
  ))}</div>;
}
