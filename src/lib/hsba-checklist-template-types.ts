// Audit HSBA: nhiều mẫu bảng kiểm (template) cho mỗi loại audit, mỗi mẫu có
// nhiều phiên bản (Nháp/Đã phát hành/Ngừng dùng) — xem migration
// 20261022_hsba_checklist_templates_v1.sql để biết lý do kiến trúc.
export const CHECKLIST_VERSION_STATUSES = ["DRAFT", "PUBLISHED", "RETIRED"] as const;
export type ChecklistVersionStatus = (typeof CHECKLIST_VERSION_STATUSES)[number];

export const CHECKLIST_VERSION_STATUS_LABEL: Record<ChecklistVersionStatus, string> = {
  DRAFT: "Nháp",
  PUBLISHED: "Đã phát hành",
  RETIRED: "Ngừng dùng",
};

export type ChecklistVersionSummary = {
  id: string;
  version_no: number;
  status: ChecklistVersionStatus;
  published_at: string | null;
  item_count: number;
};

export type ChecklistTemplateSummary = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  published_version: ChecklistVersionSummary | null;
  draft_version: ChecklistVersionSummary | null;
};
