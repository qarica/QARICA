import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { EMR_CATEGORIES } from "@/lib/emr-categories";

const STATUSES = ["TODO", "IN_PROGRESS", "DONE", "BLOCKED"];

export async function GET() {
  const auth = await requireApiPermission("emr.view");
  if (!auth.ok) return auth.response;
  const { organizationId, error: callerError } = await callerOrganizationId(auth.supabase, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data, error } = await auth.supabase
    .from("emr_timeline_milestones")
    .select("id,parent_id,title,start_date,end_date,status,category,sort_order,created_at")
    .eq("organization_id", organizationId)
    .order("sort_order")
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, milestones: data ?? [] });
}

// parent_id null = depth 0 ("đầu việc lớn"); set = nested under that parent.
// Báo cáo thực tế: "kế hoạch chung, giai đoạn, khoa" — cần đúng 3 cấp (đầu
// việc lớn / giai đoạn / khoa), không phải 2 như trước. Một đầu việc con chỉ
// được khai dưới 1 cha đã tồn tại, cùng tổ chức, VÀ cha đó không được có "ông"
// (parent của parent) — nghĩa là cha tối đa ở độ sâu 1, chặn tạo cấp thứ 4.
export async function POST(request: Request) {
  const auth = await requireApiPermission("emr.manage");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(auth.supabase, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ error: "Cần nhập tên đầu việc." }, { status: 400 });
  const status = String(body.status || "TODO");
  if (!STATUSES.includes(status)) return NextResponse.json({ error: "Trạng thái không hợp lệ." }, { status: 400 });
  const startDate = body.start_date ? String(body.start_date) : null;
  const endDate = body.end_date ? String(body.end_date) : null;
  const parentId = body.parent_id ? String(body.parent_id) : null;
  const category = body.category ? String(body.category) : null;
  if (category && !EMR_CATEGORIES.some((c) => c.code === category)) return NextResponse.json({ error: "Danh mục EMR không hợp lệ." }, { status: 400 });

  if (parentId) {
    const { data: parent } = await admin.from("emr_timeline_milestones").select("id,parent_id").eq("id", parentId).eq("organization_id", organizationId).maybeSingle();
    if (!parent) return NextResponse.json({ error: "Đầu việc cha không hợp lệ." }, { status: 400 });
    if (parent.parent_id) {
      const { data: grandparent } = await admin.from("emr_timeline_milestones").select("id,parent_id").eq("id", parent.parent_id).eq("organization_id", organizationId).maybeSingle();
      if (grandparent?.parent_id) return NextResponse.json({ error: "Chỉ hỗ trợ 3 cấp: đầu việc lớn, giai đoạn và khoa/phòng." }, { status: 400 });
    }
  }

  let countQuery = admin.from("emr_timeline_milestones").select("id", { count: "exact", head: true }).eq("organization_id", organizationId);
  countQuery = parentId ? countQuery.eq("parent_id", parentId) : countQuery.is("parent_id", null);
  const { count } = await countQuery;
  const { data, error } = await admin
    .from("emr_timeline_milestones")
    .insert({
      organization_id: organizationId,
      parent_id: parentId,
      title,
      start_date: startDate,
      end_date: endDate,
      status,
      category,
      sort_order: count ?? 0,
      created_by: auth.user.id,
    })
    .select("id,parent_id,title,start_date,end_date,status,category,sort_order,created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, milestone: data });
}
