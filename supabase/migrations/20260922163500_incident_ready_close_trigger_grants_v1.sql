-- Trigger-only function: keep execution out of the public API surface.
revoke execute on function public.qlcl_guard_incident_ready_to_close_v1() from public, anon, authenticated;
grant execute on function public.qlcl_guard_incident_ready_to_close_v1() to postgres, service_role;
