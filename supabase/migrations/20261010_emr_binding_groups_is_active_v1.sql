-- Requested: a dedicated "Quản lý nhóm gáy" screen (declare/update/delete/
-- ngừng sử dụng), separate from the master tree page (which is only for
-- reordering forms within a gáy, not managing the gáy catalog itself).
-- "Ngừng sử dụng" (deactivate) must be a soft flag, not a delete — existing
-- Biểu mẫu items keep storing the group name as plain text in
-- details.binding_group, so removing the row would orphan nothing
-- technically, but hiding it from new assignments without losing the
-- already-assigned forms' grouping is the safer default a real delete
-- cannot offer.
alter table public.emr_binding_groups add column if not exists is_active boolean not null default true;
