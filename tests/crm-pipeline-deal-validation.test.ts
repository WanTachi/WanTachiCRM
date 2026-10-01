import { describe, expect, it } from "vitest";
import {
  isStageInPipeline,
  validateDealForm,
  validatePipelineForm,
  validatePipelineStageForm,
} from "../src/lib/crm/validation";

const pipelineId = "a1000000-0000-4000-8000-000000000001";
const stageId = "a2000000-0000-4000-8000-000000000001";
const accountId = "a3000000-0000-4000-8000-000000000001";
const contactId = "a4000000-0000-4000-8000-000000000001";
const ownerId = "a5000000-0000-4000-8000-000000000001";

function pipelineForm(values: Record<string, string> = {}) {
  const form = new FormData();
  form.set("name", "Sales pipeline");
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

function stageForm(values: Record<string, string> = {}) {
  const form = new FormData();
  form.set("pipeline_id", pipelineId);
  form.set("name", "Qualified");
  form.set("position", "0");
  form.set("probability", "25");
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

function dealForm(values: Record<string, string> = {}) {
  const form = new FormData();
  form.set("pipeline_id", pipelineId);
  form.set("stage_id", stageId);
  form.set("name", "Renewal opportunity");
  form.set("description", "Annual renewal");
  form.set("amount", "1250.50");
  form.set("currency", "aed");
  form.set("expected_close_date", "2026-12-31");
  form.set("account_id", accountId);
  form.set("contact_id", contactId);
  form.set("owner_user_id", ownerId);
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

describe("Pipelines and Deals validation", () => {
  it("trims and validates pipeline fields and optional owner UUID", () => {
    const result = validatePipelineForm(pipelineForm({
      name: "  Sales pipeline  ",
      description: "  New business  ",
      owner_user_id: ownerId,
    }));

    expect(result).toEqual({
      ok: true,
      value: { name: "Sales pipeline", description: "New business", owner_user_id: ownerId },
    });
    expect(validatePipelineForm(pipelineForm({ name: "  " }))).toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    });
    expect(validatePipelineForm(pipelineForm({ owner_user_id: "not-a-uuid" }))).toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    });
  });

  it("validates stage name, integer position, and probability boundaries", () => {
    expect(validatePipelineStageForm(stageForm())).toMatchObject({
      ok: true,
      value: { pipeline_id: pipelineId, name: "Qualified", position: 0, probability: 25 },
    });
    expect(validatePipelineStageForm(stageForm({ probability: "0" })).ok).toBe(true);
    expect(validatePipelineStageForm(stageForm({ probability: "100" })).ok).toBe(true);
    expect(validatePipelineStageForm(stageForm({ name: " " }))).toMatchObject({ ok: false });
    expect(validatePipelineStageForm(stageForm({ position: "-1" }))).toMatchObject({ ok: false });
    expect(validatePipelineStageForm(stageForm({ position: "1.5" }))).toMatchObject({ ok: false });
    expect(validatePipelineStageForm(stageForm({ probability: "-0.1" }))).toMatchObject({ ok: false });
    expect(validatePipelineStageForm(stageForm({ probability: "100.1" }))).toMatchObject({ ok: false });
  });

  it("validates deal fields and normalizes optional references and currency", () => {
    expect(validateDealForm(dealForm())).toEqual({
      ok: true,
      value: {
        pipeline_id: pipelineId,
        stage_id: stageId,
        account_id: accountId,
        contact_id: contactId,
        name: "Renewal opportunity",
        description: "Annual renewal",
        amount: "1250.50",
        currency: "AED",
        owner_user_id: ownerId,
        expected_close_date: "2026-12-31",
      },
    });

    const noAssociations = dealForm({ account_id: "", contact_id: "", owner_user_id: "", amount: "", currency: "", expected_close_date: "" });
    expect(validateDealForm(noAssociations)).toMatchObject({
      ok: true,
      value: {
        account_id: null,
        contact_id: null,
        owner_user_id: null,
        amount: null,
        currency: null,
        expected_close_date: null,
      },
    });
  });

  it("rejects malformed deal identifiers, amount, currency, and date", () => {
    expect(validateDealForm(dealForm({ pipeline_id: "bad" }))).toMatchObject({ ok: false });
    expect(validateDealForm(dealForm({ stage_id: "bad" }))).toMatchObject({ ok: false });
    expect(validateDealForm(dealForm({ account_id: "bad" }))).toMatchObject({ ok: false });
    expect(validateDealForm(dealForm({ contact_id: "bad" }))).toMatchObject({ ok: false });
    expect(validateDealForm(dealForm({ owner_user_id: "bad" }))).toMatchObject({ ok: false });
    expect(validateDealForm(dealForm({ amount: "-1" }))).toMatchObject({ ok: false });
    expect(validateDealForm(dealForm({ amount: "NaN" }))).toMatchObject({ ok: false });
    expect(validateDealForm(dealForm({ currency: "US" }))).toMatchObject({ ok: false });
    expect(validateDealForm(dealForm({ expected_close_date: "2026-02-30" }))).toMatchObject({ ok: false });
  });

  it("requires the selected stage to belong to the selected pipeline", () => {
    const stages = [
      { id: stageId, pipeline_id: pipelineId },
      { id: "a2000000-0000-4000-8000-000000000002", pipeline_id: "a1000000-0000-4000-8000-000000000002" },
    ];

    expect(isStageInPipeline(stages, pipelineId, stageId)).toBe(true);
    expect(isStageInPipeline(stages, pipelineId, stages[1].id)).toBe(false);
  });
});
