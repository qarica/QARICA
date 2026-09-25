// Ma trận Biểu mẫu x Khoa/phòng — tương đương sheet "Danh sách biểu mẫu (Vinh)"
// trong file dự án gốc, nhưng đọc trực tiếp từ Supabase và cho phép đổi trạng thái
// bằng cách bấm vào ô (nếu truyền onCellClick từ component cha đã "use client").

import StatusPill from "./StatusPill";
import type { Department, DeptRolloutStatus, EmrForm } from "../../lib/emr/types";

export default function FormStatusMatrix({
  forms,
  departments,
  statusByFormDept,
  onCellClick,
}: {
  forms: EmrForm[];
  departments: Department[];
  /** map "formId::departmentId" -> trạng thái hiện tại */
  statusByFormDept: Record<string, DeptRolloutStatus>;
  onCellClick?: (formId: string, departmentId: string, current: DeptRolloutStatus | null) => void;
}) {
  if (forms.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
        Chưa có biểu mẫu — thêm ở bảng emr_forms hoặc qua trang Nhập liệu.
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 min-w-[220px] border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-500">
              Biểu mẫu
            </th>
            {departments.map((d) => (
              <th
                key={d.id}
                className="min-w-[120px] border-b border-slate-200 bg-slate-50 px-2 py-2 text-center font-semibold text-slate-500"
              >
                {d.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {forms.map((f) => (
            <tr key={f.id}>
              <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-2 font-medium text-slate-800">
                {f.name}
                {f.form_group ? (
                  <div className="text-[11px] font-normal text-slate-400">{f.form_group}</div>
                ) : null}
              </td>
              {departments.map((d) => {
                const key = `${f.id}::${d.id}`;
                const status = statusByFormDept[key] ?? null;
                return (
                  <td key={d.id} className="px-2 py-2 text-center">
                    <button
                      type="button"
                      disabled={!onCellClick}
                      onClick={() => onCellClick?.(f.id, d.id, status)}
                      className={onCellClick ? "cursor-pointer" : "cursor-default"}
                      title={status ?? "Chưa gán"}
                    >
                      {status ? (
                        <StatusPill status={status} />
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
