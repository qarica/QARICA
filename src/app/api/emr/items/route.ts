import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { EMR_CATEGORIES, EMR_CATEGORY_FIELDS } from "@/lib/emr-categories";

function sanitizeDetails(category: string, raw: unknown): Record<string, unknown> {
  const fields = (EMR_CATEGORY_FIELDS as any)[category] || [];
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const value = source[f.key];
    if (value === undefined || value === null || value === "") continue;
    if (f.type === "number") { const n = Number(value); if (Number.isFinite(n)) out[f.key] = n; continue; }
    out[f.key] = String(value).trim();
  }
  return out;
}

export async function GET(request: Request) {
  const auth = await requireApiPermission("emr.view");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  if (!category || !EMR_CATEGORIES.some((c) => c.code === category)) {
    return NextResponse.json({ error: "Danh mục không hợp lệ." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 400 });
  if (!profile?.organization_id) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data, error } = await admin
    .from("emr_rollout_items")
    .select("id,category,title,description,status,department_id,owner_user_id,due_date,priority,is_go_live_gate,evidence_url,verified_at,details,created_at,updated_at")
    .eq("organization_id", profile.organization_id)
    .eq("category", category)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, items: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("emr.manage");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const category = String(body.category || "");
  const title = String(body.title || "").trim();
  const description = body.description ? String(body.description).trim() : null;
  const status = String(body.status || "TODO");
  const priority = String(body.priority || "MEDIUM");
  const dueDate = body.due_date ? String(body.due_date) : null;
  const isGoLiveGate = body.is_go_live_gate === true;
  const evidenceUrl = body.evidence_url ? String(body.evidence_url).trim() : null;
  const departmentId = body.department_id ? String(body.department_id) : null;
  const ownerUserId = body.owner_user_id ? String(body.owner_user_id) : null;

  if (!EMR_CATEGORIES.some((c) => c.code === category)) return NextResponse.json({ error: "Danh mục không hợp lệ." }, { status: 400 });
  if (!title) return NextResponse.json({ error: "Cần nhập tiêu đề." }, { status: 400 });
  if (!["TODO", "IN_PROGRESS", "DONE", "BLOCKED"].includes(status)) return NextResponse.json({ error: "Trạng thái không hợp lệ." }, { status: 400 });
  if (!["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(priority)) return NextResponse.json({ error: "Mức ưu tiên không hợp lệ." }, { status: 400 });

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 400 });
  if (!profile?.organization_id) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  if (departmentId) { const { data: d } = await admin.from("departments").select("id").eq("id", departmentId).eq("organization_id", profile.organization_id).eq("is_active", true).maybeSingle(); if (!d) return NextResponse.json({ error: "Khoa/phòng không hợp lệ." }, { status: 400 }); }
  if (ownerUserId) { const { data: u } = await admin.from("profiles").select("user_id").eq("user_id", ownerUserId).eq("organization_id", profile.organization_id).eq("is_active", true).maybeSingle(); if (!u) return NextResponse.json({ error: "Người phụ trách không hợp lệ." }, { status: 400 }); }

  const { data, error } = await admin
    .from("emr_rollout_items")
    .insert({
      organization_id: profile.organization_id,
      category,
      title,
      description,
      status,
      priority, due_date: dueDate, department_id: departmentId, owner_user_id: ownerUserId, is_go_live_gate: isGoLiveGate, evidence_url: evidenceUrl,
      details: sanitizeDetails(category, body.details),
      created_by: auth.user.id,
      updated_by: auth.user.id,
    })
    .select("id,category,title,description,status,department_id,owner_user_id,due_date,priority,is_go_live_gate,evidence_url,verified_at,details,created_at,updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, item: data });
}
