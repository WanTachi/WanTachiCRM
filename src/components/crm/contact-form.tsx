"use client";

import { useActionState } from "react";
import type { CrmAccount, CrmContact } from "@/lib/crm/types";
import type { CrmMutationAction } from "@/lib/crm/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ContactForm({
  contact,
  accounts,
  canReadAccounts,
  defaultAccountId,
  action,
}: {
  contact?: CrmContact;
  accounts: CrmAccount[];
  canReadAccounts: boolean;
  defaultAccountId?: string;
  action: CrmMutationAction;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const prefix = contact ? `contact-${contact.id}` : "new-contact";

  return (
    <form action={formAction} className="crm-form">
      {contact ? <input type="hidden" name="id" value={contact.id} /> : null}
      <div className="crm-form-grid">
        <div className="crm-field">
          <label className="auth-label" htmlFor={`${prefix}-first-name`}>Имя *</label>
          <Input id={`${prefix}-first-name`} name="first_name" required minLength={1} maxLength={100} defaultValue={contact?.first_name ?? ""} />
        </div>
        <div className="crm-field">
          <label className="auth-label" htmlFor={`${prefix}-last-name`}>Фамилия</label>
          <Input id={`${prefix}-last-name`} name="last_name" maxLength={100} defaultValue={contact?.last_name ?? ""} />
        </div>
        <div className="crm-field">
          <label className="auth-label" htmlFor={`${prefix}-email`}>Email</label>
          <Input id={`${prefix}-email`} name="email" type="email" maxLength={320} defaultValue={contact?.email ?? ""} />
        </div>
        <div className="crm-field">
          <label className="auth-label" htmlFor={`${prefix}-phone`}>Телефон</label>
          <Input id={`${prefix}-phone`} name="phone" type="tel" maxLength={64} defaultValue={contact?.phone ?? ""} />
        </div>
        <div className="crm-field">
          <label className="auth-label" htmlFor={`${prefix}-job-title`}>Должность</label>
          <Input id={`${prefix}-job-title`} name="job_title" maxLength={160} defaultValue={contact?.job_title ?? ""} />
        </div>
        {canReadAccounts ? (
          <div className="crm-field">
            <label className="auth-label" htmlFor={`${prefix}-account`}>Аккаунт</label>
            <select className="input crm-select" id={`${prefix}-account`} name="account_id" defaultValue={contact?.account_id ?? defaultAccountId ?? ""}>
              <option value="">Без аккаунта</option>
              {contact?.account_id && !accounts.some((account) => account.id === contact.account_id) ? (
                <option value={contact.account_id}>Связанный архивированный аккаунт</option>
              ) : null}
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </div>
        ) : null}
      </div>

      {!canReadAccounts ? <p className="field-hint">Можно создать контакт без аккаунта. Для выбора аккаунта нужно право чтения аккаунтов.</p> : null}
      {state.error ? <p className="form-message form-message--error" role="alert">{state.error.message}</p> : null}
      {state.success ? <p className="form-message form-message--success" role="status">{state.success}</p> : null}
      <Button type="submit" disabled={pending}>{pending ? "Сохраняем…" : contact ? "Сохранить контакт" : "Создать контакт"}</Button>
    </form>
  );
}
