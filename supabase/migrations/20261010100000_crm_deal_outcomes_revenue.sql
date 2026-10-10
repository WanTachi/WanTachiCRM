BEGIN;

-- Deal outcomes are explicit state, independent from pipeline stage names.
-- Existing rows receive the neutral open state and no synthetic history event.
DO $preflight$
DECLARE
  outcome_column record;
  closed_at_column record;
  outcome_default text;
BEGIN
  IF pg_catalog.to_regclass('public.crm_deals') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42P01',
      MESSAGE = 'Required table public.crm_deals is missing';
  END IF;

  SELECT
    a.atttypid,
    a.attnotnull,
    a.attgenerated,
    a.attidentity,
    pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS default_expression
  INTO outcome_column
  FROM pg_catalog.pg_attribute AS a
  LEFT JOIN pg_catalog.pg_attrdef AS d
    ON d.adrelid = a.attrelid
   AND d.adnum = a.attnum
  WHERE a.attrelid = pg_catalog.to_regclass('public.crm_deals')
    AND a.attname = 'outcome'
    AND NOT a.attisdropped;

  IF FOUND THEN
    outcome_default := pg_catalog.regexp_replace(
      pg_catalog.lower(pg_catalog.coalesce(outcome_column.default_expression, '')),
      '[[:space:]]+',
      '',
      'g'
    );
    IF outcome_column.atttypid <> 'text'::regtype
       OR NOT outcome_column.attnotnull
       OR outcome_column.attgenerated <> ''
       OR outcome_column.attidentity <> ''
       OR outcome_default <> '''open''::text' THEN
      RAISE EXCEPTION USING
        ERRCODE = '42804',
        MESSAGE = 'Existing public.crm_deals.outcome has an incompatible definition';
    END IF;
  END IF;

  SELECT
    a.atttypid,
    a.attnotnull,
    a.attgenerated,
    a.attidentity,
    pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS default_expression
  INTO closed_at_column
  FROM pg_catalog.pg_attribute AS a
  LEFT JOIN pg_catalog.pg_attrdef AS d
    ON d.adrelid = a.attrelid
   AND d.adnum = a.attnum
  WHERE a.attrelid = pg_catalog.to_regclass('public.crm_deals')
    AND a.attname = 'closed_at'
    AND NOT a.attisdropped;

  IF FOUND THEN
    IF closed_at_column.atttypid <> 'timestamptz'::regtype
       OR closed_at_column.attnotnull
       OR closed_at_column.attgenerated <> ''
       OR closed_at_column.attidentity <> ''
       OR closed_at_column.default_expression IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '42804',
        MESSAGE = 'Existing public.crm_deals.closed_at has an incompatible definition';
    END IF;
  END IF;
END;
$preflight$;

ALTER TABLE public.crm_deals
  ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'open';

ALTER TABLE public.crm_deals
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

-- Do not silently accept a broad or stale UPDATE grant that would make the
-- database-controlled closed_at column writable by authenticated clients.
REVOKE UPDATE (closed_at) ON public.crm_deals FROM public, anon, authenticated;
DO $grant_preflight$
BEGIN
  IF has_table_privilege('authenticated', 'public.crm_deals', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.crm_deals', 'closed_at', 'UPDATE') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Authenticated must not have UPDATE access to public.crm_deals.closed_at';
  END IF;
END;
$grant_preflight$;

CREATE TEMP TABLE _crm_deal_outcome_expected_constraints (
  outcome text NOT NULL DEFAULT 'open',
  closed_at timestamptz,
  amount numeric,
  currency text,
  CONSTRAINT _expected_outcome_check
    CHECK (outcome IN ('open', 'won', 'lost')),
  CONSTRAINT _expected_outcome_closed_at_check
    CHECK (
      (outcome = 'open' AND closed_at IS NULL)
      OR (outcome IN ('won', 'lost') AND closed_at IS NOT NULL)
    ),
  CONSTRAINT _expected_won_value_check
    CHECK (
      outcome <> 'won'
      OR (
        amount IS NOT NULL
        AND amount > 0
        AND amount <> 'NaN'::numeric
        AND amount <> 'Infinity'::numeric
        AND amount <> '-Infinity'::numeric
        AND currency IS NOT NULL
        AND currency ~ '^[A-Z]{3}$'
      )
    )
) ON COMMIT DROP;

DO $constraints$
DECLARE
  constraint_spec record;
  actual_constraint record;
  expected_definition text;
  actual_definition text;
BEGIN
  FOR constraint_spec IN
    SELECT *
    FROM (VALUES
      ('crm_deals_outcome_check', '_expected_outcome_check'),
      ('crm_deals_outcome_closed_at_check', '_expected_outcome_closed_at_check'),
      ('crm_deals_won_value_check', '_expected_won_value_check')
    ) AS specs(constraint_name, expected_name)
  LOOP
    SELECT
      c.oid,
      c.convalidated,
      pg_catalog.pg_get_constraintdef(c.oid, true) AS definition
    INTO actual_constraint
    FROM pg_catalog.pg_constraint AS c
    WHERE c.conrelid = pg_catalog.to_regclass('public.crm_deals')
      AND c.conname = constraint_spec.constraint_name;

    SELECT pg_catalog.pg_get_constraintdef(c.oid, true)
    INTO expected_definition
    FROM pg_catalog.pg_constraint AS c
    WHERE c.conrelid = pg_catalog.to_regclass(
      'pg_temp._crm_deal_outcome_expected_constraints'
    )
      AND c.conname = constraint_spec.expected_name;

    IF actual_constraint.oid IS NULL THEN
      EXECUTE pg_catalog.format(
        'ALTER TABLE public.crm_deals ADD CONSTRAINT %I %s',
        constraint_spec.constraint_name,
        expected_definition
      );
    ELSE
      actual_definition := pg_catalog.regexp_replace(
        pg_catalog.lower(actual_constraint.definition),
        '[[:space:]]+',
        '',
        'g'
      );
      IF NOT actual_constraint.convalidated
         OR actual_definition <> pg_catalog.regexp_replace(
           pg_catalog.lower(expected_definition),
           '[[:space:]]+',
           '',
           'g'
         ) THEN
        RAISE EXCEPTION USING
          ERRCODE = '42804',
          MESSAGE = pg_catalog.format(
            'Existing constraint public.crm_deals.%I has an incompatible definition',
            constraint_spec.constraint_name
          );
      END IF;
    END IF;
  END LOOP;
END;
$constraints$;

CREATE TABLE public.crm_deal_outcome_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  deal_id uuid NOT NULL,
  from_outcome text,
  to_outcome text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid,
  amount_snapshot numeric,
  currency_snapshot text,
  CONSTRAINT crm_deal_outcome_events_from_check
    CHECK (from_outcome IS NULL OR from_outcome IN ('open', 'won', 'lost')),
  CONSTRAINT crm_deal_outcome_events_to_check
    CHECK (to_outcome IN ('open', 'won', 'lost')),
  CONSTRAINT crm_deal_outcome_events_won_snapshot_check
    CHECK (
      to_outcome <> 'won'
      OR (
        amount_snapshot IS NOT NULL
        AND amount_snapshot > 0
        AND amount_snapshot <> 'NaN'::numeric
        AND amount_snapshot <> 'Infinity'::numeric
        AND amount_snapshot <> '-Infinity'::numeric
        AND currency_snapshot IS NOT NULL
        AND currency_snapshot ~ '^[A-Z]{3}$'
      )
    ),
  CONSTRAINT crm_deal_outcome_events_organization_fk
    FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id)
    ON DELETE CASCADE,
  CONSTRAINT crm_deal_outcome_events_deal_same_org_fk
    FOREIGN KEY (organization_id, deal_id)
    REFERENCES public.crm_deals(organization_id, id)
    -- Keep direct Deal deletion blocked, while allowing the existing
    -- organization cascade to remove the history in the same transaction.
    ON DELETE NO ACTION
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT crm_deal_outcome_events_actor_same_org_fk
    FOREIGN KEY (organization_id, changed_by)
    REFERENCES public.memberships(organization_id, user_id)
    ON DELETE SET NULL (changed_by)
);

CREATE INDEX crm_deals_org_outcome_closed_at_idx
  ON public.crm_deals (organization_id, outcome, closed_at)
  WHERE archived_at IS NULL;

CREATE INDEX crm_deal_outcome_events_org_changed_at_idx
  ON public.crm_deal_outcome_events (organization_id, to_outcome, changed_at);

CREATE INDEX crm_deal_outcome_events_org_deal_changed_at_idx
  ON public.crm_deal_outcome_events (organization_id, deal_id, changed_at);

CREATE FUNCTION public.set_crm_deal_outcome_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.outcome IS DISTINCT FROM 'open' THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'Deals must be created with outcome open';
    END IF;
    IF NEW.closed_at IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'Deal closed_at is database controlled';
    END IF;
    NEW.closed_at := NULL;
    RETURN NEW;
  END IF;

  -- closed_at is never accepted from a client update. The trigger derives it
  -- from the outcome transition below.
  IF NEW.closed_at IS DISTINCT FROM OLD.closed_at THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Deal closed_at is database controlled';
  END IF;

  IF OLD.outcome = 'won'
     AND (
       NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.currency IS DISTINCT FROM OLD.currency
     ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'Won deal amount and currency are immutable';
  END IF;

  IF NEW.outcome IS DISTINCT FROM OLD.outcome THEN
    IF NEW.outcome = 'open' THEN
      NEW.closed_at := NULL;
    ELSE
      IF NEW.outcome = 'won' THEN
        NEW.currency := pg_catalog.upper(pg_catalog.btrim(NEW.currency));
        IF NEW.amount IS NULL
           OR NEW.amount <= 0
           OR NEW.amount = 'NaN'::numeric
           OR NEW.amount = 'Infinity'::numeric
           OR NEW.amount = '-Infinity'::numeric
           OR NEW.currency IS NULL
           OR NEW.currency !~ '^[A-Z]{3}$' THEN
          RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Won deals require a positive amount and a three-letter currency';
        END IF;
      END IF;
      NEW.closed_at := now();
    END IF;
  ELSE
    NEW.closed_at := OLD.closed_at;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.record_crm_deal_outcome_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.crm_deal_outcome_events (
    organization_id,
    deal_id,
    from_outcome,
    to_outcome,
    changed_at,
    changed_by,
    amount_snapshot,
    currency_snapshot
  )
  VALUES (
    NEW.organization_id,
    NEW.id,
    OLD.outcome,
    NEW.outcome,
    COALESCE(NEW.closed_at, now()),
    (SELECT auth.uid()),
    NEW.amount,
    NEW.currency
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER crm_deals_set_outcome_fields
  BEFORE INSERT OR UPDATE OF outcome, closed_at, amount, currency
  ON public.crm_deals
  FOR EACH ROW
  EXECUTE FUNCTION public.set_crm_deal_outcome_fields();

CREATE TRIGGER crm_deals_record_outcome_event
  AFTER UPDATE OF outcome
  ON public.crm_deals
  FOR EACH ROW
  WHEN (OLD.outcome IS DISTINCT FROM NEW.outcome)
  EXECUTE FUNCTION public.record_crm_deal_outcome_event();

ALTER TABLE public.crm_deal_outcome_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_deal_outcome_events_select
  ON public.crm_deal_outcome_events
  FOR SELECT
  TO authenticated
  USING (
    private.has_organization_permission(organization_id, 'deals.read')
    AND (
      EXISTS (
        SELECT 1
        FROM public.crm_deals AS deal
        WHERE deal.organization_id = crm_deal_outcome_events.organization_id
          AND deal.id = crm_deal_outcome_events.deal_id
          AND deal.archived_at IS NULL
      )
      OR private.has_organization_permission(organization_id, 'deals.manage')
    )
  );

REVOKE ALL ON public.crm_deal_outcome_events
  FROM public, anon, authenticated;
GRANT SELECT ON public.crm_deal_outcome_events TO authenticated;

-- Existing grants intentionally do not include closed_at. Outcome transitions
-- are still governed by the existing deals.manage RLS policy and the trigger.
GRANT UPDATE (outcome) ON public.crm_deals TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_crm_deal_outcome_fields()
  FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_crm_deal_outcome_event()
  FROM public, anon, authenticated;

COMMIT;
