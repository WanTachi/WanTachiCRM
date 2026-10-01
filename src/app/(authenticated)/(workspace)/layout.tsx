import type { CSSProperties, ReactNode } from "react";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { requireAuthenticatedUser } from "@/lib/auth/guards";
import { getWorkspaceOrganization } from "@/lib/auth/organizations";
import { getOrganizationPermissions } from "@/lib/auth/permissions";
import { brand } from "@/lib/config/brand";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const { supabase, user } = await requireAuthenticatedUser();
  const context = await getWorkspaceOrganization(supabase, user);
  let permissions = new Set<string>();
  try {
    permissions = await getOrganizationPermissions(supabase, user.id, context.organization.id);
  } catch {
    // Hide CRM navigation when permission data is unavailable; CRM routes and actions fail closed too.
  }

  return (
    <div className="app-shell" style={{ "--brand-accent": brand.primaryColor } as CSSProperties}>
      <Sidebar permissions={permissions} />
      <div className="workspace">
        <Header activeOrganization={context.organization} memberships={context.memberships} />
        {children}
      </div>
    </div>
  );
}
