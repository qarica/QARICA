-- RLS_INITPLAN_REMAINING_V2_POSTCHECK_V1
with expected(tablename,policyname) as (
  values
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
),
state as (
  select e.tablename,e.policyname,p.qual,p.with_check
  from expected e
  left join pg_policies p
    on p.schemaname='public'
   and p.tablename=e.tablename
   and p.policyname=e.policyname
)
select
  case when count(*)=23 then 'PASS' else 'FAIL' end as policy_count,
  case when count(*) filter (
    where (qual is not null and lower(qual) like '%select auth.uid()%')
       or (qual is null and with_check is not null and lower(with_check) like '%select auth.uid()%')
  )=23 then 'PASS' else 'FAIL' end as initplan_wrapped,
  case when count(*) filter (
    where with_check is not null and lower(with_check) not like '%select auth.uid()%'
  )=0 then 'PASS' else 'FAIL' end as with_check_initplan_wrapped
from state;
