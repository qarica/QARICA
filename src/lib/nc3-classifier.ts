// Đối chiếu mô tả sự cố với Danh mục sự cố y khoa nghiêm trọng (NC3)
// theo Phụ lục II, Thông tư 43/2018/TT-BYT. Đây là gợi ý bằng từ khóa,
// KHÔNG phải kết luận cuối cùng - QLCL luôn phải tự xác minh lại.

export type NC3Rule = { code: string; group: string; label: string; keywords: string[] };

export const NC3_RULES: NC3Rule[] = [
  { code: "1", group: "Phẫu thuật", label: "Phẫu thuật sai vị trí (bộ phận cơ thể)", keywords: ["sai vị trí phẫu thuật", "mổ sai bên", "mổ nhầm bên", "sai vị trí mổ"] },
  { code: "2", group: "Phẫu thuật", label: "Phẫu thuật sai người bệnh", keywords: ["mổ nhầm người bệnh", "phẫu thuật sai người bệnh", "mổ nhầm bệnh nhân"] },
  { code: "3", group: "Phẫu thuật", label: "Phẫu thuật sai phương pháp gây tổn thương nặng", keywords: ["sai phương pháp phẫu thuật", "sai quy trình phẫu thuật", "sai kỹ thuật mổ"] },
  { code: "4", group: "Phẫu thuật", label: "Bỏ quên dụng cụ, vật tư trong người bệnh", keywords: ["bỏ quên dụng cụ", "sót gạc", "sót dụng cụ", "quên gạc", "sót kim", "bỏ sót dụng cụ"] },
  { code: "5", group: "Phẫu thuật", label: "Tử vong trong/ngay sau phẫu thuật (ASA I)", keywords: ["tử vong trong phẫu thuật", "tử vong sau mổ", "tử vong trong mổ", "tử vong khi gây mê"] },
  { code: "6", group: "Trang thiết bị", label: "Tử vong/di chứng nặng liên quan thuốc, thiết bị, sinh phẩm", keywords: ["sự cố thiết bị y tế", "hỏng thiết bị gây tổn hại", "lỗi thiết bị y tế"] },
  { code: "7", group: "Trang thiết bị", label: "Tử vong/di chứng liên quan chức năng y dụng cụ khác kế hoạch", keywords: ["dụng cụ hoạt động sai chức năng", "thiết bị trục trặc trong điều trị"] },
  { code: "8", group: "Trang thiết bị", label: "Tử vong/di chứng do thuyên tắc khí nội mạch", keywords: ["thuyên tắc khí", "tắc mạch khí", "khí lọt vào mạch máu"] },
  { code: "9", group: "Quản lý người bệnh", label: "Giao nhầm trẻ sơ sinh", keywords: ["giao nhầm trẻ sơ sinh", "trao nhầm con", "nhầm trẻ sơ sinh"] },
  { code: "10", group: "Quản lý người bệnh", label: "Người bệnh trốn viện tử vong/di chứng nặng", keywords: ["trốn viện tử vong", "bỏ trốn khỏi bệnh viện", "tự ý ra viện tử vong"] },
  { code: "11", group: "Quản lý người bệnh", label: "Tự tử tại cơ sở khám chữa bệnh", keywords: ["tự tử", "tự sát tại bệnh viện", "treo cổ tại khoa", "nhảy lầu tự tử"] },
  { code: "12", group: "Chăm sóc", label: "Tử vong/di chứng do lỗi dùng thuốc (biết dị ứng/tương tác)", keywords: ["sốc phản vệ do thuốc", "dị ứng thuốc đã biết", "nhầm thuốc", "cho nhầm thuốc", "sai thuốc"] },
  { code: "13", group: "Chăm sóc", label: "Tử vong/di chứng do tán huyết vì truyền nhầm nhóm máu", keywords: ["truyền nhầm nhóm máu", "nhầm nhóm máu", "tán huyết do truyền máu", "truyền nhầm máu"] },
  { code: "14", group: "Chăm sóc", label: "Sản phụ tử vong/di chứng liên quan chuyển dạ, sinh con", keywords: ["sản phụ tử vong", "tử vong khi sinh", "tử vong sau sinh", "băng huyết tử vong"] },
  { code: "15", group: "Chăm sóc", label: "Tử vong/di chứng do hạ đường huyết trong điều trị", keywords: ["hạ đường huyết tử vong", "hạ đường huyết nặng", "hôn mê hạ đường huyết"] },
  { code: "16", group: "Chăm sóc", label: "Tử vong/di chứng do tăng bilirubin (vàng da nhân) sơ sinh", keywords: ["vàng da nhân", "vàng da sơ sinh nặng", "tăng bilirubin sơ sinh"] },
  { code: "17", group: "Chăm sóc", label: "Loét do tì đè độ 3 hoặc 4", keywords: ["loét tì đè độ 3", "loét tì đè độ 4", "loét ép độ 3", "loét ép độ 4"] },
  { code: "18", group: "Chăm sóc", label: "Tử vong/di chứng do vật lý trị liệu gây sang chấn cột sống", keywords: ["sang chấn cột sống", "chấn thương cột sống do vật lý trị liệu"] },
  { code: "19", group: "Chăm sóc", label: "Nhầm lẫn trong cấy ghép mô tạng / tinh trùng / trứng", keywords: ["nhầm mô tạng", "nhầm tinh trùng", "nhầm trứng", "nhầm phôi", "cấy ghép nhầm"] },
  { code: "20", group: "Môi trường", label: "Tử vong/di chứng do điện giật", keywords: ["điện giật", "giật điện tử vong", "tai nạn điện"] },
  { code: "21", group: "Môi trường", label: "Tai nạn do thiết kế đường oxy/khí y tế", keywords: ["nhầm khí y tế", "sự cố đường oxy", "khí lẫn độc chất", "nhầm bình oxy"] },
  { code: "22", group: "Môi trường", label: "Tử vong/di chứng do bỏng", keywords: ["bỏng nặng tại bệnh viện", "bỏng do điều trị", "phỏng nặng"] },
  { code: "23", group: "Môi trường", label: "Tử vong/di chứng do té ngã khi được chăm sóc y tế", keywords: ["té ngã tử vong", "ngã gãy tử vong", "ngã chấn thương sọ não", "té ngã nặng"] },
  { code: "24", group: "Phạm tội hình sự", label: "Giả mạo nhân viên y tế", keywords: ["giả mạo nhân viên y tế", "giả danh bác sĩ", "giả danh điều dưỡng"] },
  { code: "25", group: "Phạm tội hình sự", label: "Bắt cóc/dụ dỗ người bệnh", keywords: ["bắt cóc người bệnh", "dụ dỗ người bệnh", "bắt cóc trẻ sơ sinh"] },
  { code: "26", group: "Phạm tội hình sự", label: "Tấn công tình dục người bệnh", keywords: ["tấn công tình dục", "xâm hại tình dục người bệnh", "quấy rối tình dục người bệnh"] },
  { code: "27", group: "Phạm tội hình sự", label: "Gây tử vong/thương tích nghiêm trọng trong khuôn viên cơ sở", keywords: ["hành hung", "đánh nhau gây thương tích", "bạo lực trong bệnh viện", "tấn công nhân viên y tế"] },
  { code: "28", group: "Khác", label: "Sự cố nghiêm trọng khác chưa nêu ở trên", keywords: [] },
];

export type NC3Match = { rule: NC3Rule; matchedKeywords: string[] };

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // bỏ dấu để so khớp rộng hơn
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Đối chiếu 1 đoạn mô tả sự cố với Danh mục 28 mục NC3.
 * Trả về danh sách các mục khớp kèm từ khóa đã khớp - CHỈ LÀ GỢI Ý,
 * không tự động kết luận, không thay thế việc QLCL tự xác minh.
 */
export function matchNC3(description: string): NC3Match[] {
  const normalizedText = normalize(description || "");
  if (!normalizedText) return [];
  const results: NC3Match[] = [];
  for (const rule of NC3_RULES) {
    const matched = rule.keywords.filter((kw) => normalizedText.includes(normalize(kw)));
    if (matched.length) results.push({ rule, matchedKeywords: matched });
  }
  return results;
}
