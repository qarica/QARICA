# QARICA — Transaction Hardening Deploy V1

## Mục tiêu
Đưa các workflow đa bảng rủi ro cao sang PostgreSQL transaction/RPC để toàn bộ thay đổi **commit cùng nhau hoặc rollback cùng nhau**. Tài liệu này là runbook triển khai; nó **không phải bằng chứng migration đã được áp**.

## Điều kiện trước khi chạy
1. GitHub Quality Gate của commit chuẩn bị triển khai phải PASS: Unit tests → Lint → Production build.
2. Có backup database theo `docs/PRODUCTION_OPERATIONS_RUNBOOK_V1.md`.
3. Ghi lại thời điểm backup và người thực hiện.
4. Không chạy khi đang có nhiều người thao tác các workflow liên quan.
5. Nếu preflight hoặc bất kỳ migration nào báo duplicate/integrity error: **DỪNG**, không xóa dữ liệu để ép migration chạy.

## Bước 0 — Preflight read-only
Trước mọi migration, chạy nguyên file:

`supabase/verification/TRANSACTION_HARDENING_PREFLIGHT_V1.sql`

Chỉ tiếp tục khi kết quả có:

`TRANSACTION_HARDENING_PREFLIGHT_PASS`

Preflight kiểm tra bảng nền tảng, RPC cấp mã, duplicate business key, orphan canonical link và integrity nền tảng của phân quyền người dùng. File kết thúc bằng `ROLLBACK` nên không sửa dữ liệu.

## Thứ tự migration bắt buộc
Sau preflight PASS, chạy nguyên file, lần lượt từ 1 đến 12 trong Supabase SQL Editor:

1. `supabase/migrations/20260914_qlcl_transaction_hardening_v1.sql`
   - Finding → CAPA atomic
   - chặn một Finding sinh nhiều CAPA

2. `supabase/migrations/20260914_external_assessment_transaction_v1.sql`
   - External Assessment gap → Finding atomic
   - chặn một tiêu chí của một đợt sinh Finding trùng

3. `supabase/migrations/20260914_inspection_countdown_transaction_v1.sql`
   - Inspection countdown → Actions/links/notifications atomic
   - chặn trùng offset D-30…D+7

4. `supabase/migrations/20260914_workflow_close_transactions_v1.sql`
   - Finding ACCEPT/CLOSE
   - CAPA CLOSE
   - Inspection CLOSE

5. `supabase/migrations/20260914_operational_transactions_v2.sql`
   - Improvement Proposal → Project
   - Audit CLOSE
   - Report SUBMIT/version
   - Report CONFIRM_RECEIVED/CLOSE

6. `supabase/migrations/20260914_incident_transactions_v1.sql`
   - Incident START_INVESTIGATION
   - Incident COMPLETE_INVESTIGATION
   - Incident CLOSE
   - chặn nhiều investigation `IN_PROGRESS` cùng lúc

7. `supabase/migrations/20260914_risk_fmea_directive_transactions_v1.sql`
   - Risk ACCEPT
   - Risk RETIRE
   - FMEA CLOSE
   - Directive COMPLETE

8. `supabase/migrations/20260914_improvement_monitoring_transactions_v1.sql`
   - Improvement Project CLOSE
   - Monitoring 5S initial responses + round state atomic
   - Monitoring Recheck corrections + round state atomic
   - Monitoring QLCL confirmation atomic

9. `supabase/migrations/20260914_record_lifecycle_transaction_v1.sql`
   - CANCEL / ARCHIVE hồ sơ toàn cục
   - đồng bộ workflow con + Registry + status history + audit trong cùng transaction
   - giữ nguyên mapping lifecycle hiện hành, không tự mở rộng loại hồ sơ được hủy

10. `supabase/migrations/20260914_linked_action_transaction_v1.sql`
   - tạo generic linked Action: Registry + `actions` + canonical `HAS_ACTION`
   - tạo specialized link cho Directive/Finding/CAPA/Risk/Inspection
   - notification + audit cùng transaction
   - PROGRAM cố ý không đi đường generic; kế hoạch dùng `program_action_links` riêng

11. `supabase/migrations/20260914_plan_action_transaction_v1.sql`
   - tạo Action của Kế hoạch trong một transaction
   - giữ `program_action_links` cho progress semantics
   - đồng thời tạo canonical `record_links.HAS_ACTION` cho traceability
   - notification + audit cùng transaction

12. `supabase/migrations/20260914_admin_user_access_transaction_v1.sql`
   - cập nhật profile + organization + roles + scopes + checkbox permission overrides trong một transaction
   - chặn target user thuộc organization khác
   - chặn primary department / scope department ngoài organization hoặc đã inactive
   - validate role và permission trước khi thay thế cấu hình quyền
   - RPC chỉ `service_role` được EXECUTE; `anon` và `authenticated` bị revoke

Mỗi file tự `BEGIN`/`COMMIT`. Không gộp thủ công từng đoạn nhỏ.

### Lưu ý riêng với Monitoring và Storage
PostgreSQL không thể rollback file object trong Supabase Storage. Vì vậy Monitoring dùng mô hình:
1. upload ảnh vào bucket dưới trạng thái Evidence `PENDING`;
2. commit toàn bộ dữ liệu nghiệp vụ bằng RPC transaction;
3. nếu transaction thất bại, API thực hiện cleanup evidence row + storage object best-effort;
4. khi QLCL xác nhận đợt giám sát, evidence liên quan mới được chuyển `VALID`.

Như vậy dữ liệu nghiệp vụ vẫn atomic; Storage được xử lý bằng compensation thay vì giả định có distributed transaction.

### Lưu ý riêng với Quản trị người dùng
- PATCH phân quyền **fail-closed**: nếu `qlcl_set_user_access_v1` chưa tồn tại thì API trả `503` và không ghi dữ liệu.
- Không dùng lại chuỗi legacy `delete roles/scopes → insert lại`, vì lỗi giữa chừng có thể làm tài khoản mất một phần quyền.
- POST tạo user vẫn tạo Auth user bằng Supabase Admin; nếu bước cấu hình DB thất bại thì API phải xóa Auth user vừa tạo để tránh tài khoản nửa cấu hình.
- Mọi target user phải được caller nhìn thấy qua RLS và thuộc cùng organization trước khi service-role mutation chạy.

## Postcheck bắt buộc
Sau 12 migration, chạy nguyên file:

`supabase/verification/TRANSACTION_HARDENING_POSTCHECK_V1.sql`

Kết quả hợp lệ phải có:
- `TRANSACTION_HARDENING_POSTCHECK_PASS`
- `verified_rpc_count = 25`
- `verified_unique_index_count = 6`
- không duplicate business key
- `anon` và `authenticated` không có EXECUTE trực tiếp vào SECURITY DEFINER mutation RPC
- `service_role` có EXECUTE

Nếu postcheck không PASS: migration **không được đánh dấu hoàn tất** và không tiếp tục production smoke test.

## Cơ chế thực thi app
Các workflow đa bảng trọng yếu dùng **canonical atomic RPC + fail-closed**:
1. API gọi transaction RPC chuẩn;
2. RPC thành công → trả `transaction: "atomic"`;
3. nếu RPC chưa được triển khai, thiếu function hoặc transaction lỗi → API từ chối mutation; không chạy chuỗi write rời rạc thay thế;
4. legacy fallback đa bảng đã được loại khỏi các workflow Production đã harden;
5. ngoại lệ duy nhất là tài nguyên ngoài PostgreSQL như Storage object: DB vẫn atomic, còn file mới upload được cleanup best-effort nếu transaction thất bại.

Mục tiêu là không che giấu lỗi triển khai, không double-write và không tạo trạng thái Registry/domain/link/history lệch nhau.

## Smoke test sau migration
Không dùng dữ liệu production quan trọng để thử phá gate. Dùng hồ sơ test/pilot có kiểm soát và kiểm tra tối thiểu:
- Finding ACCEPT đóng đồng thời Finding + Registry + history.
- Finding → CAPA chỉ sinh 01 CAPA khi retry.
- External Assessment cùng `criterion_ref` không sinh Finding lần hai.
- Inspection countdown retry không sinh Action trùng offset.
- CAPA/Inspection/Audit/FMEA/Directive close cập nhật đồng bộ domain + Registry.
- Proposal retry không tạo project thứ hai.
- Improvement Project chỉ close khi closure review gần nhất = `ACHIEVED`, Action hoàn tất và có Evidence.
- Report submission tăng version tuần tự và không tạo cùng version.
- Incident không thể có hai investigation `IN_PROGRESS`; close yêu cầu Action + Evidence.
- Risk ACCEPT tạo acceptance + status đồng bộ; RETIRE đồng bộ Risk + Registry.
- Monitoring initial save không để response nửa chừng nếu round transition lỗi.
- Monitoring Recheck hoặc commit toàn bộ correction hoặc rollback toàn bộ correction DB.
- Monitoring Confirm cập nhật confirmation marker + round status đồng thời.
- Nếu Monitoring RPC lỗi sau upload ảnh, không còn evidence/storage object mới bị bỏ rơi sau cleanup.
- CANCEL/ARCHIVE cập nhật workflow con + Registry + history + audit đồng bộ; lỗi một bước phải rollback toàn bộ DB transition.
- ARCHIVE hồ sơ đã ARCHIVED phải idempotent, không sinh history/audit trùng.
- Generic linked Action tạo đồng thời Action Registry + domain row + canonical link + specialized link khi có.
- Payload department/assignee khác organization bị chặn trong API và recheck ở RPC.
- `plans.manage` không được dùng để tạo generic Action từ Finding/CAPA/Risk/Incident; PROGRAM dùng API kế hoạch riêng.
- Plan Action chỉ tạo khi caller nhìn thấy kế hoạch qua RLS, kế hoạch `IN_PROGRESS`, và Action có đồng thời `program_action_links` + canonical `HAS_ACTION`.
- Plan Action lỗi giữa các bước phải rollback toàn bộ DB state, không để Action mồ côi làm sai % tiến độ.
- PATCH user ngoài RLS/cùng organization bị 403/404 trước service-role mutation.
- `primary_department_id` hoặc `scope_department_ids` khác organization bị transaction từ chối và không thay đổi roles/scopes cũ.
- Role/permission invalid làm toàn bộ cập nhật user rollback; không có trạng thái “profile mới nhưng quyền cũ/mất scope”.
- Gọi trực tiếp `qlcl_set_user_access_v1` bằng `authenticated`/`anon` bị permission denied.
- Khi RPC admin user chưa tồn tại, PATCH trả 503 và kiểm tra số row roles/scopes/permissions trước-sau không đổi.
- Audit log có `request_meta.transaction` tương ứng ở đường RPC nơi được thiết kế ghi audit.

## Rollback
Không drop function/index tùy tiện trên production khi có lỗi nghiệp vụ sau migration.
1. dừng thao tác workflow bị ảnh hưởng;
2. giữ nguyên audit/log;
3. xác định lỗi nằm ở code hay DB function;
4. nếu cần rollback database, thực hiện theo backup/restore runbook và change window;
5. sau restore phải chạy lại kiểm tra integrity trước khi mở hệ thống.

## Tiêu chí đánh dấu hoàn tất
Chỉ ghi `DATABASE TRANSACTION HARDENING: PASS` khi đồng thời có:
- backup evidence;
- preflight PASS;
- 12 migration chạy thành công;
- postcheck PASS;
- smoke test PASS;
- không có duplicate/orphan mới;
- production app đang dùng RPC atomic như kỳ vọng.

Cho đến lúc đó, trạng thái chính xác là **PREPARED — NOT APPLIED**.
