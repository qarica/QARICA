"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";
import { buildMyWorkExcelHtml, myWorkExcelFileName, type MyWorkExportRow } from "../lib/my-work-excel";

// Nút "Xuất Excel" cho Việc của tôi: tải về TOÀN BỘ danh sách đang lọc (tab + tìm kiếm + tuần), không chỉ
// trang đang xem. Tạo file ngay trên trình duyệt từ dữ liệu trang đã dựng sẵn → không có route/quyền mới.
export function MyWorkExportButton({ rows, caption, todayKey, weekStart }: { rows: MyWorkExportRow[]; caption: string; todayKey: string; weekStart: string | null }) {
  const [busy, setBusy] = useState(false);

  function download() {
    setBusy(true);
    try {
      const html = buildMyWorkExcelHtml(rows, caption);
      const blob = new Blob(["﻿", html], { type: "application/vnd.ms-excel;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = myWorkExcelFileName(todayKey, weekStart);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="button secondary small" disabled={busy} onClick={download} title={`Tải ${rows.length} việc đang hiển thị (đã lọc theo tab/tìm kiếm/tuần) về Excel`}>
      <Icon name="download" size={15} /> {busy ? "Đang xuất..." : `Xuất Excel (${rows.length})`}
    </button>
  );
}
