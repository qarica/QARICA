create or replace view public.vw_work_items
with (security_invoker = true) as
select
  'ACTION'::text source_type,
  a.id source_id,
  r.id record_id,
  r.organization_id,
  a.assignee_user_id owner_user_id,
  a.lead_department_id owner_department_id,
  a.title,
  a.description,
  a.priority,
  a.workflow_status source_status,
  case
    when a.workflow_status in ('COMPLETED','CLOSED') then 'DONE'
    when a.workflow_status in ('CANCELLED','NOT_APPLICABLE') then 'CANCELLED'
    else 'ACTIVE'
  end::text normalized_state,
  a.start_date::timestamptz start_at,
  a.due_date::timestamptz due_at,
  a.actual_end_date::timestamptz completed_at,
  r.created_at,
  r.updated_at,
  ('/tasks/' || r.id::text)::text target_route,
  jsonb_build_object('record_type',r.record_type,'record_code',r.record_code) metadata
from public.actions a
join public.records r on r.id = a.record_id
where r.lifecycle_status='ACTIVE'

union all
select 'PERSONAL_REMINDER',pr.id,null::uuid,pr.organization_id,pr.owner_user_id,null::uuid,
  pr.title,pr.note,pr.priority,pr.status,
  case when pr.status='COMPLETED' then 'DONE' when pr.status='CANCELLED' then 'CANCELLED' else 'ACTIVE' end,
  null::timestamptz,pr.due_at,pr.completed_at,pr.created_at,pr.updated_at,'/tasks',
  jsonb_build_object('category',pr.category,'remind_at',pr.remind_at)
from public.personal_reminders pr

union all
select 'PERSONAL_TASK',pw.id,null::uuid,null::uuid,pw.owner_user_id,null::uuid,
  pw.title,pw.content,null::text,pw.status,
  case when pw.status='COMPLETED' then 'DONE' when pw.status='CANCELLED' then 'CANCELLED' else 'ACTIVE' end,
  null::timestamptz,pw.due_at,pw.completed_at,pw.created_at,pw.updated_at,'/me',
  jsonb_build_object('item_type',pw.item_type,'category',pw.category)
from public.personal_workspace_items pw
where pw.item_type='TASK'

union all
select 'EMR',e.id,null::uuid,e.organization_id,null::uuid,e.owner_department_id,
  e.title,e.description,e.priority,e.status,
  case when e.status='DONE' then 'DONE' when e.status='CANCELLED' then 'CANCELLED' else 'ACTIVE' end,
  null::timestamptz,e.due_date::timestamptz,e.verified_at,e.created_at,e.updated_at,'/emr',
  jsonb_build_object('category',e.category,'department_ids',e.department_ids,'publish_status',e.publish_status)
from public.emr_rollout_items e
where not (e.category='BIEU_MAU' and e.publish_status='DRAFT')

union all
select 'RECORD',r.id,r.id,r.organization_id,f.owner_user_id,f.lead_department_id,
  r.title,f.description,f.severity,f.workflow_status,
  case when f.workflow_status in ('COMPLETED','CLOSED','VERIFIED') or r.lifecycle_status='CLOSED' then 'DONE'
       when f.workflow_status in ('CANCELLED','NOT_APPLICABLE') or r.lifecycle_status='CANCELLED' then 'CANCELLED'
       else 'ACTIVE' end,
  f.identified_at,f.due_date::timestamptz,r.closed_at,r.created_at,r.updated_at,
  ('/findings/'||r.id::text),
  jsonb_build_object('record_type','FINDING','record_code',r.record_code,'domain_id',f.id)
from public.findings f join public.records r on r.id=f.record_id
where r.lifecycle_status in ('ACTIVE','CLOSED')

union all
select 'RECORD',r.id,r.id,r.organization_id,c.owner_user_id,c.lead_department_id,
  r.title,c.problem_statement,c.priority,c.workflow_status,
  case when c.workflow_status in ('COMPLETED','CLOSED','VERIFIED') or r.lifecycle_status='CLOSED' then 'DONE'
       when c.workflow_status in ('CANCELLED','NOT_APPLICABLE') or r.lifecycle_status='CANCELLED' then 'CANCELLED'
       else 'ACTIVE' end,
  null::timestamptz,c.implementation_due_date::timestamptz,c.closed_at,r.created_at,r.updated_at,
  ('/capa/'||r.id::text),
  jsonb_build_object('record_type','CAPA','record_code',r.record_code,'domain_id',c.id)
from public.capas c join public.records r on r.id=c.record_id
where r.lifecycle_status in ('ACTIVE','CLOSED')

union all
select 'RECORD',r.id,r.id,r.organization_id,k.owner_user_id,k.owner_department_id,
  r.title,k.risk_event,null::text,k.workflow_status,
  case when k.workflow_status in ('COMPLETED','CLOSED','RETIRED') or r.lifecycle_status='CLOSED' then 'DONE'
       when k.workflow_status in ('CANCELLED','NOT_APPLICABLE') or r.lifecycle_status='CANCELLED' then 'CANCELLED'
       else 'ACTIVE' end,
  k.identified_at,k.next_review_date::timestamptz,k.retired_at,r.created_at,r.updated_at,
  ('/risks/'||r.id::text),
  jsonb_build_object('record_type','RISK','record_code',r.record_code,'domain_id',k.id)
from public.risks k join public.records r on r.id=k.record_id
where r.lifecycle_status in ('ACTIVE','CLOSED')

union all
select 'RECORD',r.id,r.id,r.organization_id,d.owner_user_id,d.lead_department_id,
  r.title,d.summary,d.priority,d.workflow_status,
  case when d.workflow_status in ('COMPLETED','CLOSED') or r.lifecycle_status='CLOSED' then 'DONE'
       when d.workflow_status in ('CANCELLED','NOT_APPLICABLE') or r.lifecycle_status='CANCELLED' then 'CANCELLED'
       else 'ACTIVE' end,
  d.received_date::timestamptz,coalesce(d.implementation_due_date,d.report_due_date)::timestamptz,r.closed_at,r.created_at,r.updated_at,
  ('/directives/'||r.id::text),
  jsonb_build_object('record_type','DIRECTIVE','record_code',r.record_code,'domain_id',d.id)
from public.external_directives d join public.records r on r.id=d.record_id
where r.lifecycle_status in ('ACTIVE','CLOSED')

union all
select 'RECORD',r.id,r.id,r.organization_id,ro.preparer_user_id,ro.preparing_department_id,
  r.title,ro.notes,null::text,ro.workflow_status,
  case when ro.workflow_status in ('COMPLETED','CLOSED','SUBMITTED') or r.lifecycle_status='CLOSED' then 'DONE'
       when ro.workflow_status in ('CANCELLED','NOT_APPLICABLE') or r.lifecycle_status='CANCELLED' then 'CANCELLED'
       else 'ACTIVE' end,
  ro.reporting_period_start::timestamptz,ro.due_date::timestamptz,r.closed_at,r.created_at,r.updated_at,
  ('/reports/'||r.id::text),
  jsonb_build_object('record_type','REPORT','record_code',r.record_code,'domain_id',ro.id)
from public.reporting_obligations ro join public.records r on r.id=ro.record_id
where r.lifecycle_status in ('ACTIVE','CLOSED')

union all
select 'RECORD',r.id,r.id,r.organization_id,p.project_leader_user_id,p.lead_department_id,
  p.title,p.problem_statement,null::text,p.workflow_status,
  case when p.workflow_status in ('COMPLETED','CLOSED') or r.lifecycle_status='CLOSED' then 'DONE'
       when p.workflow_status in ('CANCELLED','NOT_APPLICABLE') or r.lifecycle_status='CANCELLED' then 'CANCELLED'
       else 'ACTIVE' end,
  p.start_date::timestamptz,p.target_end_date::timestamptz,p.actual_end_date::timestamptz,r.created_at,r.updated_at,
  ('/improvement/projects/'||r.id::text),
  jsonb_build_object('record_type','IMPROVEMENT_PROJECT','record_code',r.record_code,'domain_id',p.id)
from public.improvement_projects p join public.records r on r.id=p.record_id
where r.lifecycle_status in ('ACTIVE','CLOSED')

union all
select 'RECORD',r.id,r.id,r.organization_id,ip.proposer_user_id,ip.proposing_department_id,
  ip.title,ip.problem_description,null::text,ip.workflow_status,
  case when ip.workflow_status in ('COMPLETED','CLOSED','APPROVED','REJECTED') or r.lifecycle_status='CLOSED' then 'DONE'
       when ip.workflow_status in ('CANCELLED','NOT_APPLICABLE') or r.lifecycle_status='CANCELLED' then 'CANCELLED'
       else 'ACTIVE' end,
  ip.submitted_at,null::timestamptz,r.closed_at,r.created_at,r.updated_at,
  ('/improvement/proposals/'||r.id::text),
  jsonb_build_object('record_type','IMPROVEMENT_PROPOSAL','record_code',r.record_code,'domain_id',ip.id)
from public.improvement_proposals ip join public.records r on r.id=ip.record_id
where r.lifecycle_status in ('ACTIVE','CLOSED');

revoke all on public.vw_work_items from anon;
grant select on public.vw_work_items to authenticated;
