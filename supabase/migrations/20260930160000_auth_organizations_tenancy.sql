create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  slug text not null unique check (
    char_length(slug) between 3 and 48
    and slug = lower(slug)
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 64),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug),
  unique (id, organization_id)
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  description text not null,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null,
  status text not null default 'active' check (status in ('active', 'invited', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id),
  foreign key (role_id, organization_id)
    references public.roles(id, organization_id) on delete restrict
);

create index memberships_user_status_idx
  on public.memberships (user_id, status, created_at);
create index roles_organization_idx on public.roles (organization_id);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();
create trigger roles_set_updated_at
  before update on public.roles
  for each row execute function public.set_updated_at();
create trigger memberships_set_updated_at
  before update on public.memberships
  for each row execute function public.set_updated_at();

insert into public.permissions (key, description) values
  ('organization.read', 'View the organization profile'),
  ('organization.update', 'Update the organization profile'),
  ('members.read', 'View organization memberships'),
  ('members.manage', 'Manage organization memberships and roles');

create schema private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create function private.has_organization_permission(
  target_organization_id uuid,
  required_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships as membership
    join public.role_permissions as role_permission on role_permission.role_id = membership.role_id
    join public.permissions as permission on permission.id = role_permission.permission_id
    where membership.organization_id = target_organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and permission.key = required_permission
  );
$$;

create function public.create_organization(organization_name text, organization_slug text)
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
    'organization.read', 'organization.update', 'members.read', 'members.manage'
  );

  insert into public.role_permissions (role_id, permission_id)
  select member_role_id, permission.id
  from public.permissions as permission
  where permission.key = 'organization.read';

  insert into public.memberships (organization_id, user_id, role_id, status)
  values (new_organization_id, current_user_id, owner_role_id, 'active');

  return new_organization_id;
end;
$$;

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;

create policy organizations_select_member
  on public.organizations for select to authenticated
  using (private.has_organization_permission(id, 'organization.read'));
create policy organizations_update_permission
  on public.organizations for update to authenticated
  using (private.has_organization_permission(id, 'organization.update'))
  with check (private.has_organization_permission(id, 'organization.update'));

create policy memberships_select_self_or_manager
  on public.memberships for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.has_organization_permission(organization_id, 'members.read')
  );

create policy roles_select_member
  on public.roles for select to authenticated
  using (
    exists (
      select 1 from public.memberships as membership
      where membership.organization_id = roles.organization_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
    )
  );

create policy permissions_select_authenticated
  on public.permissions for select to authenticated
  using ((select auth.uid()) is not null);

create policy role_permissions_select_member
  on public.role_permissions for select to authenticated
  using (
    exists (
      select 1 from public.roles as role
      where role.id = role_permissions.role_id
        and exists (
          select 1 from public.memberships as membership
          where membership.organization_id = role.organization_id
            and membership.user_id = (select auth.uid())
            and membership.status = 'active'
        )
    )
  );

revoke all on public.organizations, public.memberships, public.roles,
  public.permissions, public.role_permissions from anon, authenticated;
grant select on public.organizations, public.memberships, public.roles,
  public.permissions, public.role_permissions to authenticated;
grant update (name, slug) on public.organizations to authenticated;
grant delete on public.organizations to authenticated;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.create_organization(text, text) from public, anon;
revoke execute on function private.has_organization_permission(uuid, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;
grant execute on function private.has_organization_permission(uuid, text) to authenticated;
