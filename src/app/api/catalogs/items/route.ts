import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const val = (x: unknown) => String(x ?? "").trim();
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request) {
  const auth = await requireApiPermission("criteria.manage");
  if (!auth.ok) return auth.response;
  const body = await request.json();
  const admin = createAdminClient();
  const { data: caller } = await admin.from("profiles").select("organization_id,is_active").eq("user_id", auth.user.id).maybeSingle();
  if (!caller?.is_active || !caller.organization_id) return fail("Tài khoản không hợp lệ.", 403);
  const versionId = val(body.version_id);
  const { data: version } = await admin.from("criteria_set_versions").select("id,status,criteria_set_id").eq("id", versionId).maybeSingle();
  if (version?.status !== "DRAFT") return fail("Chỉ chỉnh sửa tiêu chí trong bản nháp.", 409);
  const { data: set } = await admin.from("criteria_sets").select("organization_id,is_active").eq("id", version.criteria_set_id).maybeSingle();
  if (!set?.is_active || set.organization_id !== caller.organization_id) return fail("Bộ tiêu chí không thuộc bệnh viện.", 403);
  const action = val(body.action);
  const id = val(body.id);
  if (action === "retire") {
    const { error } = await admin.from("criteria_items").update({ is_active: false }).eq("id", id).eq("criteria_version_id", versionId);
    return error ? fail(error.message) : NextResponse.json({ ok: true });
  }
  const code = val(body.code), title = val(body.title), itemType = val(body.item_type);
  if (!code || !title || !["CRITERION", "SUBITEM"].includes(itemType)) return fail("Cần mã, tên và loại tiêu chí hợp lệ.");
  const parentId = itemType === "SUBITEM" ? val(body.parent_id) : "";
  if (itemType === "SUBITEM") {
    if (!parentId) return fail("Tiểu mục cần có tiêu chí cha.");
    const { data: parent } = await admin.from("criteria_items").select("id,item_type,is_active").eq("id", parentId).eq("criteria_version_id", versionId).maybeSingle();
    if (parent?.item_type !== "CRITERION" || !parent.is_active) return fail("Tiêu chí cha không hợp lệ.");
  }
  const fields = { code, title, description: val(body.description) || null, item_type: itemType, parent_criteria_item_id: parentId || null };
  if (action === "create") {
    const { data: existing } = await admin.from("criteria_items").select("id").eq("criteria_version_id", versionId).eq("code", code).maybeSingle();
    if (existing) return fail("Mã tiêu chí hoặc tiểu mục đã tồn tại.", 409);
    const { count } = await admin.from("criteria_items").select("id", { count: "exact", head: true }).eq("criteria_version_id", versionId);
    const { error } = await admin.from("criteria_items").insert({ ...fields, criteria_version_id: versionId, sequence_no: (count || 0) + 1, is_active: true });
    return error ? fail(error.message) : NextResponse.json({ ok: true });
  }
  if (action === "update") {
    const { error } = await admin.from("criteria_items").update(fields).eq("id", id).eq("criteria_version_id", versionId).eq("is_active", true);
    return error ? fail(error.message) : NextResponse.json({ ok: true });
  }
  return fail("Thao tác không hợp lệ.");
}
