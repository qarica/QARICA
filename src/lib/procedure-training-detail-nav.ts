import { classCodeSequence } from "./procedure-training-class-code";
import { topicKeyFor } from "./procedure-training-topic-rollup";

// Điều hướng trang chi tiết lớp đào tạo — logic THUẦN (test được), dùng chung cho trang server
// ([id]/page.tsx) và thành phần giao diện.
//
// Báo cáo thực tế: "giao diện và cách phân các màn hình đào tạo và menu hơi bị rối" — trang chi
// tiết có tới 7 tab ngang hàng. Gom thành 3 BƯỚC theo đúng trình tự làm việc thực tế của 1 lớp:
//   1. Chuẩn bị   : Thông tin đào tạo, Câu hỏi & đáp án, Đăng ký
//   2. Tổ chức lớp: Điểm danh, Nhân sự & điểm, Nhập dữ liệu
//   3. Kết quả    : Phân tích
// Không đổi/xoá tab hay dữ liệu nào — chỉ đổi cách nhóm để mỗi lúc chỉ thấy vài tab liên quan.
export type DetailTab = "info" | "questions" | "registration" | "attendance" | "roster" | "import" | "analysis";

export const DETAIL_TABS: readonly DetailTab[] = ["info", "questions", "registration", "attendance", "roster", "import", "analysis"];

export function parseDetailTab(value: unknown): DetailTab | null {
  return typeof value === "string" && (DETAIL_TABS as readonly string[]).includes(value) ? (value as DetailTab) : null;
}

export type DetailStep = { key: "prepare" | "run" | "result"; label: string; tabs: DetailTab[] };

const STEP_DEFS: DetailStep[] = [
  { key: "prepare", label: "Chuẩn bị", tabs: ["info", "questions", "registration"] },
  { key: "run", label: "Tổ chức lớp", tabs: ["attendance", "roster", "import"] },
  { key: "result", label: "Kết quả", tabs: ["analysis"] },
];

// Lớp ở chế độ "chỉ điểm danh" (tập huấn không có bài test) không có tab Câu hỏi & đáp án và Phân
// tích điểm → bước "Kết quả" trống thì bỏ hẳn, không hiện bước rỗng.
export function stepsFor(attendanceOnly: boolean): DetailStep[] {
  // Lớp có bài test chỉ dùng QR làm bài (nộp bài = có mặt) nên không có tab QR Điểm danh — tránh quét 2 lần.
  const hidden: DetailTab[] = attendanceOnly ? ["questions", "analysis"] : ["attendance"];
  return STEP_DEFS.map((s) => ({ ...s, tabs: s.tabs.filter((t) => !hidden.includes(t)) })).filter((s) => s.tabs.length > 0);
}

export function stepOfTab(steps: DetailStep[], tab: DetailTab): DetailStep {
  return steps.find((s) => s.tabs.includes(tab)) ?? steps[0];
}

// ---------------------------------------------------------------------------
// Nút chọn lớp: "1 chủ đề có nhiều lớp thì nên chọn 1 nút như nút Năm để hiển thị thông tin sẽ dễ
// hơn là out ra để chọn lại". "Cùng chủ đề" theo ĐÚNG quy tắc đã dùng ở màn "Theo chủ đề"
// (topicKeyFor: ưu tiên văn bản gốc, nếu không thì tên quy trình chuẩn hoá) — 1 nguồn duy nhất.
export type ClassOptionSource = {
  id: string;
  procedure_code: string | null;
  procedure_name: string;
  document_publication_id: string | null;
  session_1_time: string | null;
  status: string;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = { TRAINED: "Đã đào tạo", PLANNED: "Kế hoạch", NOT_PLANNED: "Chưa lên kế hoạch" };

function viDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(d);
}

export function buildClassOptions(current: ClassOptionSource, all: ClassOptionSource[]): { id: string; label: string }[] {
  const key = topicKeyFor(current);
  const sameTopic = all.filter((t) => topicKeyFor(t) === key);
  // Đảm bảo lớp đang xem luôn có mặt (kể cả khi vượt giới hạn truy vấn danh sách).
  if (!sameTopic.some((t) => t.id === current.id)) sameTopic.push(current);
  sameTopic.sort((a, b) => {
    const sa = classCodeSequence(a.procedure_code ?? "") ?? 1;
    const sb = classCodeSequence(b.procedure_code ?? "") ?? 1;
    return sa - sb || a.created_at.localeCompare(b.created_at);
  });
  return sameTopic.map((t) => {
    const seq = classCodeSequence(t.procedure_code ?? "") ?? 1;
    const when = t.session_1_time?.trim() || (viDate(t.created_at) ? `tạo ${viDate(t.created_at)}` : "");
    return { id: t.id, label: [`Lớp ${seq}`, when, STATUS_LABEL[t.status] ?? t.status].filter(Boolean).join(" · ") };
  });
}
