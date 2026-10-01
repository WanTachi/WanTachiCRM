import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/layout/page-container";

export function CrmPageNotice({ title, message }: { title: string; message: string }) {
  return (
    <PageContainer>
      <Card className="crm-notice-card">
        <h1>{title}</h1>
        <p>{message}</p>
      </Card>
    </PageContainer>
  );
}
