import Link from "next/link";
import type { ReactNode } from "react";
import { brand } from "@/lib/config/brand";

export function AuthPage({ title, description, children, notice }: {
  title: string;
  description: string;
  children: ReactNode;
  notice?: string;
}) {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link className="auth-brand" href="/">{brand.name}</Link>
        <p className="eyebrow">Secure workspace</p>
        <h1>{title}</h1>
        <p className="auth-description">{description}</p>
        {notice ? <div className="setup-notice" role="status">{notice}</div> : null}
        {children}
        <p className="auth-footnote">Защищённая авторизация через Supabase</p>
      </div>
    </main>
  );
}
