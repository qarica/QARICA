# QARICA — Analytics Semantics V1

## Mục tiêu

Khóa cách diễn giải số liệu trên Dashboard và các workspace TQM để tránh nhầm lẫn giữa **hoạt động trên phần mềm** và **kết quả chất lượng thực tế**.

## Ba lớp analytics bắt buộc

### 1. Operational analytics
Dùng để điều hành công việc:
- số hồ sơ;
- số đang mở/đã đóng;
- quá hạn;
- workload theo khoa/phòng;
- tiến độ Action;
- tiến độ kế hoạch/Gantt.

Các chỉ số này **không được gọi là kết quả chất lượng**.

### 2. Quality performance analytics
Dùng để đánh giá hiệu quả quản lý chất lượng:
- tỷ lệ chỉ số đạt mục tiêu;
- tỷ lệ checklist đạt;
- Finding quá hạn/tái diễn;
- CAPA có hiệu lực;
- tỷ lệ phản hồi đúng hạn;
- tỷ lệ khắc phục sau audit/đánh giá ngoài.

### 3. Outcome / strategic analytics
Dùng cho Ban Giám đốc và TQM cấp bệnh viện:
- xu hướng an toàn người bệnh;
- trải nghiệm người bệnh;
- mục tiêu chất lượng chiến lược;
- kết quả cải tiến so baseline/target/current;
- benchmark theo thời gian/khoa/phòng.

## Quy tắc ngày nghiệp vụ

Không dùng `records.updated_at` để dựng biểu đồ xu hướng chất lượng.

| Domain | Business date ưu tiên | Ghi chú |
|---|---|---|
| Incident | `occurred_at`, nếu thiếu dùng `reported_at` | Xu hướng sự cố phải theo thời điểm xảy ra/ghi nhận sự cố |
| Finding | `identified_at` | Không dùng ngày sửa hồ sơ |
| Indicator Measurement | `period_end` / kỳ đo | Xu hướng theo kỳ đo |
| Monitoring | `scheduled_date` hoặc ngày thực hiện thực tế khi có | Phân biệt lịch và thực hiện |
| Inspection | `visit_date` | Countdown và khối lượng theo ngày đoàn |
| Directive | `received_date` | Hạn dùng `implementation_due_date` / `report_due_date` |
| Report | `reporting_period_end` và `due_date`; thời điểm gửi dùng `submitted_at` | Tách kỳ báo cáo, hạn và thực nộp |
| Improvement Project | `start_date`, `target_end_date`, `actual_end_date` | Gantt và tiến độ |
| Risk | ngày đánh giá/review nghiệp vụ | Không dùng `updated_at` làm risk trend |
| Feedback | business received date nếu schema có; nếu chưa có chỉ dùng Registry `created_at` và ghi rõ là “thời điểm hệ thống ghi nhận” | Không gọi là outcome trend |
| Assessment / Audit | ngày đợt đánh giá/audit khi schema có; nếu chưa có chỉ dùng `created_at` như nhịp ghi nhận hồ sơ | Không gọi là quality outcome |

## Quy tắc ngôn ngữ UI

- `updated_at` chỉ dùng cho: “Cập nhật gần nhất”, “hoạt động gần đây”.
- `created_at` chỉ dùng cho: “Hồ sơ được ghi nhận/khởi tạo theo tháng”.
- Chỉ business date mới được dùng cho: “xu hướng sự cố”, “Finding phát hiện”, “kỳ đo chỉ số”, “ngày tiếp đoàn”, v.v.
- `% hồ sơ đã đóng` là lifecycle completion, không phải `% chất lượng đạt`.
- `% Action hoàn thành` là execution progress, không phải outcome improvement nếu chưa có đo baseline/target/current.

## Drill-down

Mọi KPI/chart điều hành quan trọng phải hướng tới khả năng drill-down từ số tổng hợp → danh sách hồ sơ cấu thành → hồ sơ chi tiết. Không được tạo số tổng hợp không truy vết được nguồn.

## Empty state

Nếu không đủ dữ liệu nghiệp vụ để tính một metric, hiển thị `Chưa đủ dữ liệu` thay vì suy diễn bằng proxy không tương đương.
