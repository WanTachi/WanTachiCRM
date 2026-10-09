import { PageContainer } from "@/components/layout/page-container";
import { CrmPageNotice } from "@/components/crm/crm-page-notice";
import { resolveCrmAccess } from "@/lib/crm/access";
import {
  formatDashboardAmount,
  formatDashboardPeriod,
  loadDashboardData,
  parseDashboardPeriod,
} from "@/lib/crm/dashboard";

type DashboardPageProps = {
  searchParams: Promise<{ period?: string | string[] }>;
};

export default async function Home({ searchParams }: DashboardPageProps) {
  const access = await resolveCrmAccess();
  if (!access.ok) return <CrmPageNotice title="Не удалось проверить доступ" message={access.error.message} />;

  const query = await searchParams;
  const period = parseDashboardPeriod(query.period);
  const dashboard = await loadDashboardData(access.value, period);
  const periodLabel = formatDashboardPeriod(period);
  const pipeline = dashboard.deals.status === "available"
    ? dashboard.deals.value.pipelineByCurrency
    : [];

  const activeDealsValue = dashboard.deals.status === "available"
    ? String(dashboard.deals.value.activeCount)
    : dashboard.deals.status === "forbidden" ? "Нет доступа" : "Недоступно";
  const accountsValue = dashboard.accounts.status === "available"
    ? String(dashboard.accounts.value)
    : dashboard.accounts.status === "forbidden" ? "Нет доступа" : "Недоступно";
  const tasksValue = dashboard.tasks.status === "available"
    ? String(dashboard.tasks.value)
    : dashboard.tasks.status === "forbidden" ? "Нет доступа" : "Недоступно";
  const pipelineValue = dashboard.deals.status === "forbidden"
    ? "Нет доступа"
    : dashboard.deals.status === "unavailable"
      ? "Недоступно"
      : pipeline.length === 0
        ? "Нет данных"
        : pipeline.length === 1
          ? `${formatDashboardAmount(pipeline[0].amount)} ${pipeline[0].currency}`
          : `${pipeline.length} валюты`;

  return (
    <PageContainer>
      <section className="overview-heading" aria-labelledby="overview-title">
        <div className="overview-heading-copy">
          <p className="eyebrow">ОБЗОР CRM</p>
          <h1 className="page-title" id="overview-title">Доброе утро</h1>
          <p className="page-intro">Операционные показатели вашей организации на основе активных CRM-записей.</p>
        </div>
        <form className="period-control-form" action="/" method="get">
          <label htmlFor="dashboard-period">Период</label>
          <select id="dashboard-period" name="period" defaultValue={String(period)}>
            <option value="7">7 дней</option>
            <option value="30">30 дней</option>
            <option value="90">90 дней</option>
          </select>
          <button className="period-control-submit" type="submit">Применить</button>
        </form>
      </section>

      <section className="overview-kpis" aria-label="Ключевые показатели">
        <article className="overview-kpi">
          <div className="overview-kpi-topline">
            <p className="overview-kpi-label">Активные сделки</p>
            <span className="overview-kpi-dot" aria-hidden="true" />
          </div>
          <p className="overview-kpi-value">{activeDealsValue}</p>
          <p className="overview-kpi-note">Сделки без архивирования в текущей организации.</p>
        </article>

        <article className="overview-kpi">
          <div className="overview-kpi-topline">
            <p className="overview-kpi-label">Новые аккаунты</p>
            <span className="overview-kpi-dot" aria-hidden="true" />
          </div>
          <p className="overview-kpi-value">{accountsValue}</p>
          <p className="overview-kpi-note">Активные аккаунты, созданные за последние {periodLabel}.</p>
        </article>

        <article className="overview-kpi">
          <div className="overview-kpi-topline">
            <p className="overview-kpi-label">Завершённые задачи · всего</p>
            <span className="overview-kpi-dot" aria-hidden="true" />
          </div>
          <p className="overview-kpi-value">{tasksValue}</p>
          <p className="overview-kpi-note">Все активные завершённые задачи: дата завершения пока не хранится.</p>
        </article>

        <article className="overview-kpi overview-kpi--pipeline">
          <div className="overview-kpi-topline">
            <p className="overview-kpi-label">Ожидаемый pipeline</p>
            <span className="overview-kpi-dot" aria-hidden="true" />
          </div>
          <p className="overview-kpi-value">{pipelineValue}</p>
          {pipeline.length > 0 ? (
            <div className="overview-kpi-breakdown" aria-label="Ожидаемый pipeline по валютам">
              {pipeline.map((entry) => (
                <span key={entry.currency}>
                  {entry.currency}: {formatDashboardAmount(entry.amount)}
                </span>
              ))}
            </div>
          ) : (
            <p className="overview-kpi-note">
              {dashboard.deals.status === "forbidden"
                ? "Нет разрешения просматривать аналитику сделок."
                : dashboard.deals.status === "unavailable"
                  ? "Данные временно недоступны."
                  : "Суммы показаны отдельно по валютам, без конвертации."}
            </p>
          )}
        </article>
      </section>

      <section className="overview-analytics" aria-label="Аналитика">
        <article className="overview-panel overview-sales-panel">
          <div className="overview-panel-heading">
            <div>
              <p className="overview-panel-kicker">АНАЛИТИКА</p>
              <h2 className="overview-panel-title">Созданные сделки</h2>
            </div>
            <span className="overview-panel-meta">
              {dashboard.deals.status === "available" ? `За ${periodLabel}` : dashboard.deals.status === "forbidden" ? "Нет доступа" : "Недоступно"}
            </span>
          </div>
          <DashboardDealChart dashboard={dashboard.deals} periodLabel={periodLabel} />
        </article>

        <article className="overview-panel overview-sources-panel">
          <div className="overview-panel-heading">
            <div>
              <p className="overview-panel-kicker">КАНАЛЫ</p>
              <h2 className="overview-panel-title">Источники клиентов</h2>
            </div>
            <span className="overview-panel-meta">Недоступно</span>
          </div>
          <div className="sources-empty-state" aria-label="Источники клиентов пока не собираются">
            <div className="sources-donut"><span>Нет<br /><small>данных</small></span></div>
            <p>В текущей CRM-схеме нет поля источника клиента, поэтому этот график пока не рассчитывается.</p>
          </div>
        </article>
      </section>
    </PageContainer>
  );
}

function DashboardDealChart({
  dashboard,
  periodLabel,
}: {
  dashboard: Awaited<ReturnType<typeof loadDashboardData>>["deals"];
  periodLabel: string;
}) {
  if (dashboard.status === "forbidden") {
    return <div className="sales-chart sales-chart--message">Нет доступа к аналитике сделок.</div>;
  }
  if (dashboard.status === "unavailable") {
    return <div className="sales-chart sales-chart--message">Не удалось загрузить данные сделок.</div>;
  }

  const { createdDeals, maxCreatedDeals } = dashboard.value;
  const hasCreatedDeals = maxCreatedDeals > 0;
  const labelStep = Math.max(1, Math.ceil(createdDeals.length / 5));

  return (
    <div className="sales-chart" aria-label={`Количество созданных сделок за ${periodLabel}`}>
      {hasCreatedDeals ? (
        <>
          <div className="sales-chart-y-labels" aria-hidden="true">
            <span>{maxCreatedDeals}</span>
            <span>{Math.ceil(maxCreatedDeals / 2)}</span>
            <span>0</span>
          </div>
          <div className="sales-chart-plot">
            {createdDeals.map((point, index) => (
              <div className="sales-chart-bar-wrap" key={point.date} title={`${formatChartDate(point.date)}: ${point.count}`}>
                <span
                  className={`sales-chart-bar${point.count === 0 ? " sales-chart-bar--empty" : ""}`}
                  style={{ height: `${point.count === 0 ? 0 : Math.max(4, (point.count / maxCreatedDeals) * 100)}%` }}
                  aria-hidden="true"
                />
                {index % labelStep === 0 || index === createdDeals.length - 1 ? (
                  <span className="sales-chart-label" aria-hidden="true">{formatChartDate(point.date)}</span>
                ) : null}
              </div>
            ))}
          </div>
          <ul className="sr-only">
            {createdDeals.map((point) => <li key={point.date}>{formatChartDate(point.date)}: {point.count} сделок</li>)}
          </ul>
        </>
      ) : (
        <p className="sales-chart-empty">За выбранный период сделки не создавались.</p>
      )}
    </div>
  );
}

function formatChartDate(value: string): string {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}
