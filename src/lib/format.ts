export function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function humanStatus(status?: string | null) {
  if (!status) return "—";
  const map: Record<string, string> = {
    NOT_STARTED: "Chưa thực hiện",
    IN_PROGRESS: "Đang thực hiện",
    EVIDENCE_SUBMITTED: "Đã nộp minh chứng",
    VERIFYING: "Chờ xác minh",
    RETURNED: "Trả lại bổ sung",
    COMPLETED: "Hoàn thành",
    CANCELLED: "Đã hủy",
    NOT_APPLICABLE: "Không áp dụng",
    ACTIVE: "Đang hoạt động",
    CLOSED: "Đã đóng",
    DRAFT: "Nháp",
    PENDING: "Chờ xử lý",
    PENDING_APPROVAL: "Chờ phê duyệt",
    APPROVED: "Đã phê duyệt",
    ON_HOLD: "Tạm dừng",
    ARCHIVED: "Lưu trữ",
    INACTIVE: "Ngưng hoạt động",
    RETIRED: "Ngưng sử dụng",
    SCHEDULED: "Cần kiểm",
    AWAITING_CONFIRMATION: "Chờ QLCL xác nhận",
    CONFIRMED: "Đã xác nhận",
    PUBLISHED: "Đã phát hành",
    VALID: "Hợp lệ",
    INVALID: "Không hợp lệ",
    REJECTED: "Từ chối",
    EXPIRED: "Hết hiệu lực",
    SUBMITTED: "Đã gửi",
    VERIFIED: "Đã xác minh",
    EFFECTIVE: "Có hiệu lực",
    INEFFECTIVE: "Chưa hiệu lực",
    GENERATED: "Đã sinh",
    SKIPPED: "Bỏ qua",
    REOPENED: "Mở lại",
    OVERDUE: "Quá hạn",
    LOCKED: "Đã khóa",
  };
  return map[status] || status.replaceAll("_", " ");
}
