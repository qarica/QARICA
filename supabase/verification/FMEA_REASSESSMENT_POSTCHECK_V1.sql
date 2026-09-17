-- Run after 20260917_fmea_residual_reassessment_v1.sql.
-- All rows should return PASS/expected metadata; this script is read-only.
select case when to_regclass('public.fmea_mode_assessments') is not null then 'PASS' else 'FAIL' end as assessment_table;
select case when exists(select 1 from pg_trigger where tgname='trg_fmea_baseline_gate_v1' and not tgisinternal) then 'PASS' else 'FAIL' end as baseline_gate_trigger;
select case when to_regprocedure('public.qlcl_close_fmea_v1(uuid,uuid,text)') is not null then 'PASS' else 'FAIL' end as close_rpc;
select column_name,data_type,is_nullable from information_schema.columns where table_schema='public' and table_name='fmea_mode_assessments' order by ordinal_position;
select assessment_type,count(*) from fmea_mode_assessments group by assessment_type order by assessment_type;
