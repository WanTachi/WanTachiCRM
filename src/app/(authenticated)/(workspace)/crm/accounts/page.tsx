import Link from "next/link";
import { ArchiveForm } from "@/components/crm/archive-form";
import { AccountForm } from "@/components/crm/account-form";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/layout/page-container";
import { createAccountAction, updateAccountAction, archiveAccountAction } from "@/app/actions/crm/accounts";
import { resolveCrmAccess, permissionError } from "@/lib/crm/access";
import { listAccountsForOrganization } from "@/lib/crm/queries";
import { UtilityIcon } from "@/components/layout/nav-icon";

type AccountsPageProps = {
  searchParams: Promise<{ edit?: string | string[]; q?: string | string[] }>;
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
  const searchTerm = (Array.isArray(query.q) ? query.q[0] : query.q)?.trim() ?? "";
  const normalizedSearchTerm = searchTerm.toLocaleLowerCase("ru-RU");
  const visibleAccounts = result.value.filter((account) => !normalizedSearchTerm || [
    account.name,
    account.industry,
    account.phone,
    account.website,
  ].some((value) => value?.toLocaleLowerCase("ru-RU").includes(normalizedSearchTerm)));

  return (
    <PageContainer>
      <div className="page-heading-row">
        <div className="page-heading-copy">
          <p className="eyebrow">CRM / КЛИЕНТЫ</p>
          <h1 className="page-title">Аккаунты</h1>
          <p className="page-intro">Компании и организации вашей клиентской базы.</p>
        </div>
        {canRead ? <span className="page-heading-meta">{result.value.length} всего</span> : null}
      </div>

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
            <div>
              <h2 className="section-heading" id="accounts-list-heading">Клиентская база</h2>
              <p className="section-description">Активные компании вашей организации</p>
            </div>
            <span className="crm-list-meta">{visibleAccounts.length} показано</span>
          </div>

          <div className="data-toolbar">
            <div className="data-tabs" aria-label="Фильтр по статусу">
              <span className="data-tab data-tab--active" aria-current="page">Активные</span>
            </div>
            <form className="data-search" action="/crm/accounts" method="get">
              <UtilityIcon name="search" />
              <label className="sr-only" htmlFor="account-search">Поиск аккаунтов</label>
              <input id="account-search" name="q" type="search" placeholder="Поиск по названию или сфере" defaultValue={searchTerm} />
              <button type="submit" className="search-submit">Найти</button>
            </form>
          </div>

          {visibleAccounts.length === 0 ? (
            <Card className="crm-empty-state">
              <h3>{searchTerm ? "Ничего не найдено" : "Аккаунтов пока нет"}</h3>
              <p>{searchTerm ? "Измените поисковый запрос и попробуйте ещё раз." : canManage ? "Добавьте первую компанию, чтобы начать вести клиентскую базу." : "Когда в организации появятся аккаунты, они будут показаны здесь."}</p>
            </Card>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <caption className="sr-only">Активные аккаунты организации</caption>
                <thead><tr><th scope="col">Компания</th><th scope="col">Сфера</th><th scope="col">Телефон</th><th scope="col">Изменена</th>{canManage ? <th scope="col"><span className="sr-only">Действия</span></th> : null}</tr></thead>
                <tbody>
                  {visibleAccounts.map((account) => (
                    <tr key={account.id}>
                      <td><span className="table-primary">{account.name}</span>{account.website ? <span className="table-secondary">{account.website}</span> : null}</td>
                      <td>{account.industry || <span className="table-secondary">—</span>}</td>
                      <td>{account.phone || <span className="table-secondary">—</span>}</td>
                      <td>{new Date(account.updated_at).toLocaleDateString("ru-RU")}</td>
                      {canManage ? <td><div className="table-actions"><Link className="button-link button-link--secondary" href={`/crm/accounts?edit=${account.id}`}>Изменить</Link><ArchiveForm id={account.id} label={account.name} action={archiveAccountAction} /></div></td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
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
