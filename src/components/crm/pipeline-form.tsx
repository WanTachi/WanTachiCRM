"use client";

import { useActionState } from "react";
import type { CrmMemberOption, CrmPipeline } from "@/lib/crm/types";
import type { CrmMutationAction } from "@/lib/crm/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PipelineForm({
  pipeline,
  members,
  currentUserId,
  canAssignOwners,
  action,
}: {
  pipeline?: CrmPipeline;
  members: CrmMemberOption[];
  currentUserId: string;
  canAssignOwners: boolean;
  action: CrmMutationAction;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const prefix = pipeline ? `pipeline-${pipeline.id}` : "new-pipeline";
  const defaultOwner = pipeline ? pipeline.owner_user_id ?? "" : currentUserId;

  return (
    <form action={formAction} className="crm-form">
      {pipeline ? <input type="hidden" name="id" value={pipeline.id} /> : null}
      <div className="crm-form-grid">
        <div className="crm-field crm-field--wide">
          <label className="auth-label" htmlFor={`${prefix}-name`}>Название *</label>
          <Input id={`${prefix}-name`} name="name" required minLength={1} maxLength={160} defaultValue={pipeline?.name ?? ""} />
        </div>
        <div className="crm-field crm-field--wide">
          <label className="auth-label" htmlFor={`${prefix}-description`}>Описание</label>
          <textarea className="input crm-textarea" id={`${prefix}-description`} name="description" maxLength={2000} defaultValue={pipeline?.description ?? ""} />
        </div>
        {canAssignOwners ? (
          <div className="crm-field">
            <label className="auth-label" htmlFor={`${prefix}-owner`}>Владелец</label>
            <select className="input crm-select" id={`${prefix}-owner`} name="owner_user_id" defaultValue={defaultOwner}>
              <option value="">Без владельца</option>
              {[...new Set([...members.map((member) => member.user_id), currentUserId])].map((userId) => (
                <option key={userId} value={userId}>
                  {userId === currentUserId ? "Вы" : `Участник · ${userId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {state.error ? <p className="form-message form-message--error" role="alert">{state.error.message}</p> : null}
      {state.success ? <p className="form-message form-message--success" role="status">{state.success}</p> : null}
      <Button type="submit" disabled={pending}>{pending ? "Сохраняем…" : pipeline ? "Сохранить воронку" : "Создать воронку"}</Button>
    </form>
  );
}
