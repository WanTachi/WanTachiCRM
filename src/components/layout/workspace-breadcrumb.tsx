"use client";

import { usePathname } from "next/navigation";

const sections = [
  { href: "/crm/accounts", label: "Аккаунты" },
  { href: "/crm/contacts", label: "Контакты" },
  { href: "/crm/pipelines", label: "Воронки" },
  { href: "/crm/deals", label: "Сделки" },
  { href: "/crm/tasks", label: "Задачи" },
  { href: "/crm/activities", label: "Активности" },
];

export function WorkspaceBreadcrumb() {
  const pathname = usePathname();
  const section = sections.find(({ href }) => pathname === href || pathname.startsWith(`${href}/`));
  const title = section?.label ?? "Обзор";

  return (
    <div className="topbar-context" aria-label={`Текущий раздел: ${title}`}>
      <span className="topbar-context-root">Рабочее пространство</span>
      <span className="context-divider" aria-hidden="true">/</span>
      <strong>{title}</strong>
    </div>
  );
}
