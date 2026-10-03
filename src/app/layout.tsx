import type { Metadata } from "next";
import Script from "next/script";
import type { CSSProperties, ReactNode } from "react";
import { brand } from "@/lib/config/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: `${brand.name} CRM`,
  description: "Универсальная CRM-платформа для команд и компаний.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" data-theme="dark" suppressHydrationWarning style={{ "--brand-accent": brand.primaryColor } as CSSProperties}>
      <head>
        <Script id="wantachi-theme-init" strategy="beforeInteractive">
          {`(() => { try { const key = "wantachi-theme"; const saved = localStorage.getItem(key); const theme = saved === "light" || saved === "system" || saved === "dark" ? saved : "dark"; document.documentElement.dataset.theme = theme; } catch {} })()`}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  );
}
