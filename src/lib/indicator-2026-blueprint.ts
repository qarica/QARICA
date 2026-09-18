export type Indicator2026Blueprint = {
  key: string;
  sourceCode: string;
  name: string;
  dimension: string;
  owner: string;
  frequency: "MONTHLY" | "QUARTERLY";
  note: string;
  activeFrom: string;
  exactDefinitionCodes: string[];
  matchKeywords: string[];
};

export const INDICATOR_2026_BLUEPRINT: Indicator2026Blueprint[] = [
  {
    key: "ssi",
    sourceCode: "3",
    name: "Tỷ lệ nhiễm khuẩn vết mổ",
    dimension: "An toàn",
    owner: "Tổ Kiểm soát nhiễm khuẩn phối hợp Khoa Ngoại",
    frequency: "MONTHLY",
    note: "Duy trì, khôi phục theo dõi từ dữ liệu 2024",
    activeFrom: "2026-10-01",
    exactDefinitionCodes: ["CSCL-01"],
    matchKeywords: ["nhiem", "trung", "vet", "mo"],
  },
  {
    key: "patient-id",
    sourceCode: "BS01",
    name: "Tỷ lệ tuân thủ xác định đúng người bệnh",
    dimension: "An toàn",
    owner: "Phòng Điều dưỡng",
    frequency: "MONTHLY",
    note: "Duy trì, khôi phục theo dõi từ dữ liệu 2024",
    activeFrom: "2026-10-01",
    exactDefinitionCodes: [],
    matchKeywords: ["dung", "nguoi", "benh"],
  },
  {
    key: "hand-hygiene",
    sourceCode: "BS02",
    name: "Tỷ lệ tuân thủ vệ sinh tay",
    dimension: "An toàn",
    owner: "Tổ Kiểm soát nhiễm khuẩn",
    frequency: "MONTHLY",
    note: "Duy trì, khôi phục theo dõi từ dữ liệu 2024",
    activeFrom: "2026-10-01",
    exactDefinitionCodes: ["CSCL-02"],
    matchKeywords: ["ve", "sinh", "tay"],
  },
  {
    key: "surgical-checklist",
    sourceCode: "BS03",
    name: "Tỷ lệ tuân thủ Bảng kiểm an toàn phẫu thuật",
    dimension: "An toàn",
    owner: "Khoa Phẫu thuật – Gây mê hồi sức",
    frequency: "MONTHLY",
    note: "Duy trì, khôi phục theo dõi từ dữ liệu 2024",
    activeFrom: "2026-10-01",
    exactDefinitionCodes: ["CSCL-04"],
    matchKeywords: ["bang", "kiem", "an", "toan", "phau", "thuat"],
  },
  {
    key: "patient-satisfaction",
    sourceCode: "16",
    name: "Tỷ lệ hài lòng của người bệnh",
    dimension: "Hướng đến người bệnh",
    owner: "Phòng Điều dưỡng, Bộ phận CSKH",
    frequency: "QUARTERLY",
    note: "Duy trì, khôi phục theo dõi từ dữ liệu 2024",
    activeFrom: "2026-10-01",
    exactDefinitionCodes: [],
    matchKeywords: ["hai", "long", "nguoi", "benh"],
  },
  {
    key: "serious-incidents",
    sourceCode: "5",
    name: "Số sự cố y khoa nghiêm trọng",
    dimension: "An toàn",
    owner: "Tổ QLCL",
    frequency: "MONTHLY",
    note: "Mới 2026 — gắn Quy trình quản lý sự cố y khoa",
    activeFrom: "2026-10-01",
    exactDefinitionCodes: ["BYT7051-05"],
    matchKeywords: ["su", "co", "y", "khoa", "nghiem", "trong"],
  },
  {
    key: "alos",
    sourceCode: "8",
    name: "Thời gian nằm viện trung bình",
    dimension: "Hiệu suất",
    owner: "Phòng KHTH",
    frequency: "QUARTERLY",
    note: "Mới 2026 — theo QĐ 7051/QĐ-BYT",
    activeFrom: "2026-10-01",
    exactDefinitionCodes: ["BYT7051-08"],
    matchKeywords: ["thoi", "gian", "nam", "vien", "trung", "binh"],
  },
  {
    key: "bed-occupancy",
    sourceCode: "9",
    name: "Công suất sử dụng giường bệnh thực tế",
    dimension: "Hiệu suất",
    owner: "Phòng KHTH",
    frequency: "QUARTERLY",
    note: "Mới 2026 — theo QĐ 7051/QĐ-BYT",
    activeFrom: "2026-10-01",
    exactDefinitionCodes: ["BYT7051-09"],
    matchKeywords: ["cong", "suat", "giuong", "benh"],
  },
  {
    key: "mortality",
    sourceCode: "11",
    name: "Tỷ lệ tử vong và tiên lượng tử vong gia đình xin về",
    dimension: "Hiệu quả",
    owner: "Phòng KHTH",
    frequency: "QUARTERLY",
    note: "Mới 2026 — theo QĐ 7051/QĐ-BYT",
    activeFrom: "2026-10-01",
    exactDefinitionCodes: ["BYT7051-11"],
    matchKeywords: ["tu", "vong", "gia", "dinh", "xin", "ve"],
  },
  {
    key: "staff-satisfaction",
    sourceCode: "15",
    name: "Tỷ lệ hài lòng của nhân viên y tế",
    dimension: "Hướng đến nhân viên",
    owner: "Phòng Nhân sự",
    frequency: "QUARTERLY",
    note: "Mới 2026 — theo QĐ 7051/QĐ-BYT",
    activeFrom: "2026-10-01",
    exactDefinitionCodes: ["CSCL-08"],
    matchKeywords: ["hai", "long", "nhan", "vien", "y", "te"],
  },
];

export type IndicatorDefinitionCandidate = {
  id: string;
  code: string | null;
  name: string | null;
  assignmentId?: string | null;
};

function fold(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function blueprintCandidates(
  item: Indicator2026Blueprint,
  candidates: IndicatorDefinitionCandidate[],
) {
  const exact = candidates.filter((candidate) =>
    candidate.code && item.exactDefinitionCodes.includes(String(candidate.code).toUpperCase()),
  );
  if (exact.length) return exact;

  const required = item.matchKeywords.map(fold).filter(Boolean);
  return candidates.filter((candidate) => {
    const haystack = fold([candidate.code, candidate.name].filter(Boolean).join(" "));
    return required.every((token) => haystack.includes(token));
  });
}

export function blueprintResolution(
  item: Indicator2026Blueprint,
  candidates: IndicatorDefinitionCandidate[],
) {
  const matches = blueprintCandidates(item, candidates);
  if (matches.length === 1) return { status: "MATCHED" as const, candidate: matches[0], matches };
  if (matches.length > 1) return { status: "AMBIGUOUS" as const, candidate: null, matches };
  return { status: "MISSING" as const, candidate: null, matches };
}
