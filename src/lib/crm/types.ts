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

export type CrmPipeline = {
  id: string;
  name: string;
  description: string | null;
  owner_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmPipelineWithStageCount = CrmPipeline & {
  active_stage_count: number;
};

export type CrmPipelineStage = {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
  probability: number | null;
  created_at: string;
  updated_at: string;
};

export type CrmDeal = {
  id: string;
  pipeline_id: string;
  stage_id: string;
  account_id: string | null;
  contact_id: string | null;
  name: string;
  description: string | null;
  amount: number | string | null;
  currency: string | null;
  owner_user_id: string | null;
  expected_close_date: string | null;
  /** Present when the Deal Outcomes migration is available. */
  outcome?: CrmDealOutcome;
  /** Database-controlled; present when the Deal Outcomes migration is available. */
  closed_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmDealOutcome = "open" | "won" | "lost";

export type CrmDealOutcomeState = {
  outcome: CrmDealOutcome;
  closed_at: string | null;
};

export type CrmDealOutcomeEvent = {
  id: string;
  deal_id: string;
  from_outcome: CrmDealOutcome | null;
  to_outcome: CrmDealOutcome;
  changed_at: string;
  changed_by: string | null;
  amount_snapshot: number | string | null;
  currency_snapshot: string | null;
};

export type CrmDashboardDeal = Pick<CrmDeal, "amount" | "currency" | "created_at">;

export type CrmTaskStatus = "open" | "in_progress" | "completed" | "cancelled";
export type CrmTaskPriority = "low" | "normal" | "high" | "urgent";
export type CrmActivityType = "note" | "call" | "meeting" | "email" | "other";

export type CrmTask = {
  id: string;
  title: string;
  description: string | null;
  status: CrmTaskStatus;
  priority: CrmTaskPriority;
  due_at: string | null;
  owner_user_id: string | null;
  account_id: string | null;
  contact_id: string | null;
  deal_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmActivity = {
  id: string;
  type: CrmActivityType;
  subject: string | null;
  body: string | null;
  occurred_at: string;
  account_id: string | null;
  contact_id: string | null;
  deal_id: string | null;
  task_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmMemberOption = {
  user_id: string;
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

export type CrmPipelineInput = {
  name: string;
  description: string | null;
  owner_user_id: string | null | undefined;
};

export type CrmPipelineStageInput = {
  pipeline_id: string;
  name: string;
  position: number;
  probability: number | null;
};

export type CrmDealInput = {
  pipeline_id: string;
  stage_id: string;
  account_id: string | null | undefined;
  contact_id: string | null | undefined;
  name: string;
  description: string | null;
  amount: string | null;
  currency: string | null;
  owner_user_id: string | null | undefined;
  expected_close_date: string | null;
};

export type CrmTaskInput = {
  title: string;
  description: string | null;
  status: CrmTaskStatus;
  priority: CrmTaskPriority;
  due_at: string | null;
  owner_user_id: string | null | undefined;
  account_id: string | null | undefined;
  contact_id: string | null | undefined;
  deal_id: string | null | undefined;
};

export type CrmActivityInput = {
  type: CrmActivityType;
  subject: string | null;
  body: string | null;
  occurred_at: string | null;
  account_id: string | null | undefined;
  contact_id: string | null | undefined;
  deal_id: string | null | undefined;
  task_id: string | null | undefined;
};

export type CrmAccess = {
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createSupabaseServerClient>>;
  userId: string;
  organizationId: string;
  permissions: Set<string>;
};
