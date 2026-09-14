# QLCL-TTSG — Production Operations Runbook V1

## 1. Mục tiêu
Runbook này là điều kiện bắt buộc trước pilot/Go-Live. Không xác nhận `GO-LIVE PASS` nếu chưa có bằng chứng backup, restore và rollback thực tế.

## 2. Trước mỗi migration production
1. Ghi commit SHA ứng dụng đang chạy.
2. Ghi migration/version database hiện tại.
3. Tạo backup database theo cơ chế Supabase đang được bệnh viện sử dụng.
4. Kiểm tra backup hoàn tất và có timestamp.
5. Kiểm tra các thay đổi Storage nếu migration liên quan file/evidence.
6. Đọc migration và xác nhận:
   - có preflight chống dữ liệu xung đột;
   - không xóa dữ liệu lịch sử ngoài chủ đích;
   - constraint/index mới không phá dữ liệu hiện tại;
   - có rollback hoặc forward-fix plan.
7. Chỉ sau đó mới apply migration.

## 3. Backup evidence bắt buộc
Mỗi lần release quan trọng phải lưu:
- release/commit SHA;
- database backup timestamp;
- người thực hiện;
- trạng thái backup;
- storage backup/snapshot nếu áp dụng;
- link/tên bằng chứng nội bộ;
- migration được áp.

Không lưu secret hoặc service-role key trong bằng chứng.

## 4. Restore drill
Trước Go-Live phải thực hiện ít nhất một lần trên môi trường riêng:
1. Restore database từ backup gần nhất.
2. Xác nhận các bảng Registry cốt lõi đọc được.
3. Xác nhận record ↔ domain table ↔ record_links ↔ evidence_links vẫn toàn vẹn.
4. Kiểm tra tối thiểu Finding, CAPA, Risk, Indicator, Audit, Evidence.
5. Kiểm tra user/RBAC/RLS sau restore.
6. Chạy smoke test read-only.
7. Ghi thời gian restore thực tế (RTO quan sát được) và mốc dữ liệu gần nhất phục hồi được (RPO quan sát được).

## 5. Application rollback
Nếu deployment mới lỗi:
1. Không sửa trực tiếp production bằng patch rời rạc.
2. Xác định last-known-good deployment.
3. Rollback Vercel về deployment đó.
4. Nếu database chưa thay đổi: xác minh ứng dụng phục hồi.
5. Nếu database đã thay đổi nhưng backward-compatible: giữ DB, rollback app.
6. Nếu DB không backward-compatible: kích hoạt kế hoạch migration rollback/forward-fix đã duyệt.
7. Ghi audit sự cố triển khai.

## 6. Migration failure
Nếu migration đang chạy thất bại:
- migration transactional phải rollback toàn bộ;
- không tiếp tục chạy fragment thủ công nếu chưa xác định trạng thái DB;
- kiểm tra object đã tạo/constraint/index trước retry;
- không đổi tên migration đã được áp thành công ở production.

## 7. Storage / Evidence
Evidence là dữ liệu kiểm chứng, không được xem như attachment tạm thời.
- bucket phải private;
- quyền tải qua signed URL/permission;
- không hard delete bằng UI nghiệp vụ;
- nếu có retention/delete job phải có chính sách được duyệt;
- kiểm tra khả năng phục hồi metadata và object file tương ứng.

## 8. Monitoring tối thiểu
Theo dõi:
- Vercel deployment/build failure;
- HTTP 5xx;
- lỗi API workflow;
- lỗi Supabase query/RPC;
- authentication failures bất thường;
- storage signed-url/file failures;
- notification sync failures;
- migration failures.

Không ghi PHI/secrets/token vào application log.

## 9. Access review
Theo chu kỳ được bệnh viện duyệt:
- user inactive phải thu hồi quyền;
- rà role/permission/scope;
- ADMIN kỹ thuật không tự có quyền nghiệp vụ;
- rà service accounts và secret rotation;
- rà user có MULTI_DEPARTMENT/HOSPITAL scope.

## 10. Release evidence template
| Trường | Giá trị |
|---|---|
| Release ID | |
| Commit SHA | |
| Database migration | |
| Backup timestamp | |
| Backup verified | |
| Restore drill reference | |
| CI unit test | |
| CI lint | |
| CI build | |
| Preview smoke | |
| UAT reference | |
| Rollback target | |
| Người phê duyệt | |

## 11. Điều kiện dừng triển khai
Dừng release khi có một trong các tình trạng:
- backup chưa xác nhận;
- migration preflight phát hiện dữ liệu xung đột;
- CI test/lint/build FAIL;
- RLS/security test P0/P1 FAIL;
- rollback target không xác định;
- migration làm thay đổi schema mà app cũ không còn tương thích nhưng chưa có rollback/forward-fix plan.
