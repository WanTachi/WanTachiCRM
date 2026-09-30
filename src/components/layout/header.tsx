import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/actions/auth";
import { switchOrganizationAction } from "@/app/actions/organizations";
import type { OrganizationMembership, OrganizationSummary } from "@/lib/auth/organizations";

export function Header({ activeOrganization, memberships }: {
  activeOrganization: OrganizationSummary;
  memberships: OrganizationMembership[];
}) {
  return (
    <header className="topbar">
      <div className="topbar-context"><span>Рабочее пространство</span><span className="context-divider">/</span><strong>Главная</strong></div>
      <div className="topbar-actions">
        {memberships.length > 1 ? (
          <form className="organization-switcher" action={switchOrganizationAction}>
            <label className="sr-only" htmlFor="active-organization">Активная организация</label>
            <select id="active-organization" name="organizationId" defaultValue={activeOrganization.id}>
              {memberships.map(({ organization }) => <option value={organization.id} key={organization.id}>{organization.name}</option>)}
            </select>
            <Button variant="secondary" size="sm" type="submit">Переключить</Button>
          </form>
        ) : <span className="organization-name">{activeOrganization.name}</span>}
        <form action={logoutAction}><Button variant="ghost" size="sm" type="submit">Выйти</Button></form>
        <Avatar initials="U" />
      </div>
    </header>
  );
}
