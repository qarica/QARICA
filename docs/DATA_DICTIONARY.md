# QARICA — Từ điển dữ liệu (Data Dictionary)

> Tài liệu này mô tả mô hình dữ liệu cốt lõi đã xác minh trực tiếp từ source
> code (không suy đoán). Phạm vi: mô hình Registry dùng chung (`records`) và
> các bảng nghiệp vụ (domain table) gắn với từng `record_type`, cộng thêm các
> bảng phụ RCA và Indicator đã đọc trực tiếp. Đây **không phải** liệt kê đầy đủ
> mọi bảng trong database (ví dụ: bảng workflow/audit log nội bộ, notification,
> permission chưa liệt kê ở đây) — chỉ phần cốt lõi phục vụ người đọc mới hiểu
> nhanh mô hình nghiệp vụ.
>
> Nguồn xác minh: `src/app/api/domain-records/route.ts`, `src/app/api/incidents/[id]/rca/route.ts`,
> `src/components/indicator-quality-overview.tsx`, `src/app/(app)/incidents/page.tsx`.

## 1. Mô hình Registry dùng chung

Mọi hồ sơ nghiệp vụ (Directive, Report, Inspection, Indicator Measurement,
Finding, Incident, CAPA, Risk, FMEA, Improvement Proposal/Project, Assessment,
External Assessment, Audit, Safety Alert, Feedback...) đều có **1 dòng gốc**
trong bảng `records`, rồi **1 dòng chi tiết nghiệp vụ** trong bảng riêng của
loại đó, liên kết qua `record_id`.

### `records` (bảng gốc — Registry)

| Cột | Ý nghĩa |
|---|---|
| `id` | Khóa chính, dùng làm `record_id` ở mọi bảng domain |
| `organization_id` | Bệnh viện sở hữu hồ sơ (multi-tenant) |
| `record_type` | Loại hồ sơ — xem danh sách `SUPPORTED` bên dưới |
| `record_code` | Mã hồ sơ, cấp tự động qua RPC `next_record_code` |
| `title` | Tên hồ sơ, bắt buộc khi tạo |
| `work_year` | Năm làm việc |
| `owner_department_id` | Khoa/phòng phụ trách |
| `owner_user_id` | Người phụ trách |
| `lifecycle_status` | `ACTIVE` khi tạo thành công; `ARCHIVED` nếu insert domain thất bại (rollback thủ công) |
| `created_by` | Người tạo |

`record_type` được hỗ trợ (tập `SUPPORTED` trong `domain-records/route.ts`):
`DIRECTIVE, REPORT, INSPECTION, INDICATOR_MEASUREMENT, FINDING, INCIDENT, CAPA,
RISK, FMEA, IMPROVEMENT_PROPOSAL, IMPROVEMENT_PROJECT, ASSESSMENT,
EXTERNAL_ASSESSMENT, AUDIT, SAFETY_ALERT, FEEDBACK`.

### Bảng domain tương ứng (tạo cùng lúc với `records`, qua `POST /api/domain-records`)

| `record_type` | Bảng domain | Cột đáng chú ý |
|---|---|---|
| `DIRECTIVE` | `external_directives` | `source_authority`, `document_number`, `priority`, `workflow_status` (khởi tạo `OPEN`) |
| `REPORT` | `reporting_obligations` | `report_type`, `reporting_period_*`, `due_date`, `workflow_status` (khởi tạo `NOT_DUE`) |
| `INSPECTION` | `inspection_events` | `inspection_type`, `visit_date` (bắt buộc), `workflow_status` (khởi tạo `PLANNING`) |
| `INDICATOR_MEASUREMENT` | `indicator_measurements` | `indicator_assignment_id`, `period_start/end`, `raw_value`, `source_mode="MANUAL"`, `workflow_status` (khởi tạo `DRAFT`) |
| `FINDING` | `findings` | `finding_type`, `description` (bắt buộc), `severity`, `workflow_status` (khởi tạo `OPEN`) |
| `INCIDENT` | `incidents` + `incident_reports` | xem mục 2 |
| `CAPA` | `capas` | `problem_statement` (bắt buộc), `priority`, `approval_required`, `effectiveness_due_date`, `workflow_status` (khởi tạo `DRAFT`) |
| `RISK` | `risks` | `risk_event` (bắt buộc), `cause_summary`, `potential_consequence`, `review_frequency`, `workflow_status` (khởi tạo `IDENTIFIED`) |
| `FMEA` | `fmea_studies` | `method` (`FMEA`/`HFMEA`, bắt buộc), `scoring_model_version_id`, `workflow_status` (khởi tạo `DRAFT`) |
| `IMPROVEMENT_PROPOSAL` | `improvement_proposals` | `problem_description` (bắt buộc), `source_type`, `workflow_status` (khởi tạo `DRAFT`) |
| `IMPROVEMENT_PROJECT` | `improvement_projects` | `problem_statement`, `start_date`, `target_end_date`, `workflow_status` (khởi tạo `DRAFT`) |
| `ASSESSMENT` | `assessment_rounds` + `assessment_round_criteria` | chỉ tạo được từ `criteria_set_versions.status="PUBLISHED"` |
| `EXTERNAL_ASSESSMENT` | `external_assessment_events` | `authority` (bắt buộc), `assessment_date`, `criteria_version_id` |
| `AUDIT` | `audits` | `audit_type` (bắt buộc), `lead_auditor_id`, `workflow_status` (khởi tạo `DRAFT`) |
| `SAFETY_ALERT` | `safety_alerts` | `summary`, `lesson`, `recommendation`, `status` (khởi tạo `DRAFT`) |
| `FEEDBACK` | `feedback_records` | `description` (bắt buộc), `feedback_type`, `response_due_at`, `workflow_status` (khởi tạo `RECEIVED`) |

Quy tắc chung: nếu insert bảng domain lỗi, hồ sơ `records` vừa tạo bị chuyển
`lifecycle_status="ARCHIVED"` ngay (không để hồ sơ rác ở `ACTIVE`).

## 2. Sự cố y khoa (Incident) — mô hình chi tiết

`incidents` (1 dòng/sự cố, `record_id` trỏ về `records`):
`occurred_at`, `detected_at`, `reported_at`, `incident_location_department_id`,
`incident_location_type`, `incident_location_text`, `summary` (= mô tả ban đầu),
`workflow_status` (khởi tạo `REPORTED`), `lead_department_id`,
`case_owner_user_id`, `harm_status`, `serious_event_flag`, `rca_required`.

`incident_reports` (1 dòng/lần báo cáo — theo Phụ lục III TT 43/2018/TT-BYT):
`incident_id`, `report_type` (`VOLUNTARY`/`MANDATORY`), `reporter_user_id`,
`reporter_name_snapshot`, `reporter_department_id`, `reporter_identity_confidential`,
`patient_*` (tên/mã/ngày sinh/giới tính/khoa — chỉ khi liên quan người bệnh),
`initial_description`, `initial_solution_proposal`, `initial_harm_assessment`,
`notified_*` (đã báo BS điều trị / gia đình / người bệnh — `YES`/`NO`/`UNKNOWN`),
`initial_occurrence_classification` (`NEAR_MISS`/`OCCURRED`), `mandatory_report_flag`.

### RCA có cấu trúc (Timeline → Five Why → Fishbone → Root Cause)

| Bảng | Ý nghĩa |
|---|---|
| `rca_analyses` | 1 dòng/sự cố cần RCA — `incident_id`, `status` (`NOT_STARTED`/`IN_PROGRESS`/`COMPLETED`), `method` |
| `rca_timeline_events` | Diễn biến theo mốc thời gian — `event_time`, `event_title`, `event_description`, `source_reference` |
| `rca_five_whys` | Phân tích sâu tùy chọn — `why_level` (1-5, không trùng), `answer`, `evidence_note` |
| `rca_fishbone_factors` | Yếu tố góp phần theo 8 nhóm (`PATIENT`, `STAFF`, `TASK_TECHNOLOGY`, `TEAM`, `WORK_ENVIRONMENT`, `INFORMATION_SYSTEMS`, `ORGANIZATION_MANAGEMENT`, `INSTITUTIONAL_CONTEXT`) |
| `rca_root_causes` | Nguyên nhân gốc đã chốt — `category_code`, `cause_statement`, `evidence_basis`, `action_required` |

Gate "đủ điều kiện RCA" (`ready`): ≥1 timeline, ≥1 fishbone, ≥1 root cause, và
nếu có dùng Five Why thì phải ≥3 cấp.

## 3. Chỉ số chất lượng (Indicator)

| Bảng | Ý nghĩa |
|---|---|
| `indicator_definitions` | Định nghĩa chỉ số gốc — `code`, `name`, `quality_dimension`, `purpose` |
| `indicator_definition_versions` | Phiên bản có hiệu lực — `desired_direction` (`HIGHER_IS_BETTER`/`LOWER_IS_BETTER`/`TARGET_RANGE`/`NEUTRAL`), `calculation_type`, `unit`, `multiplier`, `frequency`, `status` (chỉ `PUBLISHED` mới dùng được) |
| `indicator_assignments` | Phân công đo theo khoa/phòng — `indicator_version_id`, `department_id`, `collector_user_id`, `work_year`, `frequency`, `local_target`, `status` (chỉ `ACTIVE` mới nhận kỳ đo mới), `auto_create_periods` |
| `indicator_measurements` | 1 dòng/kỳ đo — `period_start/end`, `raw_value`, `calculated_value`, `workflow_status` (`DRAFT→SUBMITTED→VERIFIED/RETURNED`, có thể `LOCKED`), `result_level` (`MEETS_TARGET`/`OUT_OF_TARGET`/`NOT_EVALUATED`) |

Quy ước "kỳ đo có thể tính toán được" dùng xuyên suốt dashboard: `workflow_status
∈ {VERIFIED, LOCKED}` **và** `result_level ∈ {MEETS_TARGET, OUT_OF_TARGET}`
(xem `src/lib/dashboard-kpi.ts`, `src/lib/indicator-trend-warning.ts`,
`src/lib/indicator-department-benchmark.ts`).
