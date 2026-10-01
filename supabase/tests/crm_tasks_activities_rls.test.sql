begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('91000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'task-owner-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('91000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'task-owner-b@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('91000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'task-admin-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('91000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'task-member-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.create_organization('Task Tenant A', 'task-tenant-a')$$,
  'Owner A can create an organization with Tasks and Activities permissions'
);
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.create_organization('Task Tenant B', 'task-tenant-b')$$,
  'Owner B can create a separate organization'
);
reset role;

insert into public.memberships (organization_id, user_id, role_id, status)
select organization.id, '91000000-0000-4000-8000-000000000003', role.id, 'active'
from public.organizations as organization
join public.roles as role on role.organization_id = organization.id and role.slug = 'admin'
where organization.slug = 'task-tenant-a';
insert into public.memberships (organization_id, user_id, role_id, status)
select organization.id, '91000000-0000-4000-8000-000000000004', role.id, 'active'
from public.organizations as organization
join public.roles as role on role.organization_id = organization.id and role.slug = 'member'
where organization.slug = 'task-tenant-a';

select is(
  (select count(*)::bigint from public.role_permissions as rp
   join public.roles as role on role.id = rp.role_id
   join public.permissions as permission on permission.id = rp.permission_id
   join public.organizations as organization on organization.id = role.organization_id
   where organization.slug = 'task-tenant-a' and role.slug = 'owner'
     and permission.key in ('tasks.read', 'tasks.manage', 'activities.read', 'activities.manage')),
  4::bigint,
  'New Owner receives all Tasks and Activities permissions'
);
select is(
  (select count(*)::bigint from public.role_permissions as rp
   join public.roles as role on role.id = rp.role_id
   join public.permissions as permission on permission.id = rp.permission_id
   join public.organizations as organization on organization.id = role.organization_id
   where organization.slug = 'task-tenant-a' and role.slug = 'admin'
     and permission.key in ('tasks.read', 'tasks.manage', 'activities.read', 'activities.manage')),
  4::bigint,
  'New Admin receives read and manage permissions'
);
select is(
  (select count(*)::bigint from public.role_permissions as rp
   join public.roles as role on role.id = rp.role_id
   join public.permissions as permission on permission.id = rp.permission_id
   join public.organizations as organization on organization.id = role.organization_id
   where organization.slug = 'task-tenant-a' and role.slug = 'member'
     and permission.key in ('tasks.read', 'activities.read')),
  2::bigint,
  'New Member receives read permissions'
);
select is(
  (select count(*)::bigint from public.role_permissions as rp
   join public.roles as role on role.id = rp.role_id
   join public.permissions as permission on permission.id = rp.permission_id
   join public.organizations as organization on organization.id = role.organization_id
   where organization.slug = 'task-tenant-a' and role.slug = 'member'
     and permission.key in ('tasks.manage', 'activities.manage')),
  0::bigint,
  'New Member does not receive manage permissions'
);
select is(
  (select count(*)::bigint from public.role_permissions as rp
   join public.roles as role on role.id = rp.role_id
   join public.permissions as permission on permission.id = rp.permission_id
   join public.organizations as organization on organization.id = role.organization_id
   where organization.slug = 'task-tenant-a' and role.slug = 'admin'
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
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
insert into public.crm_accounts (id, organization_id, name)
select '95000000-0000-4000-8000-000000000001', id, 'Tenant A Account'
from public.organizations where slug = 'task-tenant-a';
insert into public.crm_contacts (id, organization_id, first_name, account_id)
select '96000000-0000-4000-8000-000000000001', organization.id, 'Ada', account.id
from public.organizations as organization
join public.crm_accounts as account on account.id = '95000000-0000-4000-8000-000000000001'
where organization.slug = 'task-tenant-a';
insert into public.crm_pipelines (id, organization_id, name)
select '93000000-0000-4000-8000-000000000001', id, 'Tenant A Pipeline'
from public.organizations where slug = 'task-tenant-a';
insert into public.crm_pipeline_stages (id, organization_id, pipeline_id, name, position)
select '94000000-0000-4000-8000-000000000001', id, 'Tenant A Stage', 0
from public.organizations where slug = 'task-tenant-a';
insert into public.crm_deals (id, organization_id, pipeline_id, stage_id, name)
select
  '97000000-0000-4000-8000-000000000001', organization.id,
  '93000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001',
  'Tenant A Deal'
from public.organizations as organization
where organization.slug = 'task-tenant-a';
insert into public.crm_tasks (
  id, organization_id, title, status, priority, due_at, owner_user_id,
  account_id, contact_id, deal_id
)
select
  '98000000-0000-4000-8000-000000000001', organization.id,
  'Tenant A linked task', 'in_progress', 'high', now() + interval '1 day',
  '91000000-0000-4000-8000-000000000001',
  '95000000-0000-4000-8000-000000000001',
  '96000000-0000-4000-8000-000000000001',
  '97000000-0000-4000-8000-000000000001'
from public.organizations as organization
where organization.slug = 'task-tenant-a';
insert into public.crm_tasks (id, organization_id, title, owner_user_id)
select '98000000-0000-4000-8000-000000000003', id, 'Tenant A read-only task', '91000000-0000-4000-8000-000000000001'
from public.organizations where slug = 'task-tenant-a';
insert into public.crm_activities (
  id, organization_id, type, subject, body, occurred_at,
  account_id, contact_id, deal_id, task_id
)
select
  '99000000-0000-4000-8000-000000000001', organization.id,
  'meeting', 'Tenant A check-in', 'Discussed next steps', now(),
  '95000000-0000-4000-8000-000000000001',
  '96000000-0000-4000-8000-000000000001',
  '97000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000001'
from public.organizations as organization
where organization.slug = 'task-tenant-a';
insert into public.crm_activities (id, organization_id, type, body)
select '99000000-0000-4000-8000-000000000003', id, 'note', 'Unlinked note is allowed'
from public.organizations where slug = 'task-tenant-a';

select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000002', true);
insert into public.crm_accounts (id, organization_id, name)
select '95000000-0000-4000-8000-000000000002', id, 'Tenant B Account'
from public.organizations where slug = 'task-tenant-b';
insert into public.crm_contacts (id, organization_id, first_name, account_id)
select '96000000-0000-4000-8000-000000000002', organization.id, 'Bo', account.id
from public.organizations as organization
join public.crm_accounts as account on account.id = '95000000-0000-4000-8000-000000000002'
where organization.slug = 'task-tenant-b';
insert into public.crm_pipelines (id, organization_id, name)
select '93000000-0000-4000-8000-000000000002', id, 'Tenant B Pipeline'
from public.organizations where slug = 'task-tenant-b';
insert into public.crm_pipeline_stages (id, organization_id, pipeline_id, name, position)
select '94000000-0000-4000-8000-000000000002', id, 'Tenant B Stage', 0
from public.organizations where slug = 'task-tenant-b';
insert into public.crm_deals (id, organization_id, pipeline_id, stage_id, name)
select
  '97000000-0000-4000-8000-000000000002', organization.id,
  '93000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000002',
  'Tenant B Deal'
from public.organizations as organization
where organization.slug = 'task-tenant-b';
insert into public.crm_tasks (id, organization_id, title, owner_user_id)
select '98000000-0000-4000-8000-000000000002', id, 'Tenant B task', '91000000-0000-4000-8000-000000000002'
from public.organizations where slug = 'task-tenant-b';
insert into public.crm_activities (id, organization_id, type, body)
select '99000000-0000-4000-8000-000000000002', id, 'email', 'Tenant B activity'
from public.organizations where slug = 'task-tenant-b';

select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
select is((select count(*)::bigint from public.crm_tasks where organization_id = (select id from public.organizations where slug = 'task-tenant-a')), 2::bigint, 'Tenant A can read its active tasks');
select is((select count(*)::bigint from public.crm_activities where organization_id = (select id from public.organizations where slug = 'task-tenant-a')), 2::bigint, 'Tenant A can read its active activities');
select is((select count(*)::bigint from public.crm_tasks where id = '98000000-0000-4000-8000-000000000002'), 0::bigint, 'Tenant A cannot read Tenant B task');
select is((select count(*)::bigint from public.crm_activities where id = '99000000-0000-4000-8000-000000000002'), 0::bigint, 'Tenant A cannot read Tenant B activity');
select is(
  (select count(*)::bigint from public.crm_tasks where id = '98000000-0000-4000-8000-000000000001'
    and account_id = '95000000-0000-4000-8000-000000000001'
    and contact_id = '96000000-0000-4000-8000-000000000001'
    and deal_id = '97000000-0000-4000-8000-000000000001'),
  1::bigint,
  'Task can link to same-organization Account, Contact and Deal'
);
select is(
  (select count(*)::bigint from public.crm_activities where id = '99000000-0000-4000-8000-000000000001'
    and account_id = '95000000-0000-4000-8000-000000000001'
    and contact_id = '96000000-0000-4000-8000-000000000001'
    and deal_id = '97000000-0000-4000-8000-000000000001'
    and task_id = '98000000-0000-4000-8000-000000000001'),
  1::bigint,
  'Activity can link to same-organization Account, Contact, Deal and Task'
);
select is((select count(*)::bigint from public.crm_tasks where id = '98000000-0000-4000-8000-000000000003' and account_id is null and contact_id is null and deal_id is null), 1::bigint, 'Task can exist without related CRM records');
select is((select count(*)::bigint from public.crm_activities where id = '99000000-0000-4000-8000-000000000003' and account_id is null and contact_id is null and deal_id is null and task_id is null), 1::bigint, 'Activity can exist without related CRM records');
select is((select created_by from public.crm_tasks where id = '98000000-0000-4000-8000-000000000001'), '91000000-0000-4000-8000-000000000001'::uuid, 'Task creator is set by the authenticated audit trigger');
select is((select updated_by from public.crm_tasks where id = '98000000-0000-4000-8000-000000000001'), '91000000-0000-4000-8000-000000000001'::uuid, 'Task updater is set by the authenticated audit trigger');
select is((select created_by from public.crm_activities where id = '99000000-0000-4000-8000-000000000001'), '91000000-0000-4000-8000-000000000001'::uuid, 'Activity creator is set by the authenticated audit trigger');

select throws_ok(
  $$insert into public.crm_tasks (organization_id, title, account_id)
    values ((select id from public.organizations where slug = 'task-tenant-a'), 'Cross-tenant account', '95000000-0000-4000-8000-000000000002')$$,
  '23503',
  'insert or update on table "crm_tasks" violates foreign key constraint "crm_tasks_account_same_org_fk"',
  'Task cannot reference an Account from another organization'
);
select throws_ok(
  $$insert into public.crm_tasks (organization_id, title, contact_id)
    values ((select id from public.organizations where slug = 'task-tenant-a'), 'Cross-tenant contact', '96000000-0000-4000-8000-000000000002')$$,
  '23503',
  'insert or update on table "crm_tasks" violates foreign key constraint "crm_tasks_contact_same_org_fk"',
  'Task cannot reference a Contact from another organization'
);
select throws_ok(
  $$insert into public.crm_tasks (organization_id, title, deal_id)
    values ((select id from public.organizations where slug = 'task-tenant-a'), 'Cross-tenant deal', '97000000-0000-4000-8000-000000000002')$$,
  '23503',
  'insert or update on table "crm_tasks" violates foreign key constraint "crm_tasks_deal_same_org_fk"',
  'Task cannot reference a Deal from another organization'
);
select throws_ok(
  $$insert into public.crm_tasks (organization_id, title, owner_user_id)
    values ((select id from public.organizations where slug = 'task-tenant-a'), 'Cross-tenant owner', '91000000-0000-4000-8000-000000000002')$$,
  '23503',
  'insert or update on table "crm_tasks" violates foreign key constraint "crm_tasks_owner_same_org_fk"',
  'Task owner must be a member of the same organization'
);
select throws_ok(
  $$insert into public.crm_activities (organization_id, type, account_id)
    values ((select id from public.organizations where slug = 'task-tenant-a'), 'note', '95000000-0000-4000-8000-000000000002')$$,
  '23503',
  'insert or update on table "crm_activities" violates foreign key constraint "crm_activities_account_same_org_fk"',
  'Activity cannot reference an Account from another organization'
);
select throws_ok(
  $$insert into public.crm_activities (organization_id, type, contact_id)
    values ((select id from public.organizations where slug = 'task-tenant-a'), 'note', '96000000-0000-4000-8000-000000000002')$$,
  '23503',
  'insert or update on table "crm_activities" violates foreign key constraint "crm_activities_contact_same_org_fk"',
  'Activity cannot reference a Contact from another organization'
);
select throws_ok(
  $$insert into public.crm_activities (organization_id, type, deal_id)
    values ((select id from public.organizations where slug = 'task-tenant-a'), 'note', '97000000-0000-4000-8000-000000000002')$$,
  '23503',
  'insert or update on table "crm_activities" violates foreign key constraint "crm_activities_deal_same_org_fk"',
  'Activity cannot reference a Deal from another organization'
);
select throws_ok(
  $$insert into public.crm_activities (organization_id, type, task_id)
    values ((select id from public.organizations where slug = 'task-tenant-a'), 'note', '98000000-0000-4000-8000-000000000002')$$,
  '23503',
  'insert or update on table "crm_activities" violates foreign key constraint "crm_activities_task_same_org_fk"',
  'Activity cannot reference a Task from another organization'
);
select throws_ok(
  $$insert into public.crm_tasks (organization_id, title, created_by)
    values ((select id from public.organizations where slug = 'task-tenant-a'), 'Spoofed actor', '91000000-0000-4000-8000-000000000002')$$,
  '42501', 'permission denied for table crm_tasks', 'Authenticated users cannot supply Task actor fields'
);
select throws_ok(
  $$update public.crm_tasks set updated_by = '91000000-0000-4000-8000-000000000002' where id = '98000000-0000-4000-8000-000000000001'$$,
  '42501', 'permission denied for table crm_tasks', 'Authenticated users cannot supply Task updater fields'
);
select throws_ok(
  $$insert into public.crm_activities (organization_id, type, created_by)
    values ((select id from public.organizations where slug = 'task-tenant-a'), 'note', '91000000-0000-4000-8000-000000000002')$$,
  '42501', 'permission denied for table crm_activities', 'Authenticated users cannot supply Activity actor fields'
);

reset role;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$insert into public.crm_tasks (organization_id, title)
    values ((select id from public.organizations where slug = 'task-tenant-a'), 'Cross-tenant creator')$$,
  '23503',
  'insert or update on table "crm_tasks" violates foreign key constraint "crm_tasks_created_by_same_org_fk"',
  'Task creator must be a member of the same organization'
);
select throws_ok(
  $$update public.crm_tasks set title = 'Cross-tenant updater' where id = '98000000-0000-4000-8000-000000000003'$$,
  '23503',
  'insert or update on table "crm_tasks" violates foreign key constraint "crm_tasks_updated_by_same_org_fk"',
  'Task updater must be a member of the same organization'
);
select throws_ok(
  $$insert into public.crm_activities (organization_id, type)
    values ((select id from public.organizations where slug = 'task-tenant-a'), 'note')$$,
  '23503',
  'insert or update on table "crm_activities" violates foreign key constraint "crm_activities_created_by_same_org_fk"',
  'Activity creator must be a member of the same organization'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$update public.crm_tasks set organization_id = (select id from public.organizations where slug = 'task-tenant-b') where id = '98000000-0000-4000-8000-000000000001'$$,
  '42501', 'permission denied for table crm_tasks', 'Authenticated users cannot update Task organization_id'
);
select throws_ok(
  $$update public.crm_activities set organization_id = (select id from public.organizations where slug = 'task-tenant-b') where id = '99000000-0000-4000-8000-000000000001'$$,
  '42501', 'permission denied for table crm_activities', 'Authenticated users cannot update Activity organization_id'
);
select throws_ok(
  $$delete from public.crm_tasks where id = '98000000-0000-4000-8000-000000000001'$$,
  '42501', 'permission denied for table crm_tasks', 'Authenticated users cannot physically delete Tasks'
);
select throws_ok(
  $$delete from public.crm_activities where id = '99000000-0000-4000-8000-000000000001'$$,
  '42501', 'permission denied for table crm_activities', 'Authenticated users cannot physically delete Activities'
);

reset role;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$update public.crm_tasks set organization_id = (select id from public.organizations where slug = 'task-tenant-b') where id = '98000000-0000-4000-8000-000000000001'$$,
  '42501', 'CRM record organization cannot be changed', 'Task audit trigger independently prevents tenant changes'
);
select throws_ok(
  $$update public.crm_activities set organization_id = (select id from public.organizations where slug = 'task-tenant-b') where id = '99000000-0000-4000-8000-000000000001'$$,
  '42501', 'CRM record organization cannot be changed', 'Activity audit trigger independently prevents tenant changes'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$update public.crm_tasks set archived_at = now() where id = '98000000-0000-4000-8000-000000000001'$$,
  'Owner with tasks.read and tasks.manage can archive a Task'
);
select lives_ok(
  $$update public.crm_activities set archived_at = now() where id = '99000000-0000-4000-8000-000000000001'$$,
  'Owner with activities.read and activities.manage can archive an Activity'
);
select is((select count(*)::bigint from public.crm_tasks where id = '98000000-0000-4000-8000-000000000001' and archived_at is null), 0::bigint, 'Archived Task is excluded from active selection');
select is((select count(*)::bigint from public.crm_activities where id = '99000000-0000-4000-8000-000000000001' and archived_at is null), 0::bigint, 'Archived Activity is excluded from active selection');
select is((select count(*)::bigint from public.crm_tasks where id = '98000000-0000-4000-8000-000000000001'), 1::bigint, 'Owner with read and manage can inspect archived Task');
select is((select count(*)::bigint from public.crm_activities where id = '99000000-0000-4000-8000-000000000001'), 1::bigint, 'Owner with read and manage can inspect archived Activity');

select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000004', true);
select is((select count(*)::bigint from public.crm_tasks where id = '98000000-0000-4000-8000-000000000001'), 0::bigint, 'Read-only Member cannot see an archived Task');
select is((select count(*)::bigint from public.crm_activities where id = '99000000-0000-4000-8000-000000000001'), 0::bigint, 'Read-only Member cannot see an archived Activity');
select is(
  (with updated as (
    update public.crm_tasks set archived_at = now()
    where id = '98000000-0000-4000-8000-000000000003'
    returning id
  ) select count(*)::bigint from updated),
  0::bigint,
  'Read-only Member cannot archive a Task'
);
select is((select count(*)::bigint from public.crm_tasks where id = '98000000-0000-4000-8000-000000000003' and archived_at is null), 1::bigint, 'Read-only Task remains active after archive attempt');
select is(
  (with updated as (
    update public.crm_activities set archived_at = now()
    where id = '99000000-0000-4000-8000-000000000003'
    returning id
  ) select count(*)::bigint from updated),
  0::bigint,
  'Read-only Member cannot archive an Activity'
);
select is((select count(*)::bigint from public.crm_activities where id = '99000000-0000-4000-8000-000000000003' and archived_at is null), 1::bigint, 'Read-only Activity remains active after archive attempt');
select throws_ok(
  $$insert into public.crm_tasks (organization_id, title)
    values ((select id from public.organizations where slug = 'task-tenant-a'), 'Member write denied')$$,
  '42501', 'new row violates row-level security policy for table "crm_tasks"', 'Read-only Member cannot create Tasks'
);
select throws_ok(
  $$insert into public.crm_activities (organization_id, type)
    values ((select id from public.organizations where slug = 'task-tenant-a'), 'note')$$,
  '42501', 'new row violates row-level security policy for table "crm_activities"', 'Read-only Member cannot create Activities'
);

select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000003', true);
select lives_ok(
  $$insert into public.crm_tasks (id, organization_id, title)
    values ('98000000-0000-4000-8000-000000000004', (select id from public.organizations where slug = 'task-tenant-a'), 'Admin Task')$$,
  'Admin can create a Task with tasks.manage'
);
select lives_ok(
  $$insert into public.crm_activities (id, organization_id, type, subject)
    values ('99000000-0000-4000-8000-000000000004', (select id from public.organizations where slug = 'task-tenant-a'), 'note', 'Admin Activity')$$,
  'Admin can create an Activity with activities.manage'
);
select lives_ok(
  $$update public.crm_tasks set title = 'Admin updated Task' where id = '98000000-0000-4000-8000-000000000004'$$,
  'Admin can update a Task with tasks.manage'
);
select lives_ok(
  $$update public.crm_activities set subject = 'Admin updated Activity' where id = '99000000-0000-4000-8000-000000000004'$$,
  'Admin can update an Activity with activities.manage'
);

reset role;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$delete from public.crm_accounts where id = '95000000-0000-4000-8000-000000000001'$$,
  'Deleting a linked Account clears optional links instead of deleting Tasks or Activities'
);
select is((select count(*)::bigint from public.crm_tasks where id = '98000000-0000-4000-8000-000000000001' and account_id is null), 1::bigint, 'Account deletion preserves the Task and clears its account link');
select is((select count(*)::bigint from public.crm_activities where id = '99000000-0000-4000-8000-000000000001' and account_id is null), 1::bigint, 'Account deletion preserves the Activity and clears its account link');
select lives_ok(
  $$delete from public.crm_contacts where id = '96000000-0000-4000-8000-000000000001'$$,
  'Deleting a linked Contact clears optional links instead of deleting Tasks or Activities'
);
select is((select count(*)::bigint from public.crm_tasks where id = '98000000-0000-4000-8000-000000000001' and contact_id is null), 1::bigint, 'Contact deletion preserves the Task and clears its contact link');
select is((select count(*)::bigint from public.crm_activities where id = '99000000-0000-4000-8000-000000000001' and contact_id is null), 1::bigint, 'Contact deletion preserves the Activity and clears its contact link');
select lives_ok(
  $$delete from public.crm_deals where id = '97000000-0000-4000-8000-000000000001'$$,
  'Deleting a linked Deal clears optional links instead of deleting Tasks or Activities'
);
select is((select count(*)::bigint from public.crm_tasks where id = '98000000-0000-4000-8000-000000000001' and deal_id is null), 1::bigint, 'Deal deletion preserves the Task and clears its deal link');
select is((select count(*)::bigint from public.crm_activities where id = '99000000-0000-4000-8000-000000000001' and deal_id is null), 1::bigint, 'Deal deletion preserves the Activity and clears its deal link');
select lives_ok(
  $$delete from public.crm_tasks where id = '98000000-0000-4000-8000-000000000001'$$,
  'Deleting a linked Task clears the optional Activity link instead of deleting the Activity'
);
select is((select count(*)::bigint from public.crm_activities where id = '99000000-0000-4000-8000-000000000001' and task_id is null), 1::bigint, 'Task deletion preserves the Activity and clears its task link');

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000002', true);
select is((select count(*)::bigint from public.crm_tasks where id = '98000000-0000-4000-8000-000000000002'), 1::bigint, 'Tenant B can read its Task');
select is((select count(*)::bigint from public.crm_tasks where id = '98000000-0000-4000-8000-000000000003'), 0::bigint, 'Tenant B cannot read Tenant A Task');
select is((select count(*)::bigint from public.crm_activities where id = '99000000-0000-4000-8000-000000000002'), 1::bigint, 'Tenant B can read its Activity');
select is((select count(*)::bigint from public.crm_activities where id = '99000000-0000-4000-8000-000000000003'), 0::bigint, 'Tenant B cannot read Tenant A Activity');

reset role;
select lives_ok(
  $$delete from public.organizations where slug = 'task-tenant-b'$$,
  'Deleting an organization still cascades its Tasks and Activities'
);
select is((select count(*)::bigint from public.crm_tasks where id = '98000000-0000-4000-8000-000000000002'), 0::bigint, 'Organization deletion removes its Tasks');
select is((select count(*)::bigint from public.crm_activities where id = '99000000-0000-4000-8000-000000000002'), 0::bigint, 'Organization deletion removes its Activities');

select * from finish();
rollback;
