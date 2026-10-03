"use client";

import { useState } from "react";
import { useActionState } from "react";
import type {
  CrmAccount,
  CrmContact,
  CrmDeal,
  CrmMemberOption,
  CrmPipeline,
  CrmPipelineStage,
} from "@/lib/crm/types";
import type { CrmMutationAction } from "@/lib/crm/types";
import { isStageInPipeline } from "@/lib/crm/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function DealForm({
  deal,
  pipelines,
  stages,
  accounts,
  contacts,
  members,
  currentUserId,
  canAssignOwners,
  canReadAccounts,
  canReadContacts,
  defaultAccountId,
  action,
}: {
  deal?: CrmDeal;
  pipelines: CrmPipeline[];
  stages: CrmPipelineStage[];
  accounts: CrmAccount[];
  contacts: CrmContact[];
  members: CrmMemberOption[];
  currentUserId: string;
  canAssignOwners: boolean;
  canReadAccounts: boolean;
  canReadContacts: boolean;
  defaultAccountId?: string;
  action: CrmMutationAction;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [selectedPipelineId, setSelectedPipelineId] = useState(() =>
    deal && pipelines.some((pipeline) => pipeline.id === deal.pipeline_id) ? deal.pipeline_id : "",
  );
  const [selectedStageId, setSelectedStageId] = useState(() =>
    deal && isStageInPipeline(stages, deal.pipeline_id, deal.stage_id) ? deal.stage_id : "",
  );
  const prefix = deal ? `deal-${deal.id}` : "new-deal";
  const ownerIds = new Set(members.map((member) => member.user_id));
  ownerIds.add(currentUserId);
  const availableStages = stages.filter((stage) => isStageInPipeline([stage], selectedPipelineId, stage.id));
  const accountOptions = accounts;
  const contactOptions = contacts;
  const selectedAccountId = deal?.account_id ?? defaultAccountId ?? "";

  return (
    <form action={formAction} className="crm-form">
      {deal ? <input type="hidden" name="id" value={deal.id} /> : null}
      <div className="crm-form-grid">
        <div className="crm-field crm-field--wide">
          <label className="auth-label" htmlFor={`${prefix}-name`}>Название сделки *</label>
          <Input id={`${prefix}-name`} name="name" required minLength={1} maxLength={200} defaultValue={deal?.name ?? ""} />
        </div>
        <div className="crm-field">
          <label className="auth-label" htmlFor={`${prefix}-pipeline`}>Воронка *</label>
          <select
            className="input crm-select"
            id={`${prefix}-pipeline`}
            name="pipeline_id"
            required
            value={selectedPipelineId}
            onChange={(event) => {
              setSelectedPipelineId(event.currentTarget.value);
              setSelectedStageId("");
            }}
          >
            <option value="">Выберите воронку</option>
            {pipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
          </select>
        </div>
        <div className="crm-field">
          <label className="auth-label" htmlFor={`${prefix}-stage`}>Этап *</label>
          <select
            className="input crm-select"
            id={`${prefix}-stage`}
            name="stage_id"
            required
            value={selectedStageId}
            onChange={(event) => setSelectedStageId(event.currentTarget.value)}
            disabled={!selectedPipelineId || availableStages.length === 0}
          >
            <option value="">Выберите этап</option>
            {availableStages.map((stage) => (
              <option key={stage.id} value={stage.id}>{stage.position}. {stage.name}</option>
            ))}
          </select>
          {selectedPipelineId && availableStages.length === 0 ? (
            <span className="field-hint">В этой воронке пока нет активных этапов.</span>
          ) : null}
        </div>
        <div className="crm-field crm-field--wide">
          <label className="auth-label" htmlFor={`${prefix}-description`}>Описание</label>
          <textarea className="input crm-textarea" id={`${prefix}-description`} name="description" maxLength={5000} defaultValue={deal?.description ?? ""} />
        </div>
        {canReadAccounts ? (
          <div className="crm-field">
            <label className="auth-label" htmlFor={`${prefix}-account`}>Аккаунт</label>
            <select className="input crm-select" id={`${prefix}-account`} name="account_id" defaultValue={accountOptions.some((item) => item.id === selectedAccountId) ? selectedAccountId : ""}>
              <option value="">Без аккаунта</option>
              {accountOptions.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
            {deal?.account_id && !accountOptions.some((item) => item.id === deal.account_id) ? (
              <span className="field-hint">Связанный аккаунт неактивен или недоступен; сохранение очистит связь.</span>
            ) : null}
          </div>
        ) : null}
        {canReadContacts ? (
          <div className="crm-field">
            <label className="auth-label" htmlFor={`${prefix}-contact`}>Контакт</label>
            <select className="input crm-select" id={`${prefix}-contact`} name="contact_id" defaultValue={contactOptions.some((item) => item.id === deal?.contact_id) ? deal?.contact_id ?? "" : ""}>
              <option value="">Без контакта</option>
              {contactOptions.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {[contact.first_name, contact.last_name].filter(Boolean).join(" ")}
                </option>
              ))}
            </select>
            {deal?.contact_id && !contactOptions.some((item) => item.id === deal.contact_id) ? (
              <span className="field-hint">Связанный контакт неактивен или недоступен; сохранение очистит связь.</span>
            ) : null}
          </div>
        ) : null}
        <div className="crm-field">
          <label className="auth-label" htmlFor={`${prefix}-amount`}>Сумма</label>
          <Input id={`${prefix}-amount`} name="amount" type="number" min={0} step="any" defaultValue={deal?.amount ?? ""} />
        </div>
        <div className="crm-field">
          <label className="auth-label" htmlFor={`${prefix}-currency`}>Валюта</label>
          <Input id={`${prefix}-currency`} name="currency" maxLength={3} placeholder="USD" defaultValue={deal?.currency ?? ""} />
        </div>
        <div className="crm-field">
          <label className="auth-label" htmlFor={`${prefix}-close-date`}>Ожидаемая дата закрытия</label>
          <Input id={`${prefix}-close-date`} name="expected_close_date" type="date" defaultValue={deal?.expected_close_date ?? ""} />
        </div>
        {canAssignOwners ? (
          <div className="crm-field">
            <label className="auth-label" htmlFor={`${prefix}-owner`}>Владелец</label>
            <select className="input crm-select" id={`${prefix}-owner`} name="owner_user_id" defaultValue={deal ? deal.owner_user_id ?? "" : currentUserId}>
              <option value="">Без владельца</option>
              {[...ownerIds].map((userId) => (
                <option key={userId} value={userId}>
                  {userId === currentUserId ? "Вы" : `Участник · ${userId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {!canReadAccounts || !canReadContacts ? (
        <p className="field-hint">Без прав чтения Accounts или Contacts сделку можно сохранить без соответствующей связи.</p>
      ) : null}
      {state.error ? <p className="form-message form-message--error" role="alert">{state.error.message}</p> : null}
      {state.success ? <p className="form-message form-message--success" role="status">{state.success}</p> : null}
      <Button type="submit" disabled={pending || pipelines.length === 0 || availableStages.length === 0}>
        {pending ? "Сохраняем…" : deal ? "Сохранить сделку" : "Создать сделку"}
      </Button>
    </form>
  );
}
