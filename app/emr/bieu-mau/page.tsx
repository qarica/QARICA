"use client";

import { useEffect, useState, useCallback } from "react";
import { emrSupabaseBrowser } from "@/lib/emr/supabase";
import FormStatusMatrix from "@/components/emr/FormStatusMatrix";
import type { Department, DeptRolloutStatus, EmrForm } from "@/lib/emr/types";

const CYCLE: DeptRolloutStatus[] = [
  "Chưa triển khai",
  "Đang triển khai",
  "Đã triển khai",
  "Đã thực hiện EMR",
];

export default function BieuMauPage() {
  const [forms, setForms] = useState<EmrForm[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, DeptRolloutStatus>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = emrSupabaseBrowser();
    const [{ data: f, error: fErr }, { data: d, error: dErr }, { data: s, error: sErr }] =
      await Promise.all([
        supabase.from("emr_forms").select("*").order("form_group").order("name"),
        supabase.from("emr_departments").select("*").order("sort_order"),
        supabase.from("emr_form_department_status").select("form_id, department_id, status"),
      ]);
    if (fErr || dErr || sErr) {
      setError((fErr ?? dErr ?? sErr)!.message);
      setLoading(false);
      return;
    }
    setForms((f as EmrForm[]) ?? []);
    setDepartments((d as Department[]) ?? []);
    const map: Record<string, DeptRolloutStatus> = {};
    for (const row of s ?? []) {
      map[`${row.form_id}::${row.department_id}`] = row.status as DeptRolloutStatus;
    }
    setStatusMap(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onCellClick(formId: string, departmentId: string, current: DeptRolloutStatus | null) {
    const idx = current ? CYCLE.indexOf(current) : -1;
    const next = CYCLE[(idx + 1) % CYCLE.length];
    const key = `${formId}::${departmentId}`;

    // Optimistic update
    setStatusMap((prev) => ({ ...prev, [key]: next }));

    const supabase = emrSupabaseBrowser();
    const { error: upsertErr } = await supabase
      .from("emr_form_department_status")
      .upsert(
        { form_id: formId, department_id: departmentId, status: next },
        { onConflict: "form_id,department_id" }
      );
    if (upsertErr) {
      // revert on failure (vd: tài khoản chưa có quyền ghi)
      setStatusMap((prev) => ({ ...prev, [key]: current ?? "Chưa triển khai" }));
      setError(upsertErr.message);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Đang tải…</p>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Bấm vào ô để chuyển trạng thái (Chưa triển khai → Đang triển khai → Đã triển khai →
        Đã thực hiện EMR → quay lại). Thay đổi lưu trực tiếp vào Supabase.
      </p>
      {error ? <p className="text-sm text-red-600">Lỗi: {error}</p> : null}
      <FormStatusMatrix
        forms={forms}
        departments={departments}
        statusByFormDept={statusMap}
        onCellClick={onCellClick}
      />
    </div>
  );
}
