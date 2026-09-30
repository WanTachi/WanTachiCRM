import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

export const ACTIVE_ORGANIZATION_COOKIE = "wantachi_active_organization";

export type OrganizationSummary = { id: string; name: string; slug: string };
export type OrganizationMembership = { organizationId: string; organization: OrganizationSummary };
type ServerSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export async function getMembershipOrganizations(
  supabase: ServerSupabase,
  user: User,
): Promise<OrganizationMembership[]> {
  const { data, error } = await supabase
    .from("memberships")
    .select("organization_id, organizations!inner(id, name, slug)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) throw new Error("Unable to load organization memberships.");

  return (data ?? []).flatMap((row) => {
    const organization = row.organizations;
    if (!organization || Array.isArray(organization)) return [];
    return [{ organizationId: row.organization_id, organization }];
  });
}

export async function getWorkspaceOrganization(
  supabase: ServerSupabase,
  user: User,
) {
  const memberships = await getMembershipOrganizations(supabase, user);
  if (memberships.length === 0) redirect("/organization/new");

  const cookieStore = await cookies();
  const requestedId = cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value;
  const activeMembership = memberships.find((item) => item.organizationId === requestedId) ?? memberships[0];

  return { memberships, organization: activeMembership.organization };
}
