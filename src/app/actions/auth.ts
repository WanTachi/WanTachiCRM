"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { AuthFormState } from "@/components/auth/auth-form";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/lib/auth/organizations";
import { isSafeReturnPath } from "@/lib/auth/return-path";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const genericAuthError = "Не удалось выполнить запрос. Проверьте данные и попробуйте ещё раз.";

export async function loginAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: genericAuthError };

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: genericAuthError };
  } catch {
    return { error: genericAuthError };
  }

  const returnPath = isSafeReturnPath(formData.get("next")) ? String(formData.get("next")) : "/";
  redirect(returnPath);
}

export async function registerAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  if (!email || password.length < 10 || password !== confirmation) {
    return { error: "Укажите email, пароль от 10 символов и подтвердите пароль." };
  }

  try {
    const config = getSupabaseConfig();
    if (!config) return { error: "Сервис авторизации ещё не настроен." };
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${config.siteUrl}/auth/confirm` },
    });
    if (error || !data.user) return { error: genericAuthError };
    if (!data.session) {
      return { success: "Аккаунт создан. Если подтверждение email включено в Supabase, перейдите по ссылке из письма." };
    }
  } catch {
    return { error: genericAuthError };
  }

  redirect("/organization/new");
}

export async function logoutAction() {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } finally {
    const cookieStore = await cookies();
    cookieStore.delete(ACTIVE_ORGANIZATION_COOKIE);
    redirect("/login");
  }
}
