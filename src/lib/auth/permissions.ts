import type { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Load the current user's permissions through their active organization membership. */
export async function getOrganizationPermissions(
  supabase: ServerSupabase,
  userId: string,
  organizationId: string,
): Promise<Set<string>> {
  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("role_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (membershipError) throw new Error("Unable to load organization permissions.");
  if (!membership) return new Set();

  const { data: grants, error: grantsError } = await supabase
    .from("role_permissions")
    .select("permission_id")
    .eq("role_id", membership.role_id);

  if (grantsError) throw new Error("Unable to load organization permissions.");

  const permissionIds = (grants ?? []).map((grant) => grant.permission_id);
  if (permissionIds.length === 0) return new Set();

  const { data: permissions, error: permissionsError } = await supabase
    .from("permissions")
    .select("key")
    .in("id", permissionIds);

  if (permissionsError) throw new Error("Unable to load organization permissions.");

  return new Set((permissions ?? []).map((permission) => permission.key));
}
