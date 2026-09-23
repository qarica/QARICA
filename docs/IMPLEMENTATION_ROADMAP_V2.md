# QARICA — Implementation Roadmap V2

## Mục tiêu

Hoàn thiện QARICA thành nền tảng quản lý chất lượng, rủi ro, cải tiến và công việc chất lượng dùng được cho nhiều tổ chức và nhiều năm. Kế hoạch năm, bộ tiêu chí, chỉ số, biểu mẫu và quy trình cụ thể của từng tổ chức là dữ liệu/cấu hình; không phải kiến trúc Core.

Mọi thay đổi phải bảo đảm:

- Không dùng số liệu giả.
- Không vượt RLS/permission/organization scope.
- Workflow đa bảng phải atomic.
- Mọi quyết định nghiệp vụ quan trọng phải truy vết được.
- Nhập một lần, tái sử dụng dữ liệu qua liên kết ID/FK thay vì sao chép.
- Không gọi CODE/PREVIEW/UAT/GO-LIVE PASS khi chưa có bằng chứng.
- Baseline quản trị tiến độ là Master Task Register A–S / 360+; PR chỉ là bằng chứng thực thi.

## Giai đoạn 1 — Nền móng production

### Quality gate
- CI bắt buộc: lint, unit test, production build.
- Bổ sung integration/E2E cho workflow trọng yếu.
- Lưu test ID, role, organization scope, expected, actual và bằng chứng.
- Release theo chuỗi Code → Gate → Preview → functional/data/UI verification → regression → merge → migration → Production → sanity.

### Security
- Kiểm thử direct UUID/API access ngoài organization scope.
- Kiểm thử cross-organization mutation.
- Kiểm thử direct RPC execution.
- Kiểm thử private evidence/signed URL.
- Fail-closed khi atomic RPC chưa tồn tại.
- Không thêm policy hoặc index chỉ để làm Advisor xanh; thay đổi phải theo access contract và query path thực.

### UX/Workflow
- Mọi menu phải có route danh sách và route chi tiết phù hợp.
- Mọi record detail phải có trạng thái, owner, hạn, next action, evidence, history và audit khi nghiệp vụ yêu cầu.
- My Work, Calendar, reminder và notification dùng chung dữ liệu nguồn; không nhập lại.
- Dashboard phải hiển thị “Chưa đủ dữ liệu” khi mẫu số bằng 0.

## Giai đoạn 2 — Quality Management Core

- Common backbone: Source → Requirement/Objective/Finding → Action/CAPA → Execution → Evidence → Verification → Effectiveness → Closure → Analytics/Report.
- Dashboard chuyên biệt theo workspace nhưng dùng master/reference dùng chung.
- Scorecard: baseline, target, current, trend, owner.
- Process Map: mục tiêu → quá trình → chỉ số → finding → CAPA → kết quả.
- RCA hỗ trợ Five Why tùy chọn, Fishbone, nguyên nhân hệ thống và rào chắn.
- CAPA có effectiveness review và sustain/spread.
- Risk có inherent/residual, Risk Matrix và heatmap.
- Drill-down từ KPI/biểu đồ về hồ sơ nguồn.
- Criteria, Assessment, Checklist/Monitoring, Indicator, Incident, Feedback, Directive, Inspection, FMEA, Risk và Report phải liên kết Action/CAPA/Evidence theo cùng backbone.

## Giai đoạn 3 — Smart Work Management

- Trung tâm Hôm nay: quá hạn, hôm nay, 3 ngày, 7 ngày, chờ xác minh, chờ minh chứng.
- Personal Reminder và Recurring Work Engine.
- Calendar/Gantt dùng ngày thật; không suy diễn ngày thiếu.
- Escalation theo SLA và mức độ.
- Dự báo workload 7–30 ngày.
- Gợi ý người phối hợp và hồ sơ liên quan.
- Phát hiện vấn đề lặp lại.
- Inspection Mode D-30 đến D+30.
- Trợ lý chỉ đề xuất, không tự quyết định nghiệp vụ.

## Giai đoạn 4 — Go-Live và vận hành

- UAT theo vai trò và organization scope.
- Backup/restore test.
- Migration/rollback hoặc forward-fix.
- Vercel deployment rollback.
- Tài khoản khẩn cấp và thu hồi quyền.
- Security/performance advisor review theo contract thực tế.
- Sign-off nghiệp vụ, đơn vị sử dụng, executive và technical admin.

## Nguyên tắc dữ liệu năm

Kế hoạch chất lượng năm 2026/KH50 chỉ là một instance dữ liệu tham khảo, kiểm thử và đối chiếu của năm 2026. Không hard-code cấu trúc, mục tiêu, hoạt động, chỉ tiêu, mốc thời gian hoặc đơn vị của KH50 vào QARICA Core. Tương tự, bộ 83/48 tiêu chí hay bất kỳ bộ tiêu chí cụ thể nào là dữ liệu có version, không phải giới hạn kiến trúc.

## Tiêu chí hoàn thành

Một nhóm việc chỉ được đánh dấu hoàn thành khi có, tùy phạm vi:

1. Mã nguồn hoặc migration tương ứng.
2. Test/verification script.
3. Bằng chứng chạy Gate/Preview/Production phù hợp.
4. Migration Production và postcheck nếu có thay đổi DB.
5. Không có P0/P1 chưa xử lý.
6. Runtime/data sanity đạt.
7. Cập nhật Master Task Register A–S / 360+ và handoff.
