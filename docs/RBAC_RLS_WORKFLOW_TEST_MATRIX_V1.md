# QARICA — RBAC / RLS / Workflow Test Matrix V1

## Mục tiêu

Đây là quality gate bắt buộc trước Go-Live. Build thành công không thay thế được kiểm thử quyền, scope, transaction integrity và workflow.

## Vai trò cần kiểm
- ADMIN
- QLCL_MANAGER
- QLCL_STAFF
- DEPARTMENT_HEAD
- QUALITY_NETWORK
- ACTION_OWNER
- EXECUTIVE
- USER

## Scope cần kiểm
- SELF
- DEPARTMENT
- ASSIGNED
- MULTI_DEPARTMENT
- HOSPITAL
- SPECIFIC_RECORD

## Quy tắc khóa
- ADMIN là vai trò kỹ thuật, không tự động trở thành business actor.
- Quyền xem không đồng nghĩa quyền sửa.
- Biết UUID không được phép vượt RLS/scope.
- API dùng service/admin client phải kiểm quyền + organization + record visibility trước mutation.
- Mọi workflow state transition phải kiểm ở server, không tin client.
- SECURITY DEFINER mutation RPC chỉ `service_role` được EXECUTE; `anon` và `authenticated` phải bị revoke.
- Workflow đa bảng phải commit toàn bộ hoặc rollback toàn bộ; không chấp nhận Registry/domain/history lệch trạng thái.
- Retry phải idempotent ở các luồng có business key duy nhất.
- Cập nhật phân quyền người dùng phải fail-closed nếu atomic RPC chưa được triển khai; không dùng fallback delete/insert từng bảng.

## Ma trận kiểm thử tối thiểu

| ID | Tình huống | Kết quả mong đợi |
|---|---|---|
| SEC-01 | USER truy cập record ngoài scope bằng URL trực tiếp | 403/404, không lộ dữ liệu |
| SEC-02 | QUALITY_NETWORK khoa A truy cập record khoa B không được gán | Bị chặn |
| SEC-03 | DEPARTMENT_HEAD khoa A sửa record khoa B | Bị chặn |
| SEC-04 | ACTION_OWNER xem Action được giao | Được phép |
| SEC-05 | ACTION_OWNER tự đóng CAPA | Bị chặn nếu không có `capa.manage` |
| SEC-06 | ADMIN kỹ thuật không có business permission mở module nghiệp vụ | Không tự động được cấp quyền |
| SEC-07 | EXECUTIVE xem dashboard cấp tổ chức | Được phép theo permission, không tự sửa nghiệp vụ |
| SEC-08 | User gọi POST API workflow với record UUID ngoài scope | 403/404 |
| SEC-09 | User giả payload owner_department_id ngoài organization | Bị chặn |
| SEC-10 | User giả assignee_user_id ngoài organization | Bị chặn |
| SEC-11 | Record archived/closed bị gọi lệnh workflow tiếp | 409 |
| SEC-12 | Evidence private file không có quyền | Không sinh signed URL/không tải được |
| SEC-13 | `authenticated` gọi trực tiếp transaction RPC SECURITY DEFINER | Permission denied / không EXECUTE |
| SEC-14 | `anon` gọi trực tiếp transaction RPC SECURITY DEFINER | Permission denied / không EXECUTE |
| SEC-15 | API workflow dùng service role nhưng record ngoài RLS visibility của caller | 403/404 trước mutation |
| SEC-16 | Payload UUID thuộc organization khác | Bị chặn, không có cross-org mutation |
| SEC-17 | Admin biết UUID user của organization khác và gọi PATCH | 403/404 trước service-role mutation |
| SEC-18 | Admin gửi `primary_department_id` thuộc organization khác | Bị chặn; profile/roles/scopes/permissions không thay đổi |
| SEC-19 | Admin gửi `scope_department_ids` thuộc organization khác hoặc inactive | Bị chặn; không có partial permission update |
| SEC-20 | `authenticated` gọi trực tiếp `qlcl_set_user_access_v1` | Permission denied / không EXECUTE |
| SEC-21 | PATCH phân quyền khi RPC `qlcl_set_user_access_v1` chưa tồn tại | HTTP 503, không có mutation |

## Transaction / retry integrity

| ID | Tình huống | Kết quả mong đợi |
|---|---|---|
| TX-01 | Retry Finding → CAPA | Chỉ có 01 CAPA + 01 canonical link |
| TX-02 | Retry External Assessment gap cùng `criterion_ref` | Không sinh Finding thứ hai |
| TX-03 | Retry Inspection countdown | Không sinh Action trùng offset |
| TX-04 | Retry Proposal → Project | Không sinh Project thứ hai |
| TX-05 | Hai request Report SUBMIT cạnh tranh | Version tuần tự, không duplicate version |
| TX-06 | Incident START_INVESTIGATION retry/concurrent | Tối đa 01 investigation `IN_PROGRESS` |
| TX-07 | Lỗi giữa domain close và Registry close | Transaction rollback, hai trạng thái vẫn đồng nhất |
| TX-08 | Risk ACCEPT lỗi sau khi tạo acceptance | Không để acceptance mồ côi / status cũ được giữ |
| TX-09 | Monitoring initial save lỗi khi đổi round status | Không còn checklist responses nửa chừng |
| TX-10 | Monitoring Recheck lỗi ở một tiêu chí giữa batch | Không có correction một phần; toàn batch rollback/compensate |
| TX-11 | Monitoring RPC lỗi sau upload ảnh | Evidence/file PENDING vừa upload được cleanup best-effort, không tạo business state nửa chừng |
| TX-12 | Monitoring Confirm lỗi sau marker update | Confirmation marker và round status không lệch nhau |
| TX-13 | CANCEL lỗi ở child/Registry/history/audit | Toàn bộ DB transition rollback; child và Registry giữ trạng thái cũ |
| TX-14 | ARCHIVE record đã ARCHIVED được gọi lại | Idempotent; không sinh thêm history/audit |
| TX-15 | User có UUID nhưng không nhìn thấy record gọi CANCEL/ARCHIVE API | 403/404 trước khi service-role RPC được gọi |
| TX-16 | Admin update user với 1 role/permission invalid giữa payload | Toàn bộ profile + roles + scopes + permission overrides rollback |
| TX-17 | Admin đổi scope từ HOSPITAL sang MULTI_DEPARTMENT nhưng một department invalid | Scope cũ được giữ nguyên; không xóa trước rồi lỗi |
| TX-18 | Tạo Auth user xong nhưng cấu hình DB thất bại | Auth user mới được xóa compensation; không để tài khoản nửa cấu hình |
| TX-19 | PATCH user khi atomic RPC thiếu | 503 và row count `user_roles`, `user_scopes`, `user_permissions` trước/sau không đổi |

## Workflow gate cần kiểm E2E

### Finding
1. Create/Open.
2. Không Action → SUBMIT bị chặn.
3. Có Action chưa hoàn tất → SUBMIT bị chặn.
4. Action hoàn tất nhưng chưa Evidence → bị chặn.
5. Evidence đủ → EVIDENCE_SUBMITTED.
6. Reviewer BEGIN_VERIFY.
7. RETURN bắt buộc lý do + next due date.
8. ACCEPT → Finding + Registry closed + history + audit trong cùng transaction.
9. ESCALATE_CAPA → chỉ tạo đúng 01 CAPA và link canonical.

### CAPA
1. DRAFT → approval/RCA đúng gate.
2. Chưa RCA → không START_ACTIONS.
3. Thiếu Corrective hoặc Preventive → bị chặn.
4. Còn Action chưa xong → không REQUEST_EFFECTIVENESS.
5. Thiếu Evidence → bị chặn.
6. Effectiveness = ineffective → quay lại IN_PROGRESS.
7. Chỉ EFFECTIVE mới CLOSE được; CAPA + Registry + history phải đồng bộ.

### Risk
1. initial score → control/action → residual score → acceptance/monitoring.
2. ACCEPT/ACCEPT_WITH_MONITORING/NOT_ACCEPTED/ESCALATE phải dùng assessment gần nhất.
3. ACCEPT_WITH_MONITORING bắt buộc next review date hợp lệ.
4. ACCEPT ghi acceptance + Risk status trong cùng transaction.
5. RETIRE chỉ từ RISK_ACCEPTED/MONITORING và phải đồng bộ Risk + Registry + history.

### FMEA/HFMEA
1. cần scoring model + process step + failure mode.
2. high-priority failure mode phải có Action.
3. Action chưa xong/Evidence thiếu → không residual review.
4. CLOSE phải recheck Action/Evidence tại thời điểm đóng, không chỉ tin trạng thái UI trước đó.
5. residual review + conclusion mới close; FMEA + Registry + history đồng bộ.

### Assessment / External assessment
1. self-assessment chưa đủ tiêu chí/evidence → không review/finalize.
2. external assessment chỉ compare với self đã FINALIZED cùng criteria version.
3. chênh lệch tạo Finding, không ghi đè self score.
4. cùng một `criterion_ref` retry không sinh Finding trùng.
5. còn Finding mở → không close comparison.

### Audit / Inspection
1. audit phải có scope/session/evidence theo gate.
2. còn Finding mở → audit không close.
3. audit close phải đồng bộ Audit + Registry + history.
4. inspection countdown không được tạo trùng offset.
5. chưa đến visit date → không START_VISIT.
6. còn Action countdown chưa xong hoặc thiếu Evidence → không close.
7. inspection close phải đồng bộ domain + Registry + history.

### Directive / Report
1. thiếu owner/due/recipient → không bắt đầu.
2. Action chưa hoàn tất hoặc thiếu evidence → không submit.
3. report submission phải version hóa và chống duplicate version khi concurrent retry.
4. CONFIRM_RECEIVED phải đóng Reporting Obligation + Registry + history đồng bộ.
5. Directive COMPLETE phải recheck Action/Evidence và đóng domain + Registry atomically.

### Incident
1. TRIAGE xác định harm/investigation/RCA theo rule.
2. START_INVESTIGATION không tạo được nhiều investigation đang mở.
3. COMPLETE_INVESTIGATION cập nhật investigation + Incident status cùng transaction.
4. READY_TO_CLOSE yêu cầu ít nhất 01 Action áp dụng, Action hoàn tất và Evidence.
5. CLOSE recheck gate và đóng Incident + Registry + history trong cùng transaction.

### Improvement
1. Proposal SUBMIT yêu cầu problem + baseline + scope.
2. RETURN/REJECT bắt buộc lý do.
3. APPROVE_AND_CREATE_PROJECT chỉ tạo đúng 01 Project khi retry.
4. Project cần SMART objective + milestone/PDSA trước approval.
5. EVALUATE yêu cầu Action hoàn tất + Evidence + kết quả mục tiêu.
6. PARTIAL/NOT_ACHIEVED quay lại IN_PROGRESS.
7. CLOSE chỉ khi latest closure review = ACHIEVED, Action vẫn hoàn tất, Evidence còn tồn tại và có kết luận duy trì/nhân rộng.

### Monitoring / Checklist
1. Không lưu initial result nếu thiếu item hoặc item/version không hợp lệ.
2. Initial result batch + round status phải atomic ở DB.
3. Có FAIL → giữ IN_PROGRESS để recheck; không FAIL → AWAITING_CONFIRMATION.
4. Recheck phải đủ toàn bộ FAIL response, không trùng response id.
5. Recheck batch + response_corrections + round status phải atomic ở DB.
6. Confirm chỉ từ AWAITING_CONFIRMATION; marker + round CONFIRMED atomic.
7. Evidence ảnh chỉ chuyển VALID sau xác nhận QLCL.
8. Storage upload thất bại không được làm hỏng transaction nghiệp vụ; evidence lỗi phải được cleanup/không tham chiếu.
9. FAIL không tự động sinh Finding hàng loạt; chỉ escalation có chủ đích mới đi Finding/CAPA.

### Global lifecycle
1. CANCEL yêu cầu record còn hoạt động và lý do hợp lệ.
2. CLOSED không được CANCEL; dùng ARCHIVE nếu cần loại khỏi danh sách vận hành.
3. CANCEL cập nhật workflow con theo mapping hiện hành + Registry + history + audit trong cùng transaction.
4. ARCHIVE PROGRAM cập nhật cả `work_programs`; các loại khác giữ nguyên mapping hiện hành.
5. ARCHIVE record đã ARCHIVED phải idempotent.
6. Caller phải nhìn thấy record qua RLS, có lifecycle permission và cùng organization trước khi admin/RPC mutation được phép chạy.

### Admin User & Permission
1. Caller phải đồng thời có `users.manage` và `permissions.manage`.
2. Target user phải nhìn thấy qua RLS của caller và cùng organization.
3. Role phải active; permission id phải active.
4. Primary department và scope departments phải active, cùng organization.
5. Profile + roles + scopes + permission overrides phải commit cùng transaction.
6. PATCH không có legacy fallback; thiếu RPC phải trả 503 và giữ nguyên cấu hình cũ.
7. POST tạo Auth user nếu DB transaction thất bại phải xóa Auth user vừa tạo.
8. `anon`/`authenticated` không được EXECUTE trực tiếp mutation RPC; chỉ service_role.

## Bằng chứng PASS cần lưu

Mỗi test case phải có:
- test ID;
- account/role/scope;
- record/module;
- expected result;
- actual result;
- screenshot/log nếu cần;
- PASS/FAIL;
- người kiểm;
- ngày kiểm.

Riêng TX test cần lưu thêm:
- số row trước/sau ở các bảng liên quan;
- transaction path (`atomic`; nếu canonical RPC thiếu hoặc lỗi phải fail-closed, không chấp nhận legacy fallback);
- business key/record id dùng để retry;
- bằng chứng không có duplicate/orphan.

## Điều kiện ký Security/UAT PASS

Không có P0/P1 FAIL mở. Tất cả test vượt scope, UUID direct access, direct RPC execution, retry/idempotency, workflow bypass và Admin User cross-org/partial-write phải PASS trước Go-Live.
