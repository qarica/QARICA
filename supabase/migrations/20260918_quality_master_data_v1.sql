-- Quality master-data V1: criteria hierarchy, indicator version metadata, checklist source codes,
-- and service-role-only standardized internal code generation.
alter table public.criteria_sets
  add column if not exists description text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.criteria_set_versions
  add column if not exists effective_to date,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.criteria_items
  add column if not exists parent_criteria_item_id uuid references public.criteria_items(id),
  add column if not exists item_type text not null default 'CRITERION',
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.indicator_definitions
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.indicator_definition_versions
  add column if not exists effective_from date,
  add column if not exists effective_to date,
  add column if not exists published_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.checklist_templates
  add column if not exists source_code text,
  add column if not exists code_scheme_version integer not null default 2;

update public.checklist_templates
set source_code=code
where source_code is null and nullif(trim(code),'') is not null;

update public.checklist_templates t
set organization_id=d.organization_id,updated_at=now()
from public.departments d
where t.organization_id is null
  and t.owner_department_id=d.id
  and d.organization_id is not null;

create index if not exists idx_criteria_items_parent on public.criteria_items(parent_criteria_item_id);
create index if not exists idx_criteria_items_version_active on public.criteria_items(criteria_version_id,is_active);
create index if not exists idx_checklist_templates_source_code on public.checklist_templates(source_code);

create unique index if not exists uq_criteria_sets_org_code_ci
  on public.criteria_sets(organization_id,upper(code))
  where code is not null and trim(code)<>'';
create unique index if not exists uq_indicator_definitions_org_code_ci
  on public.indicator_definitions(organization_id,upper(code))
  where code is not null and trim(code)<>'';
create unique index if not exists uq_checklist_templates_org_code_ci
  on public.checklist_templates(organization_id,upper(code))
  where code is not null and trim(code)<>'';
create unique index if not exists uq_indicator_definition_versions_no
  on public.indicator_definition_versions(indicator_definition_id,version_no);
create unique index if not exists uq_criteria_items_version_code_ci
  on public.criteria_items(criteria_version_id,upper(code))
  where code is not null and trim(code)<>'';

create unique index if not exists uq_criteria_sets_org_code_ci on public.criteria_sets(organization_id,upper(code)) where code is not null and trim(code)<>'';
create unique index if not exists uq_indicator_definitions_org_code_ci on public.indicator_definitions(organization_id,upper(code)) where code is not null and trim(code)<>'';
create unique index if not exists uq_checklist_templates_org_code_ci on public.checklist_templates(organization_id,upper(code)) where code is not null and trim(code)<>'';
create unique index if not exists uq_indicator_definition_versions_no on public.indicator_definition_versions(indicator_definition_id,version_no);
create unique index if not exists uq_criteria_items_version_code_ci on public.criteria_items(criteria_version_id,upper(code)) where code is not null and trim(code)<>'';

create or replace function public.qlcl_next_master_code_v1(
  p_org uuid,
  p_kind text,
  p_work_year integer default extract(year from current_date)::integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_kind text:=upper(trim(coalesce(p_kind,'')));
  v_prefix text;
  v_seq integer;
begin
  if p_org is null then raise exception 'Organization is required'; end if;
  if v_kind='CRITERIA_SET' then v_prefix:='TC';
  elsif v_kind='INDICATOR' then v_prefix:='CS';
  elsif v_kind='CHECKLIST' then v_prefix:='BK';
  else raise exception 'Unsupported master code kind: %',v_kind;
  end if;

  perform pg_advisory_xact_lock(hashtext(p_org::text||':'||v_kind||':'||p_work_year::text));

  if v_kind='CRITERIA_SET' then
    select count(*)+1 into v_seq from public.criteria_sets
    where organization_id=p_org and code like v_prefix||'-'||p_work_year::text||'-%';
  elsif v_kind='INDICATOR' then
    select count(*)+1 into v_seq from public.indicator_definitions
    where organization_id=p_org and code like v_prefix||'-'||p_work_year::text||'-%';
  else
    select count(*)+1 into v_seq from public.checklist_templates
    where organization_id=p_org and code like v_prefix||'-'||p_work_year::text||'-%';
  end if;

  return v_prefix||'-'||p_work_year::text||'-'||lpad(v_seq::text,4,'0');
end;
$function$;

revoke all on function public.qlcl_next_master_code_v1(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.qlcl_next_master_code_v1(uuid,text,integer) to service_role;
