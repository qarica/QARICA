-- SAFETY_ALERT_PERMISSIONS_POSTCHECK_V1
select
  case when exists(select 1 from public.permissions where code='safety_alert.view' and is_active) then 'PASS' else 'FAIL' end as view_permission,
  case when exists(select 1 from public.permissions where code='safety_alert.edit' and is_active) then 'PASS' else 'FAIL' end as edit_permission,
  case when exists(select 1 from public.permissions where code='safety_alert.publish' and is_active) then 'PASS' else 'FAIL' end as publish_permission,
  case when not exists(
    select 1
    from public.role_permissions old_rp
    join public.permissions old_p on old_p.id=old_rp.permission_id and old_p.code='incident.investigate'
    where not exists (
      select 1 from public.role_permissions new_rp
      join public.permissions new_p on new_p.id=new_rp.permission_id and new_p.code='safety_alert.edit'
      where new_rp.role_id=old_rp.role_id
    )
  ) then 'PASS' else 'FAIL' end as edit_mapping_preserved,
  case when not exists(
    select 1
    from public.role_permissions old_rp
    join public.permissions old_p on old_p.id=old_rp.permission_id and old_p.code='incident.close'
    where not exists (
      select 1 from public.role_permissions new_rp
      join public.permissions new_p on new_p.id=new_rp.permission_id and new_p.code='safety_alert.publish'
      where new_rp.role_id=old_rp.role_id
    )
  ) then 'PASS' else 'FAIL' end as publish_mapping_preserved;
