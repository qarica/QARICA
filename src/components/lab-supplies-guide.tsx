"use client";

import type { ReactNode } from "react";

/** Khối "Cách dùng" gập/mở cho từng tab của Kho — mô tả thứ tự thao tác thực tế bằng ngôn ngữ nghiệp vụ. */
export function LabGuide({ title = "Cách dùng tab này", steps, note, defaultOpen = false }: { title?: string; steps: ReactNode[]; note?: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="ls-guide" open={defaultOpen}>
      <summary>{title}</summary>
      <ol>{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
      {note ? <p className="ls-guide-note">{note}</p> : null}
    </details>
  );
}

export const STOCKTAKE_GUIDE = {
  title: "Cách kiểm kê và chốt kỳ (thường làm cuối tháng)",
  steps: [
    <><b>Kiểm kê:</b> đếm thực tế từng lô trên kệ, nhập vào cột “Số đếm thực tế”. Lô chưa đếm thì để trống, hệ thống bỏ qua.</>,
    <>Bấm <b>“Ghi kiểm kê”</b>. Lô nào số đếm lệch tồn sổ sẽ tự sinh 1 dòng điều chỉnh (lý do “Kiểm kê”). Lô khớp thì không sinh gì.</>,
    <>Xem lại các dòng điều chỉnh ở tab <b>“Sổ kho &amp; báo cáo”</b> để chắc số liệu đúng.</>,
    <><b>Chốt kỳ:</b> chọn ngày cuối kỳ rồi bấm “Chốt kỳ”. Từ đó không ghi thêm phiếu nào có ngày trong kỳ đã chốt, nên số báo cáo kỳ không đổi nữa.</>,
  ],
  note: "Chốt nhầm thì bấm “Mở lại kỳ” (chỉ kỳ gần nhất, bắt buộc ghi lý do, hệ thống lưu vết ai mở và vì sao). Kiểm kê lệch trên 10% so với tồn sổ phải ghi chú giải thích.",
};

export const LEDGER_GUIDE = {
  title: "Sổ kho và báo cáo dùng để làm gì",
  steps: [
    <><b>Phiếu:</b> nhật ký mọi phiếu nhập, xuất, hủy, điều chỉnh theo ngày. Dùng để tra cứu và đối chiếu chứng từ. Chọn khoảng ngày rồi bấm “Xuất Excel” để lấy đủ.</>,
    <><b>Thẻ kho vật tư:</b> chọn 1 vật tư để xem toàn bộ nhập, xuất và tồn lũy kế của riêng vật tư đó.</>,
    <><b>Nhập–Xuất–Tồn theo kỳ:</b> chọn khoảng ngày, bấm “Xem báo cáo” để có tồn đầu kỳ, tổng nhập, xuất, hủy, điều chỉnh và tồn cuối kỳ của từng vật tư. Dùng khi nộp số liệu hoặc thanh tra.</>,
  ],
  note: "Sổ không sửa hoặc xóa được. Nếu có sai sót, tạo phiếu điều chỉnh mới để sửa số tồn.",
};

export const RECEIPT_GUIDE = {
  title: "Cách nhập kho",
  steps: [
    <>Gõ mã/tên hoặc quét mã vật tư, nhập <b>số lượng</b>, <b>số lô</b> và <b>hạn dùng</b> (hóa chất và chất chuẩn bắt buộc có hạn).</>,
    <>Cùng một vật tư nhưng khác lô: bấm nút nhân đôi dòng, đổi số lô và hạn dùng. Mỗi lô là một dòng riêng.</>,
    <>Nhập thêm vào lô đã có thì ghi đúng số lô và hạn đó, số lượng sẽ cộng dồn. Cùng số lô mà khác hạn dùng sẽ bị chặn để tránh nhập nhầm.</>,
    <>Bấm “Ghi phiếu nhập”. Một dòng lỗi thì cả phiếu không được ghi.</>,
  ],
};

export const ISSUE_GUIDE = {
  title: "Cách xuất dùng và hủy hàng",
  steps: [
    <>Chọn vật tư và số lượng. Hệ thống tự lấy lô hết hạn sớm nhất trước (FEFO) và hiện lô sẽ lấy bên cạnh.</>,
    <>Nếu thực tế người dùng đã lấy lô khác, chọn lại lô ở ô “Đổi lô”. Hệ thống chỉ cảnh báo khi không theo FEFO chứ không chặn.</>,
    <>Xuất dùng bắt buộc ghi <b>người nhận / nơi sử dụng</b>. Lô đã hết hạn không xuất dùng được, hãy chuyển sang <b>Hủy hàng</b> và chọn lý do.</>,
  ],
};
