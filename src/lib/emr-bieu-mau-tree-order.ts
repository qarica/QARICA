// Thứ tự dựng Cây biểu mẫu (emr-bieu-mau-tree-client.tsx) — tách ra dùng
// chung với Excel xuất từ cây (items/export/route.ts, groupBy=binding_group)
// vì trước đó 2 nơi tự sắp xếp khác nhau: cây theo sort_order của nhóm gáy +
// binding_group_order của biểu mẫu, Excel lại sắp theo A-Z tên nhóm + A-Z
// tiêu đề — khiến file xuất không khớp thứ tự hiển thị trên phần mềm. Giữ 1
// nguồn logic sắp xếp duy nhất để không lệch lại về sau.
export const BIEU_MAU_TREE_UNGROUPED = "Chưa phân nhóm";

type BindingGroupMeta = { name: string; sort_order: number };

// Nhóm gáy đã khai báo xếp trước theo đúng sort_order của chính nó (cột STT
// trong màn hình "Quản lý nhóm gáy"); tên tự do chưa khai báo (dữ liệu cũ)
// xếp sau theo A-Z; "Chưa phân nhóm" luôn xếp cuối cùng.
export function sortBieuMauGroupNames(names: string[], groups: BindingGroupMeta[]): string[] {
  const groupByName = new Map(groups.map((g) => [g.name, g]));
  return [...names].sort((a, b) => {
    if (a === BIEU_MAU_TREE_UNGROUPED) return 1;
    if (b === BIEU_MAU_TREE_UNGROUPED) return -1;
    const ga = groupByName.get(a);
    const gb = groupByName.get(b);
    if (ga && gb) return ga.sort_order - gb.sort_order;
    if (ga) return -1;
    if (gb) return 1;
    return a.localeCompare(b, "vi");
  });
}

// "Số TT biểu mẫu" đánh số liên tục trong từng gáy (details.binding_group_order)
// — biểu mẫu chưa có số thứ tự xếp sau cùng, ổn định theo tên.
export function sortBieuMauGroupItems<T extends { details: Record<string, unknown> | null; title: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const oa = Number(a.details?.binding_group_order);
    const ob = Number(b.details?.binding_group_order);
    const va = Number.isFinite(oa) ? oa : Infinity;
    const vb = Number.isFinite(ob) ? ob : Infinity;
    if (va !== vb) return va - vb;
    return a.title.localeCompare(b.title, "vi");
  });
}
