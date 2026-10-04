"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CrmAccount, CrmContact, CrmDeal, CrmMutationAction, CrmTask } from "@/lib/crm/types";

export function ActivityForm({
  accounts,
  contacts,
  deals,
  tasks,
  canReadAccounts,
  canReadContacts,
  canReadDeals,
  canReadTasks,
  defaultAccountId,
  defaultContactId,
  action,
}: {
  accounts: CrmAccount[];
  contacts: CrmContact[];
  deals: CrmDeal[];
  tasks: CrmTask[];
  canReadAccounts: boolean;
  canReadContacts: boolean;
  canReadDeals: boolean;
  canReadTasks: boolean;
  defaultAccountId?: string;
  defaultContactId?: string;
  action: CrmMutationAction;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const initialContactId = contacts.some((item) => item.id === defaultContactId) ? defaultContactId : "";

  return (
    <form action={formAction} className="crm-form">
      <div className="crm-form-grid">
        <div className="crm-field">
          <label className="auth-label" htmlFor="new-activity-type">Тип *</label>
          <select className="input crm-select" id="new-activity-type" name="type" defaultValue="note" required>
            <option value="note">Заметка</option>
            <option value="call">Звонок</option>
            <option value="meeting">Встреча</option>
            <option value="email">Письмо</option>
            <option value="other">Другое</option>
          </select>
        </div>
        <div className="crm-field">
          <label className="auth-label" htmlFor="new-activity-date">Дата события</label>
          <Input id="new-activity-date" name="occurred_date" type="date" />
          <span className="field-hint">Если дата не указана, используется текущее время; выбранная дата сохраняется на 12:00 UTC.</span>
        </div>
        <div className="crm-field crm-field--wide">
          <label className="auth-label" htmlFor="new-activity-subject">Тема</label>
          <Input id="new-activity-subject" name="subject" maxLength={200} />
        </div>
        <div className="crm-field crm-field--wide">
          <label className="auth-label" htmlFor="new-activity-body">Описание</label>
          <textarea className="input crm-textarea" id="new-activity-body" name="body" maxLength={12000} />
        </div>
        {canReadAccounts ? (
          <div className="crm-field">
            <label className="auth-label" htmlFor="new-activity-account">Аккаунт</label>
            <select className="input crm-select" id="new-activity-account" name="account_id" defaultValue={defaultAccountId ?? ""}>
              <option value="">Без аккаунта</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </div>
        ) : null}
        {canReadContacts ? (
          <div className="crm-field">
            <label className="auth-label" htmlFor="new-activity-contact">Контакт</label>
            {/* Reapply changed prefill without resetting user selection on ordinary rerenders. */}
            <select key={initialContactId} className="input crm-select" id="new-activity-contact" name="contact_id" defaultValue={initialContactId}>
              <option value="">Без контакта</option>
              {contacts.map((contact) => <option key={contact.id} value={contact.id}>{[contact.first_name, contact.last_name].filter(Boolean).join(" ")}</option>)}
            </select>
          </div>
        ) : null}
        {canReadDeals ? (
          <div className="crm-field">
            <label className="auth-label" htmlFor="new-activity-deal">Сделка</label>
            <select className="input crm-select" id="new-activity-deal" name="deal_id" defaultValue="">
              <option value="">Без сделки</option>
              {deals.map((deal) => <option key={deal.id} value={deal.id}>{deal.name}</option>)}
            </select>
          </div>
        ) : null}
        {canReadTasks ? (
          <div className="crm-field">
            <label className="auth-label" htmlFor="new-activity-task">Задача</label>
            <select className="input crm-select" id="new-activity-task" name="task_id" defaultValue="">
              <option value="">Без задачи</option>
              {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
            </select>
          </div>
        ) : null}
      </div>

      {state.error ? <p className="form-message form-message--error" role="alert">{state.error.message}</p> : null}
      {state.success ? <p className="form-message form-message--success" role="status">{state.success}</p> : null}
      <Button type="submit" disabled={pending}>{pending ? "Сохраняем…" : "Добавить активность"}</Button>
    </form>
  );
}
