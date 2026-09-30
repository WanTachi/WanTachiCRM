import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { supabaseCookieOptions } from "@/lib/supabase/cookies";

const allowedOtpTypes = new Set<EmailOtpType>(["signup", "email"]);

export async function GET(request: NextRequest) {
  const config = getSupabaseConfig();
  if (!config) return NextResponse.redirect(new URL("/login?setup=1", request.url));

  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const typeValue = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const hasValidTokenHash = Boolean(tokenHash && typeValue && allowedOtpTypes.has(typeValue));
  if (!code && !hasValidTokenHash) {
    return NextResponse.redirect(new URL("/login?confirmation=failed", request.url));
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
  let confirmationFailed = false;
  try {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      confirmationFailed = Boolean(error);
    } else if (tokenHash && typeValue) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: typeValue });
      confirmationFailed = Boolean(error);
    }
  } catch {
    confirmationFailed = true;
  }

  const redirectResponse = NextResponse.redirect(new URL(confirmationFailed ? "/login?confirmation=failed" : "/organization/new", request.url));
  for (const cookie of response.cookies.getAll()) redirectResponse.cookies.set(cookie);
  return redirectResponse;
}
