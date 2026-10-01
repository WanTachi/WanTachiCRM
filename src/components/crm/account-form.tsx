"use client";

import { useActionState } from "react";
import type { CrmAccount } from "@/lib/crm/types";
import type { CrmMutationAction } from "@/lib/crm/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AccountForm({ account, action }: { account?: CrmAccount; action: CrmMutationAction }) {
  const [state, formAction, pending] = useActionState(action, {});
  const prefix = account ? `account-${account.id}` : "new-account";

  return (
    <form action={formAction} className="crm-form">
      {account ? <input type="hidden" name="id" value={account.id} /> : null}
      <label className="auth-label" htmlFor={`${prefix}-name`}>Название *</label>
      <Input id={`${prefix}-name`} name="name" required minLength={1} maxLength={160} defaultValue={account?.name ?? ""} />

      <div className="crm-form-grid">
        <div className="crm-field">
          <label className="auth-label" htmlFor={`${prefix}-website`}>Сайт</label>
          <Input id={`${prefix}-website`} name="website" type="url" maxLength={2048} defaultValue={account?.website ?? ""} />
        </div>
        <div className="crm-field">
          <label className="auth-label" htmlFor={`${prefix}-phone`}>Телефон</label>
          <Input id={`${prefix}-phone`} name="phone" type="tel" maxLength={64} defaultValue={account?.phone ?? ""} />
        </div>
        <div className="crm-field crm-field--wide">
          <label className="auth-label" htmlFor={`${prefix}-industry`}>Отрасль</label>
          <Input id={`${prefix}-industry`} name="industry" maxLength={120} defaultValue={account?.industry ?? ""} />
        </div>
      </div>

      {state.error ? <p className="form-message form-message--error" role="alert">{state.error.message}</p> : null}
      {state.success ? <p className="form-message form-message--success" role="status">{state.success}</p> : null}
      <Button type="submit" disabled={pending}>{pending ? "Сохраняем…" : account ? "Сохранить аккаунт" : "Создать аккаунт"}</Button>
    </form>
  );
}
