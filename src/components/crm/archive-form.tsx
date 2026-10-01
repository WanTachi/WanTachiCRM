"use client";

import { useActionState } from "react";
import type { CrmMutationAction } from "@/lib/crm/types";
import { Button } from "@/components/ui/button";

export function ArchiveForm({ id, label, action }: {
  id: string;
  label: string;
  action: CrmMutationAction;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <div className="crm-archive-control">
      <form action={formAction}>
        <input type="hidden" name="id" value={id} />
        <Button type="submit" variant="secondary" size="sm" disabled={pending} aria-label={`Архивировать: ${label}`}>
          {pending ? "Архивируем…" : "Архивировать"}
        </Button>
      </form>
      {state.error ? <p className="form-message form-message--error" role="alert">{state.error.message}</p> : null}
    </div>
  );
}
