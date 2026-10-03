BEGIN;

-- Forward patch for the Phase 2.5 baseline committed as ff60330.
-- The only subsequent SQL changes are the two audit-function definitions.
-- FK definitions, indexes, triggers, RLS, grants, permissions and
-- create_organization() are identical in the baseline and current migration.
-- Run supabase/diagnostics/phase_2_5_pre_patch.sql first.
-- Unknown function revisions / incompatible prerequisites fail without changes.
-- CREATE OR REPLACE preserves existing function OIDs, owners and ACLs;
-- the guards require the functions to exist so no default PUBLIC grant is added.

DO $preflight$
declare
  expected record;
  function_oid oid;
  body_hash text;
begin
  if pg_catalog.current_setting('server_version_num')::integer < 150000 then
    raise exception 'Phase 2.5 patch requires PostgreSQL 15 or newer';
  end if;

  for expected in
    select * from (values
      ('set_crm_record_audit_fields',
       'ca71d08403d1aa0b33aefdfde816a008', 'a7e2e0e84d752e7165c761c61c78310f'),
      ('set_crm_activity_audit_fields',
       '794ecca3b8786d488b1e707d20bbdc53', '6c1474548ccb97f710803ccd0d4a20a2')
    ) as versions(function_name, original_hash, final_hash)
  loop
    function_oid := pg_catalog.to_regprocedure(
      pg_catalog.format('public.%I()', expected.function_name)
    );

    select pg_catalog.md5(pg_catalog.regexp_replace(p.prosrc, '[[:space:]]+', '', 'g'))
    into body_hash
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_language as l on l.oid = p.prolang
    where p.oid = function_oid
      and p.prokind = 'f' and p.prorettype = 'pg_catalog.trigger'::regtype
      and not p.prosecdef and l.lanname = 'plpgsql';

    if not found then
      raise exception 'Missing or incompatible audit function: public.%()', expected.function_name;
    end if;
    if body_hash not in (expected.original_hash, expected.final_hash) then
      raise exception 'Unrecognized definition of public.%(); inspect diagnostics before patching',
        expected.function_name;
    end if;
    if pg_catalog.has_function_privilege('anon', function_oid, 'EXECUTE')
      or pg_catalog.has_function_privilege('authenticated', function_oid, 'EXECUTE') then
      raise exception 'Unexpected EXECUTE grants on public.%(); inspect diagnostics',
        expected.function_name;
    end if;
  end loop;

  -- The shared function also serves Accounts, Contacts, Pipelines and Deals.
  for expected in
    select * from (values
      ('crm_accounts', 'set_crm_record_audit_fields'),
      ('crm_contacts', 'set_crm_record_audit_fields'),
      ('crm_pipelines', 'set_crm_record_audit_fields'),
      ('crm_deals', 'set_crm_record_audit_fields'),
      ('crm_tasks', 'set_crm_record_audit_fields'),
      ('crm_activities', 'set_crm_activity_audit_fields')
    ) as targets(table_name, function_name)
  loop
    if not exists (
      select 1 from pg_catalog.pg_class as c
      join pg_catalog.pg_attribute as a on a.attrelid = c.oid
      where c.oid = pg_catalog.to_regclass('public.' || expected.table_name)
        and c.relkind = 'r' and c.relrowsecurity
        and a.attname = 'organization_id' and a.attnotnull and not a.attisdropped
        and a.atttypid = 'pg_catalog.uuid'::regtype
    ) then
      raise exception 'Missing table, RLS or tenant-column prerequisite on public.%', expected.table_name;
    end if;
    if not exists (
      select 1 from pg_catalog.pg_trigger as t
      where t.tgrelid = pg_catalog.to_regclass('public.' || expected.table_name)
        and t.tgname = expected.table_name || '_set_audit_fields'
        and t.tgfoid = pg_catalog.to_regprocedure(
          pg_catalog.format('public.%I()', expected.function_name)
        )
        -- ROW (1) + BEFORE (2) + INSERT (4) + UPDATE (16).
        and t.tgtype = 23 and t.tgenabled = 'O' and not t.tgisinternal
        and t.tgqual is null and t.tgnargs = 0
        and pg_catalog.cardinality(t.tgattr::smallint[]) = 0
    ) or exists (
      select 1 from pg_catalog.pg_trigger as t
      where t.tgrelid = pg_catalog.to_regclass('public.' || expected.table_name)
        and not t.tgisinternal
        and t.tgname <> expected.table_name || '_set_audit_fields'
    ) then
      raise exception 'Unexpected trigger configuration on public.%; inspect diagnostics', expected.table_name;
    end if;
  end loop;

  if exists (
    select 1 from pg_catalog.pg_trigger as t
    join pg_catalog.pg_class as c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where t.tgfoid in (
      pg_catalog.to_regprocedure('public.set_crm_record_audit_fields()'),
      pg_catalog.to_regprocedure('public.set_crm_activity_audit_fields()')
    ) and (
      n.nspname <> 'public'
      or c.relname not in (
        'crm_accounts', 'crm_contacts', 'crm_pipelines', 'crm_deals',
        'crm_tasks', 'crm_activities'
      )
    )
  ) then
    raise exception 'Audit function is used by an unexpected table; inspect diagnostics';
  end if;

  -- Column-specific SET NULL must keep organization_id intact.
  -- These FK definitions already existed in the original Phase 2.5 migration.
  for expected in
    select * from (values
      ('crm_tasks', 'owner_user_id', 'memberships', 'user_id'),
      ('crm_tasks', 'created_by', 'memberships', 'user_id'),
      ('crm_tasks', 'updated_by', 'memberships', 'user_id'),
      ('crm_tasks', 'account_id', 'crm_accounts', 'id'),
      ('crm_tasks', 'contact_id', 'crm_contacts', 'id'),
      ('crm_tasks', 'deal_id', 'crm_deals', 'id'),
      ('crm_activities', 'created_by', 'memberships', 'user_id'),
      ('crm_activities', 'account_id', 'crm_accounts', 'id'),
      ('crm_activities', 'contact_id', 'crm_contacts', 'id'),
      ('crm_activities', 'deal_id', 'crm_deals', 'id'),
      ('crm_activities', 'task_id', 'crm_tasks', 'id')
    ) as links(table_name, column_name, parent_table, parent_column)
  loop
    if not exists (
      select 1 from pg_catalog.pg_constraint as fk
      join pg_catalog.pg_attribute as tenant
        on tenant.attrelid = fk.conrelid and tenant.attname = 'organization_id'
      join pg_catalog.pg_attribute as child
        on child.attrelid = fk.conrelid and child.attname = expected.column_name
      join pg_catalog.pg_attribute as parent_tenant
        on parent_tenant.attrelid = fk.confrelid and parent_tenant.attname = 'organization_id'
      join pg_catalog.pg_attribute as parent
        on parent.attrelid = fk.confrelid and parent.attname = expected.parent_column
      where fk.contype = 'f'
        and fk.conrelid = pg_catalog.to_regclass('public.' || expected.table_name)
        and fk.confrelid = pg_catalog.to_regclass('public.' || expected.parent_table)
        and fk.conkey = array[tenant.attnum, child.attnum]::smallint[]
        and fk.confkey = array[parent_tenant.attnum, parent.attnum]::smallint[]
        and fk.confdeltype = 'n'
        and fk.confdelsetcols = array[child.attnum]::smallint[]
        and fk.confupdtype = 'a' and fk.confmatchtype = 's'
        and fk.convalidated and not fk.condeferrable
        and not child.attnotnull and not child.attisdropped
    ) then
      raise exception 'Unexpected tenant FK / SET NULL definition on public.%.%; inspect diagnostics',
        expected.table_name, expected.column_name;
    end if;
  end loop;
end;
$preflight$;

create or replace function public.set_crm_record_audit_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  current_actor_id uuid := (select auth.uid());
  old_values jsonb;
  new_values jsonb;
  expected_values jsonb;
  allowed_null_columns text[];
  column_name text;
  has_fk_set_null boolean := false;
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id then
      raise exception using errcode = '42501', message = 'CRM record organization cannot be changed';
    end if;

    -- PostgreSQL runs FK ON DELETE SET NULL as a nested UPDATE. Allow only
    -- updates that null known FK columns and leave every other field unchanged.
    if pg_catalog.pg_trigger_depth() > 1 then
      allowed_null_columns := case tg_table_name
        when 'crm_accounts' then array['owner_user_id', 'created_by', 'updated_by']
        when 'crm_contacts' then array['account_id', 'owner_user_id', 'created_by', 'updated_by']
        when 'crm_pipelines' then array['owner_user_id', 'created_by', 'updated_by']
        when 'crm_deals' then array['account_id', 'contact_id', 'owner_user_id', 'created_by', 'updated_by']
        when 'crm_tasks' then array['account_id', 'contact_id', 'deal_id', 'owner_user_id', 'created_by', 'updated_by']
        else array[]::text[]
      end;

      old_values := pg_catalog.to_jsonb(old) - 'updated_at';
      new_values := pg_catalog.to_jsonb(new) - 'updated_at';
      expected_values := old_values;

      foreach column_name in array allowed_null_columns loop
        if (old_values -> column_name) is distinct from 'null'::jsonb
          and (new_values -> column_name) = 'null'::jsonb then
          expected_values := pg_catalog.jsonb_set(
            expected_values,
            array[column_name],
            'null'::jsonb
          );
          has_fk_set_null := true;
        end if;
      end loop;

      if has_fk_set_null and new_values = expected_values then
        new.updated_at := now();
        return new;
      end if;
    end if;
  end if;

  if current_actor_id is null then
    raise exception using errcode = '28000', message = 'Authenticated actor required';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := current_actor_id;
  else
    new.created_by := old.created_by;
  end if;

  new.updated_by := current_actor_id;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.set_crm_activity_audit_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  current_actor_id uuid := (select auth.uid());
  old_values jsonb;
  new_values jsonb;
  expected_values jsonb;
  allowed_null_columns text[];
  column_name text;
  has_fk_set_null boolean := false;
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id then
      raise exception using errcode = '42501', message = 'CRM record organization cannot be changed';
    end if;

    -- See set_crm_record_audit_fields(): allow only pure FK SET NULL updates.
    if pg_catalog.pg_trigger_depth() > 1 then
      allowed_null_columns := array['account_id', 'contact_id', 'deal_id', 'task_id', 'created_by'];
      old_values := pg_catalog.to_jsonb(old) - 'updated_at';
      new_values := pg_catalog.to_jsonb(new) - 'updated_at';
      expected_values := old_values;

      foreach column_name in array allowed_null_columns loop
        if (old_values -> column_name) is distinct from 'null'::jsonb
          and (new_values -> column_name) = 'null'::jsonb then
          expected_values := pg_catalog.jsonb_set(
            expected_values,
            array[column_name],
            'null'::jsonb
          );
          has_fk_set_null := true;
        end if;
      end loop;

      if has_fk_set_null and new_values = expected_values then
        new.updated_at := now();
        return new;
      end if;
    end if;
  end if;

  if current_actor_id is null then
    raise exception using errcode = '28000', message = 'Authenticated actor required';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := current_actor_id;
  else
    new.created_by := old.created_by;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

COMMIT;
