-- Optional tag linking a declared đầu việc (milestone) to one of the 9 EMR
-- categories (Quy trình, Biểu mẫu, Thiết bị y tế...) for context — NOT a
-- foreign key, since EMR_CATEGORIES is a fixed business-structure list in
-- code (src/lib/emr-categories.ts), not a database table; validated against
-- that list at the API layer, same as emr_rollout_items.category already is.
-- Nullable/optional per explicit request ("không bắt buộc").
alter table public.emr_timeline_milestones add column if not exists category text;
