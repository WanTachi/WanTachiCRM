begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('61000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'crm-owner-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('61000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'crm-owner-b@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('61000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'crm-admin-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('61000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'crm-member-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.create_organization('CRM Tenant A', 'crm-tenant-a')$$,
  'Owner A can create an organization with CRM role permissions'
);
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.create_organization('CRM Tenant B', 'crm-tenant-b')$$,
  'Owner B can create a separate organization'
);
reset role;

insert into public.memberships (organization_id, user_id, role_id, status)
select organization.id, '61000000-0000-4000-8000-000000000003', role.id, 'active'
from public.organizations as organization
join public.roles as role on role.organization_id = organization.id and role.slug = 'admin'
where organization.slug = 'crm-tenant-a';
insert into public.memberships (organization_id, user_id, role_id, status)
select organization.id, '61000000-0000-4000-8000-000000000004', role.id, 'active'
from public.organizations as organization
join public.roles as role on role.organization_id = organization.id and role.slug = 'member'
where organization.slug = 'crm-tenant-a';

select is(
  (select count(*)::bigint from public.role_permissions as rp
   join public.roles as role on role.id = rp.role_id
   join public.permissions as permission on permission.id = rp.permission_id
   join public.organizations as organization on organization.id = role.organization_id
   where organization.slug = 'crm-tenant-a' and role.slug = 'owner'
     and permission.key in ('accounts.read', 'accounts.manage', 'contacts.read', 'contacts.manage')),
  4::bigint,
  'New Owner receives all Accounts and Contacts permissions'
);
select is(
  (select count(*)::bigint from public.role_permissions as rp
   join public.roles as role on role.id = rp.role_id
   join public.permissions as permission on permission.id = rp.permission_id
   join public.organizations as organization on organization.id = role.organization_id
   where organization.slug = 'crm-tenant-a' and role.slug = 'admin'
     and permission.key in ('accounts.read', 'accounts.manage', 'contacts.read', 'contacts.manage')),
  4::bigint,
  'New Admin receives read and manage permissions'
);
select is(
  (select count(*)::bigint from public.role_permissions as rp
   join public.roles as role on role.id = rp.role_id
   join public.permissions as permission on permission.id = rp.permission_id
   join public.organizations as organization on organization.id = role.organization_id
   where organization.slug = 'crm-tenant-a' and role.slug = 'member'
     and permission.key in ('accounts.read', 'contacts.read')),
  2::bigint,
  'New Member receives read permissions'
);
select is(
  (select count(*)::bigint from public.role_permissions as rp
   join public.roles as role on role.id = rp.role_id
   join public.permissions as permission on permission.id = rp.permission_id
   join public.organizations as organization on organization.id = role.organization_id
   where organization.slug = 'crm-tenant-a' and role.slug = 'member'
     and permission.key in ('accounts.manage', 'contacts.manage')),
  0::bigint,
  'New Member does not receive manage permissions'
);

select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000001', true);
insert into public.crm_accounts (id, organization_id, name, owner_user_id)
select '62000000-0000-4000-8000-000000000001', id, 'Tenant A Account', '61000000-0000-4000-8000-000000000001'
from public.organizations where slug = 'crm-tenant-a';
insert into public.crm_accounts (id, organization_id, name, owner_user_id)
select '62000000-0000-4000-8000-000000000003', id, 'Tenant A Read-only Test Account', '61000000-0000-4000-8000-000000000001'
from public.organizations where slug = 'crm-tenant-a';
insert into public.crm_contacts (id, organization_id, first_name, last_name, account_id, owner_user_id)
select '63000000-0000-4000-8000-000000000001', organization.id, 'Ada', 'TenantA', account.id, '61000000-0000-4000-8000-000000000001'
from public.organizations as organization
join public.crm_accounts as account on account.id = '62000000-0000-4000-8000-000000000001'
where organization.slug = 'crm-tenant-a';
insert into public.crm_contacts (id, organization_id, first_name, last_name, owner_user_id)
select '63000000-0000-4000-8000-000000000002', id, 'Lin', null, '61000000-0000-4000-8000-000000000001'
from public.organizations where slug = 'crm-tenant-a';

select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000002', true);
insert into public.crm_accounts (id, organization_id, name, owner_user_id)
select '62000000-0000-4000-8000-000000000002', id, 'Tenant B Account', '61000000-0000-4000-8000-000000000002'
from public.organizations where slug = 'crm-tenant-b';
insert into public.crm_contacts (id, organization_id, first_name, last_name, account_id, owner_user_id)
select '63000000-0000-4000-8000-000000000003', organization.id, 'Bo', 'TenantB', account.id, '61000000-0000-4000-8000-000000000002'
from public.organizations as organization
join public.crm_accounts as account on account.id = '62000000-0000-4000-8000-000000000002'
where organization.slug = 'crm-tenant-b';

select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select is((select count(*)::bigint from public.crm_accounts where id = '62000000-0000-4000-8000-000000000001'), 1::bigint, 'Tenant A can read its account');
select is((select count(*)::bigint from public.crm_accounts where id = '62000000-0000-4000-8000-000000000002'), 0::bigint, 'Tenant A cannot read Tenant B account');
select is((select count(*)::bigint from public.crm_contacts where organization_id = (select id from public.organizations where slug = 'crm-tenant-a')), 2::bigint, 'Tenant A can read its contacts');
select is((select count(*)::bigint from public.crm_contacts where id = '63000000-0000-4000-8000-000000000003'), 0::bigint, 'Tenant A cannot read Tenant B contact');
select is((select count(*)::bigint from public.crm_contacts where id = '63000000-0000-4000-8000-000000000002' and account_id is null), 1::bigint, 'Contact without an account is allowed');
select is((select created_by from public.crm_accounts where id = '62000000-0000-4000-8000-000000000001'), '61000000-0000-4000-8000-000000000001'::uuid, 'Insert records the authenticated creator');
select is((select updated_by from public.crm_accounts where id = '62000000-0000-4000-8000-000000000001'), '61000000-0000-4000-8000-000000000001'::uuid, 'Insert records the authenticated updater');

select throws_ok(
  $$insert into public.crm_contacts (organization_id, first_name, account_id)
    values ((select id from public.organizations where slug = 'crm-tenant-a'), 'Cross', '62000000-0000-4000-8000-000000000002')$$,
  '23503',
  'insert or update on table "crm_contacts" violates foreign key constraint "crm_contacts_account_same_org_fk"',
  'Contact cannot reference another organization account'
);
select throws_ok(
  $$insert into public.crm_accounts (organization_id, name, owner_user_id)
    values ((select id from public.organizations where slug = 'crm-tenant-a'), 'Cross tenant owner', '61000000-0000-4000-8000-000000000002')$$,
  '23503',
  'insert or update on table "crm_accounts" violates foreign key constraint "crm_accounts_owner_same_org_fk"',
  'Account owner must be a member of the same organization'
);
select throws_ok(
  $$insert into public.crm_accounts (organization_id, name, created_by)
    values ((select id from public.organizations where slug = 'crm-tenant-a'), 'Spoofed creator', '61000000-0000-4000-8000-000000000002')$$,
  '42501',
  'permission denied for table crm_accounts',
  'Authenticated users cannot supply actor fields'
);
select throws_ok(
  $$update public.crm_accounts set organization_id = (select id from public.organizations where slug = 'crm-tenant-b')
    where id = '62000000-0000-4000-8000-000000000001'$$,
  '42501',
  'permission denied for table crm_accounts',
  'Authenticated users cannot change a record tenant'
);
select throws_ok(
  $$delete from public.crm_accounts where id = '62000000-0000-4000-8000-000000000001'$$,
  '42501',
  'permission denied for table crm_accounts',
  'Authenticated users cannot physically delete accounts'
);

select lives_ok(
  $$update public.crm_accounts set archived_at = now() where id = '62000000-0000-4000-8000-000000000001'$$,
  'User with accounts.read and accounts.manage can archive an account'
);
select is((select count(*)::bigint from public.crm_accounts where id = '62000000-0000-4000-8000-000000000001' and archived_at is null), 0::bigint, 'Archived account is excluded from the active accounts selection');
select lives_ok(
  $$update public.crm_contacts set archived_at = now() where id = '63000000-0000-4000-8000-000000000002'$$,
  'User with contacts.read and contacts.manage can archive a contact'
);
select is((select count(*)::bigint from public.crm_contacts where id = '63000000-0000-4000-8000-000000000002' and archived_at is null), 0::bigint, 'Archived contact is excluded from the active contacts selection');

reset role;
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$insert into public.crm_accounts (organization_id, name, owner_user_id)
    values ((select id from public.organizations where slug = 'crm-tenant-a'), 'Cross tenant actor', null)$$,
  '23503',
  'insert or update on table "crm_accounts" violates foreign key constraint "crm_accounts_created_by_same_org_fk"',
  'Creator from another organization is rejected by the composite membership foreign key'
);
select throws_ok(
  $$update public.crm_accounts set name = 'Cross tenant updater' where id = '62000000-0000-4000-8000-000000000001'$$,
  '23503',
  'insert or update on table "crm_accounts" violates foreign key constraint "crm_accounts_updated_by_same_org_fk"',
  'Updater from another organization is rejected by the composite membership foreign key'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000004', true);
select is((select count(*)::bigint from public.crm_contacts where organization_id = (select id from public.organizations where slug = 'crm-tenant-a')), 1::bigint, 'Member can read active contacts');
select is((select count(*)::bigint from public.crm_accounts where id = '62000000-0000-4000-8000-000000000002'), 0::bigint, 'Member cannot read another organization account');
select is((select count(*)::bigint from public.crm_accounts where id = '62000000-0000-4000-8000-000000000001'), 0::bigint, 'Archived account is hidden from ordinary SELECT');
select is((select count(*)::bigint from public.crm_contacts where id = '63000000-0000-4000-8000-000000000002'), 0::bigint, 'Archived contact is hidden from ordinary SELECT');
select lives_ok(
  $$update public.crm_accounts set archived_at = now()
    where id = '62000000-0000-4000-8000-000000000003'$$,
  'User with accounts.read only cannot archive an account'
);
select is((select count(*)::bigint from public.crm_accounts where id = '62000000-0000-4000-8000-000000000003' and archived_at is null), 1::bigint, 'Read-only account remains active after archive attempt');
select lives_ok(
  $$update public.crm_contacts set archived_at = now()
    where id = '63000000-0000-4000-8000-000000000001'$$,
  'User with contacts.read only cannot archive a contact'
);
select is((select count(*)::bigint from public.crm_contacts where id = '63000000-0000-4000-8000-000000000001' and archived_at is null), 1::bigint, 'Read-only contact remains active after archive attempt');
select throws_ok(
  $$insert into public.crm_accounts (organization_id, name)
    values ((select id from public.organizations where slug = 'crm-tenant-a'), 'Member write denied')$$,
  '42501',
  'new row violates row-level security policy for table "crm_accounts"',
  'Member cannot create accounts without accounts.manage'
);

select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000003', true);
select lives_ok(
  $$insert into public.crm_accounts (organization_id, name)
    values ((select id from public.organizations where slug = 'crm-tenant-a'), 'Admin-created account')$$,
  'Admin can create accounts with accounts.manage'
);

select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000002', true);
select is((select count(*)::bigint from public.crm_accounts where id = '62000000-0000-4000-8000-000000000002'), 1::bigint, 'Tenant B can read its account');
select is((select count(*)::bigint from public.crm_accounts where id = '62000000-0000-4000-8000-000000000001'), 0::bigint, 'Tenant B cannot read Tenant A account');
select is((select count(*)::bigint from public.crm_contacts where id = '63000000-0000-4000-8000-000000000003'), 1::bigint, 'Tenant B can read its contact');
select is((select count(*)::bigint from public.crm_contacts where id = '63000000-0000-4000-8000-000000000002'), 0::bigint, 'Tenant B cannot read Tenant A archived contact');

select * from finish();
rollback;
