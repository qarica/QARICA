-- QARICA RLS init-plan optimization V2 (remaining 23 policies flagged by
-- Supabase's auth_rls_initplan performance advisor after rls_initplan_core_v1/
-- rls_initplan_incident_v1). Same technique, same safety: semantics are
-- unchanged, only bare auth.uid() calls are wrapped in a scalar SELECT so
-- PostgreSQL evaluates them once per statement instead of once per row.
--
-- These 23 are policies written directly against
-- "(select profiles.organization_id from profiles where profiles.user_id =
-- auth.uid())" or similar bare auth.uid() comparisons (personal task
-- extension/approver policies) that predate private.current_organization_id()
-- being used everywhere — the vast majority of qlcl_authenticated_select
-- policies already route through that helper and were never flagged.

do $$
declare
  r record;
  v_count integer := 0;
  v_qual text;
  v_check text;
begin
  select count(*) into v_count
  from pg_policies p
  where p.schemaname='public'
    and (p.tablename,p.policyname) in (
      ('personal_task_extension_requests','personal_task_extension_read_own'),
      ('personal_task_extension_requests','personal_task_extension_create_own'),
      ('personal_task_approvers','personal_task_approver_read'),
      ('personal_task_approvers','personal_task_approver_owner_insert'),
      ('personal_task_audit','personal_task_audit_select_own'),
      ('external_assessment_delegates','qlcl_authenticated_select'),
      ('emr_rollout_items','qlcl_authenticated_select'),
      ('emr_binding_groups','qlcl_authenticated_select'),
      ('emr_timeline_milestones','qlcl_authenticated_select'),
      ('hsba_checklist_items','qlcl_authenticated_select'),
      ('hsba_audits','qlcl_authenticated_select'),
      ('hsba_audit_item_results','qlcl_authenticated_select'),
      ('hsba_audit_findings','qlcl_authenticated_select'),
      ('procurement_requests','qlcl_authenticated_select'),
      ('physician_license_registrations','qlcl_authenticated_select'),
      ('incoming_documents','qlcl_authenticated_select'),
      ('procedure_trainings','qlcl_authenticated_select'),
      ('document_publications','qlcl_authenticated_select'),
      ('document_publication_acknowledgments','qlcl_authenticated_select'),
      ('hsba_checklist_templates','qlcl_authenticated_select'),
      ('hsba_checklist_versions','qlcl_authenticated_select'),
      ('procedure_training_attendees','qlcl_authenticated_select'),
      ('hsba_checklist_groups','qlcl_authenticated_select')
    );

  if v_count <> 23 then
    raise exception 'Expected 23 RLS policies flagged by auth_rls_initplan, found %', v_count;
  end if;

  for r in
    select p.tablename,p.policyname,p.qual,p.with_check
    from pg_policies p
    where p.schemaname='public'
      and (p.tablename,p.policyname) in (
        ('personal_task_extension_requests','personal_task_extension_read_own'),
        ('personal_task_extension_requests','personal_task_extension_create_own'),
        ('personal_task_approvers','personal_task_approver_read'),
        ('personal_task_approvers','personal_task_approver_owner_insert'),
        ('personal_task_audit','personal_task_audit_select_own'),
        ('external_assessment_delegates','qlcl_authenticated_select'),
        ('emr_rollout_items','qlcl_authenticated_select'),
        ('emr_binding_groups','qlcl_authenticated_select'),
        ('emr_timeline_milestones','qlcl_authenticated_select'),
        ('hsba_checklist_items','qlcl_authenticated_select'),
        ('hsba_audits','qlcl_authenticated_select'),
        ('hsba_audit_item_results','qlcl_authenticated_select'),
        ('hsba_audit_findings','qlcl_authenticated_select'),
        ('procurement_requests','qlcl_authenticated_select'),
        ('physician_license_registrations','qlcl_authenticated_select'),
        ('incoming_documents','qlcl_authenticated_select'),
        ('procedure_trainings','qlcl_authenticated_select'),
        ('document_publications','qlcl_authenticated_select'),
        ('document_publication_acknowledgments','qlcl_authenticated_select'),
        ('hsba_checklist_templates','qlcl_authenticated_select'),
        ('hsba_checklist_versions','qlcl_authenticated_select'),
        ('procedure_training_attendees','qlcl_authenticated_select'),
        ('hsba_checklist_groups','qlcl_authenticated_select')
      )
  loop
    v_qual := case when r.qual is null then null
                   else replace(r.qual,'auth.uid()','(select auth.uid())') end;
    v_check := case when r.with_check is null then null
                    else replace(r.with_check,'auth.uid()','(select auth.uid())') end;

    execute format(
      'alter policy %I on public.%I%s%s',
      r.policyname,
      r.tablename,
      case when v_qual is null then '' else format(' using (%s)',v_qual) end,
      case when v_check is null then '' else format(' with check (%s)',v_check) end
    );
  end loop;
end $$;
