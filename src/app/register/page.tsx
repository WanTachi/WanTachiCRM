import { AuthPage } from "@/components/auth/auth-page";
import { AuthForm } from "@/components/auth/auth-form";
import { registerAction } from "@/app/actions/auth";
import { getSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  const notice = getSupabaseConfig()
    ? undefined
    : "Регистрация станет доступна после настройки Supabase в .env.local.";

  return (
    <AuthPage title="Создайте аккаунт" description="Один аккаунт для ваших рабочих пространств." notice={notice}>
      {getSupabaseConfig() ? <AuthForm mode="register" action={registerAction} /> : null}
    </AuthPage>
  );
}
