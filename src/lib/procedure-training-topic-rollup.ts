import { computePassStatus, type PassStatusResult, type PassStatusRound } from "./procedure-training-pass-status";
import { normalizeEmployeeCode } from "./training-self-test";

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
  training_id: string;
  employee_code: string | null;
  employee_name: string;
  department: string | null;
  job_title: string | null;
  attended: boolean;
};

export type TopicEmployeeRollup = {
  normalizedCode: string;
  employeeName: string;
  department: string | null;
  jobTitle: string | null;
  status: "pass" | "fail" | "none";
  // Đợt (training) nơi người này ĐẠT, sớm nhất theo effective_date nếu đạt
  // nhiều đợt — null nếu chưa đạt đợt nào.
  passedTraining: { trainingId: string; procedureName: string; effectiveDate: string | null } | null;
  attemptCount: number;
};

// Chỉ gộp được người có mã NV (employee_code) — so khớp theo tên không đáng
// tin cậy giữa các đợt khác nhau (trùng tên khác người, hoặc cùng người gõ
// tên không giống nhau). Người không có mã NV vẫn hiện riêng trong từng
// đợt như cũ, không gộp ở màn "Theo chủ đề" này.
export function buildTopicCompletion(
  trainings: TopicTraining[],
  attendees: TopicAttendee[],
  roundsByTraining: Map<string, PassStatusRound[]>,
  resultsByAttendeeId: Map<string, PassStatusResult[]>,
  attendeeIdByTrainingAndCode: Map<string, string>,
): TopicEmployeeRollup[] {
  const trainingById = new Map(trainings.map((t) => [t.id, t]));
  const byCode = new Map<string, TopicAttendee[]>();
  for (const a of attendees) {
    if (!a.employee_code) continue;
    const code = normalizeEmployeeCode(a.employee_code);
    byCode.set(code, [...(byCode.get(code) || []), a]);
  }

  const rollups: TopicEmployeeRollup[] = [];
  for (const [code, rows] of byCode) {
    let best: "pass" | "fail" | "none" = "none";
    let passedTraining: TopicEmployeeRollup["passedTraining"] = null;
    for (const row of rows) {
      const training = trainingById.get(row.training_id);
      if (!training) continue;
      const rounds = roundsByTraining.get(row.training_id) || [];
      const attendeeId = attendeeIdByTrainingAndCode.get(`${row.training_id}:${code}`);
      const myResults = attendeeId ? resultsByAttendeeId.get(attendeeId) || [] : [];
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
      normalizedCode: code,
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
