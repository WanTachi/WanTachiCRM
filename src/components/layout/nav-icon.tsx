export type NavIconName = "overview" | "accounts" | "contacts" | "pipelines" | "deals" | "tasks" | "activities";

export function NavIcon({ name, className = "" }: { name: NavIconName; className?: string }) {
  const shared = {
    className: `nav-icon ${className}`.trim(),
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (name) {
    case "overview":
      return <svg {...shared}><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></svg>;
    case "accounts":
      return <svg {...shared}><path d="M4 20V6.8L12 3l8 3.8V20" /><path d="M8 20v-4h8v4M8 9h.01M12 9h.01M16 9h.01M8 12h.01M12 12h.01M16 12h.01" /></svg>;
    case "contacts":
      return <svg {...shared}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20v-1.4a5.5 5.5 0 0 1 11 0V20" /><path d="M16 5.3a3.2 3.2 0 0 1 0 5.9M17.2 14a5.3 5.3 0 0 1 3.3 4.9V20" /></svg>;
    case "pipelines":
      return <svg {...shared}><path d="M4 5h16M7 12h10M10 19h4" /><circle cx="6" cy="5" r="1.2" /><circle cx="17" cy="12" r="1.2" /><circle cx="11" cy="19" r="1.2" /></svg>;
    case "deals":
      return <svg {...shared}><path d="m12 3 8.5 9-8.5 9-8.5-9L12 3Z" /><path d="M8 12h8M12 8v8" /></svg>;
    case "tasks":
      return <svg {...shared}><rect x="4" y="3.5" width="16" height="17" rx="2" /><path d="m7.5 9 1.6 1.6L12 7.7M14 9h3M7.5 15l1.6 1.6 2.9-2.9M14 15h3" /></svg>;
    case "activities":
      return <svg {...shared}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.4 2" /></svg>;
  }
}

export function UtilityIcon({ name }: { name: "search" | "bell" | "logout" | "chevron" }) {
  const shared = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  if (name === "search") return <svg className="utility-icon" {...shared}><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></svg>;
  if (name === "bell") return <svg className="utility-icon" {...shared}><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" /></svg>;
  if (name === "logout") return <svg className="utility-icon" {...shared}><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></svg>;
  return <svg className="utility-icon" {...shared}><path d="m7 10 5 5 5-5" /></svg>;
}
