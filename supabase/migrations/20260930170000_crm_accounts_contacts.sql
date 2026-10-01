BEGIN;

insert into public.permissions (key, description) values
  ('accounts.read', 'View CRM accounts'),
  ('accounts.manage', 'Create and update CRM accounts'),
  ('contacts.read', 'View CRM contacts'),
  ('contacts.manage', 'Create and update CRM contacts')
on conflict (key) do nothing;

create table public.crm_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  website text,
  phone text,
  industry text,
  owner_user_id uuid default auth.uid(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint crm_accounts_organization_id_id_key unique (organization_id, id),
  constraint crm_accounts_owner_same_org_fk
    foreign key (organization_id, owner_user_id)
    references public.memberships(organization_id, user_id)
    on delete set null (owner_user_id),
  constraint crm_accounts_created_by_same_org_fk
    foreign key (organization_id, created_by)
    references public.memberships(organization_id, user_id)
    on delete set null (created_by),
  constraint crm_accounts_updated_by_same_org_fk
    foreign key (organization_id, updated_by)
    references public.memberships(organization_id, user_id)
    on delete set null (updated_by)
);

create table public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  first_name text not null check (char_length(trim(first_name)) between 1 and 100),
  last_name text check (
    last_name is null or char_length(trim(last_name)) between 1 and 100
  ),
  email text check (email is null or char_length(trim(email)) between 3 and 320),
  phone text,
  job_title text,
  account_id uuid,
  owner_user_id uuid default auth.uid(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint crm_contacts_organization_id_id_key unique (organization_id, id),
  constraint crm_contacts_account_same_org_fk
    foreign key (organization_id, account_id)
    references public.crm_accounts(organization_id, id)
    on delete set null (account_id),
  constraint crm_contacts_owner_same_org_fk
    foreign key (organization_id, owner_user_id)
    references public.memberships(organization_id, user_id)
    on delete set null (owner_user_id),
  constraint crm_contacts_created_by_same_org_fk
    foreign key (organization_id, created_by)
    references public.memberships(organization_id, user_id)
    on delete set null (created_by),
  constraint crm_contacts_updated_by_same_org_fk
    foreign key (organization_id, updated_by)
    references public.memberships(organization_id, user_id)
    on delete set null (updated_by)
);

create index crm_accounts_org_created_at_idx
  on public.crm_accounts (organization_id, created_at desc)
  where archived_at is null;
create index crm_accounts_org_owner_created_at_idx
  on public.crm_accounts (organization_id, owner_user_id, created_at desc)
  where archived_at is null;
create index crm_contacts_org_account_created_at_idx
  on public.crm_contacts (organization_id, account_id, created_at desc)
  where archived_at is null;
create index crm_contacts_org_owner_created_at_idx
  on public.crm_contacts (organization_id, owner_user_id, created_at desc)
  where archived_at is null;
create index crm_contacts_org_email_idx
  on public.crm_contacts (organization_id, lower(email))
  where archived_at is null and email is not null;

create function public.set_crm_record_audit_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  current_actor_id uuid := (select auth.uid());
begin
  if current_actor_id is null then
    raise exception using errcode = '28000', message = 'Authenticated actor required';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := current_actor_id;
  else
    if new.organization_id is distinct from old.organization_id then
      raise exception using errcode = '42501', message = 'CRM record organization cannot be changed';
    end if;
    new.created_by := old.created_by;
  end if;

  new.updated_by := current_actor_id;
  new.updated_at := now();
  return new;
end;
$$;

create trigger crm_accounts_set_audit_fields
  before insert or update on public.crm_accounts
  for each row execute function public.set_crm_record_audit_fields();
create trigger crm_contacts_set_audit_fields
  before insert or update on public.crm_contacts
  for each row execute function public.set_crm_record_audit_fields();

alter table public.crm_accounts enable row level security;
alter table public.crm_contacts enable row level security;

create policy crm_accounts_select
  on public.crm_accounts for select to authenticated
  using (
    archived_at is null
    and private.has_organization_permission(organization_id, 'accounts.read')
  );
create policy crm_accounts_insert
  on public.crm_accounts for insert to authenticated
  with check (private.has_organization_permission(organization_id, 'accounts.manage'));
create policy crm_accounts_update
  on public.crm_accounts for update to authenticated
  using (private.has_organization_permission(organization_id, 'accounts.manage'))
  with check (private.has_organization_permission(organization_id, 'accounts.manage'));

create policy crm_contacts_select
  on public.crm_contacts for select to authenticated
  using (
    archived_at is null
    and private.has_organization_permission(organization_id, 'contacts.read')
  );
create policy crm_contacts_insert
  on public.crm_contacts for insert to authenticated
  with check (private.has_organization_permission(organization_id, 'contacts.manage'));
create policy crm_contacts_update
  on public.crm_contacts for update to authenticated
  using (private.has_organization_permission(organization_id, 'contacts.manage'))
  with check (private.has_organization_permission(organization_id, 'contacts.manage'));

revoke all on public.crm_accounts, public.crm_contacts from public, anon, authenticated;
grant select on public.crm_accounts, public.crm_contacts to authenticated;
grant insert (organization_id, name, website, phone, industry, owner_user_id)
  on public.crm_accounts to authenticated;
grant update (name, website, phone, industry, owner_user_id, archived_at)
  on public.crm_accounts to authenticated;
grant insert (organization_id, first_name, last_name, email, phone, job_title, account_id, owner_user_id)
  on public.crm_contacts to authenticated;
grant update (first_name, last_name, email, phone, job_title, account_id, owner_user_id, archived_at)
  on public.crm_contacts to authenticated;

revoke execute on function public.set_crm_record_audit_fields() from public, anon, authenticated;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission
  on permission.key in (
    'accounts.read', 'accounts.manage', 'contacts.read', 'contacts.manage'
  )
where role.is_system and role.slug in ('owner', 'admin')
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission
  on permission.key in ('accounts.read', 'contacts.read')
where role.is_system and role.slug = 'member'
on conflict (role_id, permission_id) do nothing;

create or replace function public.create_organization(organization_name text, organization_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_organization_id uuid;
  owner_role_id uuid;
  admin_role_id uuid;
  member_role_id uuid;
begin
  if current_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  insert into public.organizations (name, slug)
  values (trim(organization_name), lower(trim(organization_slug)))
  returning id into new_organization_id;

  insert into public.roles (organization_id, name, slug, is_system)
  values (new_organization_id, 'Owner', 'owner', true)
  returning id into owner_role_id;

  insert into public.roles (organization_id, name, slug, is_system)
  values (new_organization_id, 'Admin', 'admin', true)
  returning id into admin_role_id;

  insert into public.roles (organization_id, name, slug, is_system)
  values (new_organization_id, 'Member', 'member', true)
  returning id into member_role_id;

  insert into public.role_permissions (role_id, permission_id)
  select owner_role_id, permission.id from public.permissions as permission;

  insert into public.role_permissions (role_id, permission_id)
  select admin_role_id, permission.id
  from public.permissions as permission
  where permission.key in (
    'organization.read', 'organization.update', 'members.read', 'members.manage',
    'accounts.read', 'accounts.manage', 'contacts.read', 'contacts.manage'
  );

  insert into public.role_permissions (role_id, permission_id)
  select member_role_id, permission.id
  from public.permissions as permission
  where permission.key in ('organization.read', 'accounts.read', 'contacts.read');

  insert into public.memberships (organization_id, user_id, role_id, status)
  values (new_organization_id, current_user_id, owner_role_id, 'active');

  return new_organization_id;
end;
$$;

revoke execute on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;

COMMIT;
