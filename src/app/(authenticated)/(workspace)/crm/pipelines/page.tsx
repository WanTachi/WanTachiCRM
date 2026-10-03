import Link from "next/link";
import { ArchiveForm } from "@/components/crm/archive-form";
import { CrmPageNotice } from "@/components/crm/crm-page-notice";
import { PipelineForm } from "@/components/crm/pipeline-form";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/layout/page-container";
import { archivePipelineAction, createPipelineAction, updatePipelineAction } from "@/app/actions/crm/pipelines";
import { notFoundError, permissionError, resolveCrmAccess } from "@/lib/crm/access";
import { listAssignableMembersForOrganization, listPipelinesWithStageCountsForOrganization } from "@/lib/crm/queries";
import { isCrmRecordId } from "@/lib/crm/validation";

type PipelinesPageProps = {
  searchParams: Promise<{ edit?: string | string[] }>;
};

export default async function PipelinesPage({ searchParams }: PipelinesPageProps) {
  const access = await resolveCrmAccess();
  if (!access.ok) return <CrmPageNotice title="Не удалось проверить доступ" message={access.error.message} />;

  const canRead = access.value.permissions.has("pipelines.read");
  const canManage = access.value.permissions.has("pipelines.manage");
  const canAssignOwners = access.value.permissions.has("members.read");
  if (!canRead && !canManage) {
    return <CrmPageNotice title="Нет доступа к воронкам" message={permissionError("воронкам", "read").message} />;
  }

  const [pipelinesResult, membersResult, query] = await Promise.all([
    canRead
      ? listPipelinesWithStageCountsForOrganization(access.value.supabase, access.value.organizationId)
      : Promise.resolve({ ok: true as const, value: [] }),
    canManage && canAssignOwners
      ? listAssignableMembersForOrganization(access.value.supabase, access.value.organizationId)
      : Promise.resolve({ ok: true as const, value: [] }),
    searchParams,
  ]);
  if (!pipelinesResult.ok) {
    return <CrmPageNotice title="Не удалось загрузить воронки" message={pipelinesResult.error.message} />;
  }

  const requestedEdit = Array.isArray(query.edit) ? query.edit[0] : query.edit;
  const editingPipeline = requestedEdit && isCrmRecordId(requestedEdit)
    ? pipelinesResult.value.find((pipeline) => pipeline.id === requestedEdit)
    : undefined;
  const members = membersResult.ok ? membersResult.value : [];

  return (
    <PageContainer>
      <div className="page-heading-row">
        <div className="page-heading-copy">
          <p className="eyebrow">CRM / ПРОДАЖИ</p>
          <h1 className="page-title">Воронки</h1>
          <p className="page-intro">Управляйте этапами продаж и воронками вашей организации.</p>
        </div>
        {canRead ? <span className="page-heading-meta">{pipelinesResult.value.length} всего</span> : null}
      </div>

      {requestedEdit && !editingPipeline ? (
        <div className="crm-notice" role="status">{notFoundError("воронка").message}</div>
      ) : null}
      {!canRead && canManage ? (
        <div className="crm-notice" role="status">Вы можете создавать воронки, но у вас нет права просматривать существующие.</div>
      ) : null}

      {canManage ? (
        <section className="crm-panel" aria-labelledby={editingPipeline ? "edit-pipeline-heading" : "create-pipeline-heading"}>
          <div className="crm-panel-heading">
            <h2 className="section-heading" id={editingPipeline ? "edit-pipeline-heading" : "create-pipeline-heading"}>
              {editingPipeline ? "Изменить воронку" : "Новая воронка"}
            </h2>
            {editingPipeline ? <Link className="crm-text-link" href="/crm/pipelines">Отмена</Link> : null}
          </div>
          <PipelineForm
            key={editingPipeline?.id ?? "new-pipeline"}
            pipeline={editingPipeline}
            members={members}
            currentUserId={access.value.userId}
            canAssignOwners={canAssignOwners}
            action={editingPipeline ? updatePipelineAction : createPipelineAction}
          />
        </section>
      ) : null}

      {canRead ? (
        <section className="crm-section" aria-labelledby="pipelines-list-heading">
          <div className="crm-list-heading">
            <h2 className="section-heading" id="pipelines-list-heading">Активные воронки</h2>
            <span className="field-hint">{pipelinesResult.value.length} записей</span>
          </div>
          {pipelinesResult.value.length === 0 ? (
            <Card className="crm-empty-state">
              <h3>Воронок пока нет</h3>
              <p>{canManage ? "Создайте воронку, затем добавьте в неё этапы." : "Когда в организации появятся воронки, они будут показаны здесь."}</p>
            </Card>
          ) : (
            <div className="crm-record-list">
              {pipelinesResult.value.map((pipeline) => (
                <Card className="crm-record" key={pipeline.id}>
                  <div className="crm-record-main">
                    <h3><Link href={`/crm/pipelines/${pipeline.id}`}>{pipeline.name}</Link></h3>
                    <div className="crm-record-details">
                      {pipeline.description ? <span>{pipeline.description}</span> : null}
                      <span>{pipeline.active_stage_count} активных этапов</span>
                      <span>Владелец: {pipeline.owner_user_id === access.value.userId ? "вы" : pipeline.owner_user_id ? "участник команды" : "не назначен"}</span>
                      <span>Создана: {new Date(pipeline.created_at).toLocaleDateString("ru-RU")}</span>
                    </div>
                  </div>
                  {canManage ? (
                    <div className="crm-record-actions">
                      <Link className="button-link button-link--secondary" href={`/crm/pipelines?edit=${pipeline.id}`}>Изменить</Link>
                      <Link className="button-link button-link--secondary" href={`/crm/pipelines/${pipeline.id}`}>Этапы</Link>
                      <ArchiveForm id={pipeline.id} label={pipeline.name} action={archivePipelineAction} />
                    </div>
                  ) : (
                    <Link className="button-link button-link--secondary" href={`/crm/pipelines/${pipeline.id}`}>Открыть</Link>
                  )}
                </Card>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </PageContainer>
  );
}
