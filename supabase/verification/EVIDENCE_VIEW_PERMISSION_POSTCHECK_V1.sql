-- EVIDENCE_VIEW_PERMISSION_POSTCHECK_V1
select
  case when exists(select 1 from public.permissions where code='evidence.view' and is_active) then 'PASS' else 'FAIL' end as permission_exists,
  case when not exists(
    select 1
    from public.role_permissions old_rp
    join public.permissions old_p on old_p.id=old_rp.permission_id and old_p.code='tasks.view'
    where not exists (
      select 1
      from public.role_permissions new_rp
      join public.permissions new_p on new_p.id=new_rp.permission_id and new_p.code='evidence.view'
      where new_rp.role_id=old_rp.role_id
    )
  ) then 'PASS' else 'FAIL' end as mapping_preserved;
