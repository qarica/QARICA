-- Read-only preflight for Phase 0 soft delete. Run after applying the migration.
-- Any failed assertion raises an exception; no records are modified.
DO $$
DECLARE
  has_column boolean;
  rls_on boolean;
  policy_count integer;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'personal_workspace_items'
      AND column_name = 'deleted_at'
      AND data_type = 'timestamp with time zone'
  ) INTO has_column;
  IF NOT has_column THEN
    RAISE EXCEPTION 'personal_workspace_items.deleted_at is missing or wrong type';
  END IF;

  SELECT c.relrowsecurity INTO rls_on
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'personal_workspace_items';
  IF rls_on IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'RLS is disabled on personal_workspace_items';
  END IF;

  SELECT count(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'personal_workspace_items'
    AND cmd IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL')
    AND (qual ILIKE '%auth.uid()%' OR with_check ILIKE '%auth.uid()%');
  IF policy_count < 4 THEN
    RAISE EXCEPTION 'Expected four owner-scoped RLS policies, found %', policy_count;
  END IF;

  RAISE NOTICE 'Phase 0 schema and owner policy preflight passed';
END $$;
