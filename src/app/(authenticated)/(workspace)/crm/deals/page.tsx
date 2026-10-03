import Link from "next/link";
import { ArchiveForm } from "@/components/crm/archive-form";
import { CrmPageNotice } from "@/components/crm/crm-page-notice";
import { DealForm } from "@/components/crm/deal-form";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/layout/page-container";
import { archiveDealAction, createDealAction, updateDealAction } from "@/app/actions/crm/deals";
import { notFoundError, permissionError, resolveCrmAccess } from "@/lib/crm/access";
import {
  listAccountsForOrganization,
  listActiveStagesForOrganization,
  listAssignableMembersForOrganization,
  listContactsForOrganization,
  listDealsForOrganization,
  listPipelinesForOrganization,
} from "@/lib/crm/queries";
import { isCrmRecordId } from "@/lib/crm/validation";
import type { CrmAccount, CrmContact, CrmDeal, CrmPipeline, CrmPipelineStage } from "@/lib/crm/types";

type DealsPageProps = {
  searchParams: Promise<{ edit?: string | string[] }>;
};

export default async function DealsPage({ searchParams }: DealsPageProps) {
  const access = await resolveCrmAccess();
  if (!access.ok) return <CrmPageNotice title="Не удалось проверить доступ" message={access.error.message} />;

  const permissions = access.value.permissions;
  const canRead = permissions.has("deals.read");
  const canManage = permissions.has("deals.manage");
  const canReadPipelines = permissions.has("pipelines.read");
  const canReadAccounts = permissions.has("accounts.read");
  const canReadContacts = permissions.has("contacts.read");
  const canAssignOwners = permissions.has("members.read");
  if (!canRead && !canManage) {
    return <CrmPageNotice title="Нет доступа к сделкам" message={permissionError("сделкам", "read").message} />;
  }

  const [dealsResult, pipelinesResult, stagesResult, accountsResult, contactsResult, membersResult, query] = await Promise.all([
    canRead
      ? listDealsForOrganization(access.value.supabase, access.value.organizationId)
      : Promise.resolve({ ok: true as const, value: [] as CrmDeal[] }),
    canReadPipelines
      ? listPipelinesForOrganization(access.value.supabase, access.value.organizationId)
      : Promise.resolve({ ok: true as const, value: [] as CrmPipeline[] }),
    canReadPipelines
      ? listActiveStagesForOrganization(access.value.supabase, access.value.organizationId)
      : Promise.resolve({ ok: true as const, value: [] as CrmPipelineStage[] }),
    canReadAccounts
      ? listAccountsForOrganization(access.value.supabase, access.value.organizationId)
      : Promise.resolve({ ok: true as const, value: [] as CrmAccount[] }),
    canReadContacts
      ? listContactsForOrganization(access.value.supabase, access.value.organizationId)
      : Promise.resolve({ ok: true as const, value: [] as CrmContact[] }),
    canManage && canAssignOwners
      ? listAssignableMembersForOrganization(access.value.supabase, access.value.organizationId)
      : Promise.resolve({ ok: true as const, value: [] }),
    searchParams,
  ]);

  if (!dealsResult.ok) return <CrmPageNotice title="Не удалось загрузить сделки" message={dealsResult.error.message} />;
  if (!pipelinesResult.ok) return <CrmPageNotice title="Не удалось загрузить воронки" message={pipelinesResult.error.message} />;
  if (!stagesResult.ok) return <CrmPageNotice title="Не удалось загрузить этапы" message={stagesResult.error.message} />;
  if (!accountsResult.ok) return <CrmPageNotice title="Не удалось загрузить аккаунты" message={accountsResult.error.message} />;
  if (!contactsResult.ok) return <CrmPageNotice title="Не удалось загрузить контакты" message={contactsResult.error.message} />;

  const requestedEdit = Array.isArray(query.edit) ? query.edit[0] : query.edit;
  const editingDeal = canRead && requestedEdit && isCrmRecordId(requestedEdit)
    ? dealsResult.value.find((deal) => deal.id === requestedEdit)
    : undefined;
  const pipelineNames = new Map(pipelinesResult.value.map((pipeline) => [pipeline.id, pipeline.name]));
  const stageNames = new Map(stagesResult.value.map((stage) => [stage.id, stage.name]));
  const accountNames = new Map(accountsResult.value.map((account) => [account.id, account.name]));
  const contactNames = new Map(contactsResult.value.map((contact) => [
    contact.id,
    [contact.first_name, contact.last_name].filter(Boolean).join(" "),
  ]));
  const members = membersResult.ok ? membersResult.value : [];
  const dealColumns = canReadPipelines
    ? pipelinesResult.value.flatMap((pipeline) => stagesResult.value
      .filter((stage) => stage.pipeline_id === pipeline.id)
      .sort((left, right) => left.position - right.position)
      .map((stage) => ({
        id: stage.id,
        pipelineName: pipeline.name,
        stageName: stage.name,
        position: stage.position,
        deals: dealsResult.value.filter((deal) => deal.pipeline_id === pipeline.id && deal.stage_id === stage.id),
      })))
    : [];
  const activeStageIds = new Set(dealColumns.map((column) => column.id));
  const unplacedDeals = canReadPipelines
    ? dealsResult.value.filter((deal) => !activeStageIds.has(deal.stage_id))
    : dealsResult.value;
  if (unplacedDeals.length > 0) {
    dealColumns.push({
      id: "unplaced",
      pipelineName: canReadPipelines ? "Архивные или недоступные этапы" : "Воронка недоступна",
      stageName: "Без активного этапа",
      position: Number.MAX_SAFE_INTEGER,
      deals: unplacedDeals,
    });
  }

  return (
    <PageContainer>
      <div className="page-heading-row">
        <div className="page-heading-copy">
          <p className="eyebrow">CRM / ПРОДАЖИ</p>
          <h1 className="page-title">Сделки</h1>
          <p className="page-intro">Отслеживайте сделки, их этапы и ожидаемые даты закрытия.</p>
        </div>
        {canRead ? <span className="page-heading-meta">{dealsResult.value.length} активных</span> : null}
      </div>

      {requestedEdit && !editingDeal ? (
        <div className="crm-notice" role="status">{notFoundError("сделка").message}</div>
      ) : null}
      {!canRead && canManage ? (
        <div className="crm-notice" role="status">Вы можете создавать сделки, но у вас нет права просматривать существующие.</div>
      ) : null}

      {canManage && !canReadPipelines ? (
        <div className="crm-notice" role="status">Для создания и изменения сделки нужно также право чтения воронок.</div>
      ) : null}
      {canManage && canReadPipelines ? (
        <section className="crm-panel" aria-labelledby={editingDeal ? "edit-deal-heading" : "create-deal-heading"}>
          <div className="crm-panel-heading">
            <h2 className="section-heading" id={editingDeal ? "edit-deal-heading" : "create-deal-heading"}>
              {editingDeal ? "Изменить сделку" : "Новая сделка"}
            </h2>
            {editingDeal ? <Link className="crm-text-link" href="/crm/deals">Отмена</Link> : null}
          </div>
          {pipelinesResult.value.length === 0 || stagesResult.value.length === 0 ? (
            <div className="crm-empty-state">
              <p>Сначала нужна активная воронка и хотя бы один этап.</p>
              <Link className="crm-text-link" href="/crm/pipelines">Перейти к воронкам</Link>
            </div>
          ) : (
            <DealForm
              key={editingDeal?.id ?? "new-deal"}
              deal={editingDeal}
              pipelines={pipelinesResult.value}
              stages={stagesResult.value}
              accounts={accountsResult.value}
              contacts={contactsResult.value}
              members={members}
              currentUserId={access.value.userId}
              canAssignOwners={canAssignOwners}
              canReadAccounts={canReadAccounts}
              canReadContacts={canReadContacts}
              action={editingDeal ? updateDealAction : createDealAction}
            />
          )}
        </section>
      ) : null}

      {canRead ? (
        <section className="crm-section" aria-labelledby="deals-list-heading">
          <div className="crm-list-heading">
            <div>
              <h2 className="section-heading" id="deals-list-heading">Доска продаж</h2>
              <p className="section-description">Распределение по активным этапам воронок</p>
            </div>
            <span className="crm-list-meta">{dealColumns.filter((column) => column.id !== "unplaced").length} этапов</span>
          </div>
          {dealColumns.length === 0 ? (
            <Card className="crm-empty-state">
              <h3>Сделок пока нет</h3>
              <p>{canManage ? "Добавьте первую сделку, чтобы начать отслеживать продажи." : "Когда в организации появятся сделки, они будут показаны здесь."}</p>
            </Card>
          ) : (
            <div className="deal-board" aria-label="Сделки по этапам">
              {dealColumns.map((column, columnIndex) => (
                <section className="deal-column" key={column.id} data-stage-tone={columnIndex % 4} aria-label={`${column.pipelineName}: ${column.stageName}`}>
                  <header className="deal-column-header">
                    <div className="deal-column-title">
                      <span className="deal-pipeline-name">{column.pipelineName}</span>
                      <h3 className="deal-stage-name">{column.stageName}</h3>
                    </div>
                    <span className="deal-column-total">{column.deals.length}</span>
                  </header>
                  {column.deals.map((deal) => (
                    <Card className="deal-card" key={deal.id}>
                      <Link className="deal-card-title" href={`/crm/deals?edit=${deal.id}`}>{deal.name}</Link>
                      <div className="deal-card-meta">
                        <span>{formatAmount(deal.amount, deal.currency)}</span>
                        <span>{deal.expected_close_date ?? "Без срока"}</span>
                      </div>
                      <div className="deal-card-meta">
                        <span>{contactNames.get(deal.contact_id ?? "") ?? "Без контакта"}</span>
                        <span>{deal.account_id ? accountNames.get(deal.account_id) ?? "Аккаунт недоступен" : "Без аккаунта"}</span>
                        <span>{deal.owner_user_id === access.value.userId ? "Вы" : deal.owner_user_id ? "Участник команды" : "Без владельца"}</span>
                      </div>
                      {pipelineNames.get(deal.pipeline_id) ? <span className="table-secondary">{pipelineNames.get(deal.pipeline_id)}</span> : null}
                      {canManage ? (
                        <div className="deal-card-footer">
                          <span className="deal-stage-chip">{stageNames.get(deal.stage_id) ?? "Этап неактивен"}</span>
                          <div className="deal-card-actions">
                            <Link className="button-link button-link--secondary" href={`/crm/deals?edit=${deal.id}`}>Изменить</Link>
                            <ArchiveForm id={deal.id} label={deal.name} pipelineId={deal.pipeline_id} action={archiveDealAction} />
                          </div>
                        </div>
                      ) : null}
                    </Card>
                  ))}
                  {column.deals.length === 0 ? <p className="deal-column-empty">Нет сделок на этом этапе</p> : null}
                </section>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </PageContainer>
  );
}

function formatAmount(amount: number | string | null, currency: string | null): string {
  if (amount === null) return "не указана";
  const parsed = Number(amount);
  const formatted = Number.isFinite(parsed) ? parsed.toLocaleString("ru-RU") : String(amount);
  return [formatted, currency].filter(Boolean).join(" ");
}
