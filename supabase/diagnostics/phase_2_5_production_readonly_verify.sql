-- Run this ENTIRE file in a new Supabase SQL Editor query as postgres.
-- This is a catalog/permission check, NOT the pgTAP integration test.
-- No application functions, test fixtures, DDL or data writes are executed.
-- PASS covers only the named metadata check; REVIEW requires definition review.
-- pgTAP is optional here: its absence is INFO, and nothing installs it.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '2s';
SET LOCAL search_path = pg_catalog;

WITH
tables(table_name, audit_signature) AS (VALUES
  ('crm_tasks', 'public.set_crm_record_audit_fields()'),
  ('crm_activities', 'public.set_crm_activity_audit_fields()')
),
relations AS (
  SELECT t.*, c.oid, c.relkind, c.relrowsecurity,
    a.attnum AS org_attnum, a.attnotnull AS org_not_null
  FROM tables t
  LEFT JOIN pg_class c ON c.oid = to_regclass('public.' || t.table_name)
  LEFT JOIN pg_attribute a ON a.attrelid = c.oid
    AND a.attname = 'organization_id' AND NOT a.attisdropped
),
expected_fk(table_name, constraint_name, column_name, parent_table, parent_column) AS (VALUES
  ('crm_tasks', 'crm_tasks_owner_same_org_fk', 'owner_user_id', 'memberships', 'user_id'),
  ('crm_tasks', 'crm_tasks_created_by_same_org_fk', 'created_by', 'memberships', 'user_id'),
  ('crm_tasks', 'crm_tasks_updated_by_same_org_fk', 'updated_by', 'memberships', 'user_id'),
  ('crm_tasks', 'crm_tasks_account_same_org_fk', 'account_id', 'crm_accounts', 'id'),
  ('crm_tasks', 'crm_tasks_contact_same_org_fk', 'contact_id', 'crm_contacts', 'id'),
  ('crm_tasks', 'crm_tasks_deal_same_org_fk', 'deal_id', 'crm_deals', 'id'),
  ('crm_activities', 'crm_activities_created_by_same_org_fk', 'created_by', 'memberships', 'user_id'),
  ('crm_activities', 'crm_activities_account_same_org_fk', 'account_id', 'crm_accounts', 'id'),
  ('crm_activities', 'crm_activities_contact_same_org_fk', 'contact_id', 'crm_contacts', 'id'),
  ('crm_activities', 'crm_activities_deal_same_org_fk', 'deal_id', 'crm_deals', 'id'),
  ('crm_activities', 'crm_activities_task_same_org_fk', 'task_id', 'crm_tasks', 'id')
),
fk_checks AS (
  SELECT e.*, pg_get_constraintdef(k.oid, true) AS definition,
    k.contype = 'f' AND k.convalidated AND NOT k.condeferrable
      AND k.confrelid = to_regclass('public.' || e.parent_table)
      AND k.confdeltype = 'n' AND k.confupdtype = 'a' AND k.confmatchtype = 's'
      AND a.attnotnull = false
      AND (to_jsonb(k) -> 'confdelsetcols') = to_jsonb(ARRAY[a.attnum])
      AND ARRAY(
        SELECT ca.attname::text FROM unnest(k.conkey) WITH ORDINALITY AS u(num, pos)
        JOIN pg_attribute ca ON ca.attrelid = k.conrelid AND ca.attnum = u.num
        ORDER BY u.pos
      ) = ARRAY['organization_id', e.column_name]
      AND ARRAY(
        SELECT pa.attname::text FROM unnest(k.confkey) WITH ORDINALITY AS u(num, pos)
        JOIN pg_attribute pa ON pa.attrelid = k.confrelid AND pa.attnum = u.num
        ORDER BY u.pos
      ) = ARRAY['organization_id', e.parent_column] AS ok
  FROM expected_fk e
  LEFT JOIN pg_constraint k ON k.conrelid = to_regclass('public.' || e.table_name)
    AND k.conname = e.constraint_name
  LEFT JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attname = e.column_name
    AND NOT a.attisdropped
),
expected_functions(signature, body_hash, security_definer) AS (VALUES
  ('public.set_crm_record_audit_fields()', 'a7e2e0e84d752e7165c761c61c78310f', false),
  ('public.set_crm_activity_audit_fields()', '6c1474548ccb97f710803ccd0d4a20a2', false),
  ('public.create_organization(text,text)', '20a57f129e73df12d5f3549ad8ca30cd', true)
),
permission_keys(key) AS (VALUES
  ('tasks.read'), ('tasks.manage'), ('activities.read'), ('activities.manage')
),
role_checks AS (
  SELECT r.slug, r.id, r.organization_id, k.key,
    (rp.role_id IS NOT NULL) =
      (r.slug IN ('owner', 'admin') OR k.key IN ('tasks.read', 'activities.read')) AS ok
  FROM public.roles r CROSS JOIN permission_keys k
  LEFT JOIN public.permissions p ON p.key = k.key
  LEFT JOIN public.role_permissions rp ON rp.role_id = r.id AND rp.permission_id = p.id
  WHERE r.is_system AND r.slug IN ('owner', 'admin', 'member')
),
checks(section, object_name, status, details) AS (
  SELECT '01_environment', current_database()::text, 'INFO', jsonb_build_object(
    'server_version', current_setting('server_version'), 'executed_as', current_user,
    'transaction_read_only', current_setting('transaction_read_only'),
    'scope', 'Metadata only; no runtime RLS/audit/FK actions are exercised')
  UNION ALL
  SELECT '02_pgtap', 'pgtap', 'INFO', jsonb_build_object(
    'installed_version', e.extversion, 'schema', n.nspname,
    'available_version', (SELECT default_version FROM pg_available_extensions WHERE name = 'pgtap'),
    'authenticated_schema_usage', has_schema_privilege('authenticated', n.oid, 'USAGE'),
    'helpers', (SELECT jsonb_agg(jsonb_build_object(
      'function', p.oid::regprocedure::text,
      'authenticated_execute', has_function_privilege('authenticated', p.oid, 'EXECUTE'))
      ORDER BY p.oid::regprocedure::text)
      FROM pg_proc p JOIN pg_depend d ON d.classid = 'pg_proc'::regclass
        AND d.objid = p.oid AND d.refclassid = 'pg_extension'::regclass
        AND d.refobjid = e.oid AND d.deptype = 'e'
      WHERE p.proname IN ('no_plan', 'lives_ok', 'throws_ok', 'is', 'finish')),
    'note', 'Not required for this read-only script; no installation performed')
  FROM (SELECT 1) seed
  LEFT JOIN pg_extension e ON e.extname = 'pgtap'
  LEFT JOIN pg_namespace n ON n.oid = e.extnamespace
  UNION ALL
  SELECT '03_table_rls_tenant', r.table_name,
    CASE WHEN r.relkind = 'r' AND r.relrowsecurity AND r.org_not_null THEN 'PASS' ELSE 'FAIL' END,
    jsonb_build_object('exists', r.oid IS NOT NULL, 'rls_enabled', r.relrowsecurity,
      'organization_id_not_null', r.org_not_null)
  FROM relations r
  UNION ALL
  SELECT '04_optional_fk', f.constraint_name, CASE WHEN f.ok THEN 'PASS' ELSE 'FAIL' END,
    jsonb_build_object('definition', f.definition,
      'expected', 'Validated composite tenant FK; SET NULL only on nullable reference column')
  FROM fk_checks f
  UNION ALL
  SELECT '05_organization_cascade', r.table_name,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_constraint k JOIN pg_attribute a ON a.attrelid = k.confrelid AND a.attname = 'id'
      WHERE k.conrelid = r.oid AND k.contype = 'f' AND k.convalidated
        AND k.confrelid = to_regclass('public.organizations') AND k.confdeltype = 'c'
        AND k.conkey = ARRAY[r.org_attnum] AND k.confkey = ARRAY[a.attnum]
    ) THEN 'PASS' ELSE 'FAIL' END,
    jsonb_build_object('expected', 'organization_id references organizations(id) ON DELETE CASCADE')
  FROM relations r
  UNION ALL
  SELECT '06_function_body_and_security', e.signature,
    CASE WHEN md5(regexp_replace(p.prosrc, '[[:space:]]+', '', 'g')) = e.body_hash
      AND p.prosecdef = e.security_definer THEN 'PASS' ELSE 'FAIL' END,
    jsonb_build_object('normalized_body_hash', md5(regexp_replace(p.prosrc, '[[:space:]]+', '', 'g')),
      'security_definer', p.prosecdef, 'config_for_review', p.proconfig)
  FROM expected_functions e LEFT JOIN pg_proc p ON p.oid = to_regprocedure(e.signature)
  UNION ALL
  SELECT '07_audit_trigger', r.table_name,
    CASE WHEN t.tgfoid = to_regprocedure(r.audit_signature) AND t.tgtype = 23
      AND t.tgenabled = 'O' AND t.tgqual IS NULL AND t.tgnargs = 0
      THEN 'PASS' ELSE 'FAIL' END,
    jsonb_build_object('definition', pg_get_triggerdef(t.oid, true))
  FROM relations r LEFT JOIN pg_trigger t ON t.tgrelid = r.oid
    AND t.tgname = r.table_name || '_set_audit_fields' AND NOT t.tgisinternal
  UNION ALL
  SELECT '08_policies', r.table_name, 'REVIEW', jsonb_build_object(
    'expected', 'Only SELECT/INSERT/UPDATE for authenticated; archive SELECT needs read AND manage; writes need manage',
    'policies', (SELECT jsonb_agg(jsonb_build_object('name', p.policyname,
      'command', p.cmd, 'roles', p.roles, 'permissive', p.permissive,
      'using', p.qual, 'with_check', p.with_check) ORDER BY p.policyname)
      FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = r.table_name))
  FROM relations r
  UNION ALL
  SELECT '09_authenticated_table_access', r.table_name,
    CASE WHEN has_table_privilege('authenticated', r.oid, 'SELECT')
      AND NOT has_table_privilege('authenticated', r.oid, 'DELETE,TRUNCATE,TRIGGER')
      THEN 'PASS' ELSE 'FAIL' END,
    jsonb_build_object('select', has_table_privilege('authenticated', r.oid, 'SELECT'),
      'delete', has_table_privilege('authenticated', r.oid, 'DELETE'),
      'truncate', has_table_privilege('authenticated', r.oid, 'TRUNCATE'),
      'trigger', has_table_privilege('authenticated', r.oid, 'TRIGGER'))
  FROM relations r
  UNION ALL
  SELECT '09_anon_access', r.table_name,
    CASE WHEN r.oid IS NOT NULL
      AND NOT has_table_privilege('anon', r.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      AND NOT has_any_column_privilege('anon', r.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
      THEN 'PASS' ELSE 'FAIL' END,
    jsonb_build_object('any_table_access',
      has_table_privilege('anon', r.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
      'any_column_access', has_any_column_privilege('anon', r.oid, 'SELECT,INSERT,UPDATE,REFERENCES'))
  FROM relations r
  UNION ALL
  SELECT '10_protected_columns', r.table_name,
    CASE WHEN count(a.attnum) = CASE WHEN r.table_name = 'crm_tasks' THEN 6 ELSE 5 END
      AND bool_and(NOT has_column_privilege('authenticated', r.oid, a.attnum, 'UPDATE')
        AND (a.attname = 'organization_id' OR
          NOT has_column_privilege('authenticated', r.oid, a.attnum, 'INSERT')))
      THEN 'PASS' ELSE 'FAIL' END,
    jsonb_agg(jsonb_build_object('column', a.attname,
      'insert', has_column_privilege('authenticated', r.oid, a.attnum, 'INSERT'),
      'update', has_column_privilege('authenticated', r.oid, a.attnum, 'UPDATE')) ORDER BY a.attname)
  FROM relations r LEFT JOIN pg_attribute a ON a.attrelid = r.oid AND NOT a.attisdropped
    AND a.attname IN ('id', 'organization_id', 'created_by', 'updated_by', 'created_at', 'updated_at')
  GROUP BY r.table_name
  UNION ALL
  SELECT '11_permissions', k.key, CASE WHEN p.id IS NOT NULL THEN 'PASS' ELSE 'FAIL' END,
    jsonb_build_object('exists', p.id IS NOT NULL)
  FROM permission_keys k LEFT JOIN public.permissions p ON p.key = k.key
  UNION ALL
  SELECT '12_system_role_grants', 'Owner/Admin manage; Member read only',
    CASE WHEN count(*) = 0 THEN 'REVIEW' WHEN bool_and(rc.ok) THEN 'PASS' ELSE 'FAIL' END,
    jsonb_build_object('roles_checked', count(DISTINCT rc.id),
      'mismatches', coalesce(jsonb_agg(jsonb_build_object('organization_id', rc.organization_id,
        'role', rc.slug, 'permission', rc.key)) FILTER (WHERE NOT rc.ok), '[]'::jsonb))
  FROM role_checks rc
  UNION ALL
  SELECT '13_constraints', r.table_name, 'REVIEW', (
    SELECT jsonb_agg(jsonb_build_object('name', k.conname, 'validated', k.convalidated,
      'definition', pg_get_constraintdef(k.oid, true)) ORDER BY k.conname)
    FROM pg_constraint k WHERE k.conrelid = r.oid)
  FROM relations r
  UNION ALL
  SELECT '14_indexes', r.table_name, 'REVIEW', (
    SELECT jsonb_agg(jsonb_build_object('definition', pg_get_indexdef(i.indexrelid),
      'valid', i.indisvalid, 'ready', i.indisready) ORDER BY i.indexrelid::regclass::text)
    FROM pg_index i WHERE i.indrelid = r.oid)
  FROM relations r
  UNION ALL
  SELECT '15_all_user_triggers', 'Shared audit tables and auth.users', 'REVIEW', (
    SELECT jsonb_agg(jsonb_build_object('table', t.tgrelid::regclass::text,
      'enabled', t.tgenabled, 'definition', pg_get_triggerdef(t.oid, true))
      ORDER BY t.tgrelid::regclass::text, t.tgname)
    FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN (
      to_regclass('auth.users'), to_regclass('public.crm_accounts'),
      to_regclass('public.crm_contacts'), to_regclass('public.crm_pipelines'),
      to_regclass('public.crm_pipeline_stages'), to_regclass('public.crm_deals'),
      to_regclass('public.crm_tasks'), to_regclass('public.crm_activities')))
)
SELECT section, object_name, status, details FROM checks ORDER BY section, object_name;

ROLLBACK;
