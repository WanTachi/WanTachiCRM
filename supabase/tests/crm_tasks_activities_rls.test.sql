-- Destructive integration test: run only in a disposable/local or staging
-- Supabase database. All fixtures and schema-local helpers are rolled back.
begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions, pg_catalog;

select no_plan();

-- Every run gets isolated identities and organization slugs. This prevents a
-- disposable/staging run from ever reusing an existing fixture by accident.
select set_config('test.phase25.run_token', replace(gen_random_uuid()::text, '-', ''), true);
select set_config('test.phase25.slug_a', 'task-tenant-a-' || current_setting('test.phase25.run_token'), true);
select set_config('test.phase25.slug_b', 'task-tenant-b-' || current_setting('test.phase25.run_token'), true);
select set_config('test.phase25.user_owner_a', gen_random_uuid()::text, true);
select set_config('test.phase25.user_owner_b', gen_random_uuid()::text, true);
select set_config('test.phase25.user_admin_a', gen_random_uuid()::text, true);
select set_config('test.phase25.user_member_a', gen_random_uuid()::text, true);
select set_config('test.phase25.user_departing_a', gen_random_uuid()::text, true);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (current_setting('test.phase25.user_owner_a')::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'task-owner-a-' || current_setting('test.phase25.run_token') || '@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  (current_setting('test.phase25.user_owner_b')::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'task-owner-b-' || current_setting('test.phase25.run_token') || '@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  (current_setting('test.phase25.user_admin_a')::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'task-admin-a-' || current_setting('test.phase25.run_token') || '@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  (current_setting('test.phase25.user_member_a')::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'task-member-a-' || current_setting('test.phase25.run_token') || '@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  (current_setting('test.phase25.user_departing_a')::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'task-departing-member-a-' || current_setting('test.phase25.run_token') || '@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.phase25.user_owner_a'), true);
select lives_ok(
  $$select public.create_organization('Task Tenant A', current_setting('test.phase25.slug_a'))$$,
  'Owner A can create an organization with Tasks and Activities permissions'
);
select set_config('request.jwt.claim.sub', current_setting('test.phase25.user_owner_b'), true);
select lives_ok(
  $$select public.create_organization('Task Tenant B', current_setting('test.phase25.slug_b'))$$,
  'Owner B can create a separate organization'
);
reset role;

insert into public.memberships (organization_id, user_id, role_id, status)
select organization.id, current_setting('test.phase25.user_admin_a')::uuid, role.id, 'active'
from public.organizations as organization
join public.roles as role on role.organization_id = organization.id and role.slug = 'admin'
where organization.slug = current_setting('test.phase25.slug_a');
insert into public.memberships (organization_id, user_id, role_id, status)
select organization.id, current_setting('test.phase25.user_member_a')::uuid, role.id, 'active'
from public.organizations as organization
join public.roles as role on role.organization_id = organization.id and role.slug = 'member'
where organization.slug = current_setting('test.phase25.slug_a');
insert into public.memberships (organization_id, user_id, role_id, status)
select organization.id, current_setting('test.phase25.user_departing_a')::uuid, role.id, 'active'
from public.organizations as organization
join public.roles as role on role.organization_id = organization.id and role.slug = 'member'
where organization.slug = current_setting('test.phase25.slug_a');

select is(
  (select count(*)::bigint from public.role_permissions as rp
   join public.roles as role on role.id = rp.role_id
   join public.permissions as permission on permission.id = rp.permission_id
   join public.organizations as organization on organization.id = role.organization_id
   where organization.slug = current_setting('test.phase25.slug_a') and role.slug = 'owner'
     and permission.key in ('tasks.read', 'tasks.manage', 'activities.read', 'activities.manage')),
  4::bigint,
  'New Owner receives all Tasks and Activities permissions'
);
select is(
  (select count(*)::bigint from public.role_permissions as rp
   join public.roles as role on role.id = rp.role_id
   join public.permissions as permission on permission.id = rp.permission_id
   join public.organizations as organization on organization.id = role.organization_id
   where organization.slug = current_setting('test.phase25.slug_a') and role.slug = 'admin'
     and permission.key in ('tasks.read', 'tasks.manage', 'activities.read', 'activities.manage')),
  4::bigint,
  'New Admin receives read and manage permissions'
);
select is(
  (select count(*)::bigint from public.role_permissions as rp
   join public.roles as role on role.id = rp.role_id
   join public.permissions as permission on permission.id = rp.permission_id
   join public.organizations as organization on organization.id = role.organization_id
   where organization.slug = current_setting('test.phase25.slug_a') and role.slug = 'member'
     and permission.key in ('tasks.read', 'activities.read')),
  2::bigint,
  'New Member receives read permissions'
);
select is(
  (select count(*)::bigint from public.role_permissions as rp
   join public.roles as role on role.id = rp.role_id
   join public.permissions as permission on permission.id = rp.permission_id
   join public.organizations as organization on organization.id = role.organization_id
   where organization.slug = current_setting('test.phase25.slug_a') and role.slug = 'member'
     and permission.key in ('tasks.manage', 'activities.manage')),
  0::bigint,
  'New Member does not receive manage permissions'
);
select is(
  (select count(*)::bigint from public.role_permissions as rp
   join public.roles as role on role.id = rp.role_id
   join public.permissions as permission on permission.id = rp.permission_id
   join public.organizations as organization on organization.id = role.organization_id
   where organization.slug = current_setting('test.phase25.slug_a') and role.slug = 'admin'
     and permission.key in (
       'organization.read', 'organization.update', 'members.read', 'members.manage',
       'accounts.read', 'accounts.manage', 'contacts.read', 'contacts.manage',
       'pipelines.read', 'pipelines.manage', 'deals.read', 'deals.manage',
       'tasks.read', 'tasks.manage', 'activities.read', 'activities.manage'
     )),
  16::bigint,
  'New Admin retains existing CRM and organization permissions alongside the new ones'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.phase25.user_owner_a'), true);
with inserted as (
  insert into public.crm_accounts (organization_id, name)
  select id, 'Tenant A Account'
  from public.organizations where slug = current_setting('test.phase25.slug_a')
  returning id
)
select set_config('test.phase25.account_a', id::text, true) from inserted;
with inserted as (
  insert into public.crm_contacts (organization_id, first_name, account_id)
  select organization.id, 'Ada', current_setting('test.phase25.account_a')::uuid
  from public.organizations as organization
  where organization.slug = current_setting('test.phase25.slug_a')
  returning id
)
select set_config('test.phase25.contact_a', id::text, true) from inserted;
with inserted as (
  insert into public.crm_pipelines (organization_id, name)
  select id, 'Tenant A Pipeline'
  from public.organizations where slug = current_setting('test.phase25.slug_a')
  returning id
)
select set_config('test.phase25.pipeline_a', id::text, true) from inserted;
with inserted as (
  insert into public.crm_pipeline_stages (organization_id, pipeline_id, name, position)
  select id, current_setting('test.phase25.pipeline_a')::uuid, 'Tenant A Stage', 0
  from public.organizations where slug = current_setting('test.phase25.slug_a')
  returning id
)
select set_config('test.phase25.stage_a', id::text, true) from inserted;
with inserted as (
  insert into public.crm_deals (organization_id, pipeline_id, stage_id, name)
  select organization.id, current_setting('test.phase25.pipeline_a')::uuid,
    current_setting('test.phase25.stage_a')::uuid, 'Tenant A Deal'
  from public.organizations as organization
  where organization.slug = current_setting('test.phase25.slug_a')
  returning id
)
select set_config('test.phase25.deal_a', id::text, true) from inserted;
with inserted as (
  insert into public.crm_tasks (
    organization_id, title, status, priority, due_at, owner_user_id,
    account_id, contact_id, deal_id
  )
  select organization.id, 'Tenant A linked task', 'in_progress', 'high',
    now() + interval '1 day', current_setting('test.phase25.user_owner_a')::uuid,
    current_setting('test.phase25.account_a')::uuid,
    current_setting('test.phase25.contact_a')::uuid,
    current_setting('test.phase25.deal_a')::uuid
  from public.organizations as organization
  where organization.slug = current_setting('test.phase25.slug_a')
  returning id
)
select set_config('test.phase25.task_a', id::text, true) from inserted;
with inserted as (
  insert into public.crm_tasks (organization_id, title, owner_user_id)
  select id, 'Tenant A read-only task', current_setting('test.phase25.user_owner_a')::uuid
  from public.organizations where slug = current_setting('test.phase25.slug_a')
  returning id
)
select set_config('test.phase25.task_readonly_a', id::text, true) from inserted;
with inserted as (
  insert into public.crm_activities (
    organization_id, type, subject, body, occurred_at,
    account_id, contact_id, deal_id, task_id
  )
  select organization.id, 'meeting', 'Tenant A check-in', 'Discussed next steps', now(),
    current_setting('test.phase25.account_a')::uuid,
    current_setting('test.phase25.contact_a')::uuid,
    current_setting('test.phase25.deal_a')::uuid,
    current_setting('test.phase25.task_a')::uuid
  from public.organizations as organization
  where organization.slug = current_setting('test.phase25.slug_a')
  returning id
)
select set_config('test.phase25.activity_a', id::text, true) from inserted;
with inserted as (
  insert into public.crm_activities (organization_id, type, body)
  select id, 'note', 'Unlinked note is allowed'
  from public.organizations where slug = current_setting('test.phase25.slug_a')
  returning id
)
select set_config('test.phase25.activity_unlinked_a', id::text, true) from inserted;

select set_config('request.jwt.claim.sub', current_setting('test.phase25.user_owner_b'), true);
with inserted as (
  insert into public.crm_accounts (organization_id, name)
  select id, 'Tenant B Account'
  from public.organizations where slug = current_setting('test.phase25.slug_b')
  returning id
)
select set_config('test.phase25.account_b', id::text, true) from inserted;
with inserted as (
  insert into public.crm_contacts (organization_id, first_name, account_id)
  select organization.id, 'Bo', current_setting('test.phase25.account_b')::uuid
  from public.organizations as organization
  where organization.slug = current_setting('test.phase25.slug_b')
  returning id
)
select set_config('test.phase25.contact_b', id::text, true) from inserted;
with inserted as (
  insert into public.crm_pipelines (organization_id, name)
  select id, 'Tenant B Pipeline'
  from public.organizations where slug = current_setting('test.phase25.slug_b')
  returning id
)
select set_config('test.phase25.pipeline_b', id::text, true) from inserted;
with inserted as (
  insert into public.crm_pipeline_stages (organization_id, pipeline_id, name, position)
  select id, current_setting('test.phase25.pipeline_b')::uuid, 'Tenant B Stage', 0
  from public.organizations where slug = current_setting('test.phase25.slug_b')
  returning id
)
select set_config('test.phase25.stage_b', id::text, true) from inserted;
with inserted as (
  insert into public.crm_deals (organization_id, pipeline_id, stage_id, name)
  select organization.id, current_setting('test.phase25.pipeline_b')::uuid,
    current_setting('test.phase25.stage_b')::uuid, 'Tenant B Deal'
  from public.organizations as organization
  where organization.slug = current_setting('test.phase25.slug_b')
  returning id
)
select set_config('test.phase25.deal_b', id::text, true) from inserted;
with inserted as (
  insert into public.crm_tasks (organization_id, title, owner_user_id)
  select id, 'Tenant B task', current_setting('test.phase25.user_owner_b')::uuid
  from public.organizations where slug = current_setting('test.phase25.slug_b')
  returning id
)
select set_config('test.phase25.task_b', id::text, true) from inserted;
with inserted as (
  insert into public.crm_activities (organization_id, type, body)
  select id, 'email', 'Tenant B activity'
  from public.organizations where slug = current_setting('test.phase25.slug_b')
  returning id
)
select set_config('test.phase25.activity_b', id::text, true) from inserted;

select set_config('request.jwt.claim.sub', current_setting('test.phase25.user_owner_a'), true);
select is((select count(*)::bigint from public.crm_tasks where organization_id = (select id from public.organizations where slug = current_setting('test.phase25.slug_a'))), 2::bigint, 'Tenant A can read its active tasks');
select is((select count(*)::bigint from public.crm_activities where organization_id = (select id from public.organizations where slug = current_setting('test.phase25.slug_a'))), 2::bigint, 'Tenant A can read its active activities');
select is((select count(*)::bigint from public.crm_tasks where id = current_setting('test.phase25.task_b')::uuid), 0::bigint, 'Tenant A cannot read Tenant B task');
select is((select count(*)::bigint from public.crm_activities where id = current_setting('test.phase25.activity_b')::uuid), 0::bigint, 'Tenant A cannot read Tenant B activity');
select is(
  (select count(*)::bigint from public.crm_tasks where id = current_setting('test.phase25.task_a')::uuid
    and account_id = current_setting('test.phase25.account_a')::uuid
    and contact_id = current_setting('test.phase25.contact_a')::uuid
    and deal_id = current_setting('test.phase25.deal_a')::uuid),
  1::bigint,
  'Task can link to same-organization Account, Contact and Deal'
);
select is(
  (select count(*)::bigint from public.crm_activities where id = current_setting('test.phase25.activity_a')::uuid
    and account_id = current_setting('test.phase25.account_a')::uuid
    and contact_id = current_setting('test.phase25.contact_a')::uuid
    and deal_id = current_setting('test.phase25.deal_a')::uuid
    and task_id = current_setting('test.phase25.task_a')::uuid),
  1::bigint,
  'Activity can link to same-organization Account, Contact, Deal and Task'
);
select is((select count(*)::bigint from public.crm_tasks where id = current_setting('test.phase25.task_readonly_a')::uuid and account_id is null and contact_id is null and deal_id is null), 1::bigint, 'Task can exist without related CRM records');
select is((select count(*)::bigint from public.crm_activities where id = current_setting('test.phase25.activity_unlinked_a')::uuid and account_id is null and contact_id is null and deal_id is null and task_id is null), 1::bigint, 'Activity can exist without related CRM records');
select is((select created_by from public.crm_tasks where id = current_setting('test.phase25.task_a')::uuid), current_setting('test.phase25.user_owner_a')::uuid, 'Task creator is set by the authenticated audit trigger');
select is((select updated_by from public.crm_tasks where id = current_setting('test.phase25.task_a')::uuid), current_setting('test.phase25.user_owner_a')::uuid, 'Task updater is set by the authenticated audit trigger');
select is((select created_by from public.crm_activities where id = current_setting('test.phase25.activity_a')::uuid), current_setting('test.phase25.user_owner_a')::uuid, 'Activity creator is set by the authenticated audit trigger');

select throws_ok(
  $$insert into public.crm_tasks (organization_id, title, account_id)
    values ((select id from public.organizations where slug = current_setting('test.phase25.slug_a')), 'Cross-tenant account', current_setting('test.phase25.account_b')::uuid)$$,
  '23503',
  'insert or update on table "crm_tasks" violates foreign key constraint "crm_tasks_account_same_org_fk"',
  'Task cannot reference an Account from another organization'
);
select throws_ok(
  $$insert into public.crm_tasks (organization_id, title, contact_id)
    values ((select id from public.organizations where slug = current_setting('test.phase25.slug_a')), 'Cross-tenant contact', current_setting('test.phase25.contact_b')::uuid)$$,
  '23503',
  'insert or update on table "crm_tasks" violates foreign key constraint "crm_tasks_contact_same_org_fk"',
  'Task cannot reference a Contact from another organization'
);
select throws_ok(
  $$insert into public.crm_tasks (organization_id, title, deal_id)
    values ((select id from public.organizations where slug = current_setting('test.phase25.slug_a')), 'Cross-tenant deal', current_setting('test.phase25.deal_b')::uuid)$$,
  '23503',
  'insert or update on table "crm_tasks" violates foreign key constraint "crm_tasks_deal_same_org_fk"',
  'Task cannot reference a Deal from another organization'
);
select throws_ok(
  $$insert into public.crm_tasks (organization_id, title, owner_user_id)
    values ((select id from public.organizations where slug = current_setting('test.phase25.slug_a')), 'Cross-tenant owner', current_setting('test.phase25.user_owner_b')::uuid)$$,
  '23503',
  'insert or update on table "crm_tasks" violates foreign key constraint "crm_tasks_owner_same_org_fk"',
  'Task owner must be a member of the same organization'
);
select throws_ok(
  $$insert into public.crm_activities (organization_id, type, account_id)
    values ((select id from public.organizations where slug = current_setting('test.phase25.slug_a')), 'note', current_setting('test.phase25.account_b')::uuid)$$,
  '23503',
  'insert or update on table "crm_activities" violates foreign key constraint "crm_activities_account_same_org_fk"',
  'Activity cannot reference an Account from another organization'
);
select throws_ok(
  $$insert into public.crm_activities (organization_id, type, contact_id)
    values ((select id from public.organizations where slug = current_setting('test.phase25.slug_a')), 'note', current_setting('test.phase25.contact_b')::uuid)$$,
  '23503',
  'insert or update on table "crm_activities" violates foreign key constraint "crm_activities_contact_same_org_fk"',
  'Activity cannot reference a Contact from another organization'
);
select throws_ok(
  $$insert into public.crm_activities (organization_id, type, deal_id)
    values ((select id from public.organizations where slug = current_setting('test.phase25.slug_a')), 'note', current_setting('test.phase25.deal_b')::uuid)$$,
  '23503',
  'insert or update on table "crm_activities" violates foreign key constraint "crm_activities_deal_same_org_fk"',
  'Activity cannot reference a Deal from another organization'
);
select throws_ok(
  $$insert into public.crm_activities (organization_id, type, task_id)
    values ((select id from public.organizations where slug = current_setting('test.phase25.slug_a')), 'note', current_setting('test.phase25.task_b')::uuid)$$,
  '23503',
  'insert or update on table "crm_activities" violates foreign key constraint "crm_activities_task_same_org_fk"',
  'Activity cannot reference a Task from another organization'
);
select throws_ok(
  $$insert into public.crm_tasks (organization_id, title, created_by)
    values ((select id from public.organizations where slug = current_setting('test.phase25.slug_a')), 'Spoofed actor', current_setting('test.phase25.user_owner_b')::uuid)$$,
  '42501', 'permission denied for table crm_tasks', 'Authenticated users cannot supply Task actor fields'
);
select throws_ok(
  $$update public.crm_tasks set updated_by = current_setting('test.phase25.user_owner_b')::uuid where id = current_setting('test.phase25.task_a')::uuid$$,
  '42501', 'permission denied for table crm_tasks', 'Authenticated users cannot supply Task updater fields'
);
select throws_ok(
  $$insert into public.crm_activities (organization_id, type, created_by)
    values ((select id from public.organizations where slug = current_setting('test.phase25.slug_a')), 'note', current_setting('test.phase25.user_owner_b')::uuid)$$,
  '42501', 'permission denied for table crm_activities', 'Authenticated users cannot supply Activity actor fields'
);

reset role;
select set_config('request.jwt.claim.sub', current_setting('test.phase25.user_owner_b'), true);
select throws_ok(
  $$insert into public.crm_tasks (organization_id, title)
    values ((select id from public.organizations where slug = current_setting('test.phase25.slug_a')), 'Cross-tenant creator')$$,
  '23503',
  'insert or update on table "crm_tasks" violates foreign key constraint "crm_tasks_created_by_same_org_fk"',
  'Task creator must be a member of the same organization'
);
select throws_ok(
  $$update public.crm_tasks set title = 'Cross-tenant updater' where id = current_setting('test.phase25.task_readonly_a')::uuid$$,
  '23503',
  'insert or update on table "crm_tasks" violates foreign key constraint "crm_tasks_updated_by_same_org_fk"',
  'Task updater must be a member of the same organization'
);
select throws_ok(
  $$insert into public.crm_activities (organization_id, type)
    values ((select id from public.organizations where slug = current_setting('test.phase25.slug_a')), 'note')$$,
  '23503',
  'insert or update on table "crm_activities" violates foreign key constraint "crm_activities_created_by_same_org_fk"',
  'Activity creator must be a member of the same organization'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.phase25.user_owner_a'), true);
select throws_ok(
  $$update public.crm_tasks set organization_id = (select id from public.organizations where slug = current_setting('test.phase25.slug_b')) where id = current_setting('test.phase25.task_a')::uuid$$,
  '42501', 'permission denied for table crm_tasks', 'Authenticated users cannot update Task organization_id'
);
select throws_ok(
  $$update public.crm_activities set organization_id = (select id from public.organizations where slug = current_setting('test.phase25.slug_b')) where id = current_setting('test.phase25.activity_a')::uuid$$,
  '42501', 'permission denied for table crm_activities', 'Authenticated users cannot update Activity organization_id'
);
select throws_ok(
  $$delete from public.crm_tasks where id = current_setting('test.phase25.task_a')::uuid$$,
  '42501', 'permission denied for table crm_tasks', 'Authenticated users cannot physically delete Tasks'
);
select throws_ok(
  $$delete from public.crm_activities where id = current_setting('test.phase25.activity_a')::uuid$$,
  '42501', 'permission denied for table crm_activities', 'Authenticated users cannot physically delete Activities'
);

reset role;
select set_config('request.jwt.claim.sub', current_setting('test.phase25.user_owner_a'), true);
select throws_ok(
  $$update public.crm_tasks set organization_id = (select id from public.organizations where slug = current_setting('test.phase25.slug_b')) where id = current_setting('test.phase25.task_a')::uuid$$,
  '42501', 'CRM record organization cannot be changed', 'Task audit trigger independently prevents tenant changes'
);
select throws_ok(
  $$update public.crm_activities set organization_id = (select id from public.organizations where slug = current_setting('test.phase25.slug_b')) where id = current_setting('test.phase25.activity_a')::uuid$$,
  '42501', 'CRM record organization cannot be changed', 'Activity audit trigger independently prevents tenant changes'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.phase25.user_owner_a'), true);
select lives_ok(
  $$update public.crm_tasks set archived_at = now() where id = current_setting('test.phase25.task_a')::uuid$$,
  'Owner with tasks.read and tasks.manage can archive a Task'
);
select lives_ok(
  $$update public.crm_activities set archived_at = now() where id = current_setting('test.phase25.activity_a')::uuid$$,
  'Owner with activities.read and activities.manage can archive an Activity'
);
select is((select count(*)::bigint from public.crm_tasks where id = current_setting('test.phase25.task_a')::uuid and archived_at is null), 0::bigint, 'Archived Task is excluded from active selection');
select is((select count(*)::bigint from public.crm_activities where id = current_setting('test.phase25.activity_a')::uuid and archived_at is null), 0::bigint, 'Archived Activity is excluded from active selection');
select is((select count(*)::bigint from public.crm_tasks where id = current_setting('test.phase25.task_a')::uuid), 1::bigint, 'Owner with read and manage can inspect archived Task');
select is((select count(*)::bigint from public.crm_activities where id = current_setting('test.phase25.activity_a')::uuid), 1::bigint, 'Owner with read and manage can inspect archived Activity');

select set_config('request.jwt.claim.sub', current_setting('test.phase25.user_member_a'), true);
select is((select count(*)::bigint from public.crm_tasks where id = current_setting('test.phase25.task_a')::uuid), 0::bigint, 'Read-only Member cannot see an archived Task');
select is((select count(*)::bigint from public.crm_activities where id = current_setting('test.phase25.activity_a')::uuid), 0::bigint, 'Read-only Member cannot see an archived Activity');
select is(
  (with updated as (
    update public.crm_tasks set archived_at = now()
    where id = current_setting('test.phase25.task_readonly_a')::uuid
    returning id
  ) select count(*)::bigint from updated),
  0::bigint,
  'Read-only Member cannot archive a Task'
);
select is((select count(*)::bigint from public.crm_tasks where id = current_setting('test.phase25.task_readonly_a')::uuid and archived_at is null), 1::bigint, 'Read-only Task remains active after archive attempt');
select is(
  (with updated as (
    update public.crm_activities set archived_at = now()
    where id = current_setting('test.phase25.activity_unlinked_a')::uuid
    returning id
  ) select count(*)::bigint from updated),
  0::bigint,
  'Read-only Member cannot archive an Activity'
);
select is((select count(*)::bigint from public.crm_activities where id = current_setting('test.phase25.activity_unlinked_a')::uuid and archived_at is null), 1::bigint, 'Read-only Activity remains active after archive attempt');
select throws_ok(
  $$insert into public.crm_tasks (organization_id, title)
    values ((select id from public.organizations where slug = current_setting('test.phase25.slug_a')), 'Member write denied')$$,
  '42501', 'new row violates row-level security policy for table "crm_tasks"', 'Read-only Member cannot create Tasks'
);
select throws_ok(
  $$insert into public.crm_activities (organization_id, type)
    values ((select id from public.organizations where slug = current_setting('test.phase25.slug_a')), 'note')$$,
  '42501', 'new row violates row-level security policy for table "crm_activities"', 'Read-only Member cannot create Activities'
);

select set_config('request.jwt.claim.sub', current_setting('test.phase25.user_admin_a'), true);
select lives_ok(
  $$with inserted as (
      insert into public.crm_tasks (organization_id, title)
      values ((select id from public.organizations where slug = current_setting('test.phase25.slug_a')), 'Admin Task')
      returning id
    )
    select set_config('test.phase25.task_admin_a', id::text, true) from inserted$$,
  'Admin can create a Task with tasks.manage'
);
select lives_ok(
  $$with inserted as (
      insert into public.crm_activities (organization_id, type, subject)
      values ((select id from public.organizations where slug = current_setting('test.phase25.slug_a')), 'note', 'Admin Activity')
      returning id
    )
    select set_config('test.phase25.activity_admin_a', id::text, true) from inserted$$,
  'Admin can create an Activity with activities.manage'
);
select lives_ok(
  $$update public.crm_tasks set title = 'Admin updated Task' where id = current_setting('test.phase25.task_admin_a')::uuid$$,
  'Admin can update a Task with tasks.manage'
);
select lives_ok(
  $$update public.crm_activities set subject = 'Admin updated Activity' where id = current_setting('test.phase25.activity_admin_a')::uuid$$,
  'Admin can update an Activity with activities.manage'
);

select set_config('request.jwt.claim.sub', current_setting('test.phase25.user_owner_a'), true);
select lives_ok(
  $$update public.crm_tasks set title = 'Owner updated Admin Task' where id = current_setting('test.phase25.task_admin_a')::uuid$$,
  'Authenticated Owner can update a Task after another actor created it'
);
select lives_ok(
  $$update public.crm_activities set subject = 'Owner updated Admin Activity' where id = current_setting('test.phase25.activity_admin_a')::uuid$$,
  'Authenticated Owner can update an Activity after another actor created it'
);
select is(
  (select created_by from public.crm_tasks where id = current_setting('test.phase25.task_admin_a')::uuid),
  current_setting('test.phase25.user_admin_a')::uuid,
  'Task update preserves the original creator'
);
select is(
  (select updated_by from public.crm_tasks where id = current_setting('test.phase25.task_admin_a')::uuid),
  current_setting('test.phase25.user_owner_a')::uuid,
  'Task update records the authenticated updater'
);
select is(
  (select created_by from public.crm_activities where id = current_setting('test.phase25.activity_admin_a')::uuid),
  current_setting('test.phase25.user_admin_a')::uuid,
  'Activity update preserves the original creator'
);
select throws_ok(
  $$update public.crm_tasks set updated_by = current_setting('test.phase25.user_admin_a')::uuid where id = current_setting('test.phase25.task_admin_a')::uuid$$,
  '42501', 'permission denied for table crm_tasks', 'Authenticated users cannot forge Task updater fields'
);
select throws_ok(
  $$update public.crm_activities set created_by = current_setting('test.phase25.user_admin_a')::uuid where id = current_setting('test.phase25.activity_admin_a')::uuid$$,
  '42501', 'permission denied for table crm_activities', 'Authenticated users cannot forge Activity creator fields'
);

reset role;
select set_config('request.jwt.claim.sub', current_setting('test.phase25.user_departing_a'), true);
update public.crm_accounts
set name = 'Departing member account', owner_user_id = current_setting('test.phase25.user_departing_a')::uuid
where id = current_setting('test.phase25.account_a')::uuid;
update public.crm_contacts
set first_name = 'Departing', owner_user_id = current_setting('test.phase25.user_departing_a')::uuid
where id = current_setting('test.phase25.contact_a')::uuid;
update public.crm_pipelines
set name = 'Departing member pipeline', owner_user_id = current_setting('test.phase25.user_departing_a')::uuid
where id = current_setting('test.phase25.pipeline_a')::uuid;
update public.crm_deals
set name = 'Departing member deal', owner_user_id = current_setting('test.phase25.user_departing_a')::uuid
where id = current_setting('test.phase25.deal_a')::uuid;
with inserted as (
  insert into public.crm_tasks (organization_id, title)
  select id, 'Departing member task'
  from public.organizations where slug = current_setting('test.phase25.slug_a')
  returning id
)
select set_config('test.phase25.task_departing_a', id::text, true) from inserted;
with inserted as (
  insert into public.crm_activities (organization_id, type, body)
  select id, 'note', 'Departing member activity'
  from public.organizations where slug = current_setting('test.phase25.slug_a')
  returning id
)
select set_config('test.phase25.activity_departing_a', id::text, true) from inserted;
select is(
  (select count(*)::bigint from public.crm_accounts
   where id = current_setting('test.phase25.account_a')::uuid
     and owner_user_id = current_setting('test.phase25.user_departing_a')::uuid
     and updated_by = current_setting('test.phase25.user_departing_a')::uuid),
  1::bigint,
  'Departing member is a CRM Account owner and updater before removal'
);
select is(
  (select count(*)::bigint from public.crm_contacts
   where id = current_setting('test.phase25.contact_a')::uuid
     and owner_user_id = current_setting('test.phase25.user_departing_a')::uuid
     and updated_by = current_setting('test.phase25.user_departing_a')::uuid),
  1::bigint,
  'Departing member is a CRM Contact owner and updater before removal'
);
select is(
  (select count(*)::bigint from public.crm_pipelines
   where id = current_setting('test.phase25.pipeline_a')::uuid
     and owner_user_id = current_setting('test.phase25.user_departing_a')::uuid
     and updated_by = current_setting('test.phase25.user_departing_a')::uuid),
  1::bigint,
  'Departing member is a Pipeline owner and updater before removal'
);
select is(
  (select count(*)::bigint from public.crm_deals
   where id = current_setting('test.phase25.deal_a')::uuid
     and owner_user_id = current_setting('test.phase25.user_departing_a')::uuid
     and updated_by = current_setting('test.phase25.user_departing_a')::uuid),
  1::bigint,
  'Departing member is a Deal owner and updater before removal'
);
select is(
  (select count(*)::bigint from public.crm_tasks
   where id = current_setting('test.phase25.task_departing_a')::uuid
     and owner_user_id = current_setting('test.phase25.user_departing_a')::uuid
     and created_by = current_setting('test.phase25.user_departing_a')::uuid
     and updated_by = current_setting('test.phase25.user_departing_a')::uuid),
  1::bigint,
  'Departing member is referenced by Task owner and actor fields before removal'
);
select is(
  (select count(*)::bigint from public.crm_activities
   where id = current_setting('test.phase25.activity_departing_a')::uuid
     and created_by = current_setting('test.phase25.user_departing_a')::uuid),
  1::bigint,
  'Departing member is referenced by Activity creator before removal'
);
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
select lives_ok(
  $$delete from public.memberships
    where organization_id = (select id from public.organizations where slug = current_setting('test.phase25.slug_a'))
      and user_id = current_setting('test.phase25.user_departing_a')::uuid$$,
  'Removing a referenced membership succeeds without auth.uid() for FK SET NULL actions'
);
select is(
  (select count(*)::bigint from public.crm_accounts
   where id = current_setting('test.phase25.account_a')::uuid
     and owner_user_id is null
     and updated_by is null
     and created_by = current_setting('test.phase25.user_owner_a')::uuid),
  1::bigint,
  'Account is preserved and departing owner/updater references are cleared'
);
select is(
  (select count(*)::bigint from public.crm_contacts
   where id = current_setting('test.phase25.contact_a')::uuid
     and owner_user_id is null
     and updated_by is null
     and created_by = current_setting('test.phase25.user_owner_a')::uuid),
  1::bigint,
  'Contact is preserved and departing owner/updater references are cleared'
);
select is(
  (select count(*)::bigint from public.crm_pipelines
   where id = current_setting('test.phase25.pipeline_a')::uuid
     and owner_user_id is null
     and updated_by is null
     and created_by = current_setting('test.phase25.user_owner_a')::uuid),
  1::bigint,
  'Pipeline is preserved and departing owner/updater references are cleared'
);
select is(
  (select count(*)::bigint from public.crm_deals
   where id = current_setting('test.phase25.deal_a')::uuid
     and owner_user_id is null
     and updated_by is null
     and created_by = current_setting('test.phase25.user_owner_a')::uuid),
  1::bigint,
  'Deal is preserved and departing owner/updater references are cleared'
);
select is(
  (select count(*)::bigint from public.crm_tasks
   where id = current_setting('test.phase25.task_departing_a')::uuid
     and title = 'Departing member task'
     and owner_user_id is null
     and created_by is null
     and updated_by is null),
  1::bigint,
  'Task is preserved and owner/creator/updater references are cleared after member removal'
);
select is(
  (select count(*)::bigint from public.crm_activities
   where id = current_setting('test.phase25.activity_departing_a')::uuid
     and body = 'Departing member activity'
     and created_by is null),
  1::bigint,
  'Activity is preserved and creator reference is cleared after member removal'
);

create temporary table crm_nested_update_probe (target text);
create function pg_temp.try_nested_task_update()
returns trigger
language plpgsql
as $$
begin
  if new.target = 'business_field' then
    update public.crm_tasks
    set title = 'Nested unauthenticated update'
    where id = current_setting('test.phase25.task_readonly_a')::uuid;
  elsif new.target = 'activity_business_field' then
    update public.crm_activities
    set body = 'Nested unauthenticated update'
    where id = current_setting('test.phase25.activity_unlinked_a')::uuid;
  elsif new.target = 'activity_actor_null_with_business_field' then
    update public.crm_activities
    set body = 'Nested unauthenticated update', created_by = null
    where id = current_setting('test.phase25.activity_unlinked_a')::uuid;
  elsif new.target = 'actor_field' then
    update public.crm_tasks
    set updated_by = current_setting('test.phase25.user_admin_a')::uuid
    where id = current_setting('test.phase25.task_readonly_a')::uuid;
  elsif new.target = 'actor_null_with_business_field' then
    update public.crm_tasks
    set title = 'Nested unauthenticated update', updated_by = null
    where id = current_setting('test.phase25.task_readonly_a')::uuid;
  else
    update public.crm_tasks
    set title = 'Nested unauthenticated update', owner_user_id = null
    where id = current_setting('test.phase25.task_readonly_a')::uuid;
  end if;
  return new;
end;
$$;
create trigger crm_nested_update_probe_trigger
  before insert on crm_nested_update_probe
  for each row execute function pg_temp.try_nested_task_update();

select throws_ok(
  $$insert into pg_temp.crm_nested_update_probe values ('business_field')$$,
  '28000', 'Authenticated actor required',
  'Nested update of a business field still requires an authenticated actor'
);
select throws_ok(
  $$insert into pg_temp.crm_nested_update_probe values ('activity_business_field')$$,
  '28000', 'Authenticated actor required',
  'Nested Activity update of a business field still requires an authenticated actor'
);
select throws_ok(
  $$insert into pg_temp.crm_nested_update_probe values ('activity_actor_null_with_business_field')$$,
  '28000', 'Authenticated actor required',
  'Nested Activity update cannot combine actor clearing with a business-field change'
);
select throws_ok(
  $$insert into pg_temp.crm_nested_update_probe values ('actor_field')$$,
  '28000', 'Authenticated actor required',
  'Nested update cannot forge an actor field without an authenticated FK SET NULL action'
);
select throws_ok(
  $$insert into pg_temp.crm_nested_update_probe values ('actor_null_with_business_field')$$,
  '28000', 'Authenticated actor required',
  'Nested update cannot combine actor clearing with a business-field change'
);
select throws_ok(
  $$insert into pg_temp.crm_nested_update_probe values ('relation_null_with_business_field')$$,
  '28000', 'Authenticated actor required',
  'Nested update cannot combine a foreign-key clear with a business-field change'
);

select set_config('request.jwt.claim.sub', current_setting('test.phase25.user_owner_a'), true);
select lives_ok(
  $$delete from public.crm_accounts where id = current_setting('test.phase25.account_a')::uuid$$,
  'Deleting a linked Account clears optional links instead of deleting Tasks or Activities'
);
select is((select count(*)::bigint from public.crm_tasks where id = current_setting('test.phase25.task_a')::uuid and account_id is null), 1::bigint, 'Account deletion preserves the Task and clears its account link');
select is((select count(*)::bigint from public.crm_activities where id = current_setting('test.phase25.activity_a')::uuid and account_id is null), 1::bigint, 'Account deletion preserves the Activity and clears its account link');
select lives_ok(
  $$delete from public.crm_contacts where id = current_setting('test.phase25.contact_a')::uuid$$,
  'Deleting a linked Contact clears optional links instead of deleting Tasks or Activities'
);
select is((select count(*)::bigint from public.crm_tasks where id = current_setting('test.phase25.task_a')::uuid and contact_id is null), 1::bigint, 'Contact deletion preserves the Task and clears its contact link');
select is((select count(*)::bigint from public.crm_activities where id = current_setting('test.phase25.activity_a')::uuid and contact_id is null), 1::bigint, 'Contact deletion preserves the Activity and clears its contact link');
select lives_ok(
  $$delete from public.crm_deals where id = current_setting('test.phase25.deal_a')::uuid$$,
  'Deleting a linked Deal clears optional links instead of deleting Tasks or Activities'
);
select is((select count(*)::bigint from public.crm_tasks where id = current_setting('test.phase25.task_a')::uuid and deal_id is null), 1::bigint, 'Deal deletion preserves the Task and clears its deal link');
select is((select count(*)::bigint from public.crm_activities where id = current_setting('test.phase25.activity_a')::uuid and deal_id is null), 1::bigint, 'Deal deletion preserves the Activity and clears its deal link');
select lives_ok(
  $$delete from public.crm_tasks where id = current_setting('test.phase25.task_a')::uuid$$,
  'Deleting a linked Task clears the optional Activity link instead of deleting the Activity'
);
select is((select count(*)::bigint from public.crm_activities where id = current_setting('test.phase25.activity_a')::uuid and task_id is null), 1::bigint, 'Task deletion preserves the Activity and clears its task link');

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.phase25.user_owner_b'), true);
select is((select count(*)::bigint from public.crm_tasks where id = current_setting('test.phase25.task_b')::uuid), 1::bigint, 'Tenant B can read its Task');
select is((select count(*)::bigint from public.crm_tasks where id = current_setting('test.phase25.task_readonly_a')::uuid), 0::bigint, 'Tenant B cannot read Tenant A Task');
select is((select count(*)::bigint from public.crm_activities where id = current_setting('test.phase25.activity_b')::uuid), 1::bigint, 'Tenant B can read its Activity');
select is((select count(*)::bigint from public.crm_activities where id = current_setting('test.phase25.activity_unlinked_a')::uuid), 0::bigint, 'Tenant B cannot read Tenant A Activity');

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
select lives_ok(
  $$delete from public.organizations where slug = current_setting('test.phase25.slug_b')$$,
  'Deleting an organization cascades its CRM data without requiring auth.uid() for nested FK actions'
);
select is((select count(*)::bigint from public.crm_tasks where id = current_setting('test.phase25.task_b')::uuid), 0::bigint, 'Organization deletion removes its Tasks');
select is((select count(*)::bigint from public.crm_activities where id = current_setting('test.phase25.activity_b')::uuid), 0::bigint, 'Organization deletion removes its Activities');

select * from finish();
rollback;
