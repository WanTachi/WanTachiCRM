BEGIN;

-- UPDATE statements that filter CRM rows also require the resulting row to pass
-- the SELECT policy. Keep archived contacts hidden from read-only members while
-- allowing users who can both read and manage contacts to archive them.
ALTER POLICY crm_contacts_select
  ON public.crm_contacts
  USING (
    (
      archived_at IS NULL
      AND private.has_organization_permission(organization_id, 'contacts.read')
    )
    OR
    (
      archived_at IS NOT NULL
      AND private.has_organization_permission(organization_id, 'contacts.read')
      AND private.has_organization_permission(organization_id, 'contacts.manage')
    )
  );

COMMIT;
