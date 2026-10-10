begin;

create extension if not exists pgtap with schema extensions;

-- pgTAP 3.36 has no four-argument throws_like overload. Keep the
-- SQLSTATE + message-pattern assertion transaction-local for these tests.
create or replace function pg_temp.throws_like(
  query text,
  expected_code text,
  expected_message_pattern text,
  description text
)
returns text
language plpgsql
as $$
declare
  actual_code text;
  actual_message text;
begin
  begin
    execute query;
    return extensions.ok(false, description) || E'\n' || extensions.diag('    no exception thrown');
  exception when others then
    get stacked diagnostics
      actual_code = returned_sqlstate,
      actual_message = message_text;
    if actual_code = expected_code and actual_message like expected_message_pattern then
      return extensions.ok(true, description);
    end if;
    return extensions.ok(false, description) || E'\n' || extensions.diag(
      '      caught: ' || actual_code || ': ' || actual_message ||
      E'\n      wanted: ' || expected_code || ': ' || expected_message_pattern
    );
  end;
end;
$$;

select no_plan();

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('81000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pipeline-owner-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('81000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pipeline-owner-b@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('81000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pipeline-admin-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('81000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pipeline-member-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
-- Seed deterministic fixture IDs as the database owner. Authenticated grants
-- intentionally do not include INSERT(id); production-like writes below use
-- generated IDs and exercise the real column privileges.
select lives_ok(
  $$select public.create_organization('Pipeline Tenant A', 'pipeline-tenant-a')$$,
  'Owner A can create an organization with Pipelines and Deals permissions'
);
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.create_organization('Pipeline Tenant B', 'pipeline-tenant-b')$$,
  'Owner B can create a separate organization'
);
reset role;

insert into public.memberships (organization_id, user_id, role_id, status)
select organization.id, '81000000-0000-4000-8000-000000000003', role.id, 'active'
from public.organizations as organization
join public.roles as role on role.organization_id = organization.id and role.slug = 'admin'
where organization.slug = 'pipeline-tenant-a';
insert into public.memberships (organization_id, user_id, role_id, status)
select organization.id, '81000000-0000-4000-8000-000000000004', role.id, 'active'
from public.organizations as organization
join public.roles as role on role.organization_id = organization.id and role.slug = 'member'
where organization.slug = 'pipeline-tenant-a';

select is(
  (select count(*)::bigint from public.role_permissions as rp
   join public.roles as role on role.id = rp.role_id
   join public.permissions as permission on permission.id = rp.permission_id
   join public.organizations as organization on organization.id = role.organization_id
   where organization.slug = 'pipeline-tenant-a' and role.slug = 'owner'
     and permission.key in ('pipelines.read', 'pipelines.manage', 'deals.read', 'deals.manage')),
  4::bigint,
  'New Owner receives all Pipelines and Deals permissions'
);
select is(
  (select count(*)::bigint from public.role_permissions as rp
   join public.roles as role on role.id = rp.role_id
   join public.permissions as permission on permission.id = rp.permission_id
   join public.organizations as organization on organization.id = role.organization_id
   where organization.slug = 'pipeline-tenant-a' and role.slug = 'admin'
     and permission.key in ('pipelines.read', 'pipelines.manage', 'deals.read', 'deals.manage')),
  4::bigint,
  'New Admin receives read and manage permissions'
);
select is(
  (select count(*)::bigint from public.role_permissions as rp
   join public.roles as role on role.id = rp.role_id
   join public.permissions as permission on permission.id = rp.permission_id
   join public.organizations as organization on organization.id = role.organization_id
   where organization.slug = 'pipeline-tenant-a' and role.slug = 'member'
     and permission.key in ('pipelines.read', 'deals.read')),
  2::bigint,
  'New Member receives read permissions'
);
select is(
  (select count(*)::bigint from public.role_permissions as rp
   join public.roles as role on role.id = rp.role_id
   join public.permissions as permission on permission.id = rp.permission_id
   join public.organizations as organization on organization.id = role.organization_id
   where organization.slug = 'pipeline-tenant-a' and role.slug = 'member'
     and permission.key in ('pipelines.manage', 'deals.manage')),
  0::bigint,
  'New Member does not receive manage permissions'
);

select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
insert into public.crm_pipelines (id, organization_id, name, owner_user_id)
select '82000000-0000-4000-8000-000000000001', id, 'Tenant A Sales', '81000000-0000-4000-8000-000000000001'
from public.organizations where slug = 'pipeline-tenant-a';
insert into public.crm_pipelines (id, organization_id, name, owner_user_id)
select '82000000-0000-4000-8000-000000000003', id, 'Tenant A Renewal', '81000000-0000-4000-8000-000000000001'
from public.organizations where slug = 'pipeline-tenant-a';
insert into public.crm_pipeline_stages (id, organization_id, pipeline_id, name, position, probability)
select '83000000-0000-4000-8000-000000000001', id, '82000000-0000-4000-8000-000000000001', 'Qualified', 0, 25
from public.organizations where slug = 'pipeline-tenant-a';
insert into public.crm_pipeline_stages (id, organization_id, pipeline_id, name, position, probability)
select '83000000-0000-4000-8000-000000000003', id, '82000000-0000-4000-8000-000000000003', 'Renewal', 0, 60
from public.organizations where slug = 'pipeline-tenant-a';
insert into public.crm_accounts (id, organization_id, name, owner_user_id)
select '84000000-0000-4000-8000-000000000001', id, 'Tenant A Account', '81000000-0000-4000-8000-000000000001'
from public.organizations where slug = 'pipeline-tenant-a';
insert into public.crm_contacts (id, organization_id, first_name, account_id, owner_user_id)
select '85000000-0000-4000-8000-000000000001', organization.id, 'Ada', '84000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001'
from public.organizations as organization
where organization.slug = 'pipeline-tenant-a';
insert into public.crm_deals (
  id, organization_id, pipeline_id, stage_id, account_id, contact_id, name,
  amount, currency, expected_close_date, owner_user_id
)
select
  '86000000-0000-4000-8000-000000000001', organization.id,
  '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001',
  '84000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000001',
  'Tenant A Deal', 12500, 'USD', current_date + 30, '81000000-0000-4000-8000-000000000001'
from public.organizations as organization
where organization.slug = 'pipeline-tenant-a';
insert into public.crm_deals (id, organization_id, pipeline_id, stage_id, name, owner_user_id)
select
  '86000000-0000-4000-8000-000000000003', organization.id,
  '82000000-0000-4000-8000-000000000003', '83000000-0000-4000-8000-000000000003',
  'Tenant A Active Deal', '81000000-0000-4000-8000-000000000001'
from public.organizations as organization
where organization.slug = 'pipeline-tenant-a';

select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000002', true);
insert into public.crm_pipelines (id, organization_id, name, owner_user_id)
select '82000000-0000-4000-8000-000000000002', id, 'Tenant B Sales', '81000000-0000-4000-8000-000000000002'
from public.organizations where slug = 'pipeline-tenant-b';
insert into public.crm_pipeline_stages (id, organization_id, pipeline_id, name, position)
select '83000000-0000-4000-8000-000000000002', id, '82000000-0000-4000-8000-000000000002', 'Prospecting', 0
from public.organizations where slug = 'pipeline-tenant-b';
insert into public.crm_accounts (id, organization_id, name, owner_user_id)
select '84000000-0000-4000-8000-000000000002', id, 'Tenant B Account', '81000000-0000-4000-8000-000000000002'
from public.organizations where slug = 'pipeline-tenant-b';
insert into public.crm_contacts (id, organization_id, first_name, account_id, owner_user_id)
select '85000000-0000-4000-8000-000000000002', organization.id, 'Bo', '84000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000002'
from public.organizations as organization
where organization.slug = 'pipeline-tenant-b';
insert into public.crm_deals (
  id, organization_id, pipeline_id, stage_id, account_id, contact_id, name, owner_user_id
)
select
  '86000000-0000-4000-8000-000000000002', organization.id,
  '82000000-0000-4000-8000-000000000002', '83000000-0000-4000-8000-000000000002',
  '84000000-0000-4000-8000-000000000002', '85000000-0000-4000-8000-000000000002',
  'Tenant B Deal', '81000000-0000-4000-8000-000000000002'
from public.organizations as organization
where organization.slug = 'pipeline-tenant-b';

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select is((select count(*)::bigint from public.crm_pipelines where organization_id = (select id from public.organizations where slug = 'pipeline-tenant-a')), 2::bigint, 'Owner A can read its pipelines');
select is((select count(*)::bigint from public.crm_pipeline_stages where organization_id = (select id from public.organizations where slug = 'pipeline-tenant-a')), 2::bigint, 'Owner A can read its stages');
select is((select count(*)::bigint from public.crm_deals where organization_id = (select id from public.organizations where slug = 'pipeline-tenant-a')), 2::bigint, 'Owner A can read its deals');
select is((select count(*)::bigint from public.crm_pipelines where id = '82000000-0000-4000-8000-000000000002'), 0::bigint, 'Owner A cannot read Tenant B pipeline');
select is((select count(*)::bigint from public.crm_pipeline_stages where id = '83000000-0000-4000-8000-000000000002'), 0::bigint, 'Owner A cannot read Tenant B stage');
select is((select count(*)::bigint from public.crm_deals where id = '86000000-0000-4000-8000-000000000002'), 0::bigint, 'Owner A cannot read Tenant B deal');
select is((select created_by from public.crm_pipelines where id = '82000000-0000-4000-8000-000000000001'), '81000000-0000-4000-8000-000000000001'::uuid, 'Pipeline creator is recorded by the CRM audit trigger');
select is((select updated_by from public.crm_deals where id = '86000000-0000-4000-8000-000000000001'), '81000000-0000-4000-8000-000000000001'::uuid, 'Deal updater is recorded by the CRM audit trigger');

select throws_ok(
  $$insert into public.crm_deals (organization_id, pipeline_id, stage_id, name)
    values ((select id from public.organizations where slug = 'pipeline-tenant-a'), '82000000-0000-4000-8000-000000000002', '83000000-0000-4000-8000-000000000001', 'Cross-tenant pipeline')$$,
  '23503',
  'insert or update on table "crm_deals" violates foreign key constraint "crm_deals_pipeline_same_org_fk"',
  'Deal cannot reference a pipeline from another organization'
);
select throws_ok(
  $$insert into public.crm_deals (organization_id, pipeline_id, stage_id, name)
    values ((select id from public.organizations where slug = 'pipeline-tenant-a'), '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000002', 'Cross-tenant stage')$$,
  '23503',
  'insert or update on table "crm_deals" violates foreign key constraint "crm_deals_stage_same_org_fk"',
  'Deal cannot reference a stage from another organization'
);
select throws_ok(
  $$insert into public.crm_deals (organization_id, pipeline_id, stage_id, name)
    values ((select id from public.organizations where slug = 'pipeline-tenant-a'), '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000003', 'Wrong pipeline stage')$$,
  '23503',
  'insert or update on table "crm_deals" violates foreign key constraint "crm_deals_stage_same_pipeline_fk"',
  'Deal stage must belong to the selected pipeline'
);
select throws_ok(
  $$insert into public.crm_deals (organization_id, pipeline_id, stage_id, account_id, name)
    values ((select id from public.organizations where slug = 'pipeline-tenant-a'), '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000002', 'Cross-tenant account')$$,
  '23503',
  'insert or update on table "crm_deals" violates foreign key constraint "crm_deals_account_same_org_fk"',
  'Deal cannot reference an account from another organization'
);
select throws_ok(
  $$insert into public.crm_deals (organization_id, pipeline_id, stage_id, contact_id, name)
    values ((select id from public.organizations where slug = 'pipeline-tenant-a'), '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000002', 'Cross-tenant contact')$$,
  '23503',
  'insert or update on table "crm_deals" violates foreign key constraint "crm_deals_contact_same_org_fk"',
  'Deal cannot reference a contact from another organization'
);
select throws_ok(
  $$insert into public.crm_pipelines (organization_id, name, owner_user_id)
    values ((select id from public.organizations where slug = 'pipeline-tenant-a'), 'Cross-tenant owner', '81000000-0000-4000-8000-000000000002')$$,
  '23503',
  'insert or update on table "crm_pipelines" violates foreign key constraint "crm_pipelines_owner_same_org_fk"',
  'Pipeline owner must be a member of the same organization'
);
select throws_ok(
  $$insert into public.crm_deals (organization_id, pipeline_id, stage_id, name, owner_user_id)
    values ((select id from public.organizations where slug = 'pipeline-tenant-a'), '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001', 'Cross-tenant deal owner', '81000000-0000-4000-8000-000000000002')$$,
  '23503',
  'insert or update on table "crm_deals" violates foreign key constraint "crm_deals_owner_same_org_fk"',
  'Deal owner must be a member of the same organization'
);
select throws_ok(
  $$insert into public.crm_pipelines (organization_id, name, created_by)
    values ((select id from public.organizations where slug = 'pipeline-tenant-a'), 'Spoofed actor', '81000000-0000-4000-8000-000000000002')$$,
  '42501',
  'permission denied for table crm_pipelines',
  'Authenticated users cannot supply pipeline actor fields'
);

select throws_ok(
  $$update public.crm_pipelines set organization_id = (select id from public.organizations where slug = 'pipeline-tenant-b') where id = '82000000-0000-4000-8000-000000000001'$$,
  '42501', 'permission denied for table crm_pipelines', 'Pipeline tenant cannot be changed by authenticated users'
);
select throws_ok(
  $$update public.crm_pipeline_stages set organization_id = (select id from public.organizations where slug = 'pipeline-tenant-b') where id = '83000000-0000-4000-8000-000000000001'$$,
  '42501', 'permission denied for table crm_pipeline_stages', 'Stage tenant cannot be changed by authenticated users'
);
select throws_ok(
  $$update public.crm_deals set organization_id = (select id from public.organizations where slug = 'pipeline-tenant-b') where id = '86000000-0000-4000-8000-000000000001'$$,
  '42501', 'permission denied for table crm_deals', 'Deal tenant cannot be changed by authenticated users'
);
select throws_ok(
  $$delete from public.crm_pipelines where id = '82000000-0000-4000-8000-000000000001'$$,
  '42501', 'permission denied for table crm_pipelines', 'Authenticated users cannot physically delete pipelines'
);
select throws_ok(
  $$delete from public.crm_pipeline_stages where id = '83000000-0000-4000-8000-000000000001'$$,
  '42501', 'permission denied for table crm_pipeline_stages', 'Authenticated users cannot physically delete stages'
);
select throws_ok(
  $$delete from public.crm_deals where id = '86000000-0000-4000-8000-000000000001'$$,
  '42501', 'permission denied for table crm_deals', 'Authenticated users cannot physically delete deals'
);

reset role;
select pg_temp.throws_like(
  $$delete from public.crm_pipelines where id = '82000000-0000-4000-8000-000000000001'$$,
  '23503', '%violates foreign key constraint%',
  'Deleting a pipeline with CRM stages or deals is rejected instead of cascading'
);
select is((select count(*)::bigint from public.crm_pipelines where id = '82000000-0000-4000-8000-000000000001'), 1::bigint, 'Rejected pipeline deletion leaves the pipeline intact');
select is((select count(*)::bigint from public.crm_pipeline_stages where id = '83000000-0000-4000-8000-000000000001'), 1::bigint, 'Rejected pipeline deletion leaves its stage intact');
select is((select count(*)::bigint from public.crm_deals where id = '86000000-0000-4000-8000-000000000001'), 1::bigint, 'Rejected pipeline deletion leaves its deal intact');
select pg_temp.throws_like(
  $$delete from public.crm_pipeline_stages where id = '83000000-0000-4000-8000-000000000001'$$,
  '23503', '%violates foreign key constraint%',
  'Deleting a stage with CRM deals is rejected instead of cascading'
);
select is((select count(*)::bigint from public.crm_pipeline_stages where id = '83000000-0000-4000-8000-000000000001'), 1::bigint, 'Rejected stage deletion leaves the stage intact');
select is((select count(*)::bigint from public.crm_deals where id = '86000000-0000-4000-8000-000000000001'), 1::bigint, 'Rejected stage deletion leaves its deal intact');

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$update public.crm_pipelines set archived_at = now() where id = '82000000-0000-4000-8000-000000000001'$$,
  'Owner with pipelines.read and pipelines.manage can archive a pipeline'
);
select lives_ok(
  $$update public.crm_pipeline_stages set archived_at = now() where id = '83000000-0000-4000-8000-000000000001'$$,
  'Owner with pipelines.read and pipelines.manage can archive a stage'
);
select lives_ok(
  $$update public.crm_deals set archived_at = now() where id = '86000000-0000-4000-8000-000000000001'$$,
  'Owner with deals.read and deals.manage can archive a deal'
);
select is((select count(*)::bigint from public.crm_pipelines where id = '82000000-0000-4000-8000-000000000001' and archived_at is null), 0::bigint, 'Archived pipeline is excluded from active selection');
select is((select count(*)::bigint from public.crm_pipeline_stages where id = '83000000-0000-4000-8000-000000000001' and archived_at is null), 0::bigint, 'Archived stage is excluded from active selection');
select is((select count(*)::bigint from public.crm_deals where id = '86000000-0000-4000-8000-000000000001' and archived_at is null), 0::bigint, 'Archived deal is excluded from active selection');

select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000004', true);
select is((select count(*)::bigint from public.crm_pipelines where id = '82000000-0000-4000-8000-000000000001'), 0::bigint, 'Read-only Member cannot see archived pipeline');
select is((select count(*)::bigint from public.crm_pipeline_stages where id = '83000000-0000-4000-8000-000000000001'), 0::bigint, 'Read-only Member cannot see archived stage');
select is((select count(*)::bigint from public.crm_deals where id = '86000000-0000-4000-8000-000000000001'), 0::bigint, 'Read-only Member cannot see archived deal');
select lives_ok(
  $$update public.crm_pipelines set name = 'Member edit denied'
    where id = '82000000-0000-4000-8000-000000000003'$$,
  'Member with pipelines.read only cannot update a pipeline'
);
select lives_ok(
  $$update public.crm_pipeline_stages set name = 'Member edit denied'
    where id = '83000000-0000-4000-8000-000000000003'$$,
  'Member with pipelines.read only cannot update a stage'
);
select lives_ok(
  $$update public.crm_deals set name = 'Member edit denied'
    where id = '86000000-0000-4000-8000-000000000003'$$,
  'Member with deals.read only cannot update a deal'
);
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select is((select name from public.crm_pipelines where id = '82000000-0000-4000-8000-000000000003'), 'Tenant A Renewal', 'Read-only Member pipeline update is ignored');
select is((select name from public.crm_pipeline_stages where id = '83000000-0000-4000-8000-000000000003'), 'Renewal', 'Read-only Member stage update is ignored');
select is((select name from public.crm_deals where id = '86000000-0000-4000-8000-000000000003'), 'Tenant A Active Deal', 'Read-only Member deal update is ignored');
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$insert into public.crm_pipelines (organization_id, name)
    values ((select id from public.organizations where slug = 'pipeline-tenant-a'), 'Member pipeline denied')$$,
  '42501', 'new row violates row-level security policy for table "crm_pipelines"', 'Member cannot insert a pipeline'
);
select throws_ok(
  $$insert into public.crm_pipeline_stages (organization_id, pipeline_id, name, position)
    values ((select id from public.organizations where slug = 'pipeline-tenant-a'), '82000000-0000-4000-8000-000000000003', 'Member stage denied', 5)$$,
  '42501', 'new row violates row-level security policy for table "crm_pipeline_stages"', 'Member cannot insert a stage'
);
select throws_ok(
  $$insert into public.crm_deals (organization_id, pipeline_id, stage_id, name)
    values ((select id from public.organizations where slug = 'pipeline-tenant-a'), '82000000-0000-4000-8000-000000000003', '83000000-0000-4000-8000-000000000003', 'Member deal denied')$$,
  '42501', 'new row violates row-level security policy for table "crm_deals"', 'Member cannot insert a deal'
);

select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000003', true);
select lives_ok(
  $$insert into public.crm_pipelines (organization_id, name)
    values ((select id from public.organizations where slug = 'pipeline-tenant-a'), 'Admin Pipeline')$$,
  'Admin can manage pipelines'
);
select lives_ok(
  $$insert into public.crm_pipeline_stages (organization_id, pipeline_id, name, position)
    values (
      (select id from public.organizations where slug = 'pipeline-tenant-a'),
      (select id from public.crm_pipelines where organization_id = (select id from public.organizations where slug = 'pipeline-tenant-a') and name = 'Admin Pipeline'),
      'Admin Stage', 0
    )$$,
  'Admin can manage stages'
);
select lives_ok(
  $$insert into public.crm_deals (organization_id, pipeline_id, stage_id, name)
    values (
      (select id from public.organizations where slug = 'pipeline-tenant-a'),
      (select id from public.crm_pipelines where organization_id = (select id from public.organizations where slug = 'pipeline-tenant-a') and name = 'Admin Pipeline'),
      (select id from public.crm_pipeline_stages where organization_id = (select id from public.organizations where slug = 'pipeline-tenant-a') and name = 'Admin Stage'),
      'Admin Deal'
    )$$,
  'Admin can manage deals'
);

select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000002', true);
select is((select count(*)::bigint from public.crm_pipelines where id = '82000000-0000-4000-8000-000000000002'), 1::bigint, 'Tenant B can read its pipeline');
select is((select count(*)::bigint from public.crm_pipelines where id = '82000000-0000-4000-8000-000000000001'), 0::bigint, 'Tenant B cannot read Tenant A pipeline');
select is((select count(*)::bigint from public.crm_pipeline_stages where id = '83000000-0000-4000-8000-000000000002'), 1::bigint, 'Tenant B can read its stage');
select is((select count(*)::bigint from public.crm_pipeline_stages where id = '83000000-0000-4000-8000-000000000001'), 0::bigint, 'Tenant B cannot read Tenant A archived stage');
select is((select count(*)::bigint from public.crm_deals where id = '86000000-0000-4000-8000-000000000002'), 1::bigint, 'Tenant B can read its deal');
select is((select count(*)::bigint from public.crm_deals where id = '86000000-0000-4000-8000-000000000001'), 0::bigint, 'Tenant B cannot read Tenant A archived deal');

reset role;
select lives_ok(
  $$delete from public.organizations where slug = 'pipeline-tenant-b'$$,
  'Deleting an organization still cascades its CRM data'
);
select is((select count(*)::bigint from public.crm_pipelines where id = '82000000-0000-4000-8000-000000000002'), 0::bigint, 'Organization deletion removes its pipelines');
select is((select count(*)::bigint from public.crm_pipeline_stages where id = '83000000-0000-4000-8000-000000000002'), 0::bigint, 'Organization deletion removes its stages');
select is((select count(*)::bigint from public.crm_deals where id = '86000000-0000-4000-8000-000000000002'), 0::bigint, 'Organization deletion removes its deals');

select * from finish();
rollback;
