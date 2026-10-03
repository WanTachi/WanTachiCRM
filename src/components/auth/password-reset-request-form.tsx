"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthFormState } from "@/components/auth/auth-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ResetRequestAction = (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;

export function PasswordResetRequestForm({ action }: { action: ResetRequestAction }) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="auth-form">
      <label className="auth-label" htmlFor="email">Email</label>
      <Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />

      {state.error ? <p className="form-message form-message--error" role="alert">{state.error}</p> : null}
      {state.success ? <p className="form-message form-message--success" role="status">{state.success}</p> : null}

      <Button type="submit" disabled={pending} className="auth-submit">
        {pending ? "Подождите…" : "Отправить ссылку"}
      </Button>
      <p className="auth-switch"><Link href="/login">Вернуться ко входу</Link></p>
    </form>
  );
}
