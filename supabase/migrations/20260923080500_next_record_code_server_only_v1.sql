-- next_record_code is an internal record-allocation helper.
-- No browser/client caller exists; do not expose p_org to authenticated RPC callers.
revoke execute on function public.next_record_code(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.next_record_code(uuid, text, integer)
  to service_role;
