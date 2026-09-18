export type IncidentJourneyStatus =
  | "REPORTED"
  | "RETURNED"
  | "TRIAGED"
  | "INVESTIGATION_REQUIRED"
  | "INVESTIGATING"
  | "ACTION_FOLLOW_UP"
  | "AWAITING_CLOSURE"
  | "CLOSED"
  | "REJECTED";

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
      title: "Làm ngay: chuyển sang hành động phòng ngừa",
      instruction: "Sự cố đã xác minh và không cần điều tra. Chuyển hồ sơ sang theo dõi Action/CAPA.",
      next: "Tạo Action có người phụ trách, hạn hoàn thành và minh chứng trước khi xin đóng.",
      targetId: "incident-follow-up-transition",
      skippedInvestigation: true,
    };
  }

  if (normalized === "INVESTIGATION_REQUIRED") {
    return {
      step: 3,
      title: options.canInvestigate ? "Làm ngay: mở điều tra" : "Chờ người có quyền mở điều tra",
      instruction: "Chọn loại điều tra phù hợp. Nếu là sự cố nghiêm trọng/RCA bắt buộc, hệ thống sẽ giữ gate RCA.",
      next: "Sau khi mở điều tra: ghi yếu tố góp phần → RCA (nếu yêu cầu) → kết luận điều tra.",
      targetId: options.canInvestigate ? "incident-start-investigation" : null,
      waitForQlcl: !options.canInvestigate,
    };
  }

  if (normalized === "INVESTIGATING") {
    return {
      step: 3,
      title: options.rcaRequired ? "Làm ngay: hoàn tất điều tra và RCA" : "Làm ngay: hoàn tất điều tra",
      instruction: options.rcaRequired
        ? "Theo đúng thứ tự: yếu tố góp phần → Timeline → Five Why → Fishbone → nguyên nhân gốc → kết luận điều tra."
        : "Ghi yếu tố góp phần, sự kiện đã xác minh, kết luận tổn hại và kết luận điều tra.",
      next: "Khi điều tra đủ gate, hồ sơ chuyển sang Action/CAPA.",
      targetId: options.canInvestigate ? "incident-investigation" : null,
      waitForQlcl: !options.canInvestigate,
    };
  }

  if (normalized === "ACTION_FOLLOW_UP") {
    return {
      step: 4,
      title: "Làm ngay: tạo và theo dõi Action/CAPA",
      instruction: "Tạo Action cho việc cụ thể; dùng CAPA khi cần xử lý nguyên nhân hệ thống/lặp lại/nghiêm trọng và phải đánh giá hiệu lực.",
      next: "Hoàn thành Action áp dụng + bổ sung minh chứng → xác nhận đủ điều kiện đóng.",
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

  if (normalized === "REJECTED") {
    return {
      step: 6,
      title: "Hồ sơ đã đóng vì không phải sự cố y khoa",
      instruction: "Lý do từ chối được lưu trong lịch sử. Không tiếp tục điều tra, Action/CAPA hay gate đóng.",
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
