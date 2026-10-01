-- The "Nhập liệu" (NHAP_LIEU) EMR category was removed from the application
-- (src/lib/emr-categories.ts no longer declares it) at explicit user request.
-- Per CLAUDE.md's single-source-of-truth rule: removing a category from the
-- UI must not leave its rows, or any file it owns in storage, stranded in
-- public.emr_rollout_items where nothing can view/manage them anymore.

-- 1. Remove any attached files these items own before deleting the rows —
--    storage objects are keyed by {org}/emr/{category}/{item_id}/... (see
--    src/app/api/emr/items/[id]/file/route.ts), so this only ever touches
--    objects that belonged to NHAP_LIEU items, nothing else.
delete from storage.objects
where bucket_id = 'qlcl-evidence'
  and name like '%/emr/NHAP_LIEU/%';

-- 2. Remove the rows themselves.
delete from public.emr_rollout_items where category = 'NHAP_LIEU';

-- 3. Narrow the check constraint to match the application's category list.
alter table public.emr_rollout_items drop constraint if exists emr_rollout_items_category_check;

alter table public.emr_rollout_items add constraint emr_rollout_items_category_check check (category in (
  'CHU_KY_SO','DAO_TAO','THIET_BI_YTE','QUY_TRINH','BIEU_MAU','LOI','THIET_BI_CNTT','PATIENT_PORTAL'
));
