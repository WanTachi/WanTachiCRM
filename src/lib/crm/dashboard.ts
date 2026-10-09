import { revalidatePath } from "next/cache";
import {
  countCompletedTasksForOrganization,
  countDashboardAccountsForOrganization,
  listDashboardDealsForOrganization,
} from "@/lib/crm/queries";
import type { CrmAccess, CrmDashboardDeal, CrmResult } from "@/lib/crm/types";

export const DASHBOARD_PERIODS = [7, 30, 90] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

export type DashboardPeriodRange = {
  start: string;
  end: string;
  startMs: number;
  endMs: number;
};

export type DashboardChartPoint = {
  date: string;
  count: number;
};

export type DashboardDealAnalytics = {
  activeCount: number;
  pipelineByCurrency: Array<{ currency: string; amount: string }>;
  createdDeals: DashboardChartPoint[];
  maxCreatedDeals: number;
};

export type DashboardMetric<T> =
  | { status: "available"; value: T }
  | { status: "forbidden" }
  | { status: "unavailable" };

export type DashboardData = {
  period: DashboardPeriod;
  range: DashboardPeriodRange;
  deals: DashboardMetric<DashboardDealAnalytics>;
  accounts: DashboardMetric<number>;
  tasks: DashboardMetric<number>;
};

export function parseDashboardPeriod(value: unknown): DashboardPeriod {
  const raw = Array.isArray(value) ? value[0] : value;
  const normalized = typeof raw === "number" || typeof raw === "string" ? String(raw) : "";
  return DASHBOARD_PERIODS.find((period) => String(period) === normalized) ?? 30;
}

export function formatDashboardPeriod(period: DashboardPeriod): string {
  return `${period} дней`;
}

export function getDashboardPeriodRange(
  period: DashboardPeriod,
  now = new Date(),
): DashboardPeriodRange {
  const endDate = new Date(now);
  endDate.setUTCHours(0, 0, 0, 0);
  endDate.setUTCDate(endDate.getUTCDate() + 1);

  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - period);

  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    startMs: startDate.getTime(),
    endMs: endDate.getTime(),
  };
}

function normalizeCurrency(value: string | null): string {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : "Без валюты";
}

type DecimalAmount = {
  value: bigint;
  scale: number;
};

function parseAmount(value: number | string | null): DecimalAmount | null {
  if (value === null) return null;
  const raw = typeof value === "number" ? String(value) : value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;

  const [whole, fraction = ""] = raw.split(".");
  if (whole.length + fraction.length > 1000) return null;
  return { value: BigInt(`${whole}${fraction}`), scale: fraction.length };
}

function addAmounts(left: DecimalAmount, right: DecimalAmount): DecimalAmount {
  if (left.scale === right.scale) {
    return { value: left.value + right.value, scale: left.scale };
  }
  if (left.scale > right.scale) {
    return {
      value: left.value + right.value * BigInt(10) ** BigInt(left.scale - right.scale),
      scale: left.scale,
    };
  }
  return {
    value: left.value * BigInt(10) ** BigInt(right.scale - left.scale) + right.value,
    scale: right.scale,
  };
}

function decimalToString(amount: DecimalAmount): string {
  if (amount.scale === 0) return amount.value.toString();
  const digits = amount.value.toString().padStart(amount.scale + 1, "0");
  const whole = digits.slice(0, -amount.scale);
  const fraction = digits.slice(-amount.scale).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function compareAmounts(left: DecimalAmount, right: DecimalAmount): number {
  const scale = Math.max(left.scale, right.scale);
  const leftValue = left.value * BigInt(10) ** BigInt(scale - left.scale);
  const rightValue = right.value * BigInt(10) ** BigInt(scale - right.scale);
  return leftValue === rightValue ? 0 : leftValue > rightValue ? -1 : 1;
}

function toDateKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function aggregateDashboardDeals(
  deals: CrmDashboardDeal[],
  period: DashboardPeriod,
  range = getDashboardPeriodRange(period),
): DashboardDealAnalytics {
  const createdDeals = Array.from({ length: period }, (_, index) => ({
    date: toDateKey(range.startMs + index * 24 * 60 * 60 * 1000),
    count: 0,
  }));
  const pipeline = new Map<string, DecimalAmount>();

  for (const deal of deals) {
    const createdAt = Date.parse(deal.created_at);
    if (Number.isFinite(createdAt) && createdAt >= range.startMs && createdAt < range.endMs) {
      const index = Math.floor((createdAt - range.startMs) / (24 * 60 * 60 * 1000));
      if (index >= 0 && index < createdDeals.length) createdDeals[index].count += 1;
    }

    const amount = parseAmount(deal.amount);
    if (amount === null) continue;
    const currency = normalizeCurrency(deal.currency);
    pipeline.set(currency, pipeline.has(currency) ? addAmounts(pipeline.get(currency)!, amount) : amount);
  }

  const pipelineByCurrency = [...pipeline.entries()]
    .sort(([leftCurrency, leftAmount], [rightCurrency, rightAmount]) =>
      compareAmounts(leftAmount, rightAmount) || leftCurrency.localeCompare(rightCurrency))
    .map(([currency, amount]) => ({ currency, amount: decimalToString(amount) }));

  return {
    activeCount: deals.length,
    pipelineByCurrency,
    createdDeals,
    maxCreatedDeals: Math.max(0, ...createdDeals.map((point) => point.count)),
  };
}

export function formatDashboardAmount(amount: number | string): string {
  const parsed = parseAmount(amount);
  if (!parsed) return "—";

  let value = parsed.value;
  let scale = parsed.scale;
  if (scale > 2) {
    const divisor = BigInt(10) ** BigInt(scale - 2);
    const remainder = value % divisor;
    value /= divisor;
    if (remainder * BigInt(2) >= divisor) value += BigInt(1);
    scale = 2;
  }
  const digits = value.toString().padStart(scale + 1, "0");
  const whole = digits.slice(0, -scale || undefined).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  const fraction = scale > 0 ? digits.slice(-scale).replace(/0+$/, "") : "";
  return fraction ? `${whole},${fraction}` : whole;
}

function toMetric<T, U>(
  allowed: boolean,
  result: CrmResult<T> | null,
  map: (value: T) => U,
): DashboardMetric<U> {
  if (!allowed) return { status: "forbidden" };
  if (!result || !result.ok) return { status: "unavailable" };
  return { status: "available", value: map(result.value) };
}

export async function loadDashboardData(
  access: CrmAccess,
  period: DashboardPeriod,
  now = new Date(),
): Promise<DashboardData> {
  const range = getDashboardPeriodRange(period, now);
  const canReadDeals = access.permissions.has("deals.read");
  const canReadAccounts = access.permissions.has("accounts.read");
  const canReadTasks = access.permissions.has("tasks.read");

  const [dealsResult, accountsResult, tasksResult] = await Promise.all([
    canReadDeals
      ? listDashboardDealsForOrganization(access.supabase, access.organizationId)
      : Promise.resolve(null),
    canReadAccounts
      ? countDashboardAccountsForOrganization(access.supabase, access.organizationId, range.start, range.end)
      : Promise.resolve(null),
    canReadTasks
      ? countCompletedTasksForOrganization(access.supabase, access.organizationId)
      : Promise.resolve(null),
  ]);

  return {
    period,
    range,
    deals: toMetric(canReadDeals, dealsResult, (deals) => aggregateDashboardDeals(deals, period, range)),
    accounts: toMetric(canReadAccounts, accountsResult, (count) => count),
    tasks: toMetric(canReadTasks, tasksResult, (count) => count),
  };
}

export function revalidateDashboard(): void {
  revalidatePath("/", "page");
}
