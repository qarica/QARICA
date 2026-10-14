import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// record_personal_task_audit() và record_personal_task_extension_request() là
// trigger function (dùng TG_TABLE_NAME/OLD/NEW) nhưng không revoke EXECUTE khỏi
// PUBLIC khi tạo — Supabase Security Advisor cảnh báo anon/authenticated gọi được
// qua PostgREST RPC. Gọi trực tiếp lỗi ngay vì thiếu trigger context nên không khai
// thác được, nhưng vẫn thu hẹp bề mặt API bằng cách revoke rõ ràng.
describe("personal_task trigger function — revoke EXECUTE khỏi public/anon/authenticated", () => {
  const migration = readFileSync(
    "supabase/migrations/20261108_revoke_public_execute_personal_task_triggers_v1.sql",
    "utf8",
  );

  it("revoke execute trên record_personal_task_audit()", () => {
    expect(migration).toContain(
      "revoke execute on function public.record_personal_task_audit() from public, anon, authenticated;",
    );
  });

  it("revoke execute trên record_personal_task_extension_request()", () => {
    expect(migration).toContain(
      "revoke execute on function public.record_personal_task_extension_request() from public, anon, authenticated;",
    );
  });
});
