begin;

create extension if not exists pgtap with schema extensions;

select plan(34);

select is(to_regclass('public.organizations') is not null, true, 'organizations table exists');
select is(to_regclass('public.memberships') is not null, true, 'memberships table exists');
select is(to_regclass('public.roles') is not null, true, 'roles table exists');
select is(to_regclass('public.permissions') is not null, true, 'permissions table exists');
select is(to_regclass('public.role_permissions') is not null, true, 'role_permissions table exists');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tenant-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tenant-b@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('44444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tenant-a-member@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'no-membership@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.organizations (id, name, slug) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Tenant A', 'tenant-a'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Tenant B', 'tenant-b');

insert into public.roles (id, organization_id, name, slug, is_system) values
  ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Owner', 'owner', true),
  ('a0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Admin', 'admin', true),
  ('a0000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Member', 'member', true),
  ('b0000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Owner', 'owner', true),
  ('b0000000-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Admin', 'admin', true),
  ('b0000000-0000-4000-8000-000000000003', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Member', 'member', true);

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.slug = 'owner';

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission
  on permission.key in ('organization.read', 'organization.update', 'members.read', 'members.manage')
where role.slug = 'admin';

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission on permission.key = 'organization.read'
where role.slug = 'member';

insert into public.memberships (organization_id, user_id, role_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000001'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444', 'a0000000-0000-4000-8000-000000000003'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'b0000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

select is((select count(*)::bigint from public.organizations where slug = 'tenant-a'), 1::bigint, 'User A reads their organization');
select is((select count(*)::bigint from public.organizations where slug = 'tenant-b'), 0::bigint, 'User A cannot read Organization B');
select results_eq($$update public.organizations set name = 'Tenant A Verified' where slug = 'tenant-a' returning id$$, $$values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)$$, 'User A can update their own organization');
select is_empty($$update public.organizations set name = 'Tampered' where slug = 'tenant-b' returning id$$, 'User A cannot update Organization B');
select is_empty($$delete from public.organizations where slug = 'tenant-b' returning id$$, 'User A cannot delete Organization B');
select is((select count(*)::bigint from public.memberships where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 2::bigint, 'Owner can read memberships in their organization');
select is((select count(*)::bigint from public.memberships where organization_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 0::bigint, 'User A cannot read Organization B memberships');
select is((select count(*)::bigint from public.roles where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 3::bigint, 'User A can read their organization roles');
select is((select count(*)::bigint from public.roles where organization_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 0::bigint, 'User A cannot read Organization B roles');
select is((select count(*)::bigint from public.role_permissions as rp join public.roles as r on r.id = rp.role_id where r.organization_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 0::bigint, 'User A cannot read Organization B role permissions');
select is((select count(*)::bigint from public.role_permissions as rp join public.roles as r on r.id = rp.role_id join public.permissions as p on p.id = rp.permission_id where r.organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and r.slug = 'owner' and p.key = 'members.manage'), 1::bigint, 'Owner role has members.manage permission');
select is((select count(*)::bigint from public.role_permissions as rp join public.roles as r on r.id = rp.role_id join public.permissions as p on p.id = rp.permission_id where r.organization_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and r.slug = 'owner' and p.key = 'members.manage'), 0::bigint, 'User A cannot inspect Organization B permissions');
select throws_ok($$insert into public.memberships (organization_id, user_id, role_id) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000001')$$, '42501', 'permission denied for table memberships', 'User A cannot create a cross-tenant membership');
select throws_ok($$insert into public.organizations (name, slug) values ('Forged', 'forged')$$, '42501', 'permission denied for table organizations', 'Organizations can only be created by the atomic RPC');

select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
select is((select count(*)::bigint from public.memberships where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 1::bigint, 'A member without members.read can only read their own membership');

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select is((select count(*)::bigint from public.organizations where slug = 'tenant-b'), 1::bigint, 'User B reads their organization');
select is((select count(*)::bigint from public.organizations where slug = 'tenant-a'), 0::bigint, 'User B cannot read Organization A');
select is((select count(*)::bigint from public.memberships where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0::bigint, 'User B cannot read Organization A memberships');

select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
select is((select count(*)::bigint from public.organizations), 0::bigint, 'A user without membership cannot read any organization');
select is((select count(*)::bigint from public.memberships), 0::bigint, 'A user without membership cannot read memberships');
select is((select count(*)::bigint from public.roles), 0::bigint, 'A user without membership cannot read roles');

reset role;
select throws_ok($$insert into public.memberships (organization_id, user_id, role_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000001')$$, '23505', 'duplicate key value violates unique constraint "memberships_organization_id_user_id_key"', 'Duplicate organization/user membership is rejected');
select throws_ok($$insert into public.memberships (organization_id, user_id, role_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '55555555-5555-4555-8555-555555555555', 'a0000000-0000-4000-8000-000000000001')$$, '23503', 'insert or update on table "memberships" violates foreign key constraint "memberships_user_id_fkey"', 'A membership cannot reference a missing user');
select throws_ok($$insert into public.memberships (organization_id, user_id, role_id) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000001')$$, '23503', 'insert or update on table "memberships" violates foreign key constraint "memberships_organization_id_fkey"', 'A membership cannot reference a missing organization');
select throws_ok($$insert into public.memberships (organization_id, user_id, role_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'b0000000-0000-4000-8000-000000000001')$$, '23503', 'insert or update on table "memberships" violates foreign key constraint "memberships_role_id_organization_id_fkey"', 'A membership cannot use a role from another organization');

set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
select lives_ok($$select public.create_organization('New Team', 'new-team')$$, 'Authenticated user can atomically create an organization');
select is((select count(*)::bigint from public.organizations where slug = 'new-team'), 1::bigint, 'Created organization is visible to its owner');
select is((select count(*)::bigint from public.memberships as membership join public.organizations as organization on organization.id = membership.organization_id where organization.slug = 'new-team' and membership.user_id = auth.uid() and membership.status = 'active'), 1::bigint, 'Organization creation creates an active owner membership');
select is((select count(*)::bigint from public.role_permissions as rp join public.roles as r on r.id = rp.role_id join public.permissions as p on p.id = rp.permission_id where r.organization_id = (select id from public.organizations where slug = 'new-team') and r.slug = 'owner'), 4::bigint, 'Created owner receives all foundation permissions');

select * from finish();
rollback;
