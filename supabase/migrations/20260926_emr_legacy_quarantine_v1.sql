-- QARICA EMR legacy quarantine.
-- 20260925_emr_dashboard.sql introduced a parallel, non-tenant-aware prototype schema
-- with permissive authenticated policies and demo rows. The production EMR source of
-- truth is public.emr_rollout_items. Keep legacy tables only for migration/history and
-- deny client access until a future explicit tenant-safe migration retires or converts them.

do $$
declare
  t text;
begin
  foreach t in array array[
    'emr_departments','emr_forms','emr_form_department_status','emr_form_issues',
    'emr_processes','emr_it_equipment','emr_medical_equipment',
    'emr_digital_signatures','emr_training_signoff'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', t || '_select', t);
      execute format('drop policy if exists %I on public.%I', t || '_write', t);
      execute format('revoke all privileges on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

comment on table public.emr_rollout_items is
  'Canonical tenant-scoped source of truth for QARICA EMR rollout/program control. Legacy emr_* prototype tables are quarantined.';
