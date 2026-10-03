import Link from "next/link";
import { AuthPage } from "@/components/auth/auth-page";
import { PasswordResetRequestForm } from "@/components/auth/password-reset-request-form";
import { requestPasswordResetAction } from "@/app/actions/auth";
import { getSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({ searchParams }: {
  searchParams: Promise<{ recovery?: string }>;
}) {
  const params = await searchParams;
  const configured = Boolean(getSupabaseConfig());
  const notice = !configured
    ? "Сервис авторизации ещё не настроен. Проверьте параметры Supabase в .env.local."
    : params.recovery === "failed"
      ? "Ссылка восстановления недействительна или истекла. Запросите новое письмо."
      : undefined;

  return (
    <AuthPage title="Восстановление пароля" description="Укажите email, и мы отправим ссылку для установки нового пароля." notice={notice}>
      {configured ? <PasswordResetRequestForm action={requestPasswordResetAction} /> : <p className="auth-switch"><Link href="/login">Вернуться ко входу</Link></p>}
    </AuthPage>
  );
}
