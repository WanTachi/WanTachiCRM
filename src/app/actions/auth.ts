"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { AuthFormState } from "@/components/auth/auth-form";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/lib/auth/organizations";
import { getEmailConfirmationRedirectUrl, getPasswordRecoveryRedirectUrl, validateNewPassword, validatePasswordResetEmail } from "@/lib/auth/password-reset-validation";
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
      options: { emailRedirectTo: getEmailConfirmationRedirectUrl(config.siteUrl) },
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

export async function requestPasswordResetAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const emailResult = validatePasswordResetEmail(formData.get("email"));
  if (!emailResult.ok) return { error: emailResult.error };

  const config = getSupabaseConfig();
  if (!config) return { error: "Сервис авторизации ещё не настроен." };

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(emailResult.email, {
      redirectTo: getPasswordRecoveryRedirectUrl(config.siteUrl),
    });
    if (error) return { error: "Не удалось обработать запрос сейчас. Попробуйте позже." };
  } catch {
    return { error: "Не удалось обработать запрос сейчас. Попробуйте позже." };
  }

  // Supabase intentionally returns the same successful result for existing and unknown emails.
  // Error details stay generic so Auth internals are never exposed.
  return {
    success: "Запрос обработан. Если аккаунт с таким email существует, Supabase отправит письмо со ссылкой. Проверьте почту и папку «Спам».",
  };
}

export async function updatePasswordAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const passwordResult = validateNewPassword(formData.get("password"), formData.get("confirmation"));
  if (!passwordResult.ok) return { error: passwordResult.error };

  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { error: "Ссылка восстановления недействительна или истекла. Запросите новое письмо." };
    }

    const { error } = await supabase.auth.updateUser({ password: passwordResult.password });
    if (error) return { error: "Не удалось изменить пароль. Проверьте ссылку и попробуйте ещё раз." };
  } catch {
    return { error: "Не удалось изменить пароль. Проверьте ссылку и попробуйте ещё раз." };
  }

  return { success: "Пароль успешно изменён. Вы вошли в систему с новым паролем." };
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
