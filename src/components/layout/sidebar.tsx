import Link from "next/link";
import { brand } from "@/lib/config/brand";

const navigation = [{ label: "Обзор", href: "/", icon: "◫" }];

export function Sidebar() {
  return (
    <aside className="sidebar" aria-label="Основная навигация">
      <Link className="brand-lockup" href="/" aria-label={`${brand.name}, на главную`}>
        <span className="brand-name">{brand.name}</span>
        <span className="brand-caption">WORKSPACE</span>
      </Link>
      <div className="sidebar-section-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
      <nav className="sidebar-nav">
        {navigation.map((item) => (
          <Link className="nav-link nav-link--active" href={item.href} key={item.href}>
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
