create extension if not exists btree_gist;
alter table public.criterion_responsibilities
 drop constraint if exists criterion_responsibilities_no_overlap;
alter table public.criterion_responsibilities
 add constraint criterion_responsibilities_no_overlap
 exclude using gist (
   organization_id with =,
   criteria_version_id with =,
   criteria_item_id with =,
   daterange(
     coalesce(effective_from,make_date(work_year,1,1)),
     coalesce(effective_to + 1, make_date(work_year+1,1,1)),
     '[)'
   ) with &&
 );
