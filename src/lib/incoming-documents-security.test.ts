import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// Tiếp nhận công văn đến (Tổ Đề xuất): modeled off the real tracking sheet
// (intake + a single GĐ routing annotation + deployment + deadline +
// completion tracking) — explicitly NOT the procurement BGĐ/TGĐ approve-
// reject chain, which doesn't match how công văn is actually processed.
describe("Incoming documents module security and control gates", () => {
  it("separates view and manage permissions at API boundaries", () => {
    expect(read("src/app/api/incoming-documents/route.ts")).toContain('requireApiPermission("incoming_documents.view")');
    expect(read("src/app/api/incoming-documents/route.ts")).toContain('requireApiPermission("incoming_documents.manage")');
    expect(read("src/app/api/incoming-documents/[id]/route.ts")).toContain('requireApiPermission("incoming_documents.manage")');
  });

  it("is reachable from the sidebar only behind incoming_documents.view", () => {
    const nav = read("src/lib/navigation.ts");
    expect(nav).toContain('{ label: "QUẢN LÝ CÔNG VĂN", href: "/incoming-documents", icon: "file-input", permission: "incoming_documents.view" }');
  });

  it("keeps every write tenant-scoped by organization_id", () => {
    expect(read("src/app/api/incoming-documents/route.ts")).toContain("organization_id: organizationId");
    expect(read("src/app/api/incoming-documents/[id]/route.ts")).toContain('.eq("organization_id", organizationId)');
  });

  it("is its own table — not a procurement_requests approval-chain discriminator", () => {
    const migration = read("supabase/migrations/20261016_incoming_documents_v1.sql");
    expect(migration).toContain("create table if not exists public.incoming_documents");
    expect(migration).not.toContain("procurement_requests");
    expect(migration).not.toContain("BGD_APPROVE");
  });
});

describe("Incoming document status is computed, not manually typed", () => {
  const client = read("src/components/incoming-documents-client.tsx");

  it("derives Hoàn thành đúng hạn / trễ hạn from completed_at vs due_date", () => {
    expect(client).toContain("if (doc.completed_at) {");
    expect(client).toContain('if (doc.due_date && doc.completed_at > doc.due_date) return { label: "Hoàn thành trễ hạn"');
    expect(client).toContain('return { label: "Hoàn thành đúng hạn"');
  });

  it("flags an unfinished document past its due_date as Trễ hạn, otherwise Đang xử lý", () => {
    expect(client).toContain('if (doc.due_date && doc.due_date < now) return { label: "Trễ hạn"');
    expect(client).toContain('return { label: "Đang xử lý"');
  });
});

// Báo cáo thực tế (ảnh chụp điện thoại): "2 trường nhập thời gian ko rõ là
// thời gian cho cái gì" — form "Tiếp nhận công văn mới" có 2 input
// type="date" trần (Ngày đến, Hạn xử lý) không nhãn hiển thị nào — input
// date không hiện được placeholder khi rỗng, và title chỉ là tooltip hover
// (vô dụng trên di động), nên cả 2 ô ngày trông giống hệt nhau, không biết
// ô nào là ngày gì. Bọc cả 2 trong <label className="doc-task-field"> có
// <span> nhãn phía trên, đúng quy ước label>span chung của app.
describe("Form Tiếp nhận công văn mới — 2 ô ngày có nhãn hiển thị rõ ràng", () => {
  const client = read("src/components/incoming-documents-client.tsx");

  it("ô Ngày đến (receivedAt) có nhãn hiển thị 'Ngày đến', không chỉ còn là input date trần", () => {
    expect(client).toContain('<label className="doc-task-field">\n                <span>Ngày đến</span>\n                <input className="input" type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />\n              </label>');
  });

  it("ô Hạn xử lý (dueDate) có nhãn hiển thị, không chỉ dựa vào title (tooltip hover, vô dụng trên di động)", () => {
    expect(client).toContain('<label className="doc-task-field">\n                <span>Hạn xử lý (tùy chọn)</span>\n                <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />\n              </label>');
    expect(client).not.toContain('type="date" title="Hạn xử lý (tùy chọn)"');
  });
});

// Báo cáo thực tế: "Các loại công văn nên có list chọn: Công văn hướng dẫn,
// Công văn chỉ đạo, Công văn đôn đốc; Công văn đề nghị, yêu cầu, Công văn
// phúc đáp, Công văn giải trình, Công văn thông báo, Khác" — trước đây
// document_type là input gõ tay tự do (mỗi người ghi một kiểu, không nhất
// quán). Đổi thành select cố định đúng 8 loại người dùng liệt kê.
describe("Loại công văn (document_type) là list chọn cố định, không còn gõ tay tự do", () => {
  const client = read("src/components/incoming-documents-client.tsx");

  it("định nghĩa đúng 8 loại công văn theo đúng thứ tự người dùng liệt kê, kết thúc bằng 'Khác'", () => {
    expect(client).toContain(
      'const INCOMING_DOCUMENT_TYPES = [\n  "Công văn hướng dẫn",\n  "Công văn chỉ đạo",\n  "Công văn đôn đốc",\n  "Công văn đề nghị, yêu cầu",\n  "Công văn phúc đáp",\n  "Công văn giải trình",\n  "Công văn thông báo",\n  "Khác",\n] as const;',
    );
  });

  it("form Tiếp nhận công văn mới dùng select (không còn input gõ tay) cho Loại công văn, có option rỗng để vẫn là tùy chọn", () => {
    expect(client).not.toContain('placeholder="Loại công văn (tùy chọn)"');
    expect(client).toContain('<select className="input" value={documentType} onChange={(e) => setDocumentType(e.target.value)}>');
    expect(client).toContain('<option value="">— Chọn loại công văn (tùy chọn) —</option>');
    expect(client).toContain('{INCOMING_DOCUMENT_TYPES.map((t) => (');
  });
});

// Báo cáo thực tế: "Bảng theo dõi công văn nên chia thành 1 cột đính kèm
// riêng kế bên trích yếu" — trước đây nút file đính kèm nằm lồng bên trong
// ô Trích yếu (dưới nội dung trích yếu), không có cột riêng. Tách thành
// cột "Đính kèm" độc lập, ngay sau cột Trích yếu — bảng có thêm 1 cột nên
// mọi colSpan dùng để gộp hàng (task panel mở rộng, "Chưa có công văn
// nào") phải cộng thêm 1 theo đúng tổng số cột mới.
describe("Bảng theo dõi công văn — cột Đính kèm tách riêng, ngay sau cột Trích yếu", () => {
  const client = read("src/components/incoming-documents-client.tsx");

  it("có đúng <th>Đính kèm</th> có cột riêng, không còn lồng trong Trích yếu", () => {
    expect(client).toContain("<th>Trích yếu</th>");
    expect(client).toContain("<th>Đính kèm</th>");
    expect(client).toContain('<td data-label="Trích yếu">{doc.summary}</td>');
  });

  it("ô Đính kèm hiện nút xem file khi có file, icon chìm (không phải nút) khi không có", () => {
    expect(client).toContain('<td data-label="Đính kèm">');
    expect(client).toContain('<button type="button" className="doc-file-icon has-file" onClick={() => void viewFile(doc)} title={doc.file_name} aria-label={`Xem file đính kèm: ${doc.file_name}`}>');
    expect(client).toContain('<span className="doc-file-icon" aria-label="Không có tệp đính kèm" title="Không có tệp đính kèm">');
  });
});

// Báo cáo thực tế: "Đính kèm chỉ cần hiện icon có tệp thì hiện nổi xanh, ko
// có thì chìm thôi, thu gọn cột" — trước đây hiện cả emoji 📎 lẫn tên file
// đầy đủ trong ô, chiếm nhiều chỗ ngang. Emoji có màu cố định (CSS color
// không áp dụng được), nên đổi sang Icon component (SVG, currentColor) để
// tô đúng xanh khi có file / xám mờ khi không có.
describe("Cột Đính kèm chỉ còn icon (không hiện tên file trần), tô màu theo trạng thái, thu gọn bề rộng cột", () => {
  const client = read("src/components/incoming-documents-client.tsx");

  it("dùng Icon component 'paperclip' (SVG màu theo currentColor), không còn emoji 📎 cố định màu trong phần render", () => {
    expect(client).toContain('import { Icon } from "@/components/icon";');
    expect(client).toContain('<Icon name="paperclip" size={16} />');
    expect(client).not.toContain('📎 {doc.file_name}');
  });

  it("tên file vẫn xem được qua title (tooltip) + aria-label khi đã bỏ hiện trực tiếp trong ô", () => {
    expect(client).toContain("title={doc.file_name}");
    expect(client).toContain("`Xem file đính kèm: ${doc.file_name}`");
  });

  it("có file tô xanh brand (.has-file), không có file chìm màu xám mờ — 2 trạng thái khác class rõ ràng", () => {
    expect(client).toContain(".doc-file-icon {");
    expect(client).toContain("color: #b7c0c6;");
    expect(client).toContain(".doc-file-icon.has-file {");
    expect(client).toContain("color: var(--brand, #1D4ED8);");
  });

  it("thu gọn cột Đính kèm (thứ 5) còn 56px, canh giữa icon — nhường chỗ ngang cho cột Trích yếu", () => {
    expect(client).toContain(".table-wrap th:nth-child(5),\n        .table-wrap td:nth-child(5) {\n          width: 56px;\n          text-align: center;\n        }");
  });
});

// Báo cáo thực tế: "Tại sao bắt điền số và loại công văn nhưng xuống danh
// sách thì ko có thông tin này" — form Tiếp nhận công văn mới có 2 trường
// Số văn bản (documentNo) và Loại công văn (documentType) nhưng bảng Danh
// sách công văn trước đây không hiện lại 2 giá trị này ở đâu — dữ liệu
// nhập vào "biến mất" khỏi tầm nhìn người xử lý. Thêm đúng 2 cột tương ứng
// vào bảng, cộng colSpan gộp hàng (task panel, empty-state) thêm 2.
describe("Bảng theo dõi công văn hiện lại Số văn bản và Loại công văn đã nhập ở form tiếp nhận", () => {
  const client = read("src/components/incoming-documents-client.tsx");

  it("có cột riêng <th>Số văn bản</th> và <th>Loại công văn</th>, không còn bị bỏ sót khỏi bảng", () => {
    expect(client).toContain("<th>Ngày đến</th>\n                <th>Số văn bản</th>\n                <th>Trích yếu</th>\n                <th>Loại công văn</th>\n                <th>Đính kèm</th>\n                <th>Cơ quan</th>");
    expect(client).toContain('<td data-label="Số văn bản">{doc.document_no || "—"}</td>');
  });

  it("colSpan gộp hàng (task panel, empty-state) cộng thêm 2 cho 2 cột mới, không lệch bảng", () => {
    expect(client).toContain('<td colSpan={canManage ? 12 : 11} className="doc-task-panel-cell">');
    expect(client).toContain('<td colSpan={canManage ? 12 : 11} className="empty-state compact">');
    expect(client).not.toContain("colSpan={canManage ? 10 : 9}");
  });
});

// Báo cáo thực tế: "Cần có màu theo phân loại công văn để ưu tiên xử lý" —
// ô Loại công văn hiện badge màu theo mức ưu tiên xử lý (chỉ đạo/đôn đốc
// gấp nhất → danger, đề nghị/yêu cầu → warning, hướng dẫn/phúc đáp →
// info, giải trình/thông báo/khác → muted), tái dùng đúng class
// .status-badge + 4 tone có sẵn trong globals.css, không thêm màu mới.
describe("Loại công văn hiện badge màu theo mức ưu tiên xử lý", () => {
  const client = read("src/components/incoming-documents-client.tsx");

  it("định nghĩa DOCUMENT_TYPE_TONE gắn đúng tone ưu tiên cho cả 8 loại công văn", () => {
    expect(client).toContain('"Công văn chỉ đạo": "danger"');
    expect(client).toContain('"Công văn đôn đốc": "danger"');
    expect(client).toContain('"Công văn đề nghị, yêu cầu": "warning"');
    expect(client).toContain('"Công văn hướng dẫn": "info"');
    expect(client).toContain('"Công văn phúc đáp": "info"');
    expect(client).toContain('"Công văn giải trình": "muted"');
    expect(client).toContain('"Công văn thông báo": "muted"');
    expect(client).toContain('"Khác": "muted"');
  });

  it("ô Loại công văn dùng .status-badge với tone từ docTypeTone(), '—' khi chưa chọn loại", () => {
    expect(client).toContain('<td data-label="Loại công văn">');
    expect(client).toContain('<span className={`status-badge ${docTypeTone(doc.document_type)}`}>{doc.document_type}</span>');
  });
});

// Báo cáo thực tế (2 ảnh chụp điện thoại): "Lỗi giao diện khi bấm vào nút
// công việc" — bấm "Chưa có ▴" mở panel giao việc (Nội dung, Chủ trì *,
// Phối hợp, ngày, Giao công việc) nhưng cả form bị bóp vào 1 cột hẹp ~300px
// lệch phải, để trống mảng xám lớn bên trái. Nguyên nhân: CSS responsive
// biến mỗi <td> thành grid "nhãn 105px | giá trị 1fr" trong
// final-visual-lock.css, áp dụng luôn cho <td colSpan className=
// "doc-task-panel-cell"> dù nó không có data-label (không phải cặp
// nhãn:giá trị, mà là panel full-width) — toàn bộ form bị nhồi vào cột 1fr
// còn lại. Đã sửa bằng override display:block!important giống cách đã làm
// cho td.empty-state (cùng khối @media, cùng nguyên nhân).
// Báo cáo thực tế: "Xem lại dàn trang luôn" (ảnh chụp bảng trên màn hình
// rộng) — table-layout mặc định chia đều chiều rộng cho cả 12 cột, cột
// Trích yếu (nội dung dài) bị bóp hẹp, xuống dòng nhiều lần, hàng cao bất
// thường, các cột ngắn thừa khoảng trắng. Lần sửa đầu đặt min-width:1500px
// cho cả bảng — quá rộng, báo cáo tiếp theo "Xem giao diện phải kéo qua
// lại" cho thấy bảng giờ lúc nào cũng phải cuộn ngang, kể cả màn hình rộng
// (~1920px). Bỏ hẳn min-width bảng, chỉ còn min-width vừa đủ cho cột Trích
// yếu để bảng vẫn vừa trong width:100% của .table-wrap ở màn hình thường —
// .table-wrap vẫn còn overflow-x:auto làm lưới an toàn cho màn hẹp hơn.
describe("Bảng theo dõi công văn: cột Trích yếu đủ rộng để đọc, bảng không bắt buộc cuộn ngang ở màn hình thường", () => {
  const client = read("src/components/incoming-documents-client.tsx");

  it("không còn ép min-width cho cả <table> — để bảng tự vừa trong width:100% của .table-wrap, tránh luôn phải cuộn ngang kể cả màn hình rộng", () => {
    expect(client).not.toContain("min-width: 1500px");
  });

  it("cột Trích yếu (thứ 3, nhiều chữ nhất) vẫn có min-width riêng, ở mức vừa phải (220px) thay vì đòi hỏi quá nhiều bề rộng", () => {
    expect(client).toContain(".table-wrap th:nth-child(3),\n        .table-wrap td:nth-child(3) {\n          min-width: 220px;\n        }");
  });
});

describe("Panel giao việc (doc-task-panel-cell) không còn bị bóp cột hẹp trên di động", () => {
  const css = read("src/app/final-visual-lock.css");

  it("td.doc-task-panel-cell có override display:block!important, không còn kế thừa grid nhãn:giá trị của td chung", () => {
    expect(css).toContain(".incoming-doc-overview .table-wrap tbody td.doc-task-panel-cell{display:block!important}");
  });

  it("override đứng sau rule td.empty-state đã sửa trước đó trong cùng khối @media (cùng gốc lỗi)", () => {
    const emptyStateIdx = css.indexOf(".incoming-doc-overview .table-wrap tbody td.empty-state{display:block!important}");
    const panelCellIdx = css.indexOf(".incoming-doc-overview .table-wrap tbody td.doc-task-panel-cell{display:block!important}");
    expect(emptyStateIdx).toBeGreaterThan(-1);
    expect(panelCellIdx).toBeGreaterThan(emptyStateIdx);
  });
});
