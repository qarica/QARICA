// Đạt/Không đạt dùng chung cho cả UI (procedure-training-detail-client.tsx)
// và route xuất Excel (api/procedure-trainings/[id]/export/excel) — 1 nguồn
// sự thật duy nhất (CLAUDE.md nguyên tắc 2), không tính lại logic 2 lần ở 2
// nơi khác nhau rồi có nguy cơ lệch nhau.
//
// So điểm ở ĐỢT KIỂM TRA CUỐI CÙNG (sort_order lớn nhất trong TOÀN BỘ các
// đợt đã tạo, không chỉ các đợt người đó đã có điểm) với pass_threshold, VÀ
// bắt buộc đã điểm danh (attended=true). Theo đúng quy trình tập huấn thật
// (người dùng mô tả): Pre-test chỉ để đánh giá nền tảng trước học, không có
// giá trị xét đạt/cấp chứng nhận; CHỈ Post-test mới được xét đạt — và kết
// quả Post-test chỉ được công nhận khi đã có đủ dữ liệu điểm danh tham gia
// lớp học. "nếu chỉ làm Pre không làm Post thì coi như không đạt, cần học
// lại" — tức là CHƯA làm đợt cuối cùng (dù đã có điểm ở đợt trước đó, vd
// Pre-test) vẫn tính là "Không đạt", không phải "chưa có kết quả" trung
// lập. Chỉ trả "none" khi người đó CHƯA làm bài ở BẤT KỲ đợt nào.
export type PassStatusRound = { id: string; sort_order: number; round_date: string | null };
export type PassStatusResult = { round_id: string; score: number | null };

export function computePassStatus(
  myResults: PassStatusResult[],
  rounds: PassStatusRound[],
  passThreshold: number | null,
  attended: boolean,
): "pass" | "fail" | "none" {
  if (passThreshold == null || !rounds.length) return "none";
  const hasAnyScore = myResults.some((r) => r.score != null);
  if (!hasAnyScore) return "none";
  const finalRound = [...rounds].sort((a, b) => b.sort_order - a.sort_order || (b.round_date || "").localeCompare(a.round_date || ""))[0];
  const finalResult = myResults.find((r) => r.round_id === finalRound.id && r.score != null);
  if (!finalResult || !attended) return "fail";
  return (finalResult.score as number) >= passThreshold ? "pass" : "fail";
}
