import Link from "next/link";
import { ArchiveForm } from "@/components/crm/archive-form";
import { ContactForm } from "@/components/crm/contact-form";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/layout/page-container";
import { archiveContactAction, createContactAction, updateContactAction } from "@/app/actions/crm/contacts";
import { permissionError, resolveCrmAccess } from "@/lib/crm/access";
import { listAccountsForOrganization, listContactsForOrganization } from "@/lib/crm/queries";
import { UtilityIcon } from "@/components/layout/nav-icon";

type ContactsPageProps = {
  searchParams: Promise<{ edit?: string | string[]; q?: string | string[] }>;
};

export default async function ContactsPage({ searchParams }: ContactsPageProps) {
  const access = await resolveCrmAccess();
  if (!access.ok) {
    return <CrmPageNotice title="Не удалось проверить доступ" message={access.error.message} />;
  }

  const canRead = access.value.permissions.has("contacts.read");
  const canManage = access.value.permissions.has("contacts.manage");
  if (!canRead && !canManage) {
    return <CrmPageNotice title="Нет доступа к контактам" message={permissionError("контактам", "read").message} />;
  }

  const contactsResult = canRead
    ? await listContactsForOrganization(access.value.supabase, access.value.organizationId)
    : { ok: true as const, value: [] };
  if (!contactsResult.ok) return <CrmPageNotice title="Не удалось загрузить контакты" message={contactsResult.error.message} />;

  const canReadAccounts = access.value.permissions.has("accounts.read");
  const accountsResult = canReadAccounts
    ? await listAccountsForOrganization(access.value.supabase, access.value.organizationId)
    : null;
  if (accountsResult && !accountsResult.ok) {
    return <CrmPageNotice title="Не удалось загрузить аккаунты" message={accountsResult.error.message} />;
  }
  const accounts = accountsResult?.ok ? accountsResult.value : [];
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));

  const query = await searchParams;
  const requestedEdit = Array.isArray(query.edit) ? query.edit[0] : query.edit;
  const editingContact = contactsResult.value.find((contact) => contact.id === requestedEdit);
  const searchTerm = (Array.isArray(query.q) ? query.q[0] : query.q)?.trim() ?? "";
  const normalizedSearchTerm = searchTerm.toLocaleLowerCase("ru-RU");
  const visibleContacts = contactsResult.value.filter((contact) => {
    const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ");
    return !normalizedSearchTerm || [
      name,
      contact.job_title,
      contact.email,
      contact.phone,
      contact.account_id ? accountNames.get(contact.account_id) : null,
    ].some((value) => value?.toLocaleLowerCase("ru-RU").includes(normalizedSearchTerm));
  });

  return (
    <PageContainer>
      <div className="page-heading-row">
        <div className="page-heading-copy">
          <p className="eyebrow">CRM / КЛИЕНТЫ</p>
          <h1 className="page-title">Контакты</h1>
          <p className="page-intro">Люди, связанные с аккаунтами или работающие с вашей командой напрямую.</p>
        </div>
        {canRead ? <span className="page-heading-meta">{contactsResult.value.length} всего</span> : null}
      </div>

      {requestedEdit && !editingContact ? (
        <div className="crm-notice" role="status">Контакт не найден, архивирован или недоступен.</div>
      ) : null}
      {!canRead && canManage ? (
        <div className="crm-notice" role="status">Вы можете создавать контакты, но у вас нет права просматривать существующие записи.</div>
      ) : null}

      {canManage ? (
        <section className="crm-panel" aria-labelledby={editingContact ? "edit-contact-heading" : "create-contact-heading"}>
          <div className="crm-panel-heading">
            <h2 className="section-heading" id={editingContact ? "edit-contact-heading" : "create-contact-heading"}>
              {editingContact ? "Изменить контакт" : "Новый контакт"}
            </h2>
            {editingContact ? <Link className="crm-text-link" href="/crm/contacts">Отмена</Link> : null}
          </div>
          <ContactForm
            key={editingContact?.id ?? "new-contact"}
            contact={editingContact}
            accounts={accounts}
            canReadAccounts={canReadAccounts}
            action={editingContact ? updateContactAction : createContactAction}
          />
        </section>
      ) : null}

      {canRead ? (
        <section className="crm-section" aria-labelledby="contacts-list-heading">
          <div className="crm-list-heading">
            <div>
              <h2 className="section-heading" id="contacts-list-heading">Контактная база</h2>
              <p className="section-description">Активные контакты вашей организации</p>
            </div>
            <span className="crm-list-meta">{visibleContacts.length} показано</span>
          </div>

          <div className="data-toolbar">
            <div className="data-tabs" aria-label="Фильтр по статусу">
              <span className="data-tab data-tab--active" aria-current="page">Активные</span>
            </div>
            <form className="data-search" action="/crm/contacts" method="get">
              <UtilityIcon name="search" />
              <label className="sr-only" htmlFor="contact-search">Поиск контактов</label>
              <input id="contact-search" name="q" type="search" placeholder="Поиск по имени, email или компании" defaultValue={searchTerm} />
              <button type="submit" className="search-submit">Найти</button>
            </form>
          </div>

          {visibleContacts.length === 0 ? (
            <Card className="crm-empty-state">
              <h3>{searchTerm ? "Ничего не найдено" : "Контактов пока нет"}</h3>
              <p>{searchTerm ? "Измените поисковый запрос и попробуйте ещё раз." : canManage ? "Добавьте первый контакт, чтобы начать работу с клиентской базой." : "Когда в организации появятся контакты, они будут показаны здесь."}</p>
            </Card>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <caption className="sr-only">Активные контакты организации</caption>
                <thead><tr><th scope="col">Контакт</th><th scope="col">Компания</th><th scope="col">Должность</th><th scope="col">Связь</th>{canManage ? <th scope="col"><span className="sr-only">Действия</span></th> : null}</tr></thead>
                <tbody>
                  {visibleContacts.map((contact) => {
                const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(" ");
                return (
                  <tr key={contact.id}>
                    <td><Link className="table-primary crm-text-link" href={`/crm/contacts/${contact.id}`}>{fullName}</Link><span className="table-secondary">{contact.email || "Email не указан"}</span></td>
                    <td>{contact.account_id ? accountNames.get(contact.account_id) ?? "Аккаунт связан" : <span className="table-secondary">Без аккаунта</span>}</td>
                    <td>{contact.job_title || <span className="table-secondary">—</span>}</td>
                    <td>{contact.phone || <span className="table-secondary">—</span>}</td>
                    {canManage ? <td><div className="table-actions"><Link className="button-link button-link--secondary" href={`/crm/contacts?edit=${contact.id}`}>Изменить</Link><ArchiveForm id={contact.id} label={fullName} action={archiveContactAction} /></div></td> : null}
                  </tr>
                );
              })}
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
