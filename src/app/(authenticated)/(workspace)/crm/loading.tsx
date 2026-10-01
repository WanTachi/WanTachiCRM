import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/layout/page-container";

export default function CrmLoading() {
  return (
    <PageContainer>
      <p className="eyebrow">CRM</p>
      <h1 className="page-title">Загрузка раздела…</h1>
      <Card className="crm-loading-card" aria-live="polite">Загружаем данные организации.</Card>
    </PageContainer>
  );
}
