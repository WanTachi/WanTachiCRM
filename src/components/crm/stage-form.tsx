"use client";

import { useActionState } from "react";
import type { CrmPipelineStage } from "@/lib/crm/types";
import type { CrmMutationAction } from "@/lib/crm/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function StageForm({
  pipelineId,
  stage,
  action,
}: {
  pipelineId: string;
  stage?: CrmPipelineStage;
  action: CrmMutationAction;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const prefix = stage ? `stage-${stage.id}` : `new-stage-${pipelineId}`;

  return (
    <form action={formAction} className="crm-form">
      <input type="hidden" name="pipeline_id" value={pipelineId} />
      {stage ? <input type="hidden" name="id" value={stage.id} /> : null}
      <div className="crm-form-grid">
        <div className="crm-field">
          <label className="auth-label" htmlFor={`${prefix}-name`}>Название *</label>
          <Input id={`${prefix}-name`} name="name" required minLength={1} maxLength={120} defaultValue={stage?.name ?? ""} />
        </div>
        <div className="crm-field">
          <label className="auth-label" htmlFor={`${prefix}-position`}>Позиция *</label>
          <Input id={`${prefix}-position`} name="position" type="number" required min={0} step={1} defaultValue={stage?.position ?? 0} />
        </div>
        <div className="crm-field">
          <label className="auth-label" htmlFor={`${prefix}-probability`}>Вероятность, %</label>
          <Input id={`${prefix}-probability`} name="probability" type="number" min={0} max={100} step="any" defaultValue={stage?.probability ?? ""} />
        </div>
      </div>

      {state.error ? <p className="form-message form-message--error" role="alert">{state.error.message}</p> : null}
      {state.success ? <p className="form-message form-message--success" role="status">{state.success}</p> : null}
      <Button type="submit" disabled={pending}>{pending ? "Сохраняем…" : stage ? "Сохранить этап" : "Создать этап"}</Button>
    </form>
  );
}
