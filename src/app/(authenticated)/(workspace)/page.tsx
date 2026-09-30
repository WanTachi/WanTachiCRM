import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/layout/page-container";

const foundations = [
  { label: "Application", value: "Next.js · TypeScript", note: "App Router foundation" },
  { label: "Interface", value: "Adaptive shell", note: "Light and dark system themes" },
  { label: "Workspace", value: "Organization ready", note: "Tenant access is checked on the server" },
];

export default function Home() {
  return (
    <PageContainer>
      <p className="eyebrow">Workspace</p>
      <h1 className="page-title">Обзор</h1>
      <p className="page-intro">Базовое рабочее пространство платформы. Здесь будут появляться инструменты вашей команды по мере готовности модулей.</p>
      <section className="welcome-panel" aria-labelledby="welcome-title">
        <div className="welcome-kicker"><span className="welcome-mark" aria-hidden="true" /> Рабочее пространство готово к настройке</div>
        <h2 className="welcome-title" id="welcome-title">Основа вашей команды готова</h2>
        <p className="welcome-copy">Учётная запись и организация защищены. Следующие этапы добавят CRM-инструменты поверх этой основы.</p>
      </section>
      <h2 className="section-heading">Основа платформы</h2>
      <div className="foundation-grid">
        {foundations.map((item) => (
          <Card key={item.label}>
            <p className="foundation-card-label">{item.label}</p>
            <p className="foundation-card-value">{item.value}</p>
            <p className="foundation-card-note">{item.note}</p>
          </Card>
        ))}
      </div>
      <div style={{ marginTop: "1.25rem" }}><Badge>Phase 1 · Identity foundation</Badge></div>
    </PageContainer>
  );
}
