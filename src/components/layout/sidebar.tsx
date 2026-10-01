import Link from "next/link";
import { brand } from "@/lib/config/brand";

const navigation = [
  { label: "Обзор", href: "/", icon: "◫" },
  { label: "Аккаунты", href: "/crm/accounts", icon: "▦", permissions: ["accounts.read", "accounts.manage"] },
  { label: "Контакты", href: "/crm/contacts", icon: "◎", permissions: ["contacts.read", "contacts.manage"] },
  { label: "Воронки", href: "/crm/pipelines", icon: "↗", permissions: ["pipelines.read", "pipelines.manage"] },
  { label: "Сделки", href: "/crm/deals", icon: "◇", permissions: ["deals.read", "deals.manage"] },
];

export function Sidebar({ permissions }: { permissions: ReadonlySet<string> }) {
  const visibleNavigation = navigation.filter(
    (item) => !item.permissions || item.permissions.some((permission) => permissions.has(permission)),
  );

  return (
    <aside className="sidebar" aria-label="Основная навигация">
      <Link className="brand-lockup" href="/" aria-label={`${brand.name}, на главную`}>
        <span className="brand-name">{brand.name}</span>
        <span className="brand-caption">WORKSPACE</span>
      </Link>
      <div className="sidebar-section-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
      <nav className="sidebar-nav">
        {visibleNavigation.map((item) => (
          <Link className="nav-link" href={item.href} key={item.href}>
            <span className="nav-icon" aria-hidden="true">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <span className="sidebar-status-dot" aria-hidden="true" />
        Основа платформы готова
      </div>
    </aside>
  );
}
