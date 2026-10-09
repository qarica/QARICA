import { describe, expect, it } from "vitest";
import { BIEU_MAU_TREE_UNGROUPED, sortBieuMauGroupItems, sortBieuMauGroupNames } from "./emr-bieu-mau-tree-order";

// Báo cáo thực tế: "File excel xuất từ cây biểu mẫu chưa đúng theo thứ tự
// hiển thị trên phần mềm" — cây và Excel xuất từ cây trước đó tự sắp xếp
// khác nhau (cây theo sort_order/binding_group_order, Excel theo A-Z tên
// nhóm/A-Z tiêu đề). Tách logic sắp xếp ra đây, dùng chung cho cả 2 nơi,
// kiểm tra hành vi thực sự thay vì chỉ so khớp chuỗi.
describe("sortBieuMauGroupNames — thứ tự nhóm gáy khớp Cây biểu mẫu", () => {
  it("nhóm đã khai báo xếp theo sort_order của chính nó, không phải A-Z", () => {
    const groups = [
      { name: "Nhóm B", sort_order: 1 },
      { name: "Nhóm A", sort_order: 0 },
    ];
    expect(sortBieuMauGroupNames(["Nhóm A", "Nhóm B"], groups)).toEqual(["Nhóm A", "Nhóm B"]);
    expect(sortBieuMauGroupNames(["Nhóm B", "Nhóm A"], groups)).toEqual(["Nhóm A", "Nhóm B"]);
  });

  it("tên chưa khai báo (dữ liệu cũ) xếp sau mọi nhóm đã khai báo, theo A-Z giữa chúng với nhau", () => {
    const groups = [{ name: "Nhóm chính thức", sort_order: 0 }];
    const result = sortBieuMauGroupNames(["Tên tự do Z", "Nhóm chính thức", "Tên tự do A"], groups);
    expect(result).toEqual(["Nhóm chính thức", "Tên tự do A", "Tên tự do Z"]);
  });

  it("'Chưa phân nhóm' luôn xếp cuối cùng, dù có khai báo hay không", () => {
    const groups = [{ name: "Nhóm A", sort_order: 5 }];
    const result = sortBieuMauGroupNames([BIEU_MAU_TREE_UNGROUPED, "Nhóm A"], groups);
    expect(result).toEqual(["Nhóm A", BIEU_MAU_TREE_UNGROUPED]);
  });
});

describe("sortBieuMauGroupItems — thứ tự biểu mẫu trong gáy khớp Cây biểu mẫu", () => {
  it("sắp theo binding_group_order tăng dần, không phải A-Z tiêu đề", () => {
    const items = [
      { title: "Biểu mẫu Z", details: { binding_group_order: 1 } },
      { title: "Biểu mẫu A", details: { binding_group_order: 2 } },
    ];
    const result = sortBieuMauGroupItems(items);
    expect(result.map((i) => i.title)).toEqual(["Biểu mẫu Z", "Biểu mẫu A"]);
  });

  it("biểu mẫu chưa có binding_group_order rơi xuống cuối, ổn định theo tên", () => {
    const items = [
      { title: "Chưa có số TT", details: {} },
      { title: "Biểu mẫu số 1", details: { binding_group_order: 1 } },
    ];
    const result = sortBieuMauGroupItems(items);
    expect(result.map((i) => i.title)).toEqual(["Biểu mẫu số 1", "Chưa có số TT"]);
  });

  it("không đổi mảng gốc (trả về mảng mới) — an toàn khi gọi lại nhiều lần trên cùng 1 group trong Map", () => {
    const items = [{ title: "B", details: { binding_group_order: 2 } }, { title: "A", details: { binding_group_order: 1 } }];
    const result = sortBieuMauGroupItems(items);
    expect(result).not.toBe(items);
    expect(items[0].title).toBe("B");
  });
});
