import { redirect } from "next/navigation";
import { AuthPage } from "@/components/auth/auth-page";
import { OrganizationForm } from "@/components/auth/organization-form";
import { requireAuthenticatedUser } from "@/lib/auth/guards";
import { getMembershipOrganizations } from "@/lib/auth/organizations";

export default async function NewOrganizationPage() {
  const { supabase, user } = await requireAuthenticatedUser();
  const memberships = await getMembershipOrganizations(supabase, user);
  if (memberships.length > 0) redirect("/");

  return (
    <AuthPage title="Создайте рабочее пространство" description="Начните с организации. Вы автоматически получите роль владельца.">
      <OrganizationForm />
    </AuthPage>
  );
}
