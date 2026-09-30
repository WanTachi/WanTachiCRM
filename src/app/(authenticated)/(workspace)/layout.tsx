import type { CSSProperties, ReactNode } from "react";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { requireAuthenticatedUser } from "@/lib/auth/guards";
import { getWorkspaceOrganization } from "@/lib/auth/organizations";
import { brand } from "@/lib/config/brand";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const { supabase, user } = await requireAuthenticatedUser();
  const context = await getWorkspaceOrganization(supabase, user);

  return (
    <div className="app-shell" style={{ "--brand-accent": brand.primaryColor } as CSSProperties}>
      <Sidebar />
      <div className="workspace">
        <Header activeOrganization={context.organization} memberships={context.memberships} />
        {children}
      </div>
    </div>
  );
}
