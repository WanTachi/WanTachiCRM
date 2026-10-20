"use client";

import { useActionState } from "react";
import type { CrmDealOutcome, CrmMutationAction } from "@/lib/crm/types";
import { Button } from "@/components/ui/button";

const labels: Record<CrmDealOutcome, string> = {
  open: "Открыта",
  won: "Выиграна",
  lost: "Проиграна",
};

const transitionLabels: Record<CrmDealOutcome, string> = {
  open: "Открыть заново",
  won: "Отметить выигранной",
  lost: "Отметить проигранной",
};

export function DealOutcomeControls({
  dealId,
  outcome,
  action,
}: {
  dealId: string;
  outcome: CrmDealOutcome;
  action: CrmMutationAction;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const nextOutcomes = (Object.keys(labels) as CrmDealOutcome[]).filter((next) => next !== outcome);

  return (
    <div className="deal-outcome-controls">
      <div className="crm-record-details">
        <span>Статус: <strong>{labels[outcome]}</strong></span>
      </div>
      <form action={formAction} className="deal-outcome-form">
        <input type="hidden" name="id" value={dealId} />
        {nextOutcomes.map((next) => (
          <Button
            key={next}
            type="submit"
            name="outcome"
            value={next}
            variant={next === "won" ? "primary" : "secondary"}
            disabled={pending}
            onClick={(event) => {
              if (!window.confirm(`Подтвердить переход: ${labels[outcome]} → ${labels[next]}?`)) {
                event.preventDefault();
              }
            }}
          >
            {pending ? "Сохраняем…" : transitionLabels[next]}
          </Button>
        ))}
      </form>
      {state.error ? <p className="form-message form-message--error" role="alert">{state.error.message}</p> : null}
      {state.success ? <p className="form-message form-message--success" role="status">{state.success}</p> : null}
      <p className="field-hint">Переход между статусами не меняет этап воронки. Дата закрытия устанавливается базой данных.</p>
    </div>
  );
}
