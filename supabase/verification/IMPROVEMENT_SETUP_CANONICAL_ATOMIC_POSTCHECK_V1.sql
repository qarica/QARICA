-- IMPROVEMENT_SETUP_CANONICAL_ATOMIC_POSTCHECK_V1
with fn as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_manage_improvement_setup_v1(uuid,uuid,text,jsonb,text)'
  ))) as body
)
select
  case when body like '%for update of ip%' then 'PASS' else 'FAIL' end as project_lock,
  case when body like '%project_objectives%' and body like '%project_milestones%' then 'PASS' else 'FAIL' end as canonical_tables,
  case when body like '%improvement_objective_add%' and body like '%improvement_milestone_add%' then 'PASS' else 'FAIL' end as audit_coverage,
  case when to_regclass('public.uq_project_objectives_project_normalized_text') is not null then 'PASS' else 'FAIL' end as objective_unique,
  case when to_regclass('public.uq_project_milestones_project_phase_normalized_title') is not null then 'PASS' else 'FAIL' end as milestone_unique,
  case when not has_function_privilege('authenticated',to_regprocedure('public.qlcl_manage_improvement_setup_v1(uuid,uuid,text,jsonb,text)'),'EXECUTE') then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege('service_role',to_regprocedure('public.qlcl_manage_improvement_setup_v1(uuid,uuid,text,jsonb,text)'),'EXECUTE') then 'PASS' else 'FAIL' end as service_role_allowed
from fn;
