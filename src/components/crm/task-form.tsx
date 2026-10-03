"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  CrmAccount,
  CrmContact,
  CrmDeal,
  CrmMemberOption,
  CrmMutationAction,
  CrmTask,
} from "@/lib/crm/types";

export function TaskForm({
  task,
  accounts,
  contacts,
  deals,
  members,
  currentUserId,
  canAssignOwners,
  canReadAccounts,
  canReadContacts,
  canReadDeals,
  defaultAccountId,
  action,
}: {
  task?: CrmTask;
  accounts: CrmAccount[];
  contacts: CrmContact[];
  deals: CrmDeal[];
  members: CrmMemberOption[];
  currentUserId: string;
  canAssignOwners: boolean;
  canReadAccounts: boolean;
  canReadContacts: boolean;
  canReadDeals: boolean;
  defaultAccountId?: string;
  action: CrmMutationAction;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const prefix = task ? `task-${task.id}` : "new-task";
  const ownerIds = new Set(members.map((member) => member.user_id));
  ownerIds.add(currentUserId);
  const selectedAccountId = task?.account_id ?? defaultAccountId ?? "";

  return (
    <form action={formAction} className="crm-form">
      {task ? <input type="hidden" name="id" value={task.id} /> : null}
      <div className="crm-form-grid">
        <div className="crm-field crm-field--wide">
          <label className="auth-label" htmlFor={`${prefix}-title`}>Название задачи *</label>
          <Input id={`${prefix}-title`} name="title" required minLength={1} maxLength={200} defaultValue={task?.title ?? ""} />
        </div>
        <div className="crm-field">
          <label className="auth-label" htmlFor={`${prefix}-status`}>Статус</label>
          <select className="input crm-select" id={`${prefix}-status`} name="status" defaultValue={task?.status ?? "open"}>
            <option value="open">Открыта</option>
            <option value="in_progress">В работе</option>
            <option value="completed">Завершена</option>
            <option value="cancelled">Отменена</option>
          </select>
        </div>
        <div className="crm-field">
          <label className="auth-label" htmlFor={`${prefix}-priority`}>Приоритет</label>
          <select className="input crm-select" id={`${prefix}-priority`} name="priority" defaultValue={task?.priority ?? "normal"}>
            <option value="low">Низкий</option>
            <option value="normal">Обычный</option>
            <option value="high">Высокий</option>
            <option value="urgent">Срочный</option>
          </select>
        </div>
        <div className="crm-field">
          <label className="auth-label" htmlFor={`${prefix}-due-date`}>Срок</label>
          <Input id={`${prefix}-due-date`} name="due_date" type="date" defaultValue={task?.due_at?.slice(0, 10) ?? ""} />
          <span className="field-hint">Дата хранится до конца дня по UTC.</span>
        </div>
        {canAssignOwners ? (
          <div className="crm-field">
            <label className="auth-label" htmlFor={`${prefix}-owner`}>Ответственный</label>
            <select className="input crm-select" id={`${prefix}-owner`} name="owner_user_id" defaultValue={task ? task.owner_user_id ?? "" : currentUserId}>
              <option value="">Не назначен</option>
              {[...ownerIds].map((userId) => (
                <option key={userId} value={userId}>
                  {userId === currentUserId ? "Вы" : `Участник · ${userId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="crm-field crm-field--wide">
          <label className="auth-label" htmlFor={`${prefix}-description`}>Описание</label>
          <textarea className="input crm-textarea" id={`${prefix}-description`} name="description" maxLength={5000} defaultValue={task?.description ?? ""} />
        </div>
        {canReadAccounts ? (
          <div className="crm-field">
            <label className="auth-label" htmlFor={`${prefix}-account`}>Аккаунт</label>
            <select className="input crm-select" id={`${prefix}-account`} name="account_id" defaultValue={accounts.some((item) => item.id === selectedAccountId) ? selectedAccountId : ""}>
              <option value="">Без аккаунта</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </div>
        ) : null}
        {canReadContacts ? (
          <div className="crm-field">
            <label className="auth-label" htmlFor={`${prefix}-contact`}>Контакт</label>
            <select className="input crm-select" id={`${prefix}-contact`} name="contact_id" defaultValue={contacts.some((item) => item.id === task?.contact_id) ? task?.contact_id ?? "" : ""}>
              <option value="">Без контакта</option>
              {contacts.map((contact) => <option key={contact.id} value={contact.id}>{[contact.first_name, contact.last_name].filter(Boolean).join(" ")}</option>)}
            </select>
          </div>
        ) : null}
        {canReadDeals ? (
          <div className="crm-field">
            <label className="auth-label" htmlFor={`${prefix}-deal`}>Сделка</label>
            <select className="input crm-select" id={`${prefix}-deal`} name="deal_id" defaultValue={deals.some((item) => item.id === task?.deal_id) ? task?.deal_id ?? "" : ""}>
              <option value="">Без сделки</option>
              {deals.map((deal) => <option key={deal.id} value={deal.id}>{deal.name}</option>)}
            </select>
          </div>
        ) : null}
      </div>

      {task?.account_id && canReadAccounts && !accounts.some((item) => item.id === task.account_id) ? <p className="field-hint">Связанный аккаунт архивирован или недоступен; сохранение очистит связь.</p> : null}
      {task?.contact_id && canReadContacts && !contacts.some((item) => item.id === task.contact_id) ? <p className="field-hint">Связанный контакт архивирован или недоступен; сохранение очистит связь.</p> : null}
      {task?.deal_id && canReadDeals && !deals.some((item) => item.id === task.deal_id) ? <p className="field-hint">Связанная сделка архивирована или недоступна; сохранение очистит связь.</p> : null}
      {state.error ? <p className="form-message form-message--error" role="alert">{state.error.message}</p> : null}
      {state.success ? <p className="form-message form-message--success" role="status">{state.success}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Сохраняем…" : task ? "Сохранить задачу" : "Создать задачу"}
      </Button>
    </form>
  );
}
