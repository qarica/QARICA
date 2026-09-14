export type ModuleUx = {
  workflow: string[];
  principle: string;
  related: { label: string; href: string }[];
};

const common = [
  { label: "Việc của tôi", href: "/tasks" },
  { label: "Kho minh chứng", href: "/evidence" },
  { label: "Lịch QLCL", href: "/calendar" },
];

const map: Record<string, ModuleUx> = {
  DIRECTIVE: { workflow: ["Tiếp nhận", "Phân công", "Thực hiện", "Minh chứng", "Xác nhận"], principle: "Mỗi yêu cầu cần rõ đơn vị chịu trách nhiệm, hạn xử lý và bằng chứng hoàn tất.", related: common },
  REPORT: { workflow: ["Ghi nhận nghĩa vụ", "Chuẩn bị", "Rà soát", "Gửi", "Lưu bằng chứng"], principle: "Báo cáo chỉ hoàn tất khi có bằng chứng đã gửi hoặc đã tiếp nhận.", related: common },
  INSPECTION: { workflow: ["Chuẩn bị", "Countdown", "Tiếp đoàn", "Finding", "Theo dõi sau kiểm tra"], principle: "Tồn tại sau kiểm tra đi qua Finding → Action → Evidence → Recheck.", related: [{ label: "Lịch QLCL", href: "/calendar" }, { label: "Findings", href: "/findings" }, { label: "Kho minh chứng", href: "/evidence" }] },
  INDICATOR_MEASUREMENT: { workflow: ["Định nghĩa", "Thu thập", "Xác minh", "Phân tích", "Hành động"], principle: "Chỉ số cần rõ định nghĩa, nguồn dữ liệu, kỳ đo và người xác minh.", related: common },
  FINDING: { workflow: ["Ghi nhận", "Phân loại", "Giao Action", "Minh chứng", "Recheck", "Đóng"], principle: "Không đóng Finding chỉ vì đã giao việc; cần minh chứng và kiểm tra lại.", related: [{ label: "Việc của tôi", href: "/tasks" }, { label: "CAPA", href: "/capa" }, { label: "Kho minh chứng", href: "/evidence" }] },
  INCIDENT: { workflow: ["Báo cáo", "Triage", "Phân tích/RCA", "Action/CAPA", "Đóng"], principle: "Ưu tiên học từ sự cố và ngăn tái diễn; không dùng giảm số báo cáo sự cố làm KPI.", related: [{ label: "CAPA", href: "/capa" }, { label: "Kho bài học", href: "/safety-alerts" }, { label: "Việc của tôi", href: "/tasks" }] },
  CAPA: { workflow: ["Nguyên nhân", "Khắc phục", "Phòng ngừa", "Minh chứng", "Đánh giá hiệu lực", "Đóng"], principle: "CAPA chỉ đóng sau khi đánh giá hiệu lực; hoàn thành Action chưa đồng nghĩa có hiệu quả.", related: common },
  RISK: { workflow: ["Nhận diện", "Đánh giá", "Xử lý", "Theo dõi", "Rà soát"], principle: "Rủi ro phải có owner, biện pháp kiểm soát và thời điểm rà soát.", related: [{ label: "FMEA / HFMEA", href: "/fmea" }, { label: "Việc của tôi", href: "/tasks" }, { label: "Kho minh chứng", href: "/evidence" }] },
  FMEA: { workflow: ["Chọn quy trình", "Failure mode", "Chấm S/O/D", "Ưu tiên", "Action", "Re-score"], principle: "Failure mode phải gắn với bước quy trình cụ thể; Severity cao vẫn cần xem xét.", related: [{ label: "Risk Register", href: "/risks" }, { label: "Việc của tôi", href: "/tasks" }, { label: "Kho minh chứng", href: "/evidence" }] },
  IMPROVEMENT_PROPOSAL: { workflow: ["Đề xuất", "Sàng lọc", "Ưu tiên", "Phê duyệt", "Chuyển đề án"], principle: "Đề xuất cần mô tả vấn đề, giá trị kỳ vọng và khả năng triển khai.", related: [{ label: "Đề án cải tiến", href: "/improvement/projects" }, { label: "Việc của tôi", href: "/tasks" }, { label: "Kho minh chứng", href: "/evidence" }] },
  IMPROVEMENT_PROJECT: { workflow: ["Baseline", "Mục tiêu", "PDSA", "Đo kết quả", "Duy trì/nhân rộng"], principle: "Đề án cần baseline, mục tiêu đo được, kết quả và quyết định duy trì/nhân rộng.", related: [{ label: "Đề xuất cải tiến", href: "/improvement/proposals" }, { label: "Việc của tôi", href: "/tasks" }, { label: "Kho minh chứng", href: "/evidence" }] },
  ASSESSMENT: { workflow: ["Chọn bộ tiêu chí", "Phân công", "Tự chấm", "Minh chứng", "Rà soát", "Chốt"], principle: "Không nâng điểm khi chưa có minh chứng phù hợp; tách rõ tự đánh giá và kết quả đoàn ngoài.", related: [{ label: "Đánh giá ngoài", href: "/external-assessments" }, { label: "Kho minh chứng", href: "/evidence" }, { label: "Findings", href: "/findings" }] },
  EXTERNAL_ASSESSMENT: { workflow: ["Nhập kết quả ngoài", "Đối chiếu", "Xác định chênh lệch", "Finding/Action", "Recheck"], principle: "Theo dõi chênh lệch với tự đánh giá để ưu tiên cải tiến, không sửa ngược dữ liệu lịch sử.", related: [{ label: "Tự đánh giá", href: "/assessments" }, { label: "Findings", href: "/findings" }, { label: "CAPA", href: "/capa" }] },
  AUDIT: { workflow: ["Lập kế hoạch", "Thực hiện", "Finding", "Theo dõi", "Đóng"], principle: "Audit/tracer phải giữ nguyên phát hiện ban đầu và theo dõi đến kiểm tra lại.", related: [{ label: "Findings", href: "/findings" }, { label: "Việc của tôi", href: "/tasks" }, { label: "Kho minh chứng", href: "/evidence" }] },
  SAFETY_ALERT: { workflow: ["Soạn bài học", "Rà soát", "Phát hành", "Theo dõi tiếp nhận"], principle: "Chỉ phát hành bài học/cảnh báo sau khi nội dung đã được rà soát.", related: [{ label: "Sự cố & An toàn", href: "/incidents" }, { label: "Kho minh chứng", href: "/evidence" }, { label: "Việc của tôi", href: "/tasks" }] },
  FEEDBACK: { workflow: ["Tiếp nhận", "Phân loại", "Phối hợp", "Phản hồi", "Action/CAPA nếu cần", "Đóng"], principle: "Phản ánh là đầu vào chất lượng; chuyển thành Finding/Action/CAPA khi thực sự cần theo dõi hệ thống.", related: [{ label: "Findings", href: "/findings" }, { label: "CAPA", href: "/capa" }, { label: "Việc của tôi", href: "/tasks" }] },
};

export function getModuleUx(recordTypes: string[]): ModuleUx {
  return map[recordTypes[0]] || { workflow: ["Ghi nhận", "Phân công", "Thực hiện", "Minh chứng", "Xác nhận", "Đóng"], principle: "Hồ sơ phải có owner, trạng thái, bằng chứng và lịch sử thay đổi rõ ràng.", related: common };
}
