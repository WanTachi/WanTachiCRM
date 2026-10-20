import type { CrmActionError, CrmDealOutcome } from "@/lib/crm/types";

export const CRM_DEAL_OUTCOMES: readonly CrmDealOutcome[] = ["open", "won", "lost"];

export function parseDealOutcome(value: unknown): CrmDealOutcome | null {
  return typeof value === "string" && CRM_DEAL_OUTCOMES.includes(value as CrmDealOutcome)
    ? value as CrmDealOutcome
    : null;
}

/** Mirrors the database's finite positive numeric requirement without using binary floating point. */
export function isFinitePositiveDealAmount(value: number | string | null): boolean {
  if (value === null) return false;
  const raw = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return false;
  return /[1-9]/.test(raw);
}

export function isValidDealCurrency(value: string | null): boolean {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value.trim().toUpperCase());
}

export function dealOutcomeValidationError(): CrmActionError {
  return {
    code: "invalid_input",
    message: "Чтобы отметить сделку выигранной, укажите положительную сумму и валюту из 3 букв.",
  };
}

export function dealOutcomeSchemaError(): CrmActionError {
  return {
    code: "unavailable",
    message: "Статусы сделок пока недоступны. Сначала примените обновление базы данных Deal Outcomes.",
  };
}

export function isDealOutcomeSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  if (["42703", "42P01", "PGRST204", "PGRST205"].includes(code)) return true;

  const message = typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";
  return message.includes("crm_deal_outcome_events")
    || (message.includes("column") && (message.includes("outcome") || message.includes("closed_at")));
}

