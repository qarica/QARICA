# QLCL-TTSG — TQM Product Blueprint V1

## Mục tiêu
QLCL-TTSG vận hành theo Total Quality Management (TQM), không phải phần mềm quản lý hồ sơ đơn thuần. Mỗi workspace phải giúp người dùng nhìn được: **Mục tiêu → Quá trình → Đo lường → Vấn đề → Cải tiến/Kết quả**.

## 6 trụ cột TQM khóa chính thức
1. **Customer focus** — người bệnh/khách hàng là trung tâm: trải nghiệm, phản ánh, hài lòng, thời gian chờ, sự cố ảnh hưởng người bệnh.
2. **Process approach** — quản lý theo quá trình: nhìn chất lượng theo chuỗi công việc/quy trình, không chỉ theo module dữ liệu.
3. **Continuous improvement** — cải tiến liên tục: Finding → CAPA → Action → Evidence → Recheck → Improvement/PDSA → Sustain/Spread.
4. **Data-driven management** — quyết định dựa trên dữ liệu: trend, tỷ lệ, Pareto, so sánh khoa/phòng, heatmap, baseline-target-current.
5. **Total participation** — toàn viện tham gia: owner, khoa/phòng, tiến độ, điểm nghẽn, mức độ tham gia và hoàn thành.
6. **Leadership & strategic alignment** — gắn mục tiêu bệnh viện: kế hoạch năm, mục tiêu chiến lược, đề án cải tiến, chỉ số, báo cáo và kết quả.

## Nguyên tắc dashboard
- **Dashboard chính = TQM Executive Dashboard**, không dùng task count làm nội dung trung tâm.
- **Việc của tôi = Dashboard tác nghiệp cá nhân**.
- Mỗi workspace có dashboard nghiệp vụ riêng, không dùng cùng một mẫu thống kê chung.
- Số liệu phải lấy từ dữ liệu thật trong hệ thống, không hard-code số minh họa.
- Mọi biểu đồ phải trả lời một câu hỏi quản trị cụ thể.

## 11 workspace và lớp trực quan bắt buộc

### 1. Dashboard
- % hoàn thành kế hoạch QLCL năm.
- Xu hướng chất lượng theo tháng/quý.
- Chỉ số đạt mục tiêu vs chưa đạt.
- Cơ cấu sự cố/finding/CAPA/rủi ro.
- So sánh khoa/phòng.
- Điểm nóng cần chú ý.
- Gantt/milestone chính trong năm.

### 2. Việc của tôi
- Task cá nhân, quá hạn, chờ xử lý/chờ xác nhận.
- Calendar/Gantt ngắn hạn 7–30 ngày.
- Không đóng vai trò dashboard phân tích toàn viện.

### 3. Điều hành QLCL
- % hoàn thành kế hoạch năm = completed actions / required linked actions.
- Tiến độ theo quý/tháng.
- Gantt kế hoạch/chương trình/chỉ đạo.
- Nghĩa vụ báo cáo: đúng hạn/trễ hạn/chưa nộp.
- Chỉ đạo/yêu cầu theo trạng thái.

### 4. Đo lường chất lượng
- Trend chỉ số chất lượng theo thời gian.
- % chỉ số đạt mục tiêu.
- Giám sát theo khoa/phòng.
- Kết quả checklist đạt/chưa đạt/cần theo dõi.
- Top checklist/tiêu chí có vấn đề.
- Lịch giám sát.

### 5. Đánh giá & Tiếp đoàn
- % tiêu chí đạt/chưa đạt/không áp dụng.
- Self-assessment vs external assessment gap.
- Finding theo chương/nhóm tiêu chí.
- Tiến độ chuẩn bị tiếp đoàn/Gantt countdown.

### 6. Sự cố & Phản ánh
- Trend sự cố theo thời gian.
- Pareto loại sự cố/nguyên nhân.
- Phân bố mức độ tổn hại.
- Phản ánh/góp ý theo nhóm và SLA phản hồi.
- Điểm nóng lặp lại.

### 7. Quản lý rủi ro
- Risk heatmap Likelihood × Consequence.
- Inherent risk vs residual risk.
- Top risks và risk overdue review.
- Trend số risk được kiểm soát.

### 8. Khắc phục & CAPA
- Open/closed/overdue.
- Tỷ lệ CAPA hiệu lực.
- CAPA tái mở/không hiệu lực.
- Lead time từ Finding → CAPA → Verification.

### 9. Cải tiến chất lượng
- Tiến độ đề án theo % Action hoàn thành.
- Baseline → Target → Current.
- PDSA stage distribution.
- SMART objective status.
- Gantt/milestone đề án.
- Sustain/Spread sau khi đạt mục tiêu.

### 10. Tài liệu & Minh chứng
- Tài liệu hiệu lực/sắp hết hạn/hết hiệu lực.
- Mức độ sử dụng theo quy trình/module.
- Minh chứng còn thiếu theo nghĩa vụ/đánh giá.
- Source → Work → Evidence traceability.

### 11. Phân tích QLCL
- Dashboard tổng hợp đa chiều.
- Drill-down theo khoa/phòng, thời gian, chủ đề.
- Trend/Pareto/heatmap/benchmark nội bộ.

## Chuẩn trực quan
- KPI card chỉ dùng cho chỉ số quan trọng, có bối cảnh và xu hướng.
- Donut/Pie: cơ cấu trạng thái/nhóm.
- Line/Area: xu hướng thời gian.
- Horizontal bar: so sánh khoa/phòng/top vấn đề.
- Stacked bar: tiến độ theo quý/trạng thái.
- Gantt: kế hoạch, chương trình, đề án, milestone.
- Heatmap: rủi ro, mức độ vấn đề theo khoa/phòng/quá trình.
- Pareto: sự cố, finding, phản ánh, checklist lỗi.

## Quy tắc dữ liệu
- Không tự tạo số liệu khi production không có dữ liệu tương ứng.
- Tỷ lệ tiến độ phải có công thức và mẫu số rõ ràng.
- Mọi dashboard phải tôn trọng RLS, permission và scope hiện có.
- Drill-down từ biểu đồ phải dẫn đến danh sách/hồ sơ nguồn tương ứng.

## Nguyên tắc UX
- PC: ưu tiên dashboard rộng, 2–3 cột, chart lớn, lọc trên đầu trang.
- Mobile: chart xếp 1 cột, ưu tiên KPI + biểu đồ chính, bảng chuyển card hoặc cuộn ngang hợp lý.
- Màu có ý nghĩa: xanh = đạt/ổn định; vàng = cần theo dõi; đỏ = cần can thiệp; xanh dương = thông tin/đang thực hiện.

## Thứ tự triển khai
1. Dashboard tổng.
2. Điều hành QLCL/Kế hoạch năm.
3. Đo lường & Giám sát.
4. Cải tiến chất lượng.
5. Sự cố & Phản ánh.
6. Rủi ro.
7. CAPA.
8. Đánh giá & Tiếp đoàn.
9. Tài liệu & Minh chứng.
10. Phân tích QLCL.
11. Tối ưu mobile + accessibility + export/print.

TQM Product Blueprint V1 là baseline bắt buộc cho các thay đổi UI/UX và dashboard tiếp theo.