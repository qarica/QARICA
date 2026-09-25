// Kiểu dữ liệu cho module EMR Rollout Dashboard.
// Khớp trực tiếp với schema trong supabase/migrations/20260925_emr_dashboard.sql

export type DigitizationStatus = "Chưa triển khai" | "Đang thực hiện" | "Hoàn thành";

export type DeptRolloutStatus =
  | "Chưa triển khai"
  | "Đang triển khai"
  | "Đã triển khai"
  | "Đã thực hiện EMR";

export type IssueStatus = "Mới" | "Đang xử lý" | "Chờ xác nhận" | "Đã sửa";

export type ProcessStatus = "Dự thảo" | "Đang lấy ý kiến" | "Đã ban hành" | "Tạm hoãn";

export type TrainingStatus =
  | "Chưa test"
  | "Test"
  | "Sửa lại"
  | "Hoàn thành"
  | "Không phải test";

export type EquipmentStatus = "Chưa thực hiện" | "Đang thực hiện" | "Đã thực hiện";

export interface Department {
  id: string;
  code: string | null;
  name: string;
  sort_order: number;
}

export interface EmrForm {
  id: string;
  code: string | null;
  name: string;
  form_group: string | null;
  category: string | null;
  owner_role: string | null;
  sign_order: string | null;
  requires_e_signature: boolean;
  requires_digital_sign: boolean;
  requires_stamp: boolean;
  scan_requirement: string | null;
  guide_doc_url: string | null;
  digitization_status: DigitizationStatus;
  notes: string | null;
}

export interface FormDepartmentStatus {
  id: string;
  form_id: string;
  department_id: string;
  status: DeptRolloutStatus;
  updated_at: string;
}

export interface FormIssue {
  id: string;
  form_id: string;
  category: string | null;
  description: string;
  status: IssueStatus;
  reported_at: string;
  resolved_at: string | null;
}

export interface EmrProcess {
  id: string;
  name: string;
  department: string | null;
  status: ProcessStatus;
  deadline: string | null;
  notes: string | null;
}

export interface ItEquipment {
  id: string;
  device_name: string;
  location: string;
  qty_available: number;
  qty_needed: number;
  notes: string | null;
}

export interface MedicalEquipment {
  id: string;
  name: string;
  model: string | null;
  manufacturer: string | null;
  origin_country: string | null;
  year: number | null;
  quantity: number;
  department: string | null;
  floor: string | null;
  room: string | null;
  image_format: string | null;
  integration_method: string | null;
  status: EquipmentStatus;
  notes: string | null;
}

export interface DigitalSignature {
  id: string;
  staff_name: string;
  department: string | null;
  title: string | null;
  provider: string | null;
  issued_at: string | null;
  expires_at: string | null;
  hardcopy_required: boolean;
  notes: string | null;
}

export interface TrainingSignoff {
  id: string;
  form_id: string | null;
  department: string;
  item_name: string | null;
  status: TrainingStatus;
  notes: string | null;
}

export interface FormRolloutSummary {
  form_id: string;
  form_name: string;
  form_group: string | null;
  total_departments: number;
  departments_started: number;
  departments_completed: number;
  overall_status: "Chưa gán khoa" | "Chờ triển khai" | "Đang triển khai" | "Đã hoàn thành";
}

export interface KpiSummary {
  total_forms: number;
  forms_started: number;
  forms_completed: number;
  forms_pending: number;
  pct_started: number | null;
  pct_completed: number | null;
}

export interface OpenIssuesSummary {
  form_id: string;
  form_name: string;
  open_issues: number;
  total_issues: number;
}
