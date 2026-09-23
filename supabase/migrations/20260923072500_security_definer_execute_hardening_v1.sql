-- Security hardening: remove accidental public/anonymous access to SECURITY DEFINER
-- helpers and remove direct authenticated execution from trigger/internal-only functions.
-- Keep the three user-facing permission/notification helpers callable by signed-in users.

revoke execute on function public.can_create_record_type(text) from public, anon;
grant execute on function public.can_create_record_type(text) to authenticated, service_role;

revoke execute on function public.has_permission(text) from public, anon;
grant execute on function public.has_permission(text) to authenticated, service_role;

revoke execute on function public.mark_own_notifications_read(uuid) from public, anon;
grant execute on function public.mark_own_notifications_read(uuid) to authenticated, service_role;

-- Existing application writers request codes server-side. Anonymous access is never valid.
revoke execute on function public.next_record_code(uuid, text, integer) from public, anon;
grant execute on function public.next_record_code(uuid, text, integer) to authenticated, service_role;

-- Trigger functions must not be callable through the Data API.
revoke execute on function public.qlcl_ensure_department_action_execution_v1() from public, anon, authenticated;
revoke execute on function public.qlcl_handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.qlcl_sync_record_link_traceability_v1() from public, anon, authenticated;

-- Recurring materialization is invoked only by authenticated server routes using
-- the service-role client. Direct client execution could otherwise supply another
-- actor UUID to a SECURITY DEFINER function.
revoke execute on function public.qlcl_materialize_recurring_run_v4(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.qlcl_materialize_recurring_run_v4(uuid, uuid)
  to service_role;
