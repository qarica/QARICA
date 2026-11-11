// Nhập điểm Pre/Post-test từ file khảo sát (Google Form/Microsoft Form xuất
// ra, hoặc file đã chấm sẵn như báo cáo thật ATPT-HSBA) vào procedure_
// training_attendees. Số câu hỏi khác nhau giữa các đợt đào tạo — mọi logic
// ở đây đều suy ra số câu/cột từ chính file, không giả định cố định.
//
// Ghép Pre<->Post theo tên không bao giờ hoàn hảo (báo cáo thật ATPT-HSBA tự
// phân loại "ghép chắc chắn" / "cần rà soát thủ công" — không phải lỗi, là
// bản chất dữ liệu tên người gõ tay). Module này chỉ tự ghép khi tin cậy cao
// (tên khớp sau khi chuẩn hoá, hoặc khớp sau khi bỏ tiền tố học hàm/chức
// danh như "Bs", "Ths"); khi có NHIỀU hơn 1 khả năng khớp, không tự chọn —
// để lại thành 2 dòng riêng, người dùng tự ghép tay bằng công cụ roster đã
// có (Sửa điểm) sau khi xem bản xem trước.

export type ImportGroup = "PRE" | "POST";

export type RawPersonRow = {
  employeeName: string;
  employeeCode: string | null;
  dept: string | null;
  title: string | null;
  group: ImportGroup;
  score: number | null;
  rawAnswers: string[] | null;
};

export type ScoredPersonRow = RawPersonRow & { scoringSkipped: boolean };

export type ExistingAttendee = {
  id: string;
  employeeName: string;
  employeeCode: string | null;
  preScore: number | null;
  postScore: number | null;
};

export type DetectedColumns = {
  nameIdx: number;
  codeIdx: number | null;
  deptIdx: number | null;
  titleIdx: number | null;
  groupIdx: number | null;
  scoreIdx: number | null;
  scoreMaxFromHeader: number | null;
  questionIdxs: number[];
};

export type ImportAction =
  | {
      type: "insert";
      key: string;
      employeeName: string;
      employeeCode: string | null;
      dept: string | null;
      title: string | null;
      preScore: number | null;
      postScore: number | null;
    }
  | {
      type: "update";
      key: string;
      attendeeId: string;
      employeeName: string;
      preScore: number | null;
      postScore: number | null;
      preConflict: boolean;
      postConflict: boolean;
    };

function stripDiacritics(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

export function normalizeName(raw: string): string {
  return stripDiacritics(String(raw ?? ""))
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Sắp theo độ dài giảm dần — khớp tiền tố dài nhất trước ("bscki" trước "bs").
const HONORIFIC_PREFIXES = ["bsckii", "bscki", "ths.bs", "bsck", "ths", "bs", "cnddd", "cndd", "cnđd", "đd", "dd", "ktv", "ds"]
  .sort((a, b) => b.length - a.length);

export function stripHonorific(normalized: string): string {
  for (const prefix of HONORIFIC_PREFIXES) {
    if (normalized === prefix) continue;
    if (normalized.startsWith(`${prefix} `)) return normalized.slice(prefix.length + 1).trim();
  }
  return normalized;
}

export function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const sa = stripHonorific(na);
  const sb = stripHonorific(nb);
  return !!sa && !!sb && sa === sb;
}

function normalizeAnswer(s: string): string {
  return stripDiacritics(String(s ?? ""))
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;]+$/, "");
}

export function scoreAnswers(answers: string[], answerKey: string[]): number {
  const len = Math.min(answers.length, answerKey.length);
  let score = 0;
  for (let i = 0; i < len; i++) {
    if (normalizeAnswer(answers[i]) === normalizeAnswer(answerKey[i])) score++;
  }
  return score;
}

// "ho ten"/"ho va ten" ưu tiên trước — nhiều file Microsoft Form có sẵn cột
// "Tên" (định danh người trả lời, thường để trống) ĐỨNG TRƯỚC cột tên thật
// "Họ tên Thầy/Cô; Anh/Chị" — nếu so khớp "tên" (bare) ngang hàng, cột rỗng
// đứng trước sẽ thắng nhầm. Chỉ dùng "ten" làm phương án cuối khi không có
// cột nào khớp "ho ten"/"ho va ten".
const NAME_HINTS_SPECIFIC = ["ho ten", "ho va ten"];
const NAME_HINTS_FALLBACK = ["ten"];
const CODE_HINTS = ["ma nv", "ma nhan vien", "ma so nhan vien"];
const DEPT_HINTS = ["don vi"];
const TITLE_HINTS = ["chuc danh"];
const GROUP_HINTS = ["nhom"];
const SCORE_HINTS = ["diem"];

// So khớp từ ĐẦU tiêu đề, không phải "includes" ở bất kỳ đâu — câu hỏi thật
// có thể dài cả câu và vô tình chứa đúng từ khoá ("Ba thời điểm thực hiện
// bảng kiểm..." chứa chữ "điểm" nhưng không phải cột Điểm số; "đơn vị" tương
// tự có thể xuất hiện giữa câu). Tiêu đề định danh thật (Họ tên/Mã NV/Đơn
// vị/Chức danh/Nhóm/Điểm) luôn ngắn và bắt đầu đúng bằng từ khoá.
function headerStartsWithAny(normalizedHeader: string, hints: string[]): boolean {
  return hints.some((h) => normalizedHeader === h || normalizedHeader.startsWith(`${h} `) || normalizedHeader.startsWith(`${h}/`));
}

export function detectColumns(headerRow: unknown[]): DetectedColumns {
  const normalized = headerRow.map((h) => normalizeName(String(h ?? "")));
  // Cột câu hỏi ("Câu N. ...") phân loại trước tiên, tách biệt hẳn khỏi các
  // hint khác — câu hỏi thật có thể dài và chứa trùng từ khoá của cột khác.
  const questionIdxs = normalized.reduce<number[]>((acc, h, i) => {
    if (/^cau\s*\d+/.test(h)) acc.push(i);
    return acc;
  }, []);
  const isQuestionIdx = new Set(questionIdxs);

  let nameIdx = normalized.findIndex((h, i) => !isQuestionIdx.has(i) && headerStartsWithAny(h, NAME_HINTS_SPECIFIC));
  if (nameIdx === -1) nameIdx = normalized.findIndex((h, i) => !isQuestionIdx.has(i) && headerStartsWithAny(h, NAME_HINTS_FALLBACK));
  let codeIdx: number | null = null;
  let deptIdx: number | null = null;
  let titleIdx: number | null = null;
  let groupIdx: number | null = null;
  let scoreIdx: number | null = null;
  let scoreMaxFromHeader: number | null = null;

  normalized.forEach((h, i) => {
    if (i === nameIdx || isQuestionIdx.has(i)) return;
    if (codeIdx === null && headerStartsWithAny(h, CODE_HINTS)) {
      codeIdx = i;
      return;
    }
    if (deptIdx === null && headerStartsWithAny(h, DEPT_HINTS)) {
      deptIdx = i;
      return;
    }
    if (titleIdx === null && headerStartsWithAny(h, TITLE_HINTS)) {
      titleIdx = i;
      return;
    }
    if (groupIdx === null && headerStartsWithAny(h, GROUP_HINTS)) {
      groupIdx = i;
      return;
    }
    if (scoreIdx === null && headerStartsWithAny(h, SCORE_HINTS)) {
      scoreIdx = i;
      const m = String(headerRow[i] ?? "").match(/\/\s*(\d+)/);
      if (m) scoreMaxFromHeader = Number(m[1]);
    }
  });

  return { nameIdx, codeIdx, deptIdx, titleIdx, groupIdx, scoreIdx, scoreMaxFromHeader, questionIdxs };
}

// Mã NV gõ nhầm thành chữ (gặp thật trong dữ liệu ATPT-HSBA: "Hán văn hưng",
// "Điều dưỡng") — mã thật không có khoảng trắng và không có dấu tiếng Việt.
function looksLikeRealCode(raw: string): boolean {
  if (!raw) return false;
  if (/\s/.test(raw)) return false;
  if (/[^\x00-\x7F]/.test(raw)) return false;
  return true;
}

function cellString(row: unknown[], idx: number | null): string | null {
  if (idx == null) return null;
  const v = row[idx];
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

// defaultGroup áp dụng khi file không có cột Nhóm (vd upload riêng từng file
// Pre-test/Post-test thay vì 1 file gộp cả hai như "Du lieu cham diem") —
// người dùng tự chọn trước khi xem trước, không đoán bừa là Pre-test.
export function parseRows(dataRows: unknown[][], columns: DetectedColumns, defaultGroup: ImportGroup = "PRE"): RawPersonRow[] {
  const rows: RawPersonRow[] = [];
  for (const row of dataRows) {
    const name = cellString(row, columns.nameIdx);
    if (!name) continue;
    const codeRaw = cellString(row, columns.codeIdx);
    const code = codeRaw && looksLikeRealCode(codeRaw) ? codeRaw : null;
    const dept = cellString(row, columns.deptIdx);
    const title = cellString(row, columns.titleIdx);
    let group: ImportGroup = defaultGroup;
    if (columns.groupIdx != null) {
      const groupRaw = normalizeName(String(row[columns.groupIdx] ?? ""));
      group = groupRaw.includes("post") ? "POST" : "PRE";
    }

    let score: number | null = null;
    let rawAnswers: string[] | null = null;
    if (columns.scoreIdx != null) {
      const raw = row[columns.scoreIdx];
      const parsed = raw === "" || raw == null ? NaN : Number(raw);
      score = Number.isFinite(parsed) ? parsed : null;
    } else if (columns.questionIdxs.length) {
      rawAnswers = columns.questionIdxs.map((i) => String(row[i] ?? ""));
    }

    rows.push({ employeeName: name, employeeCode: code, dept, title, group, score, rawAnswers });
  }
  return rows;
}

export function applyAnswerKey(rows: RawPersonRow[], answerKey: string[] | null): ScoredPersonRow[] {
  return rows.map((r) => {
    if (r.score != null) return { ...r, scoringSkipped: false };
    if (r.rawAnswers && answerKey && answerKey.length) {
      return { ...r, score: scoreAnswers(r.rawAnswers, answerKey), scoringSkipped: false };
    }
    return { ...r, score: null, scoringSkipped: !!r.rawAnswers };
  });
}

function codesConflict(a: string | null, b: string | null): boolean {
  return !!a && !!b && a !== b;
}

export function buildImportPlan(scoredRows: ScoredPersonRow[], existing: ExistingAttendee[]): ImportAction[] {
  const existingPool = existing.map((e) => ({ ...e, consumed: false }));
  const pre = scoredRows.filter((r) => r.group === "PRE").map((r) => ({ ...r, consumed: false }));
  const post = scoredRows.filter((r) => r.group === "POST").map((r) => ({ ...r, consumed: false }));
  const actions: ImportAction[] = [];
  let keySeq = 0;

  for (const row of [...pre, ...post]) {
    const candidates = existingPool.filter((e) => !e.consumed && namesMatch(row.employeeName, e.employeeName) && !codesConflict(row.employeeCode, e.employeeCode));
    if (candidates.length !== 1) continue;
    const match = candidates[0];
    match.consumed = true;
    row.consumed = true;
    const preScore = row.group === "PRE" ? row.score : match.preScore;
    const postScore = row.group === "POST" ? row.score : match.postScore;
    const preConflict = row.group === "PRE" && match.preScore != null && row.score != null && match.preScore !== row.score;
    const postConflict = row.group === "POST" && match.postScore != null && row.score != null && match.postScore !== row.score;
    actions.push({ type: "update", key: `u${keySeq++}`, attendeeId: match.id, employeeName: row.employeeName, preScore, postScore, preConflict, postConflict });
  }

  const preLeft = pre.filter((r) => !r.consumed);
  const postLeft = post.filter((r) => !r.consumed);

  for (const p of preLeft) {
    const candidates = postLeft.filter((q) => !q.consumed && namesMatch(p.employeeName, q.employeeName) && !codesConflict(p.employeeCode, q.employeeCode));
    if (candidates.length === 1) {
      const q = candidates[0];
      q.consumed = true;
      actions.push({
        type: "insert",
        key: `i${keySeq++}`,
        employeeName: p.employeeName,
        employeeCode: p.employeeCode || q.employeeCode,
        dept: p.dept || q.dept,
        title: p.title || q.title,
        preScore: p.score,
        postScore: q.score,
      });
    } else {
      actions.push({ type: "insert", key: `i${keySeq++}`, employeeName: p.employeeName, employeeCode: p.employeeCode, dept: p.dept, title: p.title, preScore: p.score, postScore: null });
    }
  }
  for (const q of postLeft) {
    if (q.consumed) continue;
    actions.push({ type: "insert", key: `i${keySeq++}`, employeeName: q.employeeName, employeeCode: q.employeeCode, dept: q.dept, title: q.title, preScore: null, postScore: q.score });
  }

  return actions;
}
