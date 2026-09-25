// Bảng dữ liệu dùng chung, tối giản — chỉ render, không phân trang phía client
// (dữ liệu đã được giới hạn/lọc ở phía truy vấn Supabase trước khi truyền vào).

import type { ReactNode } from "react";

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyLabel = "Chưa có dữ liệu — nhập qua trang Nhập liệu hoặc Supabase.",
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyLabel?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.header}
                className={
                  "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 " +
                  (col.className ?? "")
                }
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="hover:bg-slate-50">
              {columns.map((col) => (
                <td key={col.header} className={"px-3 py-2 align-top " + (col.className ?? "")}>
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
