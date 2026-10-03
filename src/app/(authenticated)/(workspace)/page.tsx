import { PageContainer } from "@/components/layout/page-container";

const metrics = [
  { label: "Выручка", note: "Аналитика появится после появления сделок" },
  { label: "Новые клиенты", note: "Подключите реальные контакты" },
  { label: "Активные сделки", note: "Создайте первую сделку" },
  { label: "Выполненные задачи", note: "Задачи ещё не заведены" },
];

export default function Home() {
  return (
    <PageContainer>
      <section className="overview-heading" aria-labelledby="overview-title">
        <div className="overview-heading-copy">
          <p className="eyebrow">ОБЗОР CRM</p>
          <h1 className="page-title" id="overview-title">Доброе утро</h1>
          <p className="page-intro">Ваш бизнес в порядке. Вот ключевые показатели на сегодня.</p>
        </div>
        <button className="period-control" type="button" disabled title="Переключение периода будет доступно после подключения аналитики">
          <span>Период: 30 дней</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
        </button>
      </section>

      <section className="overview-kpis" aria-label="Ключевые показатели">
        {metrics.map((metric) => (
          <article className="overview-kpi" key={metric.label}>
            <div className="overview-kpi-topline">
              <p className="overview-kpi-label">{metric.label}</p>
              <span className="overview-kpi-dot" aria-hidden="true" />
            </div>
            <p className="overview-kpi-value">Нет данных</p>
            <p className="overview-kpi-note">{metric.note}</p>
            <svg className="overview-sparkline" viewBox="0 0 180 48" aria-hidden="true" preserveAspectRatio="none">
              <path d="M0 39 C18 37 21 24 35 29 S53 40 68 28 S86 15 99 27 S115 36 128 24 S148 20 161 14 S173 18 180 8" />
            </svg>
          </article>
        ))}
      </section>

      <section className="overview-analytics" aria-label="Аналитика">
        <article className="overview-panel overview-sales-panel">
          <div className="overview-panel-heading">
            <div>
              <p className="overview-panel-kicker">АНАЛИТИКА</p>
              <h2 className="overview-panel-title">Продажи</h2>
            </div>
            <span className="overview-panel-meta">Нет данных</span>
          </div>
          <div className="sales-empty-chart" aria-label="График продаж будет доступен после появления данных">
            <div className="chart-y-labels" aria-hidden="true"><span>Нет данных</span><span>—</span><span>—</span><span>—</span></div>
            <div className="chart-grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
            <div className="chart-empty-message"><span className="empty-pulse" aria-hidden="true" />График станет доступен после появления продаж</div>
            <div className="chart-x-labels" aria-hidden="true"><span>1 нед.</span><span>2 нед.</span><span>3 нед.</span><span>4 нед.</span></div>
          </div>
        </article>

        <article className="overview-panel overview-sources-panel">
          <div className="overview-panel-heading">
            <div>
              <p className="overview-panel-kicker">КАНАЛЫ</p>
              <h2 className="overview-panel-title">Источники клиентов</h2>
            </div>
            <span className="overview-panel-meta">Нет данных</span>
          </div>
          <div className="sources-empty-state" aria-label="Источники клиентов будут доступны после появления данных">
            <div className="sources-donut"><span>Нет<br /><small>данных</small></span></div>
            <p>Источники появятся после добавления клиентов.</p>
          </div>
        </article>
      </section>
    </PageContainer>
  );
}
