import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { EMR_CATEGORIES, EMR_CATEGORY_FIELDS, EMR_STATUS_LABELS, emrCategoryBySlug, formatBooleanValue, formatSequenceValue } from "@/lib/emr-categories";

function esc(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] || ch));
}

const PRIORITY_LABELS: Record<string, string> = { LOW: "Thấp", MEDIUM: "Trung bình", HIGH: "Cao", CRITICAL: "Nghiêm trọng" };

export async function GET(request: Request) {
  const auth = await requireApiPermission("emr.view");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const categoryParam = searchParams.get("category") || "";
  const category = EMR_CATEGORIES.find((c) => c.code === categoryParam) || emrCategoryBySlug(categoryParam);
  if (!category) return NextResponse.json({ error: "Danh mục không hợp lệ." }, { status: 400 });
  // Optional grouping (e.g. the Biểu mẫu master tree exports grouped by
  // Nhóm gáy) — must be a real field of this category, never an arbitrary
  // client-supplied column.
  const groupByParam = searchParams.get("groupBy") || "";
  const groupByField = (EMR_CATEGORY_FIELDS[category.code as keyof typeof EMR_CATEGORY_FIELDS] || []).find((f) => f.key === groupByParam);
  const UNGROUPED = "Chưa phân nhóm";

  const admin = createAdminClient();
  const { data: caller, error: callerError } = await admin.from("profiles").select("organization_id").eq("user_id", auth.user.id).maybeSingle();
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!caller?.organization_id) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const [itemsRes, departmentsRes, usersRes] = await Promise.all([
    admin
      .from("emr_rollout_items")
      .select("title,description,status,department_ids,owner_user_id,due_date,priority,is_go_live_gate,details,created_at")
      .eq("organization_id", caller.organization_id)
      .eq("category", category.code)
      .order("created_at", { ascending: false }),
    admin.from("departments").select("id,name").eq("organization_id", caller.organization_id),
    admin.from("profiles").select("user_id,full_name,email").eq("organization_id", caller.organization_id),
  ]);
  if (itemsRes.error) return NextResponse.json({ error: itemsRes.error.message }, { status: 400 });

  const deptName = new Map((departmentsRes.data ?? []).map((d: any) => [d.id, d.name]));
  const userName = new Map((usersRes.data ?? []).map((u: any) => [u.user_id, u.full_name || u.email]));
  const extraFields = EMR_CATEGORY_FIELDS[category.code as keyof typeof EMR_CATEGORY_FIELDS] || [];
  const items = itemsRes.data ?? [];

  function cellValue(f: (typeof extraFields)[number], it: any) {
    const raw = it.details?.[f.key];
    if (f.type === "sequence") return formatSequenceValue(raw);
    if (f.type === "boolean") return formatBooleanValue(raw);
    return esc(raw ?? "");
  }

  function rowHtml(it: any, i: number) {
    const extraCells = extraFields.map((f) => `<td>${cellValue(f, it)}</td>`).join("");
    const departmentLabel = (it.department_ids ?? []).length ? (it.department_ids as string[]).map((id) => deptName.get(id) || "—").join(", ") : "Toàn viện";
    return `<tr><td>${i + 1}</td><td>${esc(it.title)}</td><td>${esc(it.description || "")}</td>${extraCells}<td>${esc(departmentLabel)}</td><td>${esc(userName.get(it.owner_user_id) || "")}</td><td>${esc(PRIORITY_LABELS[it.priority] || it.priority)}</td><td>${esc(it.due_date || "")}</td><td>${esc(EMR_STATUS_LABELS[it.status] || it.status)}</td><td>${it.is_go_live_gate ? "Có" : ""}</td></tr>`;
  }

  const extraHeaders = extraFields.map((f) => `<th>${esc(f.label)}</th>`).join("");
  const colCount = 9 + extraFields.length;

  let rows: string;
  if (groupByField) {
    const groups = new Map<string, any[]>();
    for (const it of items) {
      const key = String(it.details?.[groupByField.key] || "").trim() || UNGROUPED;
      const list = groups.get(key) || [];
      list.push(it);
      groups.set(key, list);
    }
    const groupNames = Array.from(groups.keys()).sort((a, b) => a === UNGROUPED ? 1 : b === UNGROUPED ? -1 : a.localeCompare(b, "vi"));
    for (const list of groups.values()) list.sort((a, b) => String(a.title).localeCompare(String(b.title), "vi"));
    let counter = 0;
    rows = groupNames
      .map((name) => {
        const groupRows = groups.get(name)!.map((it) => rowHtml(it, counter++)).join("");
        return `<tr><td colspan="${colCount}" style="background:#f1f5f9;font-weight:bold">${esc(groupByField.label)}: ${esc(name)} (${groups.get(name)!.length})</td></tr>${groupRows}`;
      })
      .join("");
  } else {
    rows = items.map((it: any, i: number) => rowHtml(it, i)).join("");
  }

  const descriptionLabel = category.descriptionLabel || "Mô tả";
  const html = `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><style>
      table{border-collapse:collapse;font-family:Arial;font-size:10pt}th,td{border:1px solid #777;padding:5px;vertical-align:top;white-space:pre-wrap}th{background:#e5e7eb;font-weight:bold}
    </style></head><body>
      <table>
        <thead><tr><th>STT</th><th>Tiêu đề</th><th>${esc(descriptionLabel)}</th>${extraHeaders}<th>Khoa/Phòng</th><th>Người phụ trách</th><th>Ưu tiên</th><th>Hạn</th><th>Trạng thái triển khai</th><th>Go-live gate</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="${colCount}">Chưa có dữ liệu.</td></tr>`}</tbody>
      </table>
    </body></html>`;

  const safe = category.slug.replace(/[^A-Za-z0-9._-]+/g, "_");
  return new NextResponse(html, {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="emr_${safe}.xls"`,
      "Cache-Control": "no-store",
    },
  });
}
