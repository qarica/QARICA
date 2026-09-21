export type IncidentJourneyStatus =
  | "REPORTED"
  | "RETURNED"
  | "TRIAGED"
  | "INVESTIGATION_REQUIRED"
  | "INVESTIGATING"
  | "ACTION_FOLLOW_UP"
  | "AWAITING_CLOSURE"
  | "CLOSED"
  | "REJECTED"
  | "CANCELLED";

export type IncidentJourneyState = {
  step: number;
  title: string;
  instruction: string;
  next: string;
  targetId: string | null;
  waitForQlcl?: boolean;
  skippedInvestigation?: boolean;
};

export function getIncidentJourneyState(
  status: string,
  options: {
    canTriage?: boolean;
    canInvestigate?: boolean;
    canClose?: boolean;
    rcaRequired?: boolean;
  } = {},
): IncidentJourneyState {
  const normalized = String(status || "REPORTED").toUpperCase() as IncidentJourneyStatus;

  if (normalized === "REPORTED" || normalized === "RETURNED") {
    if (!options.canTriage) {
      return {
        step: 2,
        title: "Đã gửi báo cáo — chờ QLCL xác minh",
        instruction: "Người báo cáo không cần thao tác thêm tại hồ sơ này cho đến khi QLCL yêu cầu bổ sung.",
        next: "QLCL sẽ xác minh nội dung, phân loại mức tổn hại và quyết định có cần điều tra/RCA.",
        targetId: null,
        waitForQlcl: true,
      };
    }
    return {
      step: 2,
      title: "Làm ngay: xác minh và phân loại sự cố",
      instruction: "Đọc báo cáo ban đầu, kiểm tra xử trí tức thời, sau đó nhập mô tả đã xác minh và mức tổn hại.",
      next: "Nếu cần điều tra → mở điều tra/RCA. Nếu không cần điều tra → chuyển sang Action/CAPA.",
      targetId: "incident-triage",
    };
  }

  if (normalized === "TRIAGED") {
    return {
      step: 4,
      title: "Làm ngay: quyết định hành động sau xác minh",
      instruction: "Sự cố đã xác minh và không cần điều tra sâu. Chỉ tạo Action/CAPA khi thực sự cần biện pháp phòng ngừa; không tạo công việc chỉ để vượt gate.",
      next: "Nếu cần hành động → tạo Action/CAPA. Nếu không cần → ghi lý do và chuyển gate đóng.",
      targetId: "incident-follow-up-transition",
      skippedInvestigation: true,
    };
  }

  if (normalized === "INVESTIGATION_REQUIRED") {
    return {
      step: 3,
      title: options.canInvestigate ? "Làm ngay: mở điều tra" : "Chờ người có quyền mở điều tra",
      instruction: "Quyết định điều tra đã được xác lập ở bước xác minh. Hệ thống mở workspace phân tích phù hợp, không yêu cầu phân loại lại nếu không cần.",
      next: "Phân tích theo PLIV; mở RCA/London khi cần phân tích sâu, sau đó chốt nguyên nhân gốc.",
      targetId: options.canInvestigate ? "incident-start-investigation" : null,
      waitForQlcl: !options.canInvestigate,
    };
  }

  if (normalized === "INVESTIGATING") {
    return {
      step: 3,
      title: options.rcaRequired ? "Làm ngay: hoàn tất điều tra và RCA" : "Làm ngay: hoàn tất điều tra",
      instruction: options.rcaRequired
        ? "Hoàn thiện PLIV và RCA: dùng dữ kiện đã xác minh làm Timeline; Fishbone/Five Why là công cụ hỗ trợ khi cần, sau đó chốt nguyên nhân gốc có căn cứ."
        : "Hoàn thiện PLIV từ dữ kiện đã xác minh và chốt kết luận điều tra; không nhập lại thông tin đã có.",
      next: "Khi điều tra đủ gate, hồ sơ chuyển sang Action/CAPA.",
      targetId: options.canInvestigate ? "incident-investigation" : null,
      waitForQlcl: !options.canInvestigate,
    };
  }

  if (normalized === "ACTION_FOLLOW_UP") {
    return {
      step: 4,
      title: "Làm ngay: tạo và theo dõi Action/CAPA",
      instruction: "Tạo Action cho việc cụ thể; CAPA dùng cho nguyên nhân hệ thống/lặp lại/nghiêm trọng. Dữ liệu nguyên nhân gốc phải được mang sang, không nhập lại.",
      next: "Nếu có Action/CAPA: hoàn thành, bổ sung minh chứng và đánh giá hiệu lực. Nếu không cần: lưu lý do được duyệt → gate đóng.",
      targetId: "incident-actions",
    };
  }

  if (normalized === "AWAITING_CLOSURE") {
    return {
      step: 5,
      title: options.canClose ? "Làm ngay: xác nhận đóng sự cố" : "Đã đủ gate — chờ người có quyền đóng",
      instruction: "Các Action áp dụng đã hoàn tất và đã có minh chứng. Kiểm tra lần cuối trước khi đóng hồ sơ.",
      next: "Sau khi đóng: biên soạn/duyệt bài học kinh nghiệm để đưa vào Learning Hub nếu cần phổ biến.",
      targetId: options.canClose ? "incident-close" : null,
      waitForQlcl: !options.canClose,
    };
  }

  if (normalized === "CLOSED") {
    return {
      step: 6,
      title: "Sự cố đã đóng",
      instruction: "Hồ sơ nghiệp vụ đã hoàn tất. Báo cáo gốc, điều tra, RCA, Action/CAPA và audit trail được giữ nguyên.",
      next: "Nếu có giá trị học tập: hoàn thiện bài học đã khử định danh và phát hành vào Kho bài học / Cảnh báo.",
      targetId: "incident-lessons",
    };
  }

  if (normalized === "REJECTED" || normalized === "CANCELLED") {
    return {
      step: 6,
      title: normalized === "CANCELLED" ? "Hồ sơ đã hủy/kết thúc" : "Hồ sơ đã đóng vì không phải sự cố y khoa",
      instruction: normalized === "CANCELLED" ? "Hồ sơ lịch sử đã kết thúc. Không tiếp tục điều tra, Action/CAPA hay gate đóng." : "Lý do từ chối được lưu trong lịch sử. Không tiếp tục điều tra, Action/CAPA hay gate đóng.",
      next: "Không còn thao tác nghiệp vụ.",
      targetId: null,
    };
  }

  return {
    step: 1,
    title: "Kiểm tra trạng thái hồ sơ",
    instruction: "Trạng thái hiện tại chưa được ánh xạ vào luồng chuẩn.",
    next: "QLCL cần kiểm tra lịch sử và trạng thái dữ liệu.",
    targetId: null,
  };
}
