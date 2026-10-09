import { CrmPageNotice } from "@/components/crm/crm-page-notice";
import { notFoundError } from "@/lib/crm/access";

export default function DealNotFound() {
  return <CrmPageNotice title="Сделка не найдена" message={notFoundError("сделка").message} />;
}
