import { describe, expect, it, vi } from "vitest";
import { archiveAccountForOrganization } from "../src/lib/crm/queries";
import type { createSupabaseServerClient } from "../src/lib/supabase/server";

type ServerSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function createSupabaseMock(response: { count: number | null; error: null | { message: string } }) {
  const query = Object.assign(Promise.resolve(response), {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
  });
  const from = vi.fn(() => query);
  const supabase = { from } as unknown as ServerSupabase;

  return { supabase, from, query };
}

describe("archiveAccountForOrganization", () => {
  it("archives without selecting the newly archived row", async () => {
    const { supabase, from, query } = createSupabaseMock({ count: 1, error: null });

    const result = await archiveAccountForOrganization(
      supabase,
      "organization-id",
      "account-id",
    );

    expect(result).toEqual({ ok: true, value: undefined });
    expect(from).toHaveBeenCalledWith("crm_accounts");
    expect(query.update).toHaveBeenCalledWith(
      { archived_at: expect.any(String) },
      { count: "exact" },
    );
    expect(query.eq).toHaveBeenNthCalledWith(1, "organization_id", "organization-id");
    expect(query.eq).toHaveBeenNthCalledWith(2, "id", "account-id");
    expect(query.is).toHaveBeenCalledWith("archived_at", null);
    expect(query.select).not.toHaveBeenCalled();
  });

  it("returns not found when no active tenant account was updated", async () => {
    const { supabase } = createSupabaseMock({ count: 0, error: null });

    const result = await archiveAccountForOrganization(
      supabase,
      "organization-id",
      "account-id",
    );

    expect(result).toMatchObject({ ok: false, error: { code: "not_found" } });
  });
});
