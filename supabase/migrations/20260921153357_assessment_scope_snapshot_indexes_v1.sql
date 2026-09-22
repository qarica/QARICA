create index if not exists ix_assessment_round_criteria_item on public.assessment_round_criteria(criteria_item_id) where criteria_item_id is not null;
create index if not exists ix_assessment_round_criteria_legacy_item on public.assessment_round_criteria(criterion_id) where criteria_item_id is null and criterion_id is not null;
create index if not exists ix_assessment_round_criteria_lead on public.assessment_round_criteria(lead_department_id) where lead_department_id is not null;
create index if not exists ix_assessment_round_criteria_responsibility_source on public.assessment_round_criteria(responsibility_source_id) where responsibility_source_id is not null;
create index if not exists ix_criterion_responsibilities_effective_lookup on public.criterion_responsibilities(organization_id,criteria_version_id,criteria_item_id,effective_from,effective_to);
