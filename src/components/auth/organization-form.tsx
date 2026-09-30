"use client";

import { useActionState } from "react";
import { createOrganizationAction } from "@/app/actions/organizations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function OrganizationForm() {
  const [state, formAction, pending] = useActionState(createOrganizationAction, {});
  return (
    <form action={formAction} className="auth-form">
      <label className="auth-label" htmlFor="organization-name">Название организации</label>
      <Input id="organization-name" name="name" autoComplete="organization" required minLength={2} maxLength={120} />
      <label className="auth-label" htmlFor="organization-slug">Короткий адрес</label>
      <Input id="organization-slug" name="slug" autoCapitalize="none" autoComplete="off" pattern="[a-z0-9]+(-[a-z0-9]+)*" minLength={3} maxLength={48} required aria-describedby="slug-hint" />
      <span className="field-hint" id="slug-hint">Латинские буквы, цифры и дефисы. Например: wantachi-team</span>
      {state.error ? <p className="form-message form-message--error" role="alert">{state.error}</p> : null}
      <Button type="submit" disabled={pending} className="auth-submit">{pending ? "Создаём…" : "Создать организацию"}</Button>
    </form>
  );
}
