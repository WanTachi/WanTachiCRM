BEGIN;

-- UPDATE statements that filter CRM rows also require the resulting row to pass
-- the SELECT policy. Keep archived accounts hidden from read-only members while
-- allowing users who can both read and manage accounts to archive them.
ALTER POLICY crm_accounts_select
  ON public.crm_accounts
  USING (
    (
      archived_at IS NULL
      AND private.has_organization_permission(organization_id, 'accounts.read')
    )
    OR
    (
      archived_at IS NOT NULL
      AND private.has_organization_permission(organization_id, 'accounts.read')
      AND private.has_organization_permission(organization_id, 'accounts.manage')
    )
  );

COMMIT;
