BEGIN;

insert into public.permissions (key, description) values
  ('pipelines.read', 'View CRM pipelines and stages'),
  ('pipelines.manage', 'Create and update CRM pipelines and stages'),
  ('deals.read', 'View CRM deals'),
  ('deals.manage', 'Create and update CRM deals')
on conflict (key) do nothing;

create table public.crm_pipelines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  description text,
  owner_user_id uuid default auth.uid(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint crm_pipelines_organization_id_id_key unique (organization_id, id),
  constraint crm_pipelines_owner_same_org_fk
    foreign key (organization_id, owner_user_id)
    references public.memberships(organization_id, user_id)
    on delete set null (owner_user_id),
  constraint crm_pipelines_created_by_same_org_fk
    foreign key (organization_id, created_by)
    references public.memberships(organization_id, user_id)
    on delete set null (created_by),
  constraint crm_pipelines_updated_by_same_org_fk
    foreign key (organization_id, updated_by)
    references public.memberships(organization_id, user_id)
    on delete set null (updated_by)
);

create table public.crm_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pipeline_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 120),
  position integer not null check (position >= 0),
  probability numeric check (probability is null or probability between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint crm_pipeline_stages_organization_id_id_key unique (organization_id, id),
  constraint crm_pipeline_stages_org_pipeline_id_key unique (organization_id, pipeline_id, id),
  constraint crm_pipeline_stages_pipeline_same_org_fk
    foreign key (organization_id, pipeline_id)
    references public.crm_pipelines(organization_id, id)
    on delete no action
);

create table public.crm_deals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pipeline_id uuid not null,
  stage_id uuid not null,
  account_id uuid,
  contact_id uuid,
  name text not null check (char_length(trim(name)) between 1 and 200),
  description text,
  amount numeric,
  currency text,
  owner_user_id uuid default auth.uid(),
  expected_close_date date,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint crm_deals_organization_id_id_key unique (organization_id, id),
  constraint crm_deals_pipeline_same_org_fk
    foreign key (organization_id, pipeline_id)
    references public.crm_pipelines(organization_id, id)
    on delete no action,
  constraint crm_deals_stage_same_org_fk
    foreign key (organization_id, stage_id)
    references public.crm_pipeline_stages(organization_id, id)
    on delete no action,
  constraint crm_deals_stage_same_pipeline_fk
    foreign key (organization_id, pipeline_id, stage_id)
    references public.crm_pipeline_stages(organization_id, pipeline_id, id)
    on delete no action,
  constraint crm_deals_account_same_org_fk
    foreign key (organization_id, account_id)
    references public.crm_accounts(organization_id, id)
    on delete set null (account_id),
  constraint crm_deals_contact_same_org_fk
    foreign key (organization_id, contact_id)
    references public.crm_contacts(organization_id, id)
    on delete set null (contact_id),
  constraint crm_deals_owner_same_org_fk
    foreign key (organization_id, owner_user_id)
    references public.memberships(organization_id, user_id)
    on delete set null (owner_user_id),
  constraint crm_deals_created_by_same_org_fk
    foreign key (organization_id, created_by)
    references public.memberships(organization_id, user_id)
    on delete set null (created_by),
  constraint crm_deals_updated_by_same_org_fk
    foreign key (organization_id, updated_by)
    references public.memberships(organization_id, user_id)
    on delete set null (updated_by)
);

create index crm_pipelines_org_created_at_idx
  on public.crm_pipelines (organization_id, created_at desc)
  where archived_at is null;
create index crm_pipelines_org_owner_created_at_idx
  on public.crm_pipelines (organization_id, owner_user_id, created_at desc)
  where archived_at is null;

create index crm_pipeline_stages_org_pipeline_position_idx
  on public.crm_pipeline_stages (organization_id, pipeline_id, position)
  where archived_at is null;

create index crm_deals_org_created_at_idx
  on public.crm_deals (organization_id, created_at desc)
  where archived_at is null;
create index crm_deals_org_pipeline_stage_idx
  on public.crm_deals (organization_id, pipeline_id, stage_id);
create index crm_deals_org_stage_idx
  on public.crm_deals (organization_id, stage_id);
create index crm_deals_org_account_idx
  on public.crm_deals (organization_id, account_id);
create index crm_deals_org_contact_idx
  on public.crm_deals (organization_id, contact_id);
create index crm_deals_org_owner_created_at_idx
  on public.crm_deals (organization_id, owner_user_id, created_at desc)
  where archived_at is null;
create index crm_deals_org_expected_close_date_idx
  on public.crm_deals (organization_id, expected_close_date)
  where archived_at is null and expected_close_date is not null;

create function public.set_crm_pipeline_stage_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger crm_pipelines_set_audit_fields
  before insert or update on public.crm_pipelines
  for each row execute function public.set_crm_record_audit_fields();
create trigger crm_pipeline_stages_set_updated_at
  before update on public.crm_pipeline_stages
  for each row execute function public.set_crm_pipeline_stage_updated_at();
create trigger crm_deals_set_audit_fields
  before insert or update on public.crm_deals
  for each row execute function public.set_crm_record_audit_fields();

alter table public.crm_pipelines enable row level security;
alter table public.crm_pipeline_stages enable row level security;
alter table public.crm_deals enable row level security;

create policy crm_pipelines_select
  on public.crm_pipelines for select to authenticated
  using (
    (
      archived_at is null
      and private.has_organization_permission(organization_id, 'pipelines.read')
    )
    or
    (
      archived_at is not null
      and private.has_organization_permission(organization_id, 'pipelines.read')
      and private.has_organization_permission(organization_id, 'pipelines.manage')
    )
  );
create policy crm_pipelines_insert
  on public.crm_pipelines for insert to authenticated
  with check (private.has_organization_permission(organization_id, 'pipelines.manage'));
create policy crm_pipelines_update
  on public.crm_pipelines for update to authenticated
  using (private.has_organization_permission(organization_id, 'pipelines.manage'))
  with check (private.has_organization_permission(organization_id, 'pipelines.manage'));

create policy crm_pipeline_stages_select
  on public.crm_pipeline_stages for select to authenticated
  using (
    (
      archived_at is null
      and private.has_organization_permission(organization_id, 'pipelines.read')
    )
    or
    (
      archived_at is not null
      and private.has_organization_permission(organization_id, 'pipelines.read')
      and private.has_organization_permission(organization_id, 'pipelines.manage')
    )
  );
create policy crm_pipeline_stages_insert
  on public.crm_pipeline_stages for insert to authenticated
  with check (private.has_organization_permission(organization_id, 'pipelines.manage'));
create policy crm_pipeline_stages_update
  on public.crm_pipeline_stages for update to authenticated
  using (private.has_organization_permission(organization_id, 'pipelines.manage'))
  with check (private.has_organization_permission(organization_id, 'pipelines.manage'));

create policy crm_deals_select
  on public.crm_deals for select to authenticated
  using (
    (
      archived_at is null
      and private.has_organization_permission(organization_id, 'deals.read')
    )
    or
    (
      archived_at is not null
      and private.has_organization_permission(organization_id, 'deals.read')
      and private.has_organization_permission(organization_id, 'deals.manage')
    )
  );
create policy crm_deals_insert
  on public.crm_deals for insert to authenticated
  with check (private.has_organization_permission(organization_id, 'deals.manage'));
create policy crm_deals_update
  on public.crm_deals for update to authenticated
  using (private.has_organization_permission(organization_id, 'deals.manage'))
  with check (private.has_organization_permission(organization_id, 'deals.manage'));

revoke all on public.crm_pipelines, public.crm_pipeline_stages, public.crm_deals
  from public, anon, authenticated;
grant select on public.crm_pipelines, public.crm_pipeline_stages, public.crm_deals
  to authenticated;
grant insert (organization_id, name, description, owner_user_id)
  on public.crm_pipelines to authenticated;
grant update (name, description, owner_user_id, archived_at)
  on public.crm_pipelines to authenticated;
grant insert (organization_id, pipeline_id, name, position, probability)
  on public.crm_pipeline_stages to authenticated;
grant update (name, position, probability, archived_at)
  on public.crm_pipeline_stages to authenticated;
grant insert (
  organization_id, pipeline_id, stage_id, account_id, contact_id, name, description,
  amount, currency, owner_user_id, expected_close_date
) on public.crm_deals to authenticated;
grant update (
  pipeline_id, stage_id, account_id, contact_id, name, description, amount, currency,
  owner_user_id, expected_close_date, archived_at
) on public.crm_deals to authenticated;

revoke execute on function public.set_crm_pipeline_stage_updated_at()
  from public, anon, authenticated;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission
  on permission.key in (
    'pipelines.read', 'pipelines.manage', 'deals.read', 'deals.manage'
  )
where role.is_system and role.slug in ('owner', 'admin')
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission
  on permission.key in ('pipelines.read', 'deals.read')
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
    'accounts.read', 'accounts.manage', 'contacts.read', 'contacts.manage',
    'pipelines.read', 'pipelines.manage', 'deals.read', 'deals.manage'
  );

  insert into public.role_permissions (role_id, permission_id)
  select member_role_id, permission.id
  from public.permissions as permission
  where permission.key in (
    'organization.read', 'accounts.read', 'contacts.read', 'pipelines.read', 'deals.read'
  );

  insert into public.memberships (organization_id, user_id, role_id, status)
  values (new_organization_id, current_user_id, owner_role_id, 'active');

  return new_organization_id;
end;
$$;

revoke execute on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;

COMMIT;
