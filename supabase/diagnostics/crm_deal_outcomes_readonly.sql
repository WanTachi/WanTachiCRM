-- Read-only verification for the Deal Outcomes Foundation migration.
-- This block inspects metadata only and does not write CRM data.
BEGIN READ ONLY;

WITH expected_tables(table_name) AS (
  VALUES ('crm_deals'), ('crm_deal_outcome_events')
),
expected_columns(table_name, column_name, expected_type, expected_not_null) AS (
  VALUES
    ('crm_deals', 'outcome', 'text', true),
    ('crm_deals', 'closed_at', 'timestamp with time zone', false)
),
expected_constraints(table_name, constraint_name) AS (
  VALUES
    ('crm_deals', 'crm_deals_outcome_check'),
    ('crm_deals', 'crm_deals_outcome_closed_at_check'),
    ('crm_deals', 'crm_deals_won_value_check'),
    ('crm_deal_outcome_events', 'crm_deal_outcome_events_from_check'),
    ('crm_deal_outcome_events', 'crm_deal_outcome_events_to_check'),
    ('crm_deal_outcome_events', 'crm_deal_outcome_events_won_snapshot_check'),
    ('crm_deal_outcome_events', 'crm_deal_outcome_events_organization_fk'),
    ('crm_deal_outcome_events', 'crm_deal_outcome_events_deal_same_org_fk'),
    ('crm_deal_outcome_events', 'crm_deal_outcome_events_actor_same_org_fk')
),
expected_indexes(table_name, index_name) AS (
  VALUES
    ('crm_deals', 'crm_deals_org_outcome_closed_at_idx'),
    ('crm_deal_outcome_events', 'crm_deal_outcome_events_org_changed_at_idx'),
    ('crm_deal_outcome_events', 'crm_deal_outcome_events_org_deal_changed_at_idx')
),
expected_triggers(table_name, trigger_name) AS (
  VALUES
    ('crm_deals', 'crm_deals_set_outcome_fields'),
    ('crm_deals', 'crm_deals_record_outcome_event')
),
expected_functions(signature) AS (
  VALUES
    ('public.set_crm_deal_outcome_fields()'),
    ('public.record_crm_deal_outcome_event()')
),
expected_policies(table_name, policy_name) AS (
  VALUES
    ('crm_deals', 'crm_deals_select'),
    ('crm_deals', 'crm_deals_insert'),
    ('crm_deals', 'crm_deals_update'),
    ('crm_deal_outcome_events', 'crm_deal_outcome_events_select')
),
expected_permissions(permission_key) AS (
  VALUES ('deals.read'), ('deals.manage')
),
expected_role_permissions(role_slug, permission_key, expected_present) AS (
  VALUES
    ('owner', 'deals.read', true),
    ('owner', 'deals.manage', true),
    ('admin', 'deals.read', true),
    ('admin', 'deals.manage', true),
    ('member', 'deals.read', true),
    ('member', 'deals.manage', false)
),
report(section, object_name, details) AS (
  SELECT '01_server', current_database(),
    jsonb_build_object(
      'status', 'PASS',
      'version', current_setting('server_version'),
      'version_num', current_setting('server_version_num'),
      'executed_as', current_user
    )
  UNION ALL
  SELECT '02_tables', expected.table_name,
    jsonb_build_object(
      'status', CASE
        WHEN c.oid IS NULL THEN 'FAIL'
        WHEN c.relrowsecurity THEN 'PASS'
        ELSE 'FAIL'
      END,
      'exists', c.oid IS NOT NULL,
      'rls_enabled', c.relrowsecurity,
      'rls_forced', c.relforcerowsecurity,
      'owner', pg_get_userbyid(c.relowner),
      'acl', c.relacl
    )
  FROM expected_tables AS expected
  LEFT JOIN pg_catalog.pg_class AS c
    ON c.oid = pg_catalog.to_regclass('public.' || expected.table_name)
  UNION ALL
  SELECT '03_columns', expected.table_name || '.' || expected.column_name,
    jsonb_build_object(
      'status', CASE
        WHEN a.attrelid IS NULL THEN 'FAIL'
        WHEN format_type(a.atttypid, a.atttypmod) = expected.expected_type
         AND a.attnotnull = expected.expected_not_null
         AND (
           (expected.column_name = 'outcome'
            AND pg_catalog.regexp_replace(
              pg_catalog.lower(pg_catalog.coalesce(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '')),
              '[[:space:]]+', '', 'g'
            ) = '''open''::text')
           OR (expected.column_name = 'closed_at' AND d.adbin IS NULL)
         ) THEN 'PASS'
        ELSE 'FAIL'
      END,
      'exists', a.attrelid IS NOT NULL,
      'type', format_type(a.atttypid, a.atttypmod),
      'expected_type', expected.expected_type,
      'not_null', a.attnotnull,
      'expected_not_null', expected.expected_not_null,
      'default', pg_catalog.pg_get_expr(d.adbin, d.adrelid)
    )
  FROM expected_columns AS expected
  LEFT JOIN pg_catalog.pg_attribute AS a
    ON a.attrelid = pg_catalog.to_regclass('public.' || expected.table_name)
   AND a.attname = expected.column_name
   AND NOT a.attisdropped
  LEFT JOIN pg_catalog.pg_attrdef AS d
    ON d.adrelid = a.attrelid
   AND d.adnum = a.attnum
  UNION ALL
  SELECT '04_constraints', expected.table_name || '.' || expected.constraint_name,
    jsonb_build_object(
      'status', CASE
        WHEN c.oid IS NULL THEN 'FAIL'
        WHEN c.convalidated THEN 'REVIEW'
        ELSE 'FAIL'
      END,
      'exists', c.oid IS NOT NULL,
      'type', c.contype,
      'definition', pg_catalog.pg_get_constraintdef(c.oid, true),
      'validated', c.convalidated,
      'deferrable', c.condeferrable,
      'initially_deferred', c.condeferred,
      'on_delete', CASE c.confdeltype
        WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
        WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END,
      'set_null_columns', to_jsonb(c) -> 'confdelsetcols'
    )
  FROM expected_constraints AS expected
  LEFT JOIN pg_catalog.pg_constraint AS c
    ON c.conrelid = pg_catalog.to_regclass('public.' || expected.table_name)
   AND c.conname = expected.constraint_name
  UNION ALL
  SELECT '05_indexes', expected.table_name || '.' || expected.index_name,
    jsonb_build_object(
      'status', CASE
        WHEN i.indexrelid IS NULL THEN 'FAIL'
        WHEN i.indisvalid AND i.indisready THEN 'REVIEW'
        ELSE 'FAIL'
      END,
      'exists', i.indexrelid IS NOT NULL,
      'definition', pg_catalog.pg_get_indexdef(i.indexrelid),
      'valid', i.indisvalid,
      'ready', i.indisready,
      'unique', i.indisunique
    )
  FROM expected_indexes AS expected
  LEFT JOIN pg_catalog.pg_class AS index_class
    ON index_class.oid = pg_catalog.to_regclass('public.' || expected.index_name)
  LEFT JOIN pg_catalog.pg_index AS i
    ON i.indexrelid = index_class.oid
  UNION ALL
  SELECT '06_triggers', expected.table_name || '.' || expected.trigger_name,
    jsonb_build_object(
      'status', CASE WHEN t.oid IS NULL THEN 'FAIL' ELSE 'REVIEW' END,
      'exists', t.oid IS NOT NULL,
      'enabled', t.tgenabled,
      'definition', pg_catalog.pg_get_triggerdef(t.oid, true),
      'function', t.tgfoid::regprocedure::text
    )
  FROM expected_triggers AS expected
  LEFT JOIN pg_catalog.pg_trigger AS t
    ON t.tgrelid = pg_catalog.to_regclass('public.' || expected.table_name)
   AND t.tgname = expected.trigger_name
   AND NOT t.tgisinternal
  UNION ALL
  SELECT '07_functions', expected.signature,
    jsonb_build_object(
      'status', CASE
        WHEN p.oid IS NULL THEN 'FAIL'
        WHEN expected.signature = 'public.record_crm_deal_outcome_event()'
         AND NOT p.prosecdef THEN 'FAIL'
        WHEN expected.signature = 'public.set_crm_deal_outcome_fields()'
         AND p.prosecdef THEN 'FAIL'
        ELSE 'REVIEW'
      END,
      'exists', p.oid IS NOT NULL,
      'owner', pg_get_userbyid(p.proowner),
      'security_definer', p.prosecdef,
      'search_path', p.proconfig,
      'acl', p.proacl,
      'definition', pg_catalog.pg_get_functiondef(p.oid)
    )
  FROM expected_functions AS expected
  LEFT JOIN pg_catalog.pg_proc AS p
    ON p.oid = pg_catalog.to_regprocedure(expected.signature)
  UNION ALL
  SELECT '08_policies', expected.table_name || '.' || expected.policy_name,
    jsonb_build_object(
      'status', CASE WHEN p.policyname IS NULL THEN 'FAIL' ELSE 'REVIEW' END,
      'exists', p.policyname IS NOT NULL,
      'command', p.cmd,
      'roles', p.roles,
      'permissive', p.permissive,
      'using', p.qual,
      'with_check', p.with_check
    )
  FROM expected_policies AS expected
  LEFT JOIN pg_catalog.pg_policies AS p
    ON p.schemaname = 'public'
   AND p.tablename = expected.table_name
   AND p.policyname = expected.policy_name
  UNION ALL
  SELECT '09_permissions', expected.permission_key,
    jsonb_build_object(
      'status', CASE WHEN p.id IS NULL THEN 'FAIL' ELSE 'PASS' END,
      'exists', p.id IS NOT NULL,
      'id', p.id,
      'description', p.description
    )
  FROM expected_permissions AS expected
  LEFT JOIN public.permissions AS p ON p.key = expected.permission_key
  UNION ALL
  SELECT '10_role_permissions', expected.role_slug || '.' || expected.permission_key,
    jsonb_build_object(
      'status', CASE
        WHEN p.id IS NULL OR count(DISTINCT r.id) = 0 THEN 'FAIL'
        WHEN expected.expected_present
         AND count(DISTINCT rp.role_id) = count(DISTINCT r.id) THEN 'PASS'
        WHEN NOT expected.expected_present
         AND count(DISTINCT rp.role_id) = 0 THEN 'PASS'
        ELSE 'FAIL'
      END,
      'roles_checked', count(DISTINCT r.id),
      'permission_exists', p.id IS NOT NULL,
      'expected_present', expected.expected_present,
      'roles_with_assignment', count(DISTINCT rp.role_id),
      'organizations_checked', count(DISTINCT r.organization_id)
    )
  FROM expected_role_permissions AS expected
  LEFT JOIN public.roles AS r
    ON r.slug = expected.role_slug
   AND r.is_system
  LEFT JOIN public.permissions AS p
    ON p.key = expected.permission_key
  LEFT JOIN public.role_permissions AS rp
    ON rp.role_id = r.id
   AND rp.permission_id = p.id
  GROUP BY expected.role_slug, expected.permission_key, expected.expected_present, p.id
  UNION ALL
  SELECT '11_table_access', tables.table_name || '.' || roles.role_name,
    jsonb_build_object(
      'status', CASE
        WHEN pg_catalog.to_regclass('public.' || tables.table_name) IS NULL THEN 'FAIL'
        WHEN roles.role_name = 'anon'
         AND COALESCE(has_table_privilege(
           roles.role_name::name,
           pg_catalog.to_regclass('public.' || tables.table_name),
           'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER'
         ), false) = false THEN 'PASS'
        ELSE 'REVIEW'
      END,
      'select', CASE WHEN pg_catalog.to_regclass('public.' || tables.table_name) IS NULL THEN NULL ELSE has_table_privilege(roles.role_name::name, pg_catalog.to_regclass('public.' || tables.table_name), 'SELECT') END,
      'insert', CASE WHEN pg_catalog.to_regclass('public.' || tables.table_name) IS NULL THEN NULL ELSE has_table_privilege(roles.role_name::name, pg_catalog.to_regclass('public.' || tables.table_name), 'INSERT') END,
      'update', CASE WHEN pg_catalog.to_regclass('public.' || tables.table_name) IS NULL THEN NULL ELSE has_table_privilege(roles.role_name::name, pg_catalog.to_regclass('public.' || tables.table_name), 'UPDATE') END,
      'delete', CASE WHEN pg_catalog.to_regclass('public.' || tables.table_name) IS NULL THEN NULL ELSE has_table_privilege(roles.role_name::name, pg_catalog.to_regclass('public.' || tables.table_name), 'DELETE') END,
      'truncate', CASE WHEN pg_catalog.to_regclass('public.' || tables.table_name) IS NULL THEN NULL ELSE has_table_privilege(roles.role_name::name, pg_catalog.to_regclass('public.' || tables.table_name), 'TRUNCATE') END,
      'trigger', CASE WHEN pg_catalog.to_regclass('public.' || tables.table_name) IS NULL THEN NULL ELSE has_table_privilege(roles.role_name::name, pg_catalog.to_regclass('public.' || tables.table_name), 'TRIGGER') END
    )
  FROM (VALUES ('crm_deals'), ('crm_deal_outcome_events')) AS tables(table_name)
  CROSS JOIN (VALUES ('anon'), ('authenticated')) AS roles(role_name)
  UNION ALL
  SELECT '12_column_access', expected.table_name || '.' || expected.column_name || '.' || roles.role_name,
    jsonb_build_object(
      'status', CASE
        WHEN pg_catalog.to_regclass('public.' || expected.table_name) IS NULL THEN 'FAIL'
        WHEN roles.role_name = 'anon'
         AND COALESCE(has_column_privilege(roles.role_name::name, pg_catalog.to_regclass('public.' || expected.table_name), expected.column_name, 'INSERT,UPDATE'), false) = false THEN 'PASS'
        WHEN expected.column_name = 'outcome'
         AND roles.role_name = 'authenticated'
         AND has_column_privilege(roles.role_name::name, pg_catalog.to_regclass('public.' || expected.table_name), expected.column_name, 'UPDATE') THEN 'PASS'
        WHEN expected.column_name = 'closed_at'
         AND roles.role_name = 'authenticated'
         AND COALESCE(has_column_privilege(roles.role_name::name, pg_catalog.to_regclass('public.' || expected.table_name), expected.column_name, 'UPDATE'), false) = false THEN 'PASS'
        ELSE 'REVIEW'
      END,
      'insert', CASE WHEN pg_catalog.to_regclass('public.' || expected.table_name) IS NULL THEN NULL ELSE has_column_privilege(roles.role_name::name, pg_catalog.to_regclass('public.' || expected.table_name), expected.column_name, 'INSERT') END,
      'update', CASE WHEN pg_catalog.to_regclass('public.' || expected.table_name) IS NULL THEN NULL ELSE has_column_privilege(roles.role_name::name, pg_catalog.to_regclass('public.' || expected.table_name), expected.column_name, 'UPDATE') END
    )
  FROM expected_columns AS expected
  CROSS JOIN (VALUES ('anon'), ('authenticated')) AS roles(role_name)
)
SELECT section, object_name, details
FROM report
ORDER BY section, object_name;

COMMIT;
