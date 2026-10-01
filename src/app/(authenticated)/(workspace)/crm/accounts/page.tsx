import Link from "next/link";
import { ArchiveForm } from "@/components/crm/archive-form";
import { AccountForm } from "@/components/crm/account-form";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/layout/page-container";
import { createAccountAction, updateAccountAction, archiveAccountAction } from "@/app/actions/crm/accounts";
import { resolveCrmAccess, permissionError } from "@/lib/crm/access";
import { listAccountsForOrganization } from "@/lib/crm/queries";

type AccountsPageProps = {
  searchParams: Promise<{ edit?: string | string[] }>;
};

export default async function AccountsPage({ searchParams }: AccountsPageProps) {
  const access = await resolveCrmAccess();
  if (!access.ok) {
    return <CrmPageNotice title="Не удалось проверить доступ" message={access.error.message} />;
  }

  const canRead = access.value.permissions.has("accounts.read");
  const canManage = access.value.permissions.has("accounts.manage");
  if (!canRead && !canManage) {
    return <CrmPageNotice title="Нет доступа к аккаунтам" message={permissionError("аккаунтам", "read").message} />;
  }

  const result = canRead
    ? await listAccountsForOrganization(access.value.supabase, access.value.organizationId)
    : { ok: true as const, value: [] };
  if (!result.ok) return <CrmPageNotice title="Не удалось загрузить аккаунты" message={result.error.message} />;

  const query = await searchParams;
  const requestedEdit = Array.isArray(query.edit) ? query.edit[0] : query.edit;
  const editingAccount = result.value.find((account) => account.id === requestedEdit);

  return (
    <PageContainer>
      <p className="eyebrow">CRM</p>
      <h1 className="page-title">Аккаунты</h1>
      <p className="page-intro">Компании и организации вашей клиентской базы.</p>

      {requestedEdit && !editingAccount ? (
        <div className="crm-notice" role="status">Аккаунт не найден, архивирован или недоступен.</div>
      ) : null}
      {!canRead && canManage ? (
        <div className="crm-notice" role="status">Вы можете создавать аккаунты, но у вас нет права просматривать существующие записи.</div>
      ) : null}

      {canManage ? (
        <section className="crm-panel" aria-labelledby={editingAccount ? "edit-account-heading" : "create-account-heading"}>
          <div className="crm-panel-heading">
            <h2 className="section-heading" id={editingAccount ? "edit-account-heading" : "create-account-heading"}>
              {editingAccount ? "Изменить аккаунт" : "Новый аккаунт"}
            </h2>
            {editingAccount ? <Link className="crm-text-link" href="/crm/accounts">Отмена</Link> : null}
          </div>
          <AccountForm
            key={editingAccount?.id ?? "new-account"}
            account={editingAccount}
            action={editingAccount ? updateAccountAction : createAccountAction}
          />
        </section>
      ) : null}

      {canRead ? (
        <section className="crm-section" aria-labelledby="accounts-list-heading">
          <div className="crm-list-heading">
            <h2 className="section-heading" id="accounts-list-heading">Все аккаунты</h2>
            <span className="field-hint">{result.value.length} записей</span>
          </div>

          {result.value.length === 0 ? (
            <Card className="crm-empty-state">
              <h3>Аккаунтов пока нет</h3>
              <p>{canManage ? "Добавьте первую компанию, чтобы начать вести клиентскую базу." : "Когда в организации появятся аккаунты, они будут показаны здесь."}</p>
            </Card>
          ) : (
            <div className="crm-record-list">
              {result.value.map((account) => (
                <Card className="crm-record" key={account.id}>
                  <div className="crm-record-main">
                    <h3>{account.name}</h3>
                    <div className="crm-record-details">
                      {account.industry ? <span>{account.industry}</span> : null}
                      {account.phone ? <span>{account.phone}</span> : null}
                      {account.website ? <span>{account.website}</span> : null}
                    </div>
                  </div>
                  {canManage ? (
                    <div className="crm-record-actions">
                      <Link className="button-link button-link--secondary" href={`/crm/accounts?edit=${account.id}`}>Изменить</Link>
                      <ArchiveForm id={account.id} label={account.name} action={archiveAccountAction} />
                    </div>
                  ) : null}
                </Card>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </PageContainer>
  );
}

function CrmPageNotice({ title, message }: { title: string; message: string }) {
  return (
    <PageContainer>
      <Card className="crm-notice-card">
        <h1>{title}</h1>
        <p>{message}</p>
      </Card>
    </PageContainer>
  );
}
