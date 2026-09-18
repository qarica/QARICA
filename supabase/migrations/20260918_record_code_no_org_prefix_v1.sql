-- Record codes no longer include the organization prefix.
-- Existing record_code values are intentionally preserved; only newly generated codes change format.
create or replace function public.next_record_code(
  p_org uuid,
  p_record_type text,
  p_work_year integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_seq integer;
  v_type text := upper(trim(coalesce(p_record_type, '')));
begin
  if p_org is null then
    raise exception 'Current user is not attached to an organization';
  end if;
  if v_type = '' then
    raise exception 'Record type is required';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_org::text || ':' || v_type || ':' || p_work_year::text)
  );

  select count(*) + 1
    into v_seq
  from public.records
  where organization_id = p_org
    and record_type = v_type
    and work_year = p_work_year;

  return v_type || '-' || p_work_year::text || '-' || lpad(v_seq::text, 4, '0');
end;
$function$;
