import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/actions/auth";
import { switchOrganizationAction } from "@/app/actions/organizations";
import { WorkspaceBreadcrumb } from "@/components/layout/workspace-breadcrumb";
import { UtilityIcon } from "@/components/layout/nav-icon";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import type { OrganizationMembership, OrganizationSummary } from "@/lib/auth/organizations";

export function Header({ userName, userEmail, activeOrganization, memberships }: {
  userName: string;
  userEmail: string;
  activeOrganization: OrganizationSummary;
  memberships: OrganizationMembership[];
}) {
  const initials = userName.slice(0, 2).toUpperCase() || "U";

  return (
    <header className="topbar">
      <div className="topbar-left">
        <WorkspaceBreadcrumb />
        <label className="global-search">
          <UtilityIcon name="search" />
          <span className="sr-only">Поиск по CRM</span>
          <input type="search" placeholder="Поиск по CRM" disabled title="Общий поиск пока недоступен" />
        </label>
      </div>
      <div className="topbar-actions">
        <ThemeSwitcher />
        {memberships.length > 1 ? (
          <form className="topbar-organization-switcher" action={switchOrganizationAction}>
            <label className="sr-only" htmlFor="topbar-active-organization">Активная организация</label>
            <select id="topbar-active-organization" name="organizationId" defaultValue={activeOrganization.id}>
              {memberships.map(({ organization }) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
            </select>
            <Button variant="secondary" size="sm" type="submit">Сменить</Button>
          </form>
        ) : null}
        <button className="topbar-icon-button" type="button" disabled aria-label="Уведомления пока недоступны" title="Уведомления пока недоступны">
          <UtilityIcon name="bell" />
        </button>
        <details className="user-menu">
          <summary className="user-menu-trigger" aria-label="Открыть меню пользователя">
            <Avatar initials={initials} />
            <span className="topbar-user-email" title={userName}>{userName}</span>
            <UtilityIcon name="chevron" />
          </summary>
          <div className="user-menu-popover">
            <div className="user-menu-identity">
              <Avatar initials={initials} />
              <div><strong>{userName}</strong><span>{userEmail}</span></div>
            </div>
            <form action={logoutAction}>
              <Button className="user-menu-logout" variant="secondary" size="sm" type="submit">
                <UtilityIcon name="logout" />
                <span>Выйти из аккаунта</span>
              </Button>
            </form>
          </div>
        </details>
      </div>
    </header>
  );
}
