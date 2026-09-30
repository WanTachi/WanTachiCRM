"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AuthFormState } from "@/components/auth/auth-form";
import { ACTIVE_ORGANIZATION_COOKIE, getMembershipOrganizations } from "@/lib/auth/organizations";
import { requireAuthenticatedUser } from "@/lib/auth/guards";

export async function createOrganizationAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  if (name.length < 2 || name.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 48) {
    return { error: "Проверьте название и URL: используйте 3–48 латинских букв, цифр или дефисов." };
  }

  const { supabase } = await requireAuthenticatedUser();
  try {
    const { data: organizationId, error } = await supabase.rpc("create_organization", {
      organization_name: name,
      organization_slug: slug,
    });
    if (error || !organizationId) return { error: "Не удалось создать организацию. Возможно, этот URL уже занят." };

    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_ORGANIZATION_COOKIE, organizationId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  } catch {
    return { error: "Не удалось создать организацию. Попробуйте ещё раз." };
  }

  redirect("/");
}

export async function switchOrganizationAction(formData: FormData) {
  const organizationId = String(formData.get("organizationId") ?? "");
  const { supabase, user } = await requireAuthenticatedUser();
  const memberships = await getMembershipOrganizations(supabase, user);
  if (!memberships.some((membership) => membership.organizationId === organizationId)) {
    redirect("/");
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORGANIZATION_COOKIE, organizationId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/");
}
