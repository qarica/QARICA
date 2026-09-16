import { NextResponse } from "next/server";
import { isOperationallyHiddenStatus } from "@/lib/operational-record";
import { filterRegistryAnalyticsRows } from "@/lib/registry-analytics";
import { analyticsExportFileName, buildRegistryAnalyticsCsv } from "@/lib/registry-analytics-export";
import { createClient } from "@/lib/supabase/server";
import { getWorkYear } from "@/lib/work-year";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const { data: allowed } = await supabase.rpc("has_permission", { p_permission_code: "reports.analytics" });
  if (!allowed) return NextResponse.json({ error: "Bạn không có quyền xuất Quality Intelligence." }, { status: 403 });

  const year = await getWorkYear();
  const url = new URL(request.url);
  const monthRaw = Number(url.searchParams.get("month") || 0);
  const month = Number.isInteger(monthRaw) && monthRaw >= 1 && monthRaw <= 12 ? monthRaw : null;
  const departmentId = url.searchParams.get("department")?.trim() || null;
  const status = url.searchParams.get("status")?.trim().toUpperCase() || "ALL";

  const { data, error } = await supabase.from("records")
    .select("id,record_code,record_type,title,lifecycle_status,owner_department_id,owner_user_id,created_at,updated_at")
    .eq("work_year", year)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const operational = ((data ?? []) as any[]).filter((row) => !isOperationallyHiddenStatus(row.lifecycle_status));
  const filtered = filterRegistryAnalyticsRows(operational, { month, departmentId, status });
  const depIds = Array.from(new Set(filtered.map((row: any) => row.owner_department_id).filter(Boolean)));
  const userIds = Array.from(new Set(filtered.map((row: any) => row.owner_user_id).filter(Boolean)));
  const [departmentsRes, profilesRes, selectedDepartmentRes] = await Promise.all([
    depIds.length ? supabase.from("departments").select("id,name,short_name").in("id", depIds) : Promise.resolve({ data: [] as any[] }),
    userIds.length ? supabase.from("profiles").select("user_id,full_name,email").in("user_id", userIds) : Promise.resolve({ data: [] as any[] }),
    departmentId ? supabase.from("departments").select("name,short_name").eq("id", departmentId).maybeSingle() : Promise.resolve({ data: null }),
  ] as any);
  const depMap = new Map((departmentsRes.data ?? []).map((row: any) => [row.id, row.short_name || row.name]));
  const userMap = new Map((profilesRes.data ?? []).map((row: any) => [row.user_id, row.full_name || row.email || row.user_id]));
  const selectedDepartment = selectedDepartmentRes.data?.short_name || selectedDepartmentRes.data?.name || null;

  const csv = buildRegistryAnalyticsCsv({
    year,
    month,
    department: selectedDepartment,
    status,
    rows: filtered.map((row: any) => ({
      record_code: row.record_code,
      record_type: row.record_type,
      title: row.title,
      lifecycle_status: row.lifecycle_status,
      department_name: depMap.get(row.owner_department_id) || "—",
      owner_name: userMap.get(row.owner_user_id) || "Chưa gán người",
      created_at: row.created_at,
      updated_at: row.updated_at,
    })),
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${analyticsExportFileName(year, month)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
