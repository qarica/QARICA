alter table public.external_assessment_scores enable row level security;
drop policy if exists qlcl_authenticated_select on public.external_assessment_scores;
create policy qlcl_authenticated_select on public.external_assessment_scores for select to authenticated using (true);
revoke insert, update, delete on public.external_assessment_scores from authenticated;
grant select on public.external_assessment_scores to authenticated;
