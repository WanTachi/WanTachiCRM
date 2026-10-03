import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { supabaseCookieOptions } from "@/lib/supabase/cookies";

export async function GET(request: NextRequest) {
  const config = getSupabaseConfig();
  if (!config) return NextResponse.redirect(new URL("/login?setup=1", request.url));

  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const hasRecoveryTokenHash = Boolean(tokenHash && type === "recovery");
  if (!code && !hasRecoveryTokenHash) {
    return NextResponse.redirect(new URL("/forgot-password?recovery=failed", config.siteUrl));
  }

  const response = NextResponse.next({ request });
  const cookieStore = await cookies();
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookieOptions: supabaseCookieOptions,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  let recoveryFailed = false;
  try {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      recoveryFailed = Boolean(error);
    } else if (tokenHash) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
      recoveryFailed = Boolean(error);
    }
  } catch {
    recoveryFailed = true;
  }

  const redirectResponse = NextResponse.redirect(new URL(
    recoveryFailed ? "/forgot-password?recovery=failed" : "/reset-password",
    config.siteUrl,
  ));
  for (const cookie of response.cookies.getAll()) redirectResponse.cookies.set(cookie);
  return redirectResponse;
}
