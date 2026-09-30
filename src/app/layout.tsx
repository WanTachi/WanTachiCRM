import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { brand } from "@/lib/config/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: `${brand.name} CRM`,
  description: "Универсальная CRM-платформа для команд и компаний.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" style={{ "--brand-accent": brand.primaryColor } as CSSProperties}>
      <body>{children}</body>
    </html>
  );
}
