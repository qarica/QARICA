# QLCL-TTSG — Go-Live Quality Gate V1

## Nguyên tắc
Không dùng cụm từ `PASS / sẵn sàng Go-Live` chỉ vì code build được hoặc preview deploy thành công.

## Gate 1 — Analytics correctness
- Không dùng `updated_at` làm proxy cho xu hướng chất lượng.
- Metric phải có định nghĩa, tử/mẫu, business date và nguồn dữ liệu rõ ràng.
- KPI lifecycle/Action progress không được gọi là quality outcome.
- Dashboard quan trọng phải drill-down được về hồ sơ cấu thành.

## Gate 2 — Transaction integrity
- Workflow đa bảng trọng yếu phải atomic hoặc có DB constraint + rollback bảo đảm.
- Ưu tiên: Finding→CAPA, External Assessment→Finding, Inspection countdown, CAPA close/effectiveness.
- Retry không được tạo duplicate record/link/action.

## Gate 3 — Security / RLS / scope
- Hoàn thành `RBAC_RLS_WORKFLOW_TEST_MATRIX_V1.md`.
- Không có P0/P1 fail mở.
- Direct UUID/API access ngoài scope phải bị chặn.

## Gate 4 — Automated QA
CI bắt buộc:
1. Unit tests.
2. Lint.
3. Production build.

Sau đó bổ sung integration/E2E cho Finding, CAPA, Risk, Assessment, Inspection, Directive/Report.

## Gate 5 — Backup / restore / rollback
Trước pilot thật phải có bằng chứng:
- DB backup thành công;
- restore thử trên môi trường riêng;
- Storage/evidence có phương án phục hồi;
- migration rollback hoặc forward-fix plan;
- Vercel deployment rollback đã thử;
- tài khoản khẩn cấp và quy trình thu hồi quyền.

## Gate 6 — UAT nghiệp vụ
UAT phải có đại diện:
- QLCL Manager/Staff;
- khoa/phòng;
- đầu mối mạng lưới chất lượng;
- action owner;
- executive view;
- technical admin.

Mỗi luồng kiểm: create → assign → execute → evidence → review/recheck → close → audit trail → dashboard.

## Mức phán quyết
- `CODE PASS`: unit/lint/build sạch.
- `PREVIEW PASS`: deployment thành công + smoke check giao diện.
- `UAT PASS`: người dùng nghiệp vụ xác nhận luồng.
- `GO-LIVE PASS`: tất cả 6 gate trên đạt và có backup/rollback evidence.
