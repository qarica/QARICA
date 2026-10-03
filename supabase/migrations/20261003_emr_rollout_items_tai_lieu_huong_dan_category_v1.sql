-- New EMR category: "Tài liệu hướng dẫn" (TAI_LIEU_HUONG_DAN) — user-guide /
-- instruction documents, optionally linked to a specific Biểu mẫu item via
-- details.related_form_id (not mandatory — a guide can also cover a whole
-- process rather than one specific form; see src/lib/emr-categories.ts).
-- Widen the rollout items check constraint to match the application's
-- category list, same pattern as 20260928_emr_rollout_items_patient_portal_category_v1.sql.

alter table public.emr_rollout_items drop constraint if exists emr_rollout_items_category_check;

alter table public.emr_rollout_items add constraint emr_rollout_items_category_check check (category in (
  'CHU_KY_SO','DAO_TAO','THIET_BI_YTE','QUY_TRINH','BIEU_MAU','LOI','THIET_BI_CNTT','PATIENT_PORTAL','TAI_LIEU_HUONG_DAN'
));
