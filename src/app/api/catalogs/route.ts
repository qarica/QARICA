import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

type Kind = "criteria" | "indicator";
const config = {
  criteria: { table: "criteria_sets", version: "criteria_set_versions", foreign: "criteria_set_id", permission: "criteria.manage" },
  indicator: { table: "indicator_definitions", version: "indicator_definition_versions", foreign: "indicator_definition_id", permission: "indicators.manage" },
} as const;
const value = (input: unknown) => String(input ?? "").trim();
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(request: Request) {
  const body = await request.json();
  const kind = value(body.kind) as Kind;
  if (!(kind in config)) return fail("Loại danh mục không hợp lệ.");
  const c = config[kind];
  const auth = await requireApiPermission(c.permission);
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { data: caller } = await admin.from("profiles").select("organization_id,is_active").eq("user_id", auth.user.id).maybeSingle();
  if (!caller?.is_active || !caller.organization_id) return fail("Tài khoản chưa gắn bệnh viện.", 403);
  const action = value(body.action);
  const code = value(body.code), name = value(body.name);
  if (action === "create") {
    if (!code || !name) return fail("Mã và tên là bắt buộc.");
    const { data: existing } = await admin.from(c.table).select("id").eq("organization_id", caller.organization_id).eq("code", code).maybeSingle();
    if (existing) return fail("Mã này đã tồn tại trong danh mục.", 409);
    const fields = kind === "criteria" ? { description: value(body.description) || null } : { purpose: value(body.description) || null };
    const { data, error } = await admin.from(c.table).insert({ organization_id: caller.organization_id, code, name, is_active: true, ...fields }).select("id").single();
    if (error || !data) return fail(error?.message || "Không tạo được danh mục.");
    const { error: versionError } = await admin.from(c.version).insert({ [c.foreign]: data.id, version_no: 1, status: "DRAFT" });
    if (versionError) { await admin.from(c.table).delete().eq("id", data.id); return fail(versionError.message); }
    return NextResponse.json({ ok: true, id: data.id });
  }
  const id = value(body.id);
  const { data: row } = await admin.from(c.table).select("id,is_active").eq("id", id).eq("organization_id", caller.organization_id).maybeSingle();
  if (!row) return fail("Không tìm thấy danh mục thuộc bệnh viện.", 404);
  if (action === "retire") {
    const { error } = await admin.from(c.table).update({ is_active: false }).eq("id", id);
    return error ? fail(error.message) : NextResponse.json({ ok: true });
  }
  if (!row.is_active) return fail("Danh mục đã ngưng sử dụng.", 409);
  const { data: versions, error: versionLookupError } = await admin.from(c.version).select("id,version_no,status").eq(c.foreign, id).order("version_no", { ascending: false }).limit(1);
  if (versionLookupError) return fail(versionLookupError.message);
  const latest = versions?.[0];
  if (action === "draft") {
    if (!latest || latest.status === "DRAFT") return fail("Đã có bản nháp hoặc chưa có phiên bản.", 409);
    const { data: draft, error } = await admin.from(c.version).insert({ [c.foreign]: id, version_no: latest.version_no + 1, status: "DRAFT" }).select("id").single();
    if (error || !draft) return fail(error?.message || "Không tạo được bản nháp.");
    if (kind === "criteria") {
      const { data: items, error: readError } = await admin.from("criteria_items").select("id,code,title,description,sequence_no,chapter_code,chapter_name,score_weight,is_core,is_mandatory,max_score,parent_criteria_item_id,item_type,is_active").eq("criteria_version_id", latest.id).order("sequence_no");
      if (readError) { await admin.from(c.version).delete().eq("id", draft.id); return fail(readError.message); }
      const idMap = new Map<string,string>();
      for (const item of [...(items || [])].sort((a, b) => Number(!!a.parent_criteria_item_id) - Number(!!b.parent_criteria_item_id))) {
        const { id: oldId, parent_criteria_item_id, ...fields } = item;
        const { data: copied, error: copyError } = await admin.from("criteria_items").insert({ ...fields, criteria_version_id: draft.id, parent_criteria_item_id: parent_criteria_item_id ? idMap.get(parent_criteria_item_id) || null : null }).select("id").single();
        if (copyError || !copied) { await admin.from(c.version).delete().eq("id", draft.id); return fail(copyError?.message || "Không sao chép được tiêu chí."); }
        idMap.set(oldId, copied.id);
      }
    } else {
      const { data: source } = await admin.from(c.version).select("calculation_type,desired_direction,frequency,unit,multiplier").eq("id", latest.id).single();
      if (source) await admin.from(c.version).update(source).eq("id", draft.id);
    }
    return NextResponse.json({ ok: true, version_id: draft.id });
  }
  if (action === "publish") {
    if (latest?.status !== "DRAFT") return fail("Chỉ phát hành bản nháp.", 409);
    if (kind === "criteria") {
      const { count } = await admin.from("criteria_items").select("id", { count: "exact", head: true }).eq("criteria_version_id", latest.id).eq("item_type", "CRITERION").eq("is_active", true);
      if (!count) return fail("Cần có ít nhất một tiêu chí trước khi phát hành.", 409);
    } else {
      const { data: definition } = await admin.from(c.version).select("unit,frequency,calculation_type").eq("id", latest.id).single();
      if (!definition?.unit || !definition.frequency || !definition.calculation_type) return fail("Cần hoàn thiện đơn vị đo, tần suất và cách tính trước khi phát hành.", 409);
    }
    const { error } = await admin.from(c.version).update({ status: "PUBLISHED", published_at: new Date().toISOString() }).eq("id", latest.id).eq("status", "DRAFT");
    return error ? fail(error.message) : NextResponse.json({ ok: true });
  }
  if (action === "update") {
    if (!code || !name) return fail("Mã và tên là bắt buộc.");
    if (latest?.status !== "DRAFT") return fail("Tạo bản nháp mới trước khi cập nhật danh mục đã phát hành.", 409);
    const fields = kind === "criteria" ? { description: value(body.description) || null } : { purpose: value(body.description) || null };
    const { error } = await admin.from(c.table).update({ code, name, ...fields }).eq("id", id);
    return error ? fail(error.message) : NextResponse.json({ ok: true });
  }
  return fail("Thao tác không hợp lệ.");
}
