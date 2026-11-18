import { computePassStatus, type PassStatusResult, type PassStatusRound } from "./procedure-training-pass-status";
import { normalizeEmployeeCode } from "./training-self-test";
import { normalizeName, stripHonorific } from "./training-import";

// Báo cáo thực tế: "1 chủ đề đào tạo có thể mở nhiều lớp nhiều đợt vào
// nhiều ngày khác nhau, người đăng ký có thể tham gia đợt này hoặc đợt
// khác. Nếu tham gia đợt này nhưng cần học lại thì có thể đăng ký lại để
// học lại đợt khác để đạt. Mỗi 1 đợt sẽ có 1 post riêng không liên quan
// nhau, chỉ tổng hợp kết quả nhân viên hoàn thành bài đào tạo nhưng chỉ
// khác ngày hoàn thành." — mỗi "đợt đào tạo" (1 bản ghi procedure_trainings)
// vẫn là 1 lớp/1 lần mở độc lập, tối đa 2 đợt kiểm tra riêng (xem
// src/app/api/procedure-trainings/[id]/rounds/route.ts) — KHÔNG đổi. Cái
// còn thiếu là xem GỘP: cùng 1 chủ đề, ai đã hoàn thành ở đợt/ngày nào,
// bất kể đợt cụ thể nào. "Cùng chủ đề" xác định theo cả 2 cách tuỳ tình
// huống (người dùng xác nhận): ưu tiên document_publication_id nếu cả 2
// đợt đều gắn văn bản (chính xác, không lệch do gõ tên khác nhau); nếu
// không có văn bản thì khớp theo procedure_name chuẩn hoá (trim + lowercase
// theo locale "vi").

export type TopicTraining = {
  id: string;
  procedure_name: string;
  document_publication_id: string | null;
  effective_date: string | null;
  pass_threshold: number | null;
};

export function topicKeyFor(training: Pick<TopicTraining, "document_publication_id" | "procedure_name">): string {
  if (training.document_publication_id) return `doc:${training.document_publication_id}`;
  return `name:${training.procedure_name.trim().toLocaleLowerCase("vi")}`;
}

// Chỉ trả về các nhóm có TỪ 2 đợt đào tạo trở lên — nhóm 1 đợt duy nhất
// không có gì để gộp, không cần hiện ở màn "Theo chủ đề".
export function groupTrainingsByTopic<T extends TopicTraining>(trainings: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const t of trainings) {
    const key = topicKeyFor(t);
    groups.set(key, [...(groups.get(key) || []), t]);
  }
  for (const [key, list] of groups) {
    if (list.length < 2) groups.delete(key);
  }
  return groups;
}

export type TopicAttendee = {
  id: string;
  training_id: string;
  employee_code: string | null;
  employee_name: string;
  department: string | null;
  job_title: string | null;
  attended: boolean;
};

export type TopicEmployeeRollup = {
  // Khoá gộp nội bộ (mã NV đã chuẩn hoá, hoặc tên đã chuẩn hoá khi không có
  // mã) — dùng làm React key, KHÔNG phải để hiển thị cột "Mã NV".
  key: string;
  employeeCode: string | null;
  employeeName: string;
  department: string | null;
  jobTitle: string | null;
  status: "pass" | "fail" | "none";
  // Đợt (training) nơi người này ĐẠT, sớm nhất theo effective_date nếu đạt
  // nhiều đợt — null nếu chưa đạt đợt nào.
  passedTraining: { trainingId: string; procedureName: string; effectiveDate: string | null } | null;
  attemptCount: number;
};

// Báo cáo thực tế: "Nút theo chủ đề ko lấy đủ số lượng" — trước đây người
// KHÔNG có mã NV bị loại thẳng khỏi bảng gộp này (so khớp theo tên giữa
// các đợt khác nhau trước đây coi là không đáng tin), nên thiếu hẳn người,
// không chỉ là không gộp được. Sau khi mã NV đã thành tùy chọn ở form tự
// test (xem training-test/[roundId]/submit/route.ts), số người không có mã
// NV tăng lên, càng làm bảng này thiếu nhiều. Sửa: ưu tiên gộp theo mã NV
// đã chuẩn hoá khi có; khi KHÔNG có mã thì vẫn đưa vào bảng, gộp theo tên
// đã chuẩn hoá (dùng lại normalizeName + stripHonorific của training-
// import.ts — cùng mức độ tin cậy đã chấp nhận ở route submit tự test) thay
// vì bỏ hẳn.
function topicRollupKey(a: Pick<TopicAttendee, "employee_code" | "employee_name">): string {
  if (a.employee_code) return `code:${normalizeEmployeeCode(a.employee_code)}`;
  return `name:${stripHonorific(normalizeName(a.employee_name))}`;
}

export function buildTopicCompletion(
  trainings: TopicTraining[],
  attendees: TopicAttendee[],
  roundsByTraining: Map<string, PassStatusRound[]>,
  resultsByAttendeeId: Map<string, PassStatusResult[]>,
): TopicEmployeeRollup[] {
  const trainingById = new Map(trainings.map((t) => [t.id, t]));
  const byKey = new Map<string, TopicAttendee[]>();
  for (const a of attendees) {
    const key = topicRollupKey(a);
    byKey.set(key, [...(byKey.get(key) || []), a]);
  }

  const rollups: TopicEmployeeRollup[] = [];
  for (const [key, rows] of byKey) {
    let best: "pass" | "fail" | "none" = "none";
    let passedTraining: TopicEmployeeRollup["passedTraining"] = null;
    for (const row of rows) {
      const training = trainingById.get(row.training_id);
      if (!training) continue;
      const rounds = roundsByTraining.get(row.training_id) || [];
      const myResults = resultsByAttendeeId.get(row.id) || [];
      const status = computePassStatus(myResults, rounds, training.pass_threshold, row.attended);
      if (status === "pass" && (best !== "pass" || !passedTraining || (training.effective_date || "") < (passedTraining.effectiveDate || "9999-99-99"))) {
        best = "pass";
        passedTraining = { trainingId: training.id, procedureName: training.procedure_name, effectiveDate: training.effective_date };
      } else if (status === "fail" && best === "none") {
        best = "fail";
      }
    }
    const latest = rows[rows.length - 1];
    rollups.push({
      key,
      employeeCode: latest.employee_code ? normalizeEmployeeCode(latest.employee_code) : null,
      employeeName: latest.employee_name,
      department: latest.department,
      jobTitle: latest.job_title,
      status: best,
      passedTraining,
      attemptCount: rows.length,
    });
  }
  return rollups.sort((a, b) => a.employeeName.localeCompare(b.employeeName, "vi"));
}
