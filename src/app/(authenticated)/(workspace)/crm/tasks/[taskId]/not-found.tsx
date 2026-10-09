import { CrmPageNotice } from "@/components/crm/crm-page-notice";
import { notFoundError } from "@/lib/crm/access";

export default function TaskNotFound() {
  return <CrmPageNotice title="Задача не найдена" message={notFoundError("задача").message} />;
}
