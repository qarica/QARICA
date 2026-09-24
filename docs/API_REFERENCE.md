# QARICA — Danh mục API Reference

> Danh sách route lấy trực tiếp từ `src/app/api/**/route.ts` bằng cách quét
> `export async function GET|POST|PATCH|PUT|DELETE` trong từng file (không
> đoán) — đảm bảo khớp 100% với source tại thời điểm tạo tài liệu này. Mô tả
> mục đích dựa trên tên route + code đã đọc trực tiếp trong quá trình phát
> triển; route chưa đọc chi tiết source được ghi mục đích suy ra từ đường dẫn.
> Mọi route đều yêu cầu đăng nhập (Supabase session) trừ khi ghi chú khác;
> phần lớn còn kiểm tra quyền qua `has_permission`/RLS trước khi thao tác.

## Registry chung (tạo/đọc mọi loại hồ sơ)

| Route | Method | Mục đích |
|---|---|---|
| `/api/domain-records` | GET, POST | Danh mục lựa chọn (GET) và tạo hồ sơ mới (POST) cho mọi `record_type` — xem `DATA_DICTIONARY.md` |
| `/api/record-lifecycle` | GET, POST | Đọc/đổi trạng thái vòng đời hồ sơ (huỷ, khôi phục...) |
| `/api/records/[id]/actions` | POST | Gắn Action (nhiệm vụ khắc phục) vào 1 hồ sơ |
| `/api/records/[id]/comments` | POST | Thêm bình luận vào hồ sơ |
| `/api/records/[id]/evidence` | POST | Đính kèm minh chứng vào hồ sơ |
| `/api/records/[id]/quality-domains` | GET, PUT | Đọc/gán lĩnh vực chất lượng (quality domain taxonomy) cho hồ sơ |
| `/api/quality-records/[id]/content` | POST | Cập nhật nội dung hồ sơ chất lượng (generic content block) |

## Sự cố y khoa & An toàn người bệnh (Incident)

| Route | Method | Mục đích |
|---|---|---|
| `/api/incidents/[id]/workflow` | POST | Chuyển trạng thái workflow sự cố (báo cáo → điều tra → đóng...) |
| `/api/incidents/[id]/rca` | GET, POST | Đọc/lưu RCA có cấu trúc (Timeline/Five Why/Fishbone/Root Cause) |
| `/api/incidents/[id]/rca/similar-cases` | GET | **[Mới]** Gợi ý sự cố tương tự đã có RCA hoàn tất, kèm nguyên nhân gốc, để tham khảo khi phân tích |
| `/api/incidents/[id]/contributing-factors` | GET, POST | Đọc/lưu yếu tố góp phần |
| `/api/incidents/[id]/lessons-learned` | GET, POST | Đọc/lưu bài học kinh nghiệm |
| `/api/incidents/[id]/capa` | GET, POST | Đọc/tạo liên kết CAPA từ sự cố |
| `/api/incidents/export` | GET | Xuất danh sách sự cố |
| `/api/incidents/similar` | POST | **[Mới]** Gợi ý sự cố có thể trùng khi đang soạn báo cáo mới (so khớp lexical trên mô tả) |
| `/api/safety-alerts/[id]/content` | GET, POST | Đọc/soạn nội dung bài học/cảnh báo an toàn |
| `/api/safety-alerts/[id]/workflow` | POST | Chuyển trạng thái phát hành cảnh báo an toàn |

## CAPA / Risk / FMEA

| Route | Method | Mục đích |
|---|---|---|
| `/api/capa/[id]/workflow` | POST | Chuyển trạng thái CAPA (draft → triển khai → đánh giá hiệu lực → đóng) |
| `/api/capa/[id]/effectiveness-indicators` | GET, POST | Đọc/gắn chỉ số đánh giá hiệu lực CAPA |
| `/api/risks/[id]/workflow` | POST | Chuyển trạng thái rủi ro (rà soát định kỳ, đóng...) |
| `/api/fmea/[id]/setup` | POST | Cấu hình process step ban đầu cho nghiên cứu FMEA/HFMEA |
| `/api/fmea/[id]/assessments` | GET, POST | Đọc/chấm điểm S/O/D cho từng failure mode |
| `/api/fmea/[id]/mode-actions` | GET | Đọc hành động khắc phục theo từng failure mode |
| `/api/fmea/[id]/workflow` | POST | Chuyển trạng thái nghiên cứu FMEA/HFMEA |

## Chỉ số chất lượng (Indicator)

| Route | Method | Mục đích |
|---|---|---|
| `/api/indicator-definitions` | POST | Tạo định nghĩa chỉ số mới |
| `/api/indicator-definitions/[id]` | PATCH | Sửa định nghĩa chỉ số |
| `/api/indicator-definitions/[id]/versions` | POST | Tạo phiên bản mới cho định nghĩa chỉ số |
| `/api/indicator-definitions/[id]/publish` | POST | Publish phiên bản chỉ số (chỉ bản `PUBLISHED` mới được phân công đo) |
| `/api/indicator-versions/[id]` | PATCH | Sửa phiên bản chỉ số |
| `/api/indicators/assignments` | POST | Tạo phân công đo chỉ số theo khoa/phòng |
| `/api/indicators/assignments/[id]` | PATCH, DELETE | Sửa/xoá phân công đo |
| `/api/indicators/assignments/[id]/automation` | PATCH | Bật/tắt tự động tạo kỳ đo |
| `/api/indicators/measurements/[id]/workflow` | POST | Chuyển trạng thái kỳ đo (nộp → xác minh/trả lại → khoá) |
| `/api/indicators/source-aliases` | POST | Gắn alias nguồn dữ liệu tự động cho chỉ số |
| `/api/indicators/sync-periods` | POST | Đồng bộ tạo kỳ đo theo tần suất đã cấu hình |

## Đánh giá & Kiểm tra (Assessment / Audit / Inspection / Criteria)

| Route | Method | Mục đích |
|---|---|---|
| `/api/assessments/[id]/criteria` | POST | Nhập điểm/kết quả theo từng tiêu chí trong đợt tự đánh giá |
| `/api/assessments/[id]/workflow` | POST | Chuyển trạng thái đợt tự đánh giá |
| `/api/external-assessments/[id]/workflow` | POST | Chuyển trạng thái đánh giá ngoài (đoàn kiểm tra) |
| `/api/audits/[id]/setup-data` | GET | Danh mục phục vụ cấu hình cuộc Audit/Tracer |
| `/api/audits/[id]/setup` | POST | Cấu hình phạm vi/nhóm audit |
| `/api/audits/[id]/workflow` | POST | Chuyển trạng thái cuộc Audit/Tracer |
| `/api/inspections/[id]/workflow` | POST | Chuyển trạng thái đợt kiểm tra (tiếp đoàn) |
| `/api/criteria-sets` | POST | Tạo bộ tiêu chí mới |
| `/api/criteria-sets/[id]` | PATCH | Sửa bộ tiêu chí |
| `/api/criteria-sets/[id]/items` | POST | Thêm tiêu chí vào bộ |
| `/api/criteria-sets/[id]/versions` | POST | Tạo phiên bản mới cho bộ tiêu chí |
| `/api/criteria-sets/[id]/publish` | POST | Publish phiên bản bộ tiêu chí |
| `/api/criteria-items/[id]` | PATCH | Sửa 1 tiêu chí |

## Kế hoạch, Chỉ thị, Báo cáo nghĩa vụ (Plan / Directive / Report / Finding / Feedback)

| Route | Method | Mục đích |
|---|---|---|
| `/api/plans` | POST | Tạo kế hoạch |
| `/api/plans/[id]` | PATCH | Sửa kế hoạch |
| `/api/plans/[id]/actions` | POST | Thêm hành động vào kế hoạch |
| `/api/plans/[id]/workflow` | POST | Chuyển trạng thái kế hoạch |
| `/api/plans/[id]/export/excel` | GET | Xuất kế hoạch ra Excel |
| `/api/plans/[id]/export/word` | GET | Xuất kế hoạch ra Word |
| `/api/directives/[id]/workflow` | POST | Chuyển trạng thái xử lý chỉ thị/công văn đến |
| `/api/reports/[id]/workflow` | POST | Chuyển trạng thái nghĩa vụ báo cáo định kỳ |
| `/api/findings/[id]/workflow` | POST | Chuyển trạng thái Finding (phát hiện từ audit) |
| `/api/feedback/[id]/workflow` | POST | Chuyển trạng thái xử lý phản ánh |

## Cải tiến chất lượng (Improvement)

| Route | Method | Mục đích |
|---|---|---|
| `/api/improvement/proposals/[id]/workflow` | POST | Chuyển trạng thái đề xuất cải tiến |
| `/api/improvement/projects/[id]/setup` | GET, POST | Đọc/cấu hình SMART objective, chỉ số, PDSA cho đề án |
| `/api/improvement/projects/[id]/workflow` | POST | Chuyển trạng thái đề án cải tiến |
| `/api/improvement/projects/[id]/milestones/status` | POST | Cập nhật trạng thái mốc tiến độ đề án |

## Giám sát hiện trường (Monitoring — 5S, vệ sinh tay...)

| Route | Method | Mục đích |
|---|---|---|
| `/api/monitoring/templates` | POST | Tạo mẫu giám sát (checklist template) |
| `/api/monitoring/templates/[id]` | PATCH | Sửa mẫu giám sát |
| `/api/monitoring/templates/[id]/sections` | POST, PATCH | Quản lý phần/mục trong mẫu |
| `/api/monitoring/templates/[id]/items` | POST, PATCH | Quản lý tiêu chí trong mẫu |
| `/api/monitoring/templates/[id]/versions` | POST | Tạo phiên bản mẫu mới |
| `/api/monitoring/templates/[id]/publish` | POST | Publish mẫu giám sát |
| `/api/monitoring/templates/[id]/preset-hand-hygiene` | POST | Khởi tạo nhanh mẫu vệ sinh tay dựng sẵn |
| `/api/monitoring/templates/preset-5s-external` | POST | Khởi tạo nhanh mẫu 5S dựng sẵn |
| `/api/monitoring/rounds/5s` | POST | Tạo đợt giám sát 5S |
| `/api/monitoring/rounds/schedule` | POST | Lên lịch đợt giám sát |
| `/api/monitoring/rounds/[id]/start` | POST | Bắt đầu thực hiện đợt giám sát |
| `/api/monitoring/rounds/[id]/5s-results` | POST | Ghi kết quả chấm điểm 5S |
| `/api/monitoring/rounds/[id]/generic-results` | POST | Ghi kết quả chấm điểm mẫu giám sát dạng chung |
| `/api/monitoring/rounds/[id]/confirm` | POST | Xác nhận hoàn tất đợt giám sát |
| `/api/monitoring/rounds/[id]/recheck` | POST | Tạo vòng tái kiểm |
| `/api/monitoring/rounds/[id]/export` | GET | Xuất kết quả đợt giám sát |
| `/api/monitoring/evidence/[id]` | GET | Tải minh chứng đính kèm giám sát |

## Lịch, thông báo, tác vụ (Calendar / Notifications / Tasks)

| Route | Method | Mục đích |
|---|---|---|
| `/api/calendar/recurring` | POST | Tạo lịch định kỳ (thường quy QLCL) |
| `/api/calendar/recurring/[id]` | PATCH | Sửa lịch định kỳ |
| `/api/calendar/recurring/sync` | POST | Đồng bộ sinh sự kiện từ lịch định kỳ |
| `/api/notifications/sync-action-reminders` | POST | Đồng bộ nhắc việc quá hạn Action |
| `/api/notifications/sync-monitoring-overdue` | POST | Đồng bộ nhắc đợt giám sát quá hạn |
| `/api/notifications/sync-quality-attention` | POST | Đồng bộ nhắc hồ sơ cần chú ý |
| `/api/tasks/[id]/workflow` | POST | Chuyển trạng thái nhiệm vụ (Action) |
| `/api/tasks/[id]/evidence` | POST | Đính kèm minh chứng cho nhiệm vụ |

## Hành chính & Hệ thống (Admin / Auth / Work groups)

| Route | Method | Mục đích |
|---|---|---|
| `/api/admin/departments` | POST | Tạo khoa/phòng |
| `/api/admin/departments/[id]` | PATCH | Sửa khoa/phòng (đã bổ sung kiểm tra `organization_id` — PR #315) |
| `/api/admin/departments/[id]/roles` | PUT | Gán vai trò mặc định cho khoa/phòng |
| `/api/admin/users` | POST | Tạo tài khoản người dùng |
| `/api/admin/users/[id]` | PATCH | Sửa tài khoản người dùng |
| `/api/admin/settings` | PATCH | Sửa cấu hình chung tổ chức |
| `/api/admin/work-calendar-holidays` | POST, PATCH | Quản lý ngày nghỉ lịch làm việc |
| `/api/auth/login` | POST | Đăng nhập |
| `/api/health/auth` | GET | Health-check trạng thái xác thực |
| `/api/work-groups` | POST | Tạo nhóm công tác |
| `/api/work-groups/[id]` | PATCH | Sửa nhóm công tác |
| `/api/analytics/registry/export` | GET | Xuất dữ liệu tổng hợp Registry phục vụ phân tích |
| `/api/evidence/[id]/download` | GET | Tải file minh chứng đã đính kèm |

---
*Tài liệu tạo tự động từ việc quét source ngày cập nhật gần nhất — nếu thêm/sửa
route, chạy lại lệnh quét trong `README` của thư mục này (hoặc yêu cầu Claude
cập nhật) để giữ đồng bộ.*
