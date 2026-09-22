-- Align the RCA save readiness signal with the investigation-completion gate.
-- Five Why is optional; when used, at least three levels are required.

undefined

revoke execute on function public.qlcl_save_incident_rca_structure_v1(uuid, uuid, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.qlcl_save_incident_rca_structure_v1(uuid, uuid, jsonb, jsonb, jsonb, jsonb) to postgres, service_role;
