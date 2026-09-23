-- Multi-tenant read boundary, batch 4: D/E/F child tables.
-- Global reusable master definitions (organization_id is null) stay visible,
-- while operational rows are always constrained to the active organization.

-- D: Criteria catalogue and assessment execution.
drop policy if exists qlcl_authenticated_select on public.criteria_set_versions;
create policy qlcl_authenticated_select
on public.criteria_set_versions for select to authenticated
using (
  exists (
    select 1 from public.criteria_sets cs
    where cs.id = criteria_set_versions.criteria_set_id
      and (cs.organization_id is null or cs.organization_id = private.current_organization_id())
  )
);

drop policy if exists qlcl_authenticated_select on public.criteria_items;
create policy qlcl_authenticated_select
on public.criteria_items for select to authenticated
using (
  exists (
    select 1
    from public.criteria_set_versions csv
    join public.criteria_sets cs on cs.id = csv.criteria_set_id
    where csv.id = criteria_items.criteria_version_id
      and (cs.organization_id is null or cs.organization_id = private.current_organization_id())
  )
);

drop policy if exists qlcl_authenticated_select on public.assessment_round_criteria;
create policy qlcl_authenticated_select
on public.assessment_round_criteria for select to authenticated
using (
  exists (
    select 1
    from public.assessment_rounds ar
    join public.records r on r.id = ar.record_id
    where ar.id = assessment_round_criteria.assessment_round_id
      and r.organization_id = private.current_organization_id()
  )
);

drop policy if exists qlcl_authenticated_select on public.criterion_assessments;
create policy qlcl_authenticated_select
on public.criterion_assessments for select to authenticated
using (
  exists (
    select 1
    from public.assessment_rounds ar
    join public.records r on r.id = ar.record_id
    where ar.id = criterion_assessments.assessment_round_id
      and r.organization_id = private.current_organization_id()
  )
);

drop policy if exists qlcl_authenticated_select on public.external_assessment_scores;
create policy qlcl_authenticated_select
on public.external_assessment_scores for select to authenticated
using (
  exists (
    select 1
    from public.external_assessment_events ea
    join public.records r on r.id = ea.record_id
    where ea.id = external_assessment_scores.external_assessment_event_id
      and r.organization_id = private.current_organization_id()
  )
);

-- E: Checklist catalogue and monitoring execution.
drop policy if exists qlcl_authenticated_select on public.checklist_versions;
create policy qlcl_authenticated_select
on public.checklist_versions for select to authenticated
using (
  exists (
    select 1 from public.checklist_templates ct
    where ct.id = checklist_versions.checklist_template_id
      and (ct.organization_id is null or ct.organization_id = private.current_organization_id())
  )
);

drop policy if exists qlcl_authenticated_select on public.checklist_sections;
create policy qlcl_authenticated_select
on public.checklist_sections for select to authenticated
using (
  exists (
    select 1
    from public.checklist_versions cv
    join public.checklist_templates ct on ct.id = cv.checklist_template_id
    where cv.id = checklist_sections.checklist_version_id
      and (ct.organization_id is null or ct.organization_id = private.current_organization_id())
  )
);

drop policy if exists qlcl_authenticated_select on public.checklist_items;
create policy qlcl_authenticated_select
on public.checklist_items for select to authenticated
using (
  exists (
    select 1
    from public.checklist_versions cv
    join public.checklist_templates ct on ct.id = cv.checklist_template_id
    where cv.id = checklist_items.checklist_version_id
      and (ct.organization_id is null or ct.organization_id = private.current_organization_id())
  )
);

drop policy if exists qlcl_authenticated_select on public.checklist_item_options;
create policy qlcl_authenticated_select
on public.checklist_item_options for select to authenticated
using (
  exists (
    select 1
    from public.checklist_items ci
    join public.checklist_versions cv on cv.id = ci.checklist_version_id
    join public.checklist_templates ct on ct.id = cv.checklist_template_id
    where ci.id = checklist_item_options.checklist_item_id
      and (ct.organization_id is null or ct.organization_id = private.current_organization_id())
  )
);

drop policy if exists qlcl_authenticated_select on public.monitoring_assignments;
create policy qlcl_authenticated_select
on public.monitoring_assignments for select to authenticated
using (
  exists (
    select 1
    from public.monitoring_rounds mr
    join public.records r on r.id = mr.record_id
    where mr.id = monitoring_assignments.monitoring_round_id
      and r.organization_id = private.current_organization_id()
  )
);

drop policy if exists qlcl_authenticated_select on public.checklist_responses;
create policy qlcl_authenticated_select
on public.checklist_responses for select to authenticated
using (
  exists (
    select 1
    from public.monitoring_rounds mr
    join public.records r on r.id = mr.record_id
    where mr.id = checklist_responses.monitoring_round_id
      and r.organization_id = private.current_organization_id()
  )
);

drop policy if exists qlcl_authenticated_select on public.response_corrections;
create policy qlcl_authenticated_select
on public.response_corrections for select to authenticated
using (
  exists (
    select 1
    from public.checklist_responses cr
    join public.monitoring_rounds mr on mr.id = cr.monitoring_round_id
    join public.records r on r.id = mr.record_id
    where cr.id = response_corrections.response_id
      and r.organization_id = private.current_organization_id()
  )
);

-- F: Indicator catalogue and assignments.
drop policy if exists qlcl_authenticated_select on public.indicator_definition_versions;
create policy qlcl_authenticated_select
on public.indicator_definition_versions for select to authenticated
using (
  exists (
    select 1 from public.indicator_definitions d
    where d.id = indicator_definition_versions.indicator_definition_id
      and (d.organization_id is null or d.organization_id = private.current_organization_id())
  )
);

drop policy if exists qlcl_authenticated_select on public.indicator_assignments;
create policy qlcl_authenticated_select
on public.indicator_assignments for select to authenticated
using (
  exists (
    select 1 from public.departments d
    where d.id = indicator_assignments.department_id
      and d.organization_id = private.current_organization_id()
  )
);

revoke select on
  public.criteria_set_versions,
  public.criteria_items,
  public.assessment_round_criteria,
  public.criterion_assessments,
  public.external_assessment_scores,
  public.checklist_versions,
  public.checklist_sections,
  public.checklist_items,
  public.checklist_item_options,
  public.monitoring_assignments,
  public.checklist_responses,
  public.response_corrections,
  public.indicator_definition_versions,
  public.indicator_assignments
from anon;
