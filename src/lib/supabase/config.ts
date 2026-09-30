export type SupabaseConfig = {
  url: string;
  publishableKey: string;
  siteUrl: string;
};

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (!url || !publishableKey || !siteUrl) return null;

  try {
    new URL(url);
    new URL(siteUrl);
  } catch {
    return null;
  }

  return { url, publishableKey, siteUrl };
}

export class SupabaseSetupError extends Error {
  constructor() {
    super("Supabase is not configured.");
    this.name = "SupabaseSetupError";
  }
}
