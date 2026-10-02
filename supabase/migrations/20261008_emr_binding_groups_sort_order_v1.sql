-- "Khai báo nhóm gáy thiếu số thứ tự các nhóm gáy" — a declared Nhóm gáy had
-- no explicit display order (alphabetical only). Adds sort_order so the
-- catalog can be ordered the way the physical binding sequence actually
-- matters, same pattern as emr_timeline_milestones.sort_order.
alter table public.emr_binding_groups add column if not exists sort_order integer not null default 0;
