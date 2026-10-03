import Link from "next/link";
import { switchOrganizationAction } from "@/app/actions/organizations";
import type { OrganizationMembership, OrganizationSummary } from "@/lib/auth/organizations";
import { brand } from "@/lib/config/brand";
import { SidebarNavLink } from "@/components/layout/sidebar-nav-link";
import { Button } from "@/components/ui/button";

const navigation = [
  { label: "Обзор", href: "/", icon: "overview" },
  { label: "Аккаунты", href: "/crm/accounts", icon: "accounts", permissions: ["accounts.read", "accounts.manage"] },
  { label: "Контакты", href: "/crm/contacts", icon: "contacts", permissions: ["contacts.read", "contacts.manage"] },
  { label: "Воронки", href: "/crm/pipelines", icon: "pipelines", permissions: ["pipelines.read", "pipelines.manage"] },
  { label: "Сделки", href: "/crm/deals", icon: "deals", permissions: ["deals.read", "deals.manage"] },
  { label: "Задачи", href: "/crm/tasks", icon: "tasks", permissions: ["tasks.read", "tasks.manage"] },
  { label: "Активности", href: "/crm/activities", icon: "activities", permissions: ["activities.read", "activities.manage"] },
] as const;

export function Sidebar({ permissions, activeOrganization, memberships }: {
  permissions: ReadonlySet<string>;
  activeOrganization: OrganizationSummary;
  memberships: OrganizationMembership[];
}) {
  const visibleNavigation = navigation.filter(
    (item) => !("permissions" in item) || item.permissions.some((permission) => permissions.has(permission)),
  );

  return (
    <aside className="sidebar" aria-label="Основная навигация">
      <Link className="brand-lockup" href="/" aria-label={`${brand.name}, на главную`}>
        <span className="brand-name"><span>WanTachi</span><span className="brand-name-accent">CRM</span></span>
      </Link>

      <div className="sidebar-section-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
      <nav className="sidebar-nav">
        {visibleNavigation.map((item) => (
          <SidebarNavLink key={item.href} href={item.href} label={item.label} icon={item.icon} />
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="workspace-switcher">
          <div className="workspace-switcher-content">
            <span className="workspace-switcher-label">Рабочее пространство</span>
            {memberships.length > 1 ? (
              <form className="organization-switcher" action={switchOrganizationAction}>
                <label className="sr-only" htmlFor="active-organization">Активная организация</label>
                <select id="active-organization" name="organizationId" defaultValue={activeOrganization.id}>
                  {memberships.map(({ organization }) => (
                    <option value={organization.id} key={organization.id}>{organization.name}</option>
                  ))}
                </select>
                <Button variant="ghost" size="sm" type="submit">Сменить</Button>
              </form>
            ) : (
              <span className="workspace-switcher-name" title={activeOrganization.name}>{activeOrganization.name}</span>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
