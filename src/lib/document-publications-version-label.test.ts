import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// Báo cáo thực tế: "Phần kiểm soát tài liệu khi nhập thiếu lần phát hành để
// kiểm soát phiên bản đó" — document_publications.version_label là cột
// NOT NULL với default 'Dự thảo 01' trong DB, nhưng không nơi nào trong UI
// từng hỏi/ghi giá trị thật (chỉ có trong SELECT, chưa bao giờ xuất hiện
// trong insert/update payload) — mọi văn bản vì vậy luôn hiện đúng y chang
// default, không kiểm soát được phiên bản thật. Thêm ở đúng 3 nơi
// version_label thật sự có ý nghĩa: Phát hành tại chỗ (ADVANCE -> PUBLISHED),
// Nhập văn bản đã phát hành (direct_publish), và Sửa văn bản đã phát hành
// (EDIT khi stage=PUBLISHED) — không thêm ở bước "Đề nghị" vì lúc đó chưa
// có bản phát hành chính thức nào để gắn số.
describe("Document publications — version_label (Lần phát hành) bắt buộc khi phát hành", () => {
  it("POST direct_publish bắt buộc version_label, cùng mức với document_code/effective_date/dissemination_type", () => {
    const route = read("src/app/api/document-publications/route.ts");
    expect(route).toContain('const versionLabel = String(body.version_label || "").trim();');
    expect(route).toContain('if (!versionLabel) return NextResponse.json({ error: "Chưa nhập lần phát hành." }, { status: 400 });');
    expect(route).toContain("insertPayload.version_label = versionLabel;");
  });

  it("PATCH ADVANCE sang PUBLISHED bắt buộc version_label", () => {
    const route = read("src/app/api/document-publications/[id]/route.ts");
    const advanceBlock = route.slice(route.indexOf('if (upcoming === "PUBLISHED")'), route.indexOf("if (disseminationType ==="));
    expect(advanceBlock).toContain('const versionLabel = String(body.version_label || "").trim();');
    expect(advanceBlock).toContain('if (!versionLabel) return NextResponse.json({ error: "Chưa nhập lần phát hành." }, { status: 400 });');
    expect(advanceBlock).toContain("update.version_label = versionLabel;");
  });

  it("PATCH EDIT khi stage đã PUBLISHED bắt buộc version_label, cùng điều kiện với document_code/effective_date", () => {
    const route = read("src/app/api/document-publications/[id]/route.ts");
    const editBlock = route.slice(route.indexOf('if (current.stage === "PUBLISHED")'), route.indexOf("const { data, error } = await admin.from(\"document_publications\").update(update)"));
    expect(editBlock).toContain('const versionLabel = String(body.version_label || "").trim();');
    expect(editBlock).toContain('if (!versionLabel) return NextResponse.json({ error: "Chưa nhập lần phát hành." }, { status: 400 });');
    expect(editBlock).toContain("update.version_label = versionLabel;");
  });

  it("client: có đúng 3 input 'Lần phát hành' — Phát hành tại chỗ, Nhập văn bản đã phát hành, Sửa văn bản đã phát hành", () => {
    const client = read("src/components/document-publications-client.tsx");
    const matches = client.match(/placeholder="Lần phát hành \(vd: Lần ban hành 01\)\.\.\."/g) ?? [];
    expect(matches.length).toBe(3);
  });

  it("client: cả 3 nút submit tương ứng đều disabled khi chưa nhập lần phát hành", () => {
    const client = read("src/components/document-publications-client.tsx");
    expect(client).toContain("disabled={!documentCode.trim() || !effectiveDate || !versionLabel.trim()}");
    expect(client).toContain(
      "disabled={directBusy || !directTitle.trim() || !directDraftingDepartmentId || !directDocumentCode.trim() || !directEffectiveDate || !directVersionLabel.trim()}"
    );
    expect(client).toContain(
      "disabled={editBusy || !editTitle.trim() || !editDraftingDepartmentId || !editDocumentCode.trim() || !editEffectiveDate || !editVersionLabel.trim()}"
    );
  });

  it("client: startEdit() nạp sẵn version_label hiện có của văn bản khi mở form sửa", () => {
    const client = read("src/components/document-publications-client.tsx");
    expect(client).toContain('setEditVersionLabel(doc.version_label || "");');
  });

  it("client: cả 3 nơi reset lại state version_label về rỗng sau khi submit/mở form mới, không giữ giá trị cũ sang văn bản khác", () => {
    const client = read("src/components/document-publications-client.tsx");
    expect(client).toContain('setDirectVersionLabel("");');
    const advanceFn = client.slice(client.indexOf("async function advance("), client.indexOf("async function removeDocument"));
    expect(advanceFn).toContain('setVersionLabel("");');
    const startPublishFn = client.slice(client.indexOf("function startPublish("), client.indexOf("function toggleFolder"));
    expect(startPublishFn).toContain('setVersionLabel("");');
  });
});

// Báo cáo thực tế tiếp theo: "thư viện cần có 1 cột là phiên bản để biết" —
// version_label giờ đã nhập được (xem describe phía trên) nhưng Thư viện
// văn bản (danh sách Đã phát hành) lại không có cột nào hiển thị nó, phải
// bấm Sửa từng văn bản mới thấy. Thêm cột "Phiên bản" vào cả bảng chính và
// Xuất Excel — cùng loại lệch nhất quán UI↔export CLAUDE.md yêu cầu đối
// chiếu đã gặp ở EMR (emr-export-hides-hidefromgrid-fields.test.ts).
describe("Document publications — Thư viện văn bản có cột Phiên bản", () => {
  const client = read("src/components/document-publications-client.tsx");

  it("bảng Thư viện văn bản có cột 'Phiên bản' ngay sau 'Tên văn bản', hiển thị version_label", () => {
    expect(client).toContain("<th>Mã văn bản</th>\n                        <th>Tên văn bản</th>\n                        <th>Phiên bản</th>\n                        <th>Loại</th>");
    expect(client).toContain('<td>{d.document_code || "—"}</td>\n                              <td>{d.title}</td>\n                              <td>{d.version_label}</td>\n                              <td>{DOCUMENT_TYPE_LABEL[d.document_type]}</td>');
  });

  it("colSpan của dòng form Sửa cộng thêm 1 cho cột Phiên bản mới, tránh lệch bảng", () => {
    expect(client).toContain("<td colSpan={canManage ? 9 : 8}>");
  });

  it("Xuất Excel cũng có cột 'Phiên bản', khớp với bảng chính", () => {
    expect(client).toContain('const header = ["Mã văn bản", "Tên văn bản", "Phiên bản", "Loại", "Khoa/phòng soạn thảo", "Bước", "Ngày hiệu lực", "Ngày xem xét lại", "Trạng thái rà soát", "Phổ biến"];');
    expect(client).toContain('d.document_code || "",\n          d.title,\n          d.version_label,\n          DOCUMENT_TYPE_LABEL[d.document_type],');
  });
});
