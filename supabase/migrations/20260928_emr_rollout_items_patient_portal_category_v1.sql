-- Fix: PATIENT_PORTAL is one of the 9 EMR categories in src/lib/emr-categories.ts
-- (EMR_CATEGORIES, EMR_CATEGORY_KPIS, EMR_CATEGORY_FIELDS all define it) and the
-- /emr/patient-portal detail page and EMR overview readiness grid already render it,
-- but the original 20260921_emr_rollout_items_v1.sql check constraint only allowed
-- the 8 categories that existed at the time PATIENT_PORTAL was added. Any attempt to
-- create a Patient Portal rollout item currently fails at the database with a check
-- constraint violation. Widen the constraint to match the application's category list.

alter table public.emr_rollout_items drop constraint if exists emr_rollout_items_category_check;

alter table public.emr_rollout_items add constraint emr_rollout_items_category_check check (category in (
  'CHU_KY_SO','NHAP_LIEU','DAO_TAO','THIET_BI_YTE','QUY_TRINH','BIEU_MAU','LOI','THIET_BI_CNTT','PATIENT_PORTAL'
));
