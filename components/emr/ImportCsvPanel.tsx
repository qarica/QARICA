"use client";

// Công cụ nhập dữ liệu thật từ CSV (xuất từ file Excel dự án EMR) thẳng vào Supabase.
// Chạy hoàn toàn ở trình duyệt của bạn — dữ liệu KHÔNG đi qua Claude, KHÔNG được
// commit vào Git. Dùng scripts/export_excel_to_csv.py để xuất CSV từ file Excel gốc.

import { useState } from "react";
import { parseCsv, csvToRecords, toBool, toIntOrNull } from "../../lib/emr/csv";
import { emrSupabaseBrowser } from "../../lib/emr/supabase";

type TargetTable =
  | "emr_forms"
  | "emr_processes"
  | "emr_it_equipment"
  | "emr_medical_equipment"
  | "emr_digital_signatures"
  | "emr_training_signoff"
  | "emr_matrix"; // chế độ đặc biệt: ma trận biểu mẫu x khoa

const TARGETS: { value: TargetTable; label: string; hint: string }[] = [
  {
    value: "emr_forms",
    label: "Danh sách biểu mẫu",
    hint: "Cột CSV cần có: name (bắt buộc), code, form_group, category, owner_role, digitization_status, requires_e_signature, requires_digital_sign, requires_stamp, scan_requirement, notes",
  },
  {
    value: "emr_matrix",
    label: "Ma trận biểu mẫu x khoa (tiến độ triển khai)",
    hint: "Cột đầu tiên: 'Tên biểu mẫu'. Các cột sau: đúng TÊN khoa/phòng đã có trong emr_departments, giá trị là trạng thái (Chưa triển khai / Đang triển khai / Đã triển khai / Đã thực hiện EMR)",
  },
  {
    value: "emr_processes",
    label: "Quy trình - tài liệu",
    hint: "Cột CSV: name (bắt buộc), department, status, deadline (yyyy-mm-dd), notes",
  },
  {
    value: "emr_it_equipment",
    label: "Thiết bị CNTT",
    hint: "Cột CSV: device_name (bắt buộc), location (bắt buộc), qty_available, qty_needed, notes",
  },
  {
    value: "emr_medical_equipment",
    label: "Thiết bị y tế",
    hint: "Cột CSV: name (bắt buộc), model, manufacturer, department, image_format, integration_method, status, notes",
  },
  {
    value: "emr_digital_signatures",
    label: "Chữ ký số (không nhập số CCCD)",
    hint: "Cột CSV: staff_name (bắt buộc), department, title, provider, issued_at, expires_at, hardcopy_required",
  },
  {
    value: "emr_training_signoff",
    label: "Đào tạo - bàn giao",
    hint: "Cột CSV: department (bắt buộc), item_name, status, notes",
  },
];

export default function ImportCsvPanel() {
  const [target, setTarget] = useState<TargetTable>("emr_forms");
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const activeTarget = TARGETS.find((t) => t.value === target)!;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setStatus(null);
    const text = await file.text();
    const parsed = parseCsv(text);
    const records = csvToRecords(parsed);
    setHeaders(parsed.headers);
    setPreview(records.slice(0, 8));
  }

  async function onImport() {
    if (preview.length === 0) {
      setStatus("Chưa chọn file hoặc file rỗng.");
      return;
    }
    setBusy(true);
    setStatus("Đang nhập dữ liệu…");
    try {
      const supabase = emrSupabaseBrowser();

      // Đọc lại toàn bộ file (preview chỉ có 8 dòng đầu để xem trước).
      const fileInput = document.getElementById("emr-csv-file") as HTMLInputElement | null;
      const file = fileInput?.files?.[0];
      if (!file) throw new Error("Không tìm thấy file đã chọn.");
      const text = await file.text();
      const records = csvToRecords(parseCsv(text));

      if (target === "emr_matrix") {
        const { data: depts, error: deptErr } = await supabase
          .from("emr_departments")
          .select("id, name");
        if (deptErr) throw deptErr;
        const deptByName = new Map((depts ?? []).map((d) => [d.name.trim(), d.id as string]));

        const deptColumns = headers.filter((h) => h !== "Tên biểu mẫu" && deptByName.has(h.trim()));
        if (deptColumns.length === 0) {
          throw new Error(
            "Không khớp được cột nào với tên khoa/phòng đã có trong emr_departments — kiểm tra lại tên cột CSV."
          );
        }

        for (const rec of records) {
          const formName = rec["Tên biểu mẫu"];
          if (!formName) continue;

          let formId: string;
          const { data: existing } = await supabase
            .from("emr_forms")
            .select("id")
            .eq("name", formName)
            .maybeSingle();
          if (existing) {
            formId = existing.id as string;
          } else {
            const { data: created, error: createErr } = await supabase
              .from("emr_forms")
              .insert({ name: formName })
              .select("id")
              .single();
            if (createErr) throw createErr;
            formId = created.id as string;
          }

          const upserts = deptColumns
            .map((col) => {
              const statusVal = rec[col]?.trim();
              const deptId = deptByName.get(col.trim());
              if (!statusVal || !deptId) return null;
              return { form_id: formId, department_id: deptId, status: statusVal };
            })
            .filter((v): v is { form_id: string; department_id: string; status: string } => v !== null);

          if (upserts.length > 0) {
            const { error: upsertErr } = await supabase
              .from("emr_form_department_status")
              .upsert(upserts, { onConflict: "form_id,department_id" });
            if (upsertErr) throw upsertErr;
          }
        }
        setStatus(`Đã nhập ${records.length} biểu mẫu vào ma trận triển khai.`);
        return;
      }

      const rows = records.map((rec) => mapRecord(target, rec));
      const { error } = await supabase.from(target).insert(rows);
      if (error) throw error;
      setStatus(`Đã nhập ${rows.length} dòng vào bảng ${target}.`);
    } catch (err) {
      setStatus(`Lỗi: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="block text-sm font-medium text-slate-700">Loại dữ liệu</label>
        <select
          value={target}
          onChange={(e) => {
            setTarget(e.target.value as TargetTable);
            setPreview([]);
            setHeaders([]);
            setStatus(null);
          }}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {TARGETS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-slate-500">{activeTarget.hint}</p>

        <div className="mt-4">
          <input
            id="emr-csv-file"
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            className="text-sm"
          />
          {fileName ? (
            <span className="ml-2 text-xs text-slate-500">{fileName}</span>
          ) : null}
        </div>
      </div>

      {preview.length > 0 ? (
        <div className="overflow-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="mb-2 text-xs font-medium text-slate-500">
            Xem trước {preview.length} dòng đầu:
          </p>
          <table className="min-w-full text-xs">
            <thead>
              <tr>
                {headers.map((h) => (
                  <th key={h} className="border-b px-2 py-1 text-left font-semibold text-slate-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i} className="border-b last:border-0">
                  {headers.map((h) => (
                    <td key={h} className="px-2 py-1 text-slate-700">
                      {row[h]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <button
        type="button"
        disabled={busy || preview.length === 0}
        onClick={onImport}
        className="rounded-lg bg-[#7B2D3B] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Đang nhập…" : "Nhập vào Supabase"}
      </button>

      {status ? <p className="text-sm text-slate-600">{status}</p> : null}
    </div>
  );
}

function mapRecord(target: TargetTable, rec: Record<string, string>): Record<string, unknown> {
  switch (target) {
    case "emr_forms":
      return {
        name: rec.name,
        code: rec.code || null,
        form_group: rec.form_group || null,
        category: rec.category || null,
        owner_role: rec.owner_role || null,
        digitization_status: rec.digitization_status || "Chưa triển khai",
        requires_e_signature: toBool(rec.requires_e_signature),
        requires_digital_sign: toBool(rec.requires_digital_sign),
        requires_stamp: toBool(rec.requires_stamp),
        scan_requirement: rec.scan_requirement || null,
        notes: rec.notes || null,
      };
    case "emr_processes":
      return {
        name: rec.name,
        department: rec.department || null,
        status: rec.status || "Dự thảo",
        deadline: rec.deadline || null,
        notes: rec.notes || null,
      };
    case "emr_it_equipment":
      return {
        device_name: rec.device_name,
        location: rec.location,
        qty_available: toIntOrNull(rec.qty_available) ?? 0,
        qty_needed: toIntOrNull(rec.qty_needed) ?? 0,
        notes: rec.notes || null,
      };
    case "emr_medical_equipment":
      return {
        name: rec.name,
        model: rec.model || null,
        manufacturer: rec.manufacturer || null,
        department: rec.department || null,
        image_format: rec.image_format || null,
        integration_method: rec.integration_method || null,
        status: rec.status || "Chưa thực hiện",
        notes: rec.notes || null,
      };
    case "emr_digital_signatures":
      return {
        staff_name: rec.staff_name,
        department: rec.department || null,
        title: rec.title || null,
        provider: rec.provider || null,
        issued_at: rec.issued_at || null,
        expires_at: rec.expires_at || null,
        hardcopy_required: toBool(rec.hardcopy_required),
      };
    case "emr_training_signoff":
      return {
        department: rec.department,
        item_name: rec.item_name || null,
        status: rec.status || "Chưa test",
        notes: rec.notes || null,
      };
    default:
      return rec;
  }
}
