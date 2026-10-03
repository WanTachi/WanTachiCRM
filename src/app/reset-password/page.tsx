import Link from "next/link";
import { AuthPage } from "@/components/auth/auth-page";
import { PasswordUpdateForm } from "@/components/auth/password-update-form";
import { updatePasswordAction } from "@/app/actions/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const configured = Boolean(getSupabaseConfig());
  let hasAuthenticatedSession = false;

  if (configured) {
    try {
      const supabase = await createSupabaseServerClient();
      const { data: { user }, error } = await supabase.auth.getUser();
      hasAuthenticatedSession = Boolean(user && !error);
    } catch {
      hasAuthenticatedSession = false;
    }
  }

  const notice = !configured
    ? "Сервис авторизации ещё не настроен. Проверьте параметры Supabase в .env.local."
    : !hasAuthenticatedSession
      ? "Сначала откройте ссылку восстановления из письма. Возможно, она уже истекла."
      : undefined;

  return (
    <AuthPage title="Новый пароль" description="Придумайте пароль длиной не менее 10 символов." notice={notice}>
      {hasAuthenticatedSession
        ? <PasswordUpdateForm action={updatePasswordAction} />
        : <p className="auth-switch"><Link href="/forgot-password">Запросить новое письмо</Link></p>}
    </AuthPage>
  );
}
