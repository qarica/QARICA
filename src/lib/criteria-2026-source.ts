export type CriterionSourceGroup = {
  sourceLeadLabel: string;
  codes: string[];
};

export type CriterionPrioritySource = {
  code: string;
  targetLevel: number;
  dueDate: string;
  sourceDueText: string;
};

export const CRITERION_2026_SOURCE_GROUPS: CriterionSourceGroup[] = [
  { sourceLeadLabel: "CSKH", codes: ["A1.1","A1.2","A4.5","A4.6"] },
  { sourceLeadLabel: "Khoa Khám bệnh", codes: ["A1.3","A1.5"] },
  { sourceLeadLabel: "Khoa Cấp cứu", codes: ["A1.4"] },
  { sourceLeadLabel: "Khoa Khám bệnh; CSKH", codes: ["A1.6"] },
  { sourceLeadLabel: "Phòng Hành chính", codes: ["A2.1","A2.2","A2.3","A2.4","A2.5","A3.1","A3.2","C1.1","C1.2"] },
  { sourceLeadLabel: "Phòng Kế toán", codes: ["A4.1","A4.2","A4.3","A4.4"] },
  { sourceLeadLabel: "Phòng Nhân sự", codes: ["B1.1","B1.2","B1.3","B2.1","B2.2","B2.3","B3.1","B3.2","B3.3","B3.4"] },
  { sourceLeadLabel: "Ban Giám đốc, Phòng Nhân sự", codes: ["B4.1","B4.2","B4.3","B4.4"] },
  { sourceLeadLabel: "Phòng KHTH", codes: ["C2.1","C2.2","C5.1","C5.2","C5.3","C5.4","C5.5"] },
  { sourceLeadLabel: "Phòng Công nghệ thông tin", codes: ["C3.1","C3.2"] },
  { sourceLeadLabel: "Tổ Kiểm soát nhiễm khuẩn", codes: ["C4.1","C4.2","C4.3","C4.4","C4.5","C4.6"] },
  { sourceLeadLabel: "Phòng Điều dưỡng", codes: ["C6.1","C6.2","C6.3","D2.4"] },
  { sourceLeadLabel: "Tổ Dinh dưỡng", codes: ["C7.1","C7.2","C7.3","C7.4","C7.5"] },
  { sourceLeadLabel: "Khoa Xét nghiệm", codes: ["C8.1","C8.2"] },
  { sourceLeadLabel: "Khoa Dược", codes: ["C9.1","C9.2","C9.3","C9.4","C9.5","C9.6"] },
  { sourceLeadLabel: "Hội đồng Khoa học kỹ thuật", codes: ["C10.1","C10.2"] },
  { sourceLeadLabel: "Tổ QLCL", codes: ["D1.1","D1.2","D1.3","D2.1","D2.2","D2.3","D2.5","D3.1","D3.2","D3.3"] },
  { sourceLeadLabel: "Khoa Sản", codes: ["E1.1","E1.2","E1.3"] },
  { sourceLeadLabel: "Khoa Nhi", codes: ["E2.1"] },
];

export const CRITERION_2026_SUPPORT_GROUPS: CriterionSourceGroup[] = [
  { sourceLeadLabel: "Các khoa lâm sàng", codes: ["C5.2","C9.4"] },
  { sourceLeadLabel: "Các khoa chuyên môn", codes: ["C5.3","C5.4","C5.5"] },
  { sourceLeadLabel: "Ban Giám đốc", codes: ["C9.2"] },
  { sourceLeadLabel: "Bộ phận Mua hàng", codes: ["C9.3"] },
  { sourceLeadLabel: "Khoa phòng Lâm sàng, Phòng truyền thông", codes: ["C9.5"] },
  { sourceLeadLabel: "Các thành viên trong hội đồng", codes: ["C9.6"] },
  { sourceLeadLabel: "Phòng KHTH", codes: ["D1.1","D1.2","D1.3","D2.1","D2.2","D2.3","D2.5","D3.1","D3.2","D3.3"] },
  { sourceLeadLabel: "Tổ QLCL", codes: ["D2.4"] },
];

export const CRITERION_2026_PRIORITY: CriterionPrioritySource[] = [
  { code: "B1.1", targetLevel: 3, dueDate: "2026-12-31", sourceDueText: "31/12/2026" },
  { code: "B1.2", targetLevel: 3, dueDate: "2026-12-31", sourceDueText: "31/12/2026" },
  { code: "B4.3", targetLevel: 3, dueDate: "2026-12-31", sourceDueText: "31/12/2026" },
  { code: "B4.4", targetLevel: 3, dueDate: "2026-12-31", sourceDueText: "31/12/2026" },
  { code: "C2.1", targetLevel: 4, dueDate: "2026-11-30", sourceDueText: "30/11/2026" },
  { code: "C2.2", targetLevel: 4, dueDate: "2026-11-30", sourceDueText: "30/11/2026" },
  { code: "C5.2", targetLevel: 3, dueDate: "2026-11-30", sourceDueText: "30/11/2026" },
  { code: "C7.5", targetLevel: 3, dueDate: "2026-11-30", sourceDueText: "30/11/2026" },
  { code: "D1.1", targetLevel: 3, dueDate: "2026-11-30", sourceDueText: "30/11/2026" },
  { code: "D2.2", targetLevel: 4, dueDate: "2026-11-30", sourceDueText: "30/11/2026 (tái tập huấn trước 31/10/2026)" },
  { code: "D2.4", targetLevel: 4, dueDate: "2026-11-30", sourceDueText: "30/11/2026 (tập huấn trước 30/09/2026, giám sát từ tháng 10/2026)" },
  { code: "D3.1", targetLevel: 3, dueDate: "2026-11-30", sourceDueText: "30/11/2026 (công bố kết quả trước 30/09/2026)" },
  { code: "E1.3", targetLevel: 3, dueDate: "2026-11-30", sourceDueText: "30/11/2026" },
];

export const CRITERION_2026_CONTACTS: Record<string,string> = {
  "C2.1": "Nguyễn Thị Đức",
  "C2.2": "Nguyễn Thị Đức",
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

export type ResponsibilityDepartment = { id: string; name: string; short_name?: string | null };

const SOURCE_ALIASES: Record<string, string[]> = {
  "cskh": ["phong marketing cskh"],
  "phong khth": ["phong ke hoach tong hop"],
  "khoa xn": ["khoa xet nghiem"],
  "bo phan cntt": ["phong cong nghe thong tin"],
  "khoa cap cuu": ["khoa cap cuu hoi suc tich cuc"],
  "phong hanh chinh": ["phong to chuc hanh chinh"],
  "phong ke toan": ["phong tai chinh ke toan"],
  "to kiem soat nhiem khuan": ["khoa kiem soat nhiem khuan"],
  "to ksnk": ["khoa kiem soat nhiem khuan"],
  "to dinh duong": ["khoa dinh duong"],
  "khoa san": ["khoa phu san"],
  "to qlcl": ["phong quan ly chat luong", "phong ke hoach tong hop"],
  "bo phan qlcl": ["phong quan ly chat luong", "phong ke hoach tong hop"],
  "ban giam doc phong nhan su": ["ban giam doc"],
  "khoa kham benh cskh": ["khoa kham benh", "phong marketing cskh"],
};

export function responsibilityDepartmentCandidates(sourceLabel: string, departments: ResponsibilityDepartment[]) {
  const label = fold(sourceLabel);
  const aliases = SOURCE_ALIASES[label] ?? [label];
  const matches = departments.filter((department) => {
    const haystack = fold([department.name, department.short_name].filter(Boolean).join(" "));
    return aliases.some((alias) => haystack === alias || haystack.includes(alias) || alias.includes(haystack));
  });
  return Array.from(new Map(matches.map((item) => [item.id, item])).values());
}

export function sourceLeadForCode(code: string) {
  return CRITERION_2026_SOURCE_GROUPS.find((group) => group.codes.includes(code))?.sourceLeadLabel ?? "";
}

export function sourceSupportForCode(code: string) {
  return CRITERION_2026_SUPPORT_GROUPS.find((group) => group.codes.includes(code))?.sourceLeadLabel ?? null;
}

export function prioritySourceForCode(code: string) {
  return CRITERION_2026_PRIORITY.find((item) => item.code === code) ?? null;
}
