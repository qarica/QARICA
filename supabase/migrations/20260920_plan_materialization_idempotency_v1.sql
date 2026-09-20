-- Prevent the same source task in one plan from materializing more than once.
-- plan_task_client_id is stored in records.metadata by the plan materializer.
create unique index if not exists records_plan_task_materialization_unique
on public.records (
  ((metadata->>'program_id')::uuid),
  (metadata->>'plan_task_client_id')
)
where record_type='ACTION'
  and lifecycle_status='ACTIVE'
  and metadata->>'origin'='PLAN_AUTOMATION'
  and nullif(metadata->>'program_id','') is not null
  and nullif(metadata->>'plan_task_client_id','') is not null;

comment on index public.records_plan_task_materialization_unique is
'Idempotency guard: one active materialized Action per program_id + plan_task_client_id.';
