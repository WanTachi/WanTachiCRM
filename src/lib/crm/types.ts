export type CrmErrorCode = "invalid_input" | "forbidden" | "not_found" | "unavailable";

export type CrmActionError = {
  code: CrmErrorCode;
  message: string;
};

export type CrmResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: CrmActionError };

export type CrmFormState = {
  error?: CrmActionError;
  success?: string;
};

export type CrmMutationAction = (
  previousState: CrmFormState,
  formData: FormData,
) => Promise<CrmFormState>;

export type CrmAccount = {
  id: string;
  name: string;
  website: string | null;
  phone: string | null;
  industry: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmContact = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  account_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmAccountInput = {
  name: string;
  website: string | null;
  phone: string | null;
  industry: string | null;
};

export type CrmContactInput = {
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  account_id: string | null | undefined;
};

export type CrmAccess = {
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createSupabaseServerClient>>;
  userId: string;
  organizationId: string;
  permissions: Set<string>;
};
