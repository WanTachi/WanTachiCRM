BEGIN;

insert into public.permissions (key, description) values
  ('tasks.read', 'View CRM tasks'),
  ('tasks.manage', 'Create and update CRM tasks'),
  ('activities.read', 'View CRM activities and notes'),
  ('activities.manage', 'Create and update CRM activities and notes')
on conflict (key) do nothing;

create table public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  description text,
  status text not null default 'open'
    constraint crm_tasks_status_check check (status in ('open', 'in_progress', 'completed', 'cancelled')),
  priority text not null default 'normal'
    constraint crm_tasks_priority_check check (priority in ('low', 'normal', 'high', 'urgent')),
  due_at timestamptz,
  owner_user_id uuid default auth.uid(),
  account_id uuid,
  contact_id uuid,
  deal_id uuid,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint crm_tasks_organization_id_id_key unique (organization_id, id),
  constraint crm_tasks_owner_same_org_fk
    foreign key (organization_id, owner_user_id)
    references public.memberships(organization_id, user_id)
    on delete set null (owner_user_id),
  constraint crm_tasks_account_same_org_fk
    foreign key (organization_id, account_id)
    references public.crm_accounts(organization_id, id)
    on delete set null (account_id),
  constraint crm_tasks_contact_same_org_fk
    foreign key (organization_id, contact_id)
    references public.crm_contacts(organization_id, id)
    on delete set null (contact_id),
  constraint crm_tasks_deal_same_org_fk
    foreign key (organization_id, deal_id)
    references public.crm_deals(organization_id, id)
    on delete set null (deal_id),
  constraint crm_tasks_created_by_same_org_fk
    foreign key (organization_id, created_by)
    references public.memberships(organization_id, user_id)
    on delete set null (created_by),
  constraint crm_tasks_updated_by_same_org_fk
    foreign key (organization_id, updated_by)
    references public.memberships(organization_id, user_id)
    on delete set null (updated_by)
);

create table public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  type text not null
    constraint crm_activities_type_check check (type in ('note', 'call', 'meeting', 'email', 'other')),
  subject text,
  body text,
  occurred_at timestamptz not null default now(),
  account_id uuid,
  contact_id uuid,
  deal_id uuid,
  task_id uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint crm_activities_organization_id_id_key unique (organization_id, id),
  constraint crm_activities_account_same_org_fk
    foreign key (organization_id, account_id)
    references public.crm_accounts(organization_id, id)
    on delete set null (account_id),
  constraint crm_activities_contact_same_org_fk
    foreign key (organization_id, contact_id)
    references public.crm_contacts(organization_id, id)
    on delete set null (contact_id),
  constraint crm_activities_deal_same_org_fk
    foreign key (organization_id, deal_id)
    references public.crm_deals(organization_id, id)
    on delete set null (deal_id),
  constraint crm_activities_task_same_org_fk
    foreign key (organization_id, task_id)
    references public.crm_tasks(organization_id, id)
    on delete set null (task_id),
  constraint crm_activities_created_by_same_org_fk
    foreign key (organization_id, created_by)
    references public.memberships(organization_id, user_id)
    on delete set null (created_by)
);

create index crm_tasks_org_created_at_idx
  on public.crm_tasks (organization_id, created_at desc)
  where archived_at is null;
create index crm_tasks_org_status_due_at_idx
  on public.crm_tasks (organization_id, status, due_at)
  where archived_at is null;
create index crm_tasks_org_priority_due_at_idx
  on public.crm_tasks (organization_id, priority, due_at)
  where archived_at is null;
create index crm_tasks_org_due_at_idx
  on public.crm_tasks (organization_id, due_at)
  where archived_at is null;
create index crm_tasks_org_owner_due_at_idx
  on public.crm_tasks (organization_id, owner_user_id, due_at)
  where archived_at is null;
create index crm_tasks_org_account_idx
  on public.crm_tasks (organization_id, account_id);
create index crm_tasks_org_contact_idx
  on public.crm_tasks (organization_id, contact_id);
create index crm_tasks_org_deal_idx
  on public.crm_tasks (organization_id, deal_id);

create index crm_activities_org_occurred_at_idx
  on public.crm_activities (organization_id, occurred_at desc)
  where archived_at is null;
create index crm_activities_org_type_occurred_at_idx
  on public.crm_activities (organization_id, type, occurred_at desc)
  where archived_at is null;
create index crm_activities_org_account_idx
  on public.crm_activities (organization_id, account_id);
create index crm_activities_org_contact_idx
  on public.crm_activities (organization_id, contact_id);
create index crm_activities_org_deal_idx
  on public.crm_activities (organization_id, deal_id);
create index crm_activities_org_task_idx
  on public.crm_activities (organization_id, task_id);

create function public.set_crm_activity_audit_fields()
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

  new.updated_at := now();
  return new;
end;
$$;

create trigger crm_tasks_set_audit_fields
  before insert or update on public.crm_tasks
  for each row execute function public.set_crm_record_audit_fields();
create trigger crm_activities_set_audit_fields
  before insert or update on public.crm_activities
  for each row execute function public.set_crm_activity_audit_fields();

alter table public.crm_tasks enable row level security;
alter table public.crm_activities enable row level security;

create policy crm_tasks_select
  on public.crm_tasks for select to authenticated
  using (
    (
      archived_at is null
      and private.has_organization_permission(organization_id, 'tasks.read')
    )
    or
    (
      archived_at is not null
      and private.has_organization_permission(organization_id, 'tasks.read')
      and private.has_organization_permission(organization_id, 'tasks.manage')
    )
  );
create policy crm_tasks_insert
  on public.crm_tasks for insert to authenticated
  with check (private.has_organization_permission(organization_id, 'tasks.manage'));
create policy crm_tasks_update
  on public.crm_tasks for update to authenticated
  using (private.has_organization_permission(organization_id, 'tasks.manage'))
  with check (private.has_organization_permission(organization_id, 'tasks.manage'));

create policy crm_activities_select
  on public.crm_activities for select to authenticated
  using (
    (
      archived_at is null
      and private.has_organization_permission(organization_id, 'activities.read')
    )
    or
    (
      archived_at is not null
      and private.has_organization_permission(organization_id, 'activities.read')
      and private.has_organization_permission(organization_id, 'activities.manage')
    )
  );
create policy crm_activities_insert
  on public.crm_activities for insert to authenticated
  with check (private.has_organization_permission(organization_id, 'activities.manage'));
create policy crm_activities_update
  on public.crm_activities for update to authenticated
  using (private.has_organization_permission(organization_id, 'activities.manage'))
  with check (private.has_organization_permission(organization_id, 'activities.manage'));

revoke all on public.crm_tasks, public.crm_activities from public, anon, authenticated;
grant select on public.crm_tasks, public.crm_activities to authenticated;
grant insert (
  organization_id, title, description, status, priority, due_at, owner_user_id,
  account_id, contact_id, deal_id
) on public.crm_tasks to authenticated;
grant update (
  title, description, status, priority, due_at, owner_user_id,
  account_id, contact_id, deal_id, archived_at
) on public.crm_tasks to authenticated;
grant insert (
  organization_id, type, subject, body, occurred_at, account_id, contact_id, deal_id, task_id
) on public.crm_activities to authenticated;
grant update (
  type, subject, body, occurred_at, account_id, contact_id, deal_id, task_id, archived_at
) on public.crm_activities to authenticated;
revoke delete on public.crm_tasks, public.crm_activities from public, anon, authenticated;

revoke execute on function public.set_crm_activity_audit_fields() from public, anon, authenticated;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission
  on permission.key in (
    'tasks.read', 'tasks.manage', 'activities.read', 'activities.manage'
  )
where role.is_system and role.slug in ('owner', 'admin')
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission
  on permission.key in ('tasks.read', 'activities.read')
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
    'pipelines.read', 'pipelines.manage', 'deals.read', 'deals.manage',
    'tasks.read', 'tasks.manage', 'activities.read', 'activities.manage'
  );

  insert into public.role_permissions (role_id, permission_id)
  select member_role_id, permission.id
  from public.permissions as permission
  where permission.key in (
    'organization.read', 'accounts.read', 'contacts.read', 'pipelines.read',
    'deals.read', 'tasks.read', 'activities.read'
  );

  insert into public.memberships (organization_id, user_id, role_id, status)
  values (new_organization_id, current_user_id, owner_role_id, 'active');

  return new_organization_id;
end;
$$;

revoke execute on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;

COMMIT;
