import Link from "next/link";
import { ArchiveForm } from "@/components/crm/archive-form";
import { CrmPageNotice } from "@/components/crm/crm-page-notice";
import { StageForm } from "@/components/crm/stage-form";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/layout/page-container";
import { archiveStageAction, createStageAction, updateStageAction } from "@/app/actions/crm/pipelines";
import { notFoundError, permissionError, resolveCrmAccess } from "@/lib/crm/access";
import { getActivePipelineForOrganization, listStagesForPipeline } from "@/lib/crm/queries";
import { isCrmRecordId } from "@/lib/crm/validation";

type PipelineDetailPageProps = {
  params: Promise<{ pipelineId: string }>;
  searchParams: Promise<{ editStage?: string | string[] }>;
};

export default async function PipelineDetailPage({ params, searchParams }: PipelineDetailPageProps) {
  const access = await resolveCrmAccess();
  if (!access.ok) return <CrmPageNotice title="Не удалось проверить доступ" message={access.error.message} />;
  if (!access.value.permissions.has("pipelines.read")) {
    return <CrmPageNotice title="Нет доступа к воронке" message={permissionError("воронкам", "read").message} />;
  }

  const { pipelineId } = await params;
  if (!isCrmRecordId(pipelineId)) {
    return <CrmPageNotice title="Воронка не найдена" message={notFoundError("воронка").message} />;
  }

  const [pipelineResult, stagesResult, query] = await Promise.all([
    getActivePipelineForOrganization(access.value.supabase, access.value.organizationId, pipelineId),
    listStagesForPipeline(access.value.supabase, access.value.organizationId, pipelineId),
    searchParams,
  ]);
  if (!pipelineResult.ok) return <CrmPageNotice title="Не удалось загрузить воронку" message={pipelineResult.error.message} />;
  if (!pipelineResult.value) return <CrmPageNotice title="Воронка не найдена" message={notFoundError("воронка").message} />;
  if (!stagesResult.ok) return <CrmPageNotice title="Не удалось загрузить этапы" message={stagesResult.error.message} />;

  const canManage = access.value.permissions.has("pipelines.manage");
  const requestedEdit = Array.isArray(query.editStage) ? query.editStage[0] : query.editStage;
  const editingStage = requestedEdit && isCrmRecordId(requestedEdit)
    ? stagesResult.value.find((stage) => stage.id === requestedEdit)
    : undefined;

  return (
    <PageContainer>
      <p className="eyebrow">CRM · PIPELINES</p>
      <div className="crm-title-row">
        <div>
          <h1 className="page-title">{pipelineResult.value.name}</h1>
          <p className="page-intro">{pipelineResult.value.description || "Этапы и порядок работы в этой воронке."}</p>
        </div>
        <div className="crm-record-actions">
          <Link className="button-link button-link--secondary" href="/crm/pipelines">Все воронки</Link>
          {canManage ? <Link className="button-link button-link--secondary" href={`/crm/pipelines?edit=${pipelineId}`}>Изменить воронку</Link> : null}
        </div>
      </div>

      {requestedEdit && !editingStage ? (
        <div className="crm-notice" role="status">{notFoundError("этап").message}</div>
      ) : null}

      {canManage ? (
        <section className="crm-panel" aria-labelledby={editingStage ? "edit-stage-heading" : "create-stage-heading"}>
          <div className="crm-panel-heading">
            <h2 className="section-heading" id={editingStage ? "edit-stage-heading" : "create-stage-heading"}>
              {editingStage ? "Изменить этап" : "Новый этап"}
            </h2>
            {editingStage ? <Link className="crm-text-link" href={`/crm/pipelines/${pipelineId}`}>Отмена</Link> : null}
          </div>
          <StageForm
            key={editingStage?.id ?? `new-stage-${pipelineId}`}
            pipelineId={pipelineId}
            stage={editingStage}
            action={editingStage ? updateStageAction : createStageAction}
          />
        </section>
      ) : null}

      <section className="crm-section" aria-labelledby="stages-list-heading">
        <div className="crm-list-heading">
          <h2 className="section-heading" id="stages-list-heading">Активные этапы</h2>
          <span className="field-hint">{stagesResult.value.length} этапов</span>
        </div>
        {stagesResult.value.length === 0 ? (
          <Card className="crm-empty-state">
            <h3>Этапов пока нет</h3>
            <p>{canManage ? "Добавьте первый этап, например «Новая сделка» или «Переговоры»." : "Когда в этой воронке появятся активные этапы, они будут показаны здесь."}</p>
          </Card>
        ) : (
          <div className="crm-record-list">
            {stagesResult.value.map((stage) => (
              <Card className="crm-record" key={stage.id}>
                <div className="crm-record-main">
                  <h3>{stage.position}. {stage.name}</h3>
                  <div className="crm-record-details">
                    <span>Позиция: {stage.position}</span>
                    <span>Вероятность: {stage.probability === null ? "не задана" : `${stage.probability}%`}</span>
                  </div>
                </div>
                {canManage ? (
                  <div className="crm-record-actions">
                    <Link className="button-link button-link--secondary" href={`/crm/pipelines/${pipelineId}?editStage=${stage.id}`}>Изменить</Link>
                    <ArchiveForm id={stage.id} label={stage.name} pipelineId={pipelineId} action={archiveStageAction} />
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </section>
    </PageContainer>
  );
}
