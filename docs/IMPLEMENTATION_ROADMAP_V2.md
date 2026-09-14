# QLCL-TTSG — Implementation Roadmap V2

## Mục tiêu

Hoàn thiện QLCL-TTSG thành nền tảng TQM và PM thông minh cho bệnh viện. Mọi thay đổi phải bảo đảm:

- Không dùng số liệu giả.
- Không vượt RLS/permission/scope.
- Workflow đa bảng phải atomic.
- Mọi quyết định nghiệp vụ phải truy vết được.
- Không gọi CODE/PREVIEW/UAT/GO-LIVE PASS khi chưa có bằng chứng.

## Giai đoạn 1 — Nền móng production

### Quality gate
- CI bắt buộc: lint, unit test, production build.
- Bổ sung integration/E2E cho workflow trọng yếu.
- Lưu test ID, role, scope, expected, actual, bằng chứng.

### Security
- Kiểm thử direct UUID/API access ngoài scope.
- Kiểm thử cross-organization mutation.
- Kiểm thử direct RPC execution.
- Kiểm thử private evidence/signed URL.
- Fail-closed khi atomic RPC chưa tồn tại.

### UX/Workflow
- Mọi menu phải có route danh sách và route chi tiết.
- Mọi record detail phải có trạng thái, owner, hạn, next action, evidence, history, audit.
- Trợ lý và chuông là trung tâm cảnh báo duy nhất.
- Dashboard phải hiển thị “Chưa đủ dữ liệu” khi mẫu số bằng 0.

## Giai đoạn 2 — TQM

- Dashboard chuyên biệt theo workspace.
- TQM Scorecard: baseline, target, current, trend, owner.
- Process Map: mục tiêu → quá trình → chỉ số → finding → CAPA → kết quả.
- RCA: 5 Why, Fishbone, nguyên nhân hệ thống, rào chắn.
- CAPA effectiveness và sustain/spread.
- Risk inherent/residual và heatmap.
- Drill-down từ mọi KPI/biểu đồ về hồ sơ nguồn.

## Giai đoạn 3 — PM thông minh

- Trung tâm Hôm nay: quá hạn, hôm nay, 3 ngày, 7 ngày, chờ xác minh, chờ minh chứng.
- Recurring Work Engine.
- Escalation theo SLA và mức độ.
- Dự báo workload 7–30 ngày.
- Gợi ý người phối hợp và hồ sơ liên quan.
- Phát hiện vấn đề lặp lại.
- Inspection Mode D-30 đến D+30.
- Trợ lý chỉ đề xuất, không tự quyết định nghiệp vụ.

## Giai đoạn 4 — Go-Live

- UAT theo vai trò và scope.
- Backup/restore test.
- Migration/rollback hoặc forward-fix.
- Vercel deployment rollback.
- Tài khoản khẩn cấp và thu hồi quyền.
- Sign-off QLCL, khoa/phòng, executive và technical admin.

## Tiêu chí hoàn thành

Một giai đoạn chỉ được đánh dấu hoàn thành khi có:

1. Mã nguồn hoặc migration tương ứng.
2. Test/verification script.
3. Bằng chứng chạy.
4. Không có P0/P1 chưa xử lý.
5. Cập nhật runbook và handoff.
