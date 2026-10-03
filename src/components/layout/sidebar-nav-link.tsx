"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon, type NavIconName } from "@/components/layout/nav-icon";

export function SidebarNavLink({ href, label, icon }: {
  href: string;
  label: string;
  icon: NavIconName;
}) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      className={`nav-link${active ? " nav-link--active" : ""}`}
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      title={label}
    >
      <NavIcon name={icon} />
      <span className="nav-link-label">{label}</span>
    </Link>
  );
}
