"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthFormState } from "@/components/auth/auth-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PasswordUpdateAction = (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;

export function PasswordUpdateForm({ action }: { action: PasswordUpdateAction }) {
  const [state, formAction, pending] = useActionState(action, {});

  if (state.success) {
    return (
      <div className="auth-form">
        <p className="form-message form-message--success" role="status">{state.success}</p>
        <p className="auth-switch"><Link href="/">Продолжить в WanTachi</Link></p>
      </div>
    );
  }

  return (
    <form action={formAction} className="auth-form">
      <label className="auth-label" htmlFor="password">Новый пароль</label>
      <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />

      <label className="auth-label" htmlFor="confirmation">Повторите новый пароль</label>
      <Input id="confirmation" name="confirmation" type="password" autoComplete="new-password" required minLength={10} />

      {state.error ? <p className="form-message form-message--error" role="alert">{state.error}</p> : null}

      <Button type="submit" disabled={pending} className="auth-submit">
        {pending ? "Подождите…" : "Сохранить новый пароль"}
      </Button>
    </form>
  );
}
