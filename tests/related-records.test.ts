import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RelatedDealRecords } from "../src/components/crm/related-records";
import type { CrmDeal } from "../src/lib/crm/types";

const deal: CrmDeal = {
  id: "a5000000-0000-4000-8000-000000000001",
  name: "Contact 360 Test Deal",
  description: null,
  pipeline_id: "a6000000-0000-4000-8000-000000000001",
  stage_id: "a7000000-0000-4000-8000-000000000001",
  account_id: "a3000000-0000-4000-8000-000000000001",
  contact_id: null,
  amount: null,
  currency: null,
  expected_close_date: null,
  owner_user_id: null,
  created_at: "2026-10-01T12:00:00Z",
  updated_at: "2026-10-01T12:00:00Z",
};

describe("RelatedDealRecords navigation", () => {
  it("renders the active deal title as a real Deal 360 link", () => {
    const html = renderToStaticMarkup(createElement(RelatedDealRecords, {
      deals: [deal],
      pipelineNames: new Map([[deal.pipeline_id, "Продажи"]]),
      stageNames: new Map([[deal.stage_id, "Переговоры"]]),
      canManage: false,
      userId: "user-id",
    }));

    expect(html).toContain(`<a class="crm-text-link" href="/crm/deals/${deal.id}">${deal.name}</a>`);
    expect(html).not.toContain('href="/crm/deals"');
  });
});
