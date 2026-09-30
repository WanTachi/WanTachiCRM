import { AuthPage } from "@/components/auth/auth-page";
import { AuthForm } from "@/components/auth/auth-form";
import { loginAction } from "@/app/actions/auth";
import { getSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ next?: string; setup?: string; confirmation?: string }>;
}) {
  const params = await searchParams;
  const configured = Boolean(getSupabaseConfig());
  const notice = !configured
    ? "Для включения входа добавьте URL, publishable key и адрес сайта Supabase в .env.local, затем перезапустите сервер."
    : params.confirmation === "failed"
      ? "Не удалось подтвердить ссылку. Запросите новое письмо и попробуйте ещё раз."
      : undefined;

  return (
    <AuthPage title="С возвращением" description="Войдите, чтобы открыть рабочее пространство." notice={notice}>
      {configured ? <AuthForm mode="login" action={loginAction} nextPath={params.next} /> : null}
    </AuthPage>
  );
}
