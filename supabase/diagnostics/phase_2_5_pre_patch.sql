-- Read-only inventory. Does not execute the functions whose definitions it shows.
-- Column-scoped grants can make table_insert/table_update false; see 03_columns.
BEGIN READ ONLY;

WITH
crm_names(name) AS (VALUES
  ('crm_accounts'), ('crm_contacts'), ('crm_pipelines'),
  ('crm_pipeline_stages'), ('crm_deals'), ('crm_tasks'), ('crm_activities')
),
crm AS (
  SELECT n.name, c.*
  FROM crm_names n
  LEFT JOIN pg_class c ON c.oid = to_regclass('public.' || n.name)
),
permission_keys(key) AS (VALUES
  ('tasks.read'), ('tasks.manage'), ('activities.read'), ('activities.manage')
),
expected_functions(signature, original_hash, final_hash) AS (VALUES
  ('public.set_crm_record_audit_fields()',
   'ca71d08403d1aa0b33aefdfde816a008', 'a7e2e0e84d752e7165c761c61c78310f'),
  ('public.set_crm_activity_audit_fields()',
   '794ecca3b8786d488b1e707d20bbdc53', '6c1474548ccb97f710803ccd0d4a20a2'),
  ('public.create_organization(text,text)',
   '20a57f129e73df12d5f3549ad8ca30cd', '20a57f129e73df12d5f3549ad8ca30cd')
),
functions AS (
  SELECT e.*, p.oid, p.proowner, p.prosecdef, p.proconfig, p.proacl,
         md5(regexp_replace(p.prosrc, '[[:space:]]+', '', 'g')) AS body_hash
  FROM expected_functions e
  LEFT JOIN pg_proc p ON p.oid = to_regprocedure(e.signature)
),
report(section, object_name, details) AS (
  SELECT '01_server', current_database(),
    jsonb_build_object('version', current_setting('server_version'),
                       'version_num', current_setting('server_version_num'),
                       'executed_as', current_user)
  UNION ALL
  SELECT '02_tables', 'public.' || c.name,
    jsonb_build_object('exists', c.oid IS NOT NULL, 'kind', c.relkind,
      'rls_enabled', c.relrowsecurity, 'rls_forced', c.relforcerowsecurity,
      'owner', pg_get_userbyid(c.relowner), 'acl', c.relacl)
  FROM crm c
  UNION ALL
  SELECT '03_columns', c.name || '.' || a.attname,
    jsonb_build_object('position', a.attnum, 'type', format_type(a.atttypid, a.atttypmod),
      'not_null', a.attnotnull, 'default', pg_get_expr(d.adbin, d.adrelid),
      'authenticated_insert', has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT'),
      'authenticated_update', has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE'))
  FROM crm c
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE c.name IN ('crm_tasks', 'crm_activities')
  UNION ALL
  SELECT '04_constraints', c.name || '.' || k.conname,
    jsonb_build_object('type', k.contype, 'definition', pg_get_constraintdef(k.oid, true),
      'validated', k.convalidated, 'deferrable', k.condeferrable,
      'initially_deferred', k.condeferred,
      'on_delete', CASE k.confdeltype
        WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
        WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END,
      'on_update', CASE k.confupdtype
        WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
        WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END,
      'set_null_column_numbers', to_jsonb(k) -> 'confdelsetcols')
  FROM crm c JOIN pg_constraint k ON k.conrelid = c.oid
  UNION ALL
  SELECT '05_indexes', c.name || '.' || i.indexrelid::regclass::text,
    jsonb_build_object('definition', pg_get_indexdef(i.indexrelid),
      'valid', i.indisvalid, 'ready', i.indisready, 'unique', i.indisunique)
  FROM crm c JOIN pg_index i ON i.indrelid = c.oid
  UNION ALL
  SELECT '06_triggers', n.nspname || '.' || c.relname || '.' || t.tgname,
    jsonb_build_object('enabled', t.tgenabled, 'definition', pg_get_triggerdef(t.oid, true),
      'function', t.tgfoid::regprocedure::text)
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE NOT t.tgisinternal AND (
    n.nspname = 'public' OR t.tgfoid IN (SELECT oid FROM functions))
  UNION ALL
  SELECT '07_functions', f.signature,
    jsonb_build_object('exists', f.oid IS NOT NULL, 'owner', pg_get_userbyid(f.proowner),
      'security_definer', f.prosecdef, 'config', f.proconfig, 'acl', f.proacl,
      'normalized_body_hash', f.body_hash,
      'known_body', CASE
        WHEN f.oid IS NULL THEN 'MISSING'
        WHEN f.body_hash = f.final_hash THEN 'CURRENT'
        WHEN f.body_hash = f.original_hash THEN 'ORIGINAL'
        ELSE 'UNKNOWN: compare full definition' END,
      'anon_execute', has_function_privilege('anon', f.oid, 'EXECUTE'),
      'authenticated_execute', has_function_privilege('authenticated', f.oid, 'EXECUTE'),
      'definition', pg_get_functiondef(f.oid))
  FROM functions f
  UNION ALL
  SELECT DISTINCT '08_other_trigger_functions', p.oid::regprocedure::text,
    jsonb_build_object('security_definer', p.prosecdef, 'definition', pg_get_functiondef(p.oid))
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE n.nspname = 'public' AND NOT t.tgisinternal
    AND NOT EXISTS (SELECT 1 FROM functions f WHERE f.oid = p.oid)
  UNION ALL
  SELECT '09_policies', p.tablename || '.' || p.policyname,
    jsonb_build_object('command', p.cmd, 'roles', p.roles, 'permissive', p.permissive,
      'using', p.qual, 'with_check', p.with_check)
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.tablename IN (SELECT name FROM crm_names)
  UNION ALL
  SELECT '10_permissions', k.key,
    jsonb_build_object('exists', p.id IS NOT NULL, 'id', p.id, 'description', p.description)
  FROM permission_keys k LEFT JOIN public.permissions p ON p.key = k.key
  UNION ALL
  SELECT '11_role_permissions', r.organization_id::text || '.' || r.id::text,
    jsonb_build_object('role_slug', r.slug, 'is_system', r.is_system,
      'permissions', jsonb_agg(jsonb_build_object(
        'key', k.key, 'granted', rp.role_id IS NOT NULL,
        'expected_builtin', CASE
          WHEN NOT r.is_system THEN NULL
          WHEN r.slug IN ('owner', 'admin') THEN true
          WHEN r.slug = 'member' THEN k.key IN ('tasks.read', 'activities.read')
          ELSE NULL END) ORDER BY k.key))
  FROM public.roles r CROSS JOIN permission_keys k
  LEFT JOIN public.permissions p ON p.key = k.key
  LEFT JOIN public.role_permissions rp ON rp.role_id = r.id AND rp.permission_id = p.id
  GROUP BY r.organization_id, r.id, r.slug, r.is_system
  UNION ALL
  SELECT '12_table_access', c.name || '.' || roles.name,
    jsonb_build_object(
      'select', has_table_privilege(roles.name::name, c.oid, 'SELECT'),
      'table_insert', has_table_privilege(roles.name::name, c.oid, 'INSERT'),
      'table_update', has_table_privilege(roles.name::name, c.oid, 'UPDATE'),
      'delete', has_table_privilege(roles.name::name, c.oid, 'DELETE'),
      'truncate', has_table_privilege(roles.name::name, c.oid, 'TRUNCATE'),
      'trigger', has_table_privilege(roles.name::name, c.oid, 'TRIGGER'))
  FROM crm c CROSS JOIN (VALUES ('anon'), ('authenticated')) AS roles(name)
  WHERE c.name IN ('crm_tasks', 'crm_activities')
)
SELECT section, object_name, details
FROM report
ORDER BY section, object_name;

COMMIT;
