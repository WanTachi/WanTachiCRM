BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT no_plan();

SELECT set_config('test.deal_outcomes.user_a', gen_random_uuid()::text, true);
SELECT set_config('test.deal_outcomes.user_b', gen_random_uuid()::text, true);
SELECT set_config('test.deal_outcomes.admin_a', gen_random_uuid()::text, true);
SELECT set_config('test.deal_outcomes.member_a', gen_random_uuid()::text, true);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  (current_setting('test.deal_outcomes.user_a')::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'deal-outcome-owner-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  (current_setting('test.deal_outcomes.user_b')::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'deal-outcome-owner-b@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  (current_setting('test.deal_outcomes.admin_a')::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'deal-outcome-admin-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  (current_setting('test.deal_outcomes.member_a')::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'deal-outcome-member-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.deal_outcomes.user_a'), true);
SELECT set_config(
  'test.deal_outcomes.org_a',
  public.create_organization(
    'Deal Outcome Tenant A',
    'deal-outcome-tenant-a-' || substr(current_setting('test.deal_outcomes.user_a'), 1, 8)
  )::text,
  true
);
SELECT set_config('request.jwt.claim.sub', current_setting('test.deal_outcomes.user_b'), true);
SELECT set_config(
  'test.deal_outcomes.org_b',
  public.create_organization(
    'Deal Outcome Tenant B',
    'deal-outcome-tenant-b-' || substr(current_setting('test.deal_outcomes.user_b'), 1, 8)
  )::text,
  true
);
RESET ROLE;

INSERT INTO public.memberships (organization_id, user_id, role_id, status)
SELECT current_setting('test.deal_outcomes.org_a')::uuid,
       current_setting('test.deal_outcomes.admin_a')::uuid,
       role.id,
       'active'
FROM public.roles AS role
WHERE role.organization_id = current_setting('test.deal_outcomes.org_a')::uuid
  AND role.slug = 'admin';

INSERT INTO public.memberships (organization_id, user_id, role_id, status)
SELECT current_setting('test.deal_outcomes.org_a')::uuid,
       current_setting('test.deal_outcomes.member_a')::uuid,
       role.id,
       'active'
FROM public.roles AS role
WHERE role.organization_id = current_setting('test.deal_outcomes.org_a')::uuid
  AND role.slug = 'member';

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.role_permissions AS role_permission
    JOIN public.roles AS role ON role.id = role_permission.role_id
    JOIN public.permissions AS permission ON permission.id = role_permission.permission_id
    WHERE role.organization_id = current_setting('test.deal_outcomes.org_a')::uuid
      AND role.slug = 'owner'
      AND permission.key IN ('deals.read', 'deals.manage')
  ),
  2::bigint,
  'Owner receives Deal read and manage permissions'
);
SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.role_permissions AS role_permission
    JOIN public.roles AS role ON role.id = role_permission.role_id
    JOIN public.permissions AS permission ON permission.id = role_permission.permission_id
    WHERE role.organization_id = current_setting('test.deal_outcomes.org_a')::uuid
      AND role.slug = 'member'
      AND permission.key IN ('deals.read', 'deals.manage')
  ),
  1::bigint,
  'Member receives Deal read but not manage permission'
);
SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.role_permissions AS role_permission
    JOIN public.roles AS role ON role.id = role_permission.role_id
    JOIN public.permissions AS permission ON permission.id = role_permission.permission_id
    WHERE role.organization_id = current_setting('test.deal_outcomes.org_a')::uuid
      AND role.slug = 'admin'
      AND permission.key IN ('deals.read', 'deals.manage')
  ),
  2::bigint,
  'Admin receives Deal read and manage permissions'
);
SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.role_permissions AS role_permission
    JOIN public.roles AS role ON role.id = role_permission.role_id
    JOIN public.permissions AS permission ON permission.id = role_permission.permission_id
    WHERE role.organization_id = current_setting('test.deal_outcomes.org_a')::uuid
      AND role.slug = 'member'
      AND permission.key = 'deals.manage'
  ),
  0::bigint,
  'Member does not receive Deal manage permission'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.crm_deals', 'UPDATE'),
  'Authenticated has no table-level UPDATE privilege on Deals'
);
SELECT ok(
  has_column_privilege('authenticated', 'public.crm_deals', 'outcome', 'UPDATE'),
  'Authenticated has column-level UPDATE privilege for outcome'
);
SELECT ok(
  NOT has_column_privilege('authenticated', 'public.crm_deals', 'closed_at', 'UPDATE'),
  'Authenticated has no UPDATE privilege for database-controlled closed_at'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.crm_deal_outcome_events', 'UPDATE'),
  'Authenticated cannot UPDATE outcome history'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.crm_deal_outcome_events', 'DELETE'),
  'Authenticated cannot DELETE outcome history'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.crm_deals', 'DELETE'),
  'Authenticated cannot physically DELETE Deals'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.deal_outcomes.user_a'), true);

INSERT INTO public.crm_pipelines (organization_id, name)
VALUES (current_setting('test.deal_outcomes.org_a')::uuid, 'Outcome Pipeline A');
SELECT set_config(
  'test.deal_outcomes.pipeline_a',
  (
    SELECT id::text
    FROM public.crm_pipelines
    WHERE organization_id = current_setting('test.deal_outcomes.org_a')::uuid
      AND name = 'Outcome Pipeline A'
    ORDER BY created_at DESC
    LIMIT 1
  ),
  true
);

INSERT INTO public.crm_pipeline_stages (organization_id, pipeline_id, name, position)
VALUES (current_setting('test.deal_outcomes.org_a')::uuid, current_setting('test.deal_outcomes.pipeline_a')::uuid, 'Open Stage', 0);
INSERT INTO public.crm_pipeline_stages (organization_id, pipeline_id, name, position)
VALUES (current_setting('test.deal_outcomes.org_a')::uuid, current_setting('test.deal_outcomes.pipeline_a')::uuid, 'Second Stage', 1);

SELECT set_config(
  'test.deal_outcomes.stage_a',
  (
    SELECT id::text
    FROM public.crm_pipeline_stages
    WHERE pipeline_id = current_setting('test.deal_outcomes.pipeline_a')::uuid
    ORDER BY position
    LIMIT 1
  ),
  true
);

SELECT set_config('test.deal_outcomes.pipeline_b', gen_random_uuid()::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.deal_outcomes.user_b'), true);
INSERT INTO public.crm_pipelines (organization_id, name)
VALUES (current_setting('test.deal_outcomes.org_b')::uuid, 'Outcome Pipeline B');
SELECT set_config(
  'test.deal_outcomes.pipeline_b',
  (
    SELECT id::text
    FROM public.crm_pipelines
    WHERE organization_id = current_setting('test.deal_outcomes.org_b')::uuid
      AND name = 'Outcome Pipeline B'
    ORDER BY created_at DESC
    LIMIT 1
  ),
  true
);
INSERT INTO public.crm_pipeline_stages (organization_id, pipeline_id, name, position)
VALUES (current_setting('test.deal_outcomes.org_b')::uuid, current_setting('test.deal_outcomes.pipeline_b')::uuid, 'Open Stage B', 0);
SELECT set_config(
  'test.deal_outcomes.stage_b_tenant',
  (
    SELECT id::text
    FROM public.crm_pipeline_stages
    WHERE pipeline_id = current_setting('test.deal_outcomes.pipeline_b')::uuid
    LIMIT 1
  ),
  true
);
INSERT INTO public.crm_deals (organization_id, pipeline_id, stage_id, name, amount, currency)
VALUES (
  current_setting('test.deal_outcomes.org_b')::uuid,
  current_setting('test.deal_outcomes.pipeline_b')::uuid,
  current_setting('test.deal_outcomes.stage_b_tenant')::uuid,
  'Outcome Deal B',
  300,
  'EUR'
);
SELECT set_config(
  'test.deal_outcomes.deal_b',
  (
    SELECT id::text
    FROM public.crm_deals
    WHERE organization_id = current_setting('test.deal_outcomes.org_b')::uuid
      AND name = 'Outcome Deal B'
    ORDER BY created_at DESC
    LIMIT 1
  ),
  true
);
UPDATE public.crm_deals
SET outcome = 'won'
WHERE id = current_setting('test.deal_outcomes.deal_b')::uuid;

SELECT set_config('request.jwt.claim.sub', current_setting('test.deal_outcomes.user_a'), true);
SELECT set_config(
  'test.deal_outcomes.stage_b',
  (
    SELECT id::text
    FROM public.crm_pipeline_stages
    WHERE pipeline_id = current_setting('test.deal_outcomes.pipeline_a')::uuid
    ORDER BY position DESC
    LIMIT 1
  ),
  true
);

INSERT INTO public.crm_deals (
  organization_id, pipeline_id, stage_id, name, amount, currency
)
VALUES (
  current_setting('test.deal_outcomes.org_a')::uuid,
  current_setting('test.deal_outcomes.pipeline_a')::uuid,
  current_setting('test.deal_outcomes.stage_a')::uuid,
  'Outcome Deal A',
  NULL,
  NULL
);

SELECT set_config(
  'test.deal_outcomes.deal_a',
  (
    SELECT id::text
    FROM public.crm_deals
    WHERE organization_id = current_setting('test.deal_outcomes.org_a')::uuid
      AND name = 'Outcome Deal A'
    ORDER BY created_at DESC
    LIMIT 1
  ),
  true
);

INSERT INTO public.crm_deals (
  organization_id, pipeline_id, stage_id, name, amount, currency
)
VALUES (
  current_setting('test.deal_outcomes.org_a')::uuid,
  current_setting('test.deal_outcomes.pipeline_a')::uuid,
  current_setting('test.deal_outcomes.stage_a')::uuid,
  'Outcome Admin Deal A',
  500,
  'USD'
);

SELECT set_config(
  'test.deal_outcomes.deal_admin_a',
  (
    SELECT id::text
    FROM public.crm_deals
    WHERE organization_id = current_setting('test.deal_outcomes.org_a')::uuid
      AND name = 'Outcome Admin Deal A'
    ORDER BY created_at DESC
    LIMIT 1
  ),
  true
);

SELECT set_config('request.jwt.claim.sub', current_setting('test.deal_outcomes.admin_a'), true);
SELECT lives_ok(
  $$UPDATE public.crm_deals
    SET outcome = 'won'
    WHERE id = current_setting('test.deal_outcomes.deal_admin_a')::uuid$$,
  'Admin with deals.manage can change Deal outcome'
);
SELECT is(
  (SELECT outcome FROM public.crm_deals WHERE id = current_setting('test.deal_outcomes.deal_admin_a')::uuid),
  'won',
  'Admin outcome change is persisted'
);
SELECT set_config('request.jwt.claim.sub', current_setting('test.deal_outcomes.user_a'), true);

SELECT is(
  (SELECT outcome FROM public.crm_deals WHERE id = current_setting('test.deal_outcomes.deal_a')::uuid),
  'open',
  'Existing/new Deals start with open outcome'
);
SELECT is(
  (SELECT closed_at FROM public.crm_deals WHERE id = current_setting('test.deal_outcomes.deal_a')::uuid),
  NULL::timestamptz,
  'Open Deals have no closed_at'
);
SELECT is(
  (SELECT count(*)::bigint FROM public.crm_deal_outcome_events WHERE deal_id = current_setting('test.deal_outcomes.deal_a')::uuid),
  0::bigint,
  'Creating an open Deal does not fabricate an outcome event'
);
SELECT ok(
  (
    SELECT condeferrable
       AND condeferred
       AND confdeltype = 'a'
    FROM pg_catalog.pg_constraint
    WHERE conname = 'crm_deal_outcome_events_deal_same_org_fk'
      AND conrelid = 'public.crm_deal_outcome_events'::regclass
  ),
  'Outcome history keeps NO ACTION for direct Deal deletion and defers the check for organization cleanup'
);

SELECT throws_like(
  $$UPDATE public.crm_deals
    SET amount = 'Infinity'::numeric, currency = 'USD', outcome = 'won'
    WHERE id = current_setting('test.deal_outcomes.deal_a')::uuid$$,
  '22023',
  '%positive amount%',
  'Won Deal rejects positive Infinity'
);
SELECT throws_like(
  $$UPDATE public.crm_deals
    SET amount = '-Infinity'::numeric, currency = 'USD', outcome = 'won'
    WHERE id = current_setting('test.deal_outcomes.deal_a')::uuid$$,
  '22023',
  '%positive amount%',
  'Won Deal rejects negative Infinity'
);
SELECT throws_like(
  $$UPDATE public.crm_deals
    SET amount = 'NaN'::numeric, currency = 'USD', outcome = 'won'
    WHERE id = current_setting('test.deal_outcomes.deal_a')::uuid$$,
  '22023',
  '%positive amount%',
  'Won Deal rejects NaN'
);

SELECT throws_like(
  $$UPDATE public.crm_deals
    SET outcome = 'won'
    WHERE id = current_setting('test.deal_outcomes.deal_a')::uuid$$,
  '22023',
  '%positive amount%',
  'Won transition requires a positive amount and valid currency'
);

SELECT lives_ok(
  $$UPDATE public.crm_deals
    SET amount = 1200, currency = 'usd'
    WHERE id = current_setting('test.deal_outcomes.deal_a')::uuid$$,
  'Open Deal amount and currency can be prepared before winning'
);

SELECT lives_ok(
  $$UPDATE public.crm_deals
    SET outcome = 'won'
    WHERE id = current_setting('test.deal_outcomes.deal_a')::uuid$$,
  'Owner can move an eligible Deal to won'
);
SELECT is(
  (SELECT outcome FROM public.crm_deals WHERE id = current_setting('test.deal_outcomes.deal_a')::uuid),
  'won',
  'Won transition stores outcome'
);
SELECT ok(
  (SELECT closed_at IS NOT NULL FROM public.crm_deals WHERE id = current_setting('test.deal_outcomes.deal_a')::uuid),
  'Won transition sets closed_at in the database'
);
SELECT is(
  (SELECT currency FROM public.crm_deals WHERE id = current_setting('test.deal_outcomes.deal_a')::uuid),
  'USD',
  'Won transition normalizes currency'
);
SELECT is(
  (SELECT count(*)::bigint FROM public.crm_deal_outcome_events WHERE deal_id = current_setting('test.deal_outcomes.deal_a')::uuid),
  1::bigint,
  'Won transition appends one outcome event'
);
SELECT is(
  (SELECT amount_snapshot FROM public.crm_deal_outcome_events WHERE deal_id = current_setting('test.deal_outcomes.deal_a')::uuid),
  1200::numeric,
  'Outcome event stores an immutable amount snapshot'
);
SELECT is(
  (SELECT currency_snapshot FROM public.crm_deal_outcome_events WHERE deal_id = current_setting('test.deal_outcomes.deal_a')::uuid),
  'USD',
  'Outcome event stores an immutable currency snapshot'
);
SELECT is(
  (SELECT changed_by FROM public.crm_deal_outcome_events WHERE deal_id = current_setting('test.deal_outcomes.deal_a')::uuid),
  current_setting('test.deal_outcomes.user_a')::uuid,
  'Outcome event derives its actor from auth.uid()'
);

SELECT throws_like(
  $$UPDATE public.crm_deals
    SET amount = 1400
    WHERE id = current_setting('test.deal_outcomes.deal_a')::uuid$$,
  '42501',
  '%amount and currency are immutable%',
  'Won Deal amount cannot be changed directly'
);
SELECT throws_like(
  $$UPDATE public.crm_deals
    SET currency = 'EUR'
    WHERE id = current_setting('test.deal_outcomes.deal_a')::uuid$$,
  '42501',
  '%amount and currency are immutable%',
  'Won Deal currency cannot be changed directly'
);
SELECT throws_like(
  $$UPDATE public.crm_deals
    SET closed_at = now()
    WHERE id = current_setting('test.deal_outcomes.deal_a')::uuid$$,
  '42501',
  '%permission denied for table crm_deals%',
  'Authenticated users cannot write closed_at directly'
);
SELECT throws_like(
  $$INSERT INTO public.crm_deal_outcome_events
    (organization_id, deal_id, from_outcome, to_outcome)
    VALUES (current_setting('test.deal_outcomes.org_a')::uuid,
            current_setting('test.deal_outcomes.deal_a')::uuid,
            'open', 'won')$$,
  '42501',
  '%permission denied for table crm_deal_outcome_events%',
  'Authenticated users cannot forge outcome history events'
);
SELECT throws_like(
  $$UPDATE public.crm_deal_outcome_events
    SET to_outcome = 'lost'
    WHERE deal_id = current_setting('test.deal_outcomes.deal_a')::uuid$$,
  '42501',
  '%permission denied for table crm_deal_outcome_events%',
  'Authenticated users cannot mutate outcome history events'
);
SELECT throws_like(
  $$DELETE FROM public.crm_deal_outcome_events
    WHERE deal_id = current_setting('test.deal_outcomes.deal_a')::uuid$$,
  '42501',
  '%permission denied for table crm_deal_outcome_events%',
  'Authenticated users cannot delete outcome history events'
);
RESET ROLE;
SELECT throws_like(
  $$INSERT INTO public.crm_deal_outcome_events
    (organization_id, deal_id, from_outcome, to_outcome, amount_snapshot, currency_snapshot)
    VALUES (current_setting('test.deal_outcomes.org_a')::uuid,
            current_setting('test.deal_outcomes.deal_a')::uuid,
            'open', 'won', 1, NULL)$$,
  '23514',
  '%crm_deal_outcome_events_won_snapshot_check%',
  'Won outcome history cannot store a NULL currency snapshot'
);
SELECT throws_like(
  $$INSERT INTO public.crm_deal_outcome_events
    (organization_id, deal_id, from_outcome, to_outcome, amount_snapshot, currency_snapshot)
    VALUES (current_setting('test.deal_outcomes.org_a')::uuid,
            current_setting('test.deal_outcomes.deal_a')::uuid,
            'open', 'won', 'Infinity'::numeric, 'USD')$$,
  '23514',
  '%crm_deal_outcome_events_won_snapshot_check%',
  'Won outcome history cannot store positive Infinity'
);
SELECT throws_like(
  $$INSERT INTO public.crm_deal_outcome_events
    (organization_id, deal_id, from_outcome, to_outcome, amount_snapshot, currency_snapshot)
    VALUES (current_setting('test.deal_outcomes.org_a')::uuid,
            current_setting('test.deal_outcomes.deal_a')::uuid,
            'open', 'won', '-Infinity'::numeric, 'USD')$$,
  '23514',
  '%crm_deal_outcome_events_won_snapshot_check%',
  'Won outcome history cannot store negative Infinity'
);
SELECT throws_like(
  $$INSERT INTO public.crm_deal_outcome_events
    (organization_id, deal_id, from_outcome, to_outcome, amount_snapshot, currency_snapshot)
    VALUES (current_setting('test.deal_outcomes.org_a')::uuid,
            current_setting('test.deal_outcomes.deal_a')::uuid,
            'open', 'won', 'NaN'::numeric, 'USD')$$,
  '23514',
  '%crm_deal_outcome_events_won_snapshot_check%',
  'Won outcome history cannot store NaN'
);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.deal_outcomes.user_a'), true);

SELECT lives_ok(
  $$UPDATE public.crm_deals
    SET outcome = 'lost'
    WHERE id = current_setting('test.deal_outcomes.deal_a')::uuid$$,
  'Won Deal can be explicitly moved to lost'
);
SELECT ok(
  (SELECT closed_at IS NOT NULL FROM public.crm_deals WHERE id = current_setting('test.deal_outcomes.deal_a')::uuid),
  'Moving a Won Deal to lost records a new closure time'
);
SELECT lives_ok(
  $$UPDATE public.crm_deals
    SET amount = 1300, currency = 'eur'
    WHERE id = current_setting('test.deal_outcomes.deal_a')::uuid$$,
  'Lost Deal amount and currency can be corrected before a new Won transition'
);

SELECT lives_ok(
  $$UPDATE public.crm_deals
    SET outcome = 'open'
    WHERE id = current_setting('test.deal_outcomes.deal_a')::uuid$$,
  'Won Deal can be explicitly reopened'
);
SELECT is(
  (SELECT closed_at FROM public.crm_deals WHERE id = current_setting('test.deal_outcomes.deal_a')::uuid),
  NULL::timestamptz,
  'Reopening clears closed_at'
);
SELECT is(
  (SELECT count(*)::bigint FROM public.crm_deal_outcome_events WHERE deal_id = current_setting('test.deal_outcomes.deal_a')::uuid),
  3::bigint,
  'Reopening appends an outcome event'
);

SELECT lives_ok(
  $$UPDATE public.crm_deals
    SET outcome = 'lost'
    WHERE id = current_setting('test.deal_outcomes.deal_a')::uuid$$,
  'Open Deal can be moved to lost'
);
SELECT lives_ok(
  $$UPDATE public.crm_deals
    SET outcome = 'won'
    WHERE id = current_setting('test.deal_outcomes.deal_a')::uuid$$,
  'Lost Deal can be explicitly moved to won'
);
SELECT is(
  (SELECT count(*)::bigint FROM public.crm_deal_outcome_events WHERE deal_id = current_setting('test.deal_outcomes.deal_a')::uuid),
  5::bigint,
  'Explicit lost and won transitions are both recorded'
);

SELECT lives_ok(
  $$UPDATE public.crm_deals
    SET stage_id = current_setting('test.deal_outcomes.stage_b')::uuid
    WHERE id = current_setting('test.deal_outcomes.deal_a')::uuid$$,
  'Stage movement remains independent from outcome'
);
SELECT is(
  (SELECT outcome FROM public.crm_deals WHERE id = current_setting('test.deal_outcomes.deal_a')::uuid),
  'won',
  'Stage movement does not change outcome'
);

SELECT lives_ok(
  $$UPDATE public.crm_deals
    SET archived_at = now()
    WHERE id = current_setting('test.deal_outcomes.deal_a')::uuid$$,
  'Owner can archive a Deal without deleting outcome history'
);
SELECT is(
  (SELECT count(*)::bigint FROM public.crm_deal_outcome_events WHERE deal_id = current_setting('test.deal_outcomes.deal_a')::uuid),
  5::bigint,
  'Archiving does not erase outcome events'
);
SELECT throws_like(
  $$DELETE FROM public.crm_deals
    WHERE id = current_setting('test.deal_outcomes.deal_a')::uuid$$,
  '42501',
  '%permission denied for table crm_deals%',
  'Authenticated users cannot physically delete a Deal with outcome history'
);

SELECT set_config('request.jwt.claim.sub', current_setting('test.deal_outcomes.member_a'), true);
SELECT is(
  (SELECT count(*)::bigint FROM public.crm_deals WHERE id = current_setting('test.deal_outcomes.deal_a')::uuid),
  0::bigint,
  'Read-only Member cannot see archived Deals'
);
SELECT is(
  (SELECT count(*)::bigint FROM public.crm_deal_outcome_events WHERE deal_id = current_setting('test.deal_outcomes.deal_a')::uuid),
  0::bigint,
  'Read-only Member cannot see archived Deal history'
);
SELECT is(
  (
    WITH updated AS (
      UPDATE public.crm_deals
      SET outcome = 'open'
      WHERE id = current_setting('test.deal_outcomes.deal_a')::uuid
      RETURNING id
    )
    SELECT count(*)::bigint FROM updated
  ),
  0::bigint,
  'Read-only Member cannot change Deal outcome'
);

SELECT set_config('request.jwt.claim.sub', current_setting('test.deal_outcomes.user_b'), true);
SELECT is(
  (SELECT count(*)::bigint FROM public.crm_deals WHERE organization_id = current_setting('test.deal_outcomes.org_a')::uuid),
  0::bigint,
  'Tenant B cannot read Tenant A Deals'
);
SELECT is(
  (SELECT count(*)::bigint FROM public.crm_deal_outcome_events WHERE organization_id = current_setting('test.deal_outcomes.org_a')::uuid),
  0::bigint,
  'Tenant B cannot read Tenant A outcome events'
);

SELECT is(
  (SELECT count(*)::bigint FROM public.crm_deal_outcome_events WHERE deal_id = current_setting('test.deal_outcomes.deal_b')::uuid),
  1::bigint,
  'Tenant B can read its own outcome event'
);

RESET ROLE;
SELECT throws_like(
  $$INSERT INTO public.crm_deal_outcome_events
    (organization_id, deal_id, from_outcome, to_outcome, amount_snapshot, currency_snapshot)
    VALUES (current_setting('test.deal_outcomes.org_b')::uuid,
            current_setting('test.deal_outcomes.deal_a')::uuid,
            'open', 'won', 1, 'USD')$$,
  '23503',
  '%crm_deal_outcome_events_deal_same_org_fk%',
  'The outcome history FK rejects a mismatched tenant relationship'
);
SELECT throws_like(
  $$INSERT INTO public.crm_deal_outcome_events
    (organization_id, deal_id, from_outcome, to_outcome, changed_by, amount_snapshot, currency_snapshot)
    VALUES (current_setting('test.deal_outcomes.org_a')::uuid,
            current_setting('test.deal_outcomes.deal_a')::uuid,
            'open', 'lost', current_setting('test.deal_outcomes.user_b')::uuid, 1, 'USD')$$,
  '23503',
  '%crm_deal_outcome_events_actor_same_org_fk%',
  'The outcome history FK rejects a changed_by member from another tenant'
);
SET CONSTRAINTS crm_deal_outcome_events_deal_same_org_fk IMMEDIATE;
SELECT throws_like(
  $$DELETE FROM public.crm_deals
    WHERE id = current_setting('test.deal_outcomes.deal_a')::uuid$$,
  '23503',
  '%crm_deal_outcome_events_deal_same_org_fk%',
  'A privileged direct Deal delete is blocked while outcome history exists'
);
SET CONSTRAINTS crm_deal_outcome_events_deal_same_org_fk DEFERRED;

SELECT lives_ok(
  $$DELETE FROM public.memberships
    WHERE organization_id = current_setting('test.deal_outcomes.org_a')::uuid
      AND user_id = current_setting('test.deal_outcomes.user_a')::uuid$$,
  'Deleting the actor membership is allowed without an authenticated JWT'
);
SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.crm_deal_outcome_events
    WHERE deal_id = current_setting('test.deal_outcomes.deal_a')::uuid
      AND changed_by IS NULL
  ),
  5::bigint,
  'Membership deletion clears changed_by while preserving outcome history'
);
SELECT is(
  (SELECT count(*)::bigint FROM public.crm_deals WHERE id = current_setting('test.deal_outcomes.deal_a')::uuid),
  1::bigint,
  'Membership deletion preserves the Deal'
);

SELECT lives_ok(
  $$DELETE FROM public.organizations
    WHERE id = current_setting('test.deal_outcomes.org_b')::uuid$$,
  'Organization deletion remains available for CRM cleanup'
);
SELECT is(
  (SELECT count(*)::bigint FROM public.crm_deals WHERE id = current_setting('test.deal_outcomes.deal_b')::uuid),
  0::bigint,
  'Organization deletion removes its Deal'
);
SELECT is(
  (SELECT count(*)::bigint FROM public.crm_deal_outcome_events WHERE deal_id = current_setting('test.deal_outcomes.deal_b')::uuid),
  0::bigint,
  'Organization deletion removes its outcome history'
);

SELECT * FROM finish();
ROLLBACK;

/*
STAGING-ONLY COMMIT-LEVEL CHECKS

The pgTAP transaction above deliberately rolls back, so it cannot prove a
deferred foreign-key check at COMMIT. In a disposable or staging project,
create a fresh organization, Deal, and outcome event, then run this sequence
as a privileged database owner using those fresh IDs:

BEGIN;
DELETE FROM public.crm_deals WHERE id = '<deal_with_history>';
COMMIT;
-- Expected: COMMIT fails with 23503 for
-- crm_deal_outcome_events_deal_same_org_fk, and the transaction is rolled back.

BEGIN;
DELETE FROM public.organizations WHERE id = '<organization_with_deal_history>';
COMMIT;
-- Expected: COMMIT succeeds because the organization CASCADE removes the Deal
-- and its outcome history in the same transaction.

Do not run these statements against production or substitute live CRM IDs.
*/
