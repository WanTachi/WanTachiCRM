import Link from "next/link";
import { ArchiveForm } from "@/components/crm/archive-form";
import { ContactForm } from "@/components/crm/contact-form";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/layout/page-container";
import { archiveContactAction, createContactAction, updateContactAction } from "@/app/actions/crm/contacts";
import { permissionError, resolveCrmAccess } from "@/lib/crm/access";
import { listAccountsForOrganization, listContactsForOrganization } from "@/lib/crm/queries";

type ContactsPageProps = {
  searchParams: Promise<{ edit?: string | string[] }>;
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

  return (
    <PageContainer>
      <p className="eyebrow">CRM</p>
      <h1 className="page-title">Контакты</h1>
      <p className="page-intro">Люди, связанные с аккаунтами или работающие с вашей командой напрямую.</p>

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
            <h2 className="section-heading" id="contacts-list-heading">Все контакты</h2>
            <span className="field-hint">{contactsResult.value.length} записей</span>
          </div>

          {contactsResult.value.length === 0 ? (
            <Card className="crm-empty-state">
              <h3>Контактов пока нет</h3>
              <p>{canManage ? "Добавьте первый контакт, чтобы начать работу с клиентской базой." : "Когда в организации появятся контакты, они будут показаны здесь."}</p>
            </Card>
          ) : (
            <div className="crm-record-list">
              {contactsResult.value.map((contact) => {
                const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(" ");
                return (
                  <Card className="crm-record" key={contact.id}>
                    <div className="crm-record-main">
                      <h3>{fullName}</h3>
                      <div className="crm-record-details">
                        {contact.job_title ? <span>{contact.job_title}</span> : null}
                        {contact.email ? <span>{contact.email}</span> : null}
                        {contact.phone ? <span>{contact.phone}</span> : null}
                        {contact.account_id ? <span>{accountNames.get(contact.account_id) ?? "Аккаунт связан"}</span> : null}
                      </div>
                    </div>
                    {canManage ? (
                      <div className="crm-record-actions">
                        <Link className="button-link button-link--secondary" href={`/crm/contacts?edit=${contact.id}`}>Изменить</Link>
                        <ArchiveForm id={contact.id} label={fullName} action={archiveContactAction} />
                      </div>
                    ) : null}
                  </Card>
                );
              })}
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
