"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type AuthFormState = { error?: string; success?: string };
type AuthAction = (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;

export function AuthForm({ mode, action, nextPath }: {
  mode: "login" | "register";
  action: AuthAction;
  nextPath?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const isRegister = mode === "register";

  return (
    <form action={formAction} className="auth-form">
      {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
      <label className="auth-label" htmlFor="email">Email</label>
      <Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />

      <label className="auth-label" htmlFor="password">Пароль</label>
      <Input id="password" name="password" type="password" autoComplete={isRegister ? "new-password" : "current-password"} required minLength={isRegister ? 10 : 1} />

      {isRegister ? (
        <>
          <label className="auth-label" htmlFor="confirmation">Повторите пароль</label>
          <Input id="confirmation" name="confirmation" type="password" autoComplete="new-password" required minLength={10} />
        </>
      ) : null}

      {state.error ? <p className="form-message form-message--error" role="alert">{state.error}</p> : null}
      {state.success ? <p className="form-message form-message--success" role="status">{state.success}</p> : null}

      <Button type="submit" disabled={pending} className="auth-submit">
        {pending ? "Подождите…" : isRegister ? "Создать аккаунт" : "Войти"}
      </Button>
      <p className="auth-switch">
        {isRegister ? "Уже зарегистрированы? " : "Ещё нет аккаунта? "}
        <Link href={isRegister ? "/login" : "/register"}>{isRegister ? "Войти" : "Создать аккаунт"}</Link>
      </p>
    </form>
  );
}
