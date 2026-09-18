import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  CRITERION_2026_CONTACTS,
  CRITERION_2026_SOURCE_GROUPS,
  prioritySourceForCode,
  sourceLeadForCode,
  sourceSupportForCode,
} from "@/lib/criteria-2026-source";

const SOURCE_REFERENCE = "Kế hoạch QLCL 2026 · Phụ lục 6 + Bảng theo dõi 83 tiêu chí 2026";

async function authorize(codes: string[]) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false as const, response: NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 }) };
  const checks = await Promise.all(codes.map((code) => supabase.rpc("has_permission", { p_permission_code: code })));
  if (!checks.some((result) => result.data === true)) {
    return { ok: false as const, response: NextResponse.json({ error: "Bạn chưa có quyền xử lý phân công tiêu chí." }, { status: 403 }) };
  }
  return { ok: true as const, user: auth.user };
}

async function callerOrg(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("profiles")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  return { admin, organizationId: data?.organization_id as string | undefined, error };
}

async function canonicalVersion(admin: ReturnType<typeof createAdminClient>, organizationId: string) {
  const { data: set, error: setError } = await admin.from("criteria_sets")
    .select("id")
    .eq("code", "83TC-BYT")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .maybeSingle();
  if (setError || !set) return { version: null, error: setError?.message || "Không tìm thấy bộ 83 tiêu chí chuẩn." };

  const { data: version, error } = await admin.from("criteria_set_versions")
    .select("id,version_no,status")
    .eq("criteria_set_id", set.id)
    .eq("status", "PUBLISHED")
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { version, error: error?.message || null };
}

export async function GET() {
  const auth = await authorize(["criteria.view", "criteria.assess", "criteria.review", "criteria.manage"]);
  if (!auth.ok) return auth.response;

  const identity = await callerOrg(auth.user.id);
  if (!identity.organizationId) {
    return NextResponse.json({ error: identity.error?.message || "Tài khoản chưa gắn bệnh viện." }, { status: 400 });
  }

  const { admin, organizationId } = identity;
  const { version, error: versionError } = await canonicalVersion(admin, organizationId);
  if (!version) return NextResponse.json({ error: versionError || "Chưa có phiên bản 83 tiêu chí đã phát hành." }, { status: 409 });

  const [{ data: criteria, error: criteriaError }, { data: responsibilities, error: responsibilitiesError }, { data: departments, error: departmentsError }] = await Promise.all([
    admin.from("criteria_items").select("id,code,title,sequence_no").eq("criteria_version_id", version.id).order("sequence_no"),
    admin.from("criterion_responsibilities")
      .select("id,criteria_item_id,source_lead_label,source_support_label,lead_department_id,support_department_ids,source_contact_name,source_target_text,target_level,source_due_text,due_date,expected_evidence,source_note,is_priority,mapping_status,source_reference,confirmed_at")
      .eq("organization_id", organizationId)
      .eq("work_year", 2026)
      .eq("criteria_version_id", version.id),
    admin.from("departments").select("id,name,short_name,is_active").eq("organization_id", organizationId).eq("is_active", true).order("name"),
  ]);

  const firstError = criteriaError || responsibilitiesError || departmentsError;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 400 });

  const responsibilityByItem = new Map((responsibilities ?? []).map((row: any) => [row.criteria_item_id, row]));
  const rows = (criteria ?? []).map((item: any) => ({
    ...item,
    responsibility: responsibilityByItem.get(item.id) || null,
  }));

  return NextResponse.json({
    ok: true,
    work_year: 2026,
    criteria_version_id: version.id,
    source_reference: SOURCE_REFERENCE,
    source_groups: CRITERION_2026_SOURCE_GROUPS,
    criteria: rows,
    departments: departments ?? [],
    initialized: (responsibilities ?? []).length > 0,
  });
}

export async function POST(request: Request) {
  const auth = await authorize(["criteria.manage"]);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "").toUpperCase();
  const identity = await callerOrg(auth.user.id);
  if (!identity.organizationId) {
    return NextResponse.json({ error: identity.error?.message || "Tài khoản chưa gắn bệnh viện." }, { status: 400 });
  }
  const { admin, organizationId } = identity;
  const { version, error: versionError } = await canonicalVersion(admin, organizationId);
  if (!version) return NextResponse.json({ error: versionError || "Chưa có phiên bản 83 tiêu chí đã phát hành." }, { status: 409 });

  if (action === "INIT_SOURCE") {
    const { data: criteria, error } = await admin.from("criteria_items")
      .select("id,code,title")
      .eq("criteria_version_id", version.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const invalid = (criteria ?? []).filter((item: any) => !sourceLeadForCode(String(item.code || "")));
    if (invalid.length) {
      const codes = invalid.slice(0, 8).map((item: any) => item.code).join(", ");
      return NextResponse.json({ error: "Nguồn phân công chưa bao phủ " + invalid.length + " tiêu chí: " + codes + "." }, { status: 409 });
    }

    const values = (criteria ?? []).map((item: any) => {
      const code = String(item.code || "");
      const priority = prioritySourceForCode(code);
      return {
        organization_id: organizationId,
        work_year: 2026,
        criteria_version_id: version.id,
        criteria_item_id: item.id,
        source_lead_label: sourceLeadForCode(code),
        source_support_label: sourceSupportForCode(code),
        source_contact_name: CRITERION_2026_CONTACTS[code] || null,
        source_target_text: priority ? "Mức " + priority.targetLevel : "Duy trì, không giảm so với năm 2025",
        target_level: priority?.targetLevel ?? null,
        source_due_text: priority?.sourceDueText ?? null,
        due_date: priority?.dueDate ?? null,
        is_priority: !!priority,
        source_reference: SOURCE_REFERENCE,
        created_by: auth.user.id,
        updated_at: new Date().toISOString(),
      };
    });

    const { error: upsertError } = await admin.from("criterion_responsibilities").upsert(values, {
      onConflict: "organization_id,work_year,criteria_version_id,criteria_item_id",
      ignoreDuplicates: false,
    });
    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 400 });

    await admin.from("audit_logs").insert({
      actor_user_id: auth.user.id,
      table_name: "criterion_responsibilities",
      action_type: "INIT_CRITERIA_RESPONSIBILITY_SOURCE_2026",
      new_value: { work_year: 2026, criteria_version_id: version.id, criteria_count: values.length, source_reference: SOURCE_REFERENCE },
      request_meta: { source: "qlcl-ui", automation: "criteria-responsibility-v1" },
    });

    return NextResponse.json({ ok: true, initialized: values.length });
  }

  if (action === "CONFIRM_GROUP") {
    const sourceLeadLabel = String(body.source_lead_label || "").trim();
    const departmentId = String(body.department_id || "").trim();
    if (!sourceLeadLabel || !departmentId) {
      return NextResponse.json({ error: "Thiếu nhóm phân công hoặc khoa/phòng xác nhận." }, { status: 400 });
    }
    if (!CRITERION_2026_SOURCE_GROUPS.some((group) => group.sourceLeadLabel === sourceLeadLabel)) {
      return NextResponse.json({ error: "Nhóm phân công không thuộc nguồn 83 tiêu chí 2026." }, { status: 400 });
    }

    const { data: department, error: departmentError } = await admin.from("departments")
      .select("id,organization_id,is_active,name")
      .eq("id", departmentId)
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .maybeSingle();
    if (departmentError || !department) {
      return NextResponse.json({ error: departmentError?.message || "Khoa/phòng xác nhận không hợp lệ." }, { status: 400 });
    }

    const { data: updated, error: updateError } = await admin.from("criterion_responsibilities")
      .update({
        lead_department_id: departmentId,
        mapping_status: "CONFIRMED",
        confirmed_by: auth.user.id,
        confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationId)
      .eq("work_year", 2026)
      .eq("criteria_version_id", version.id)
      .eq("source_lead_label", sourceLeadLabel)
      .select("id");
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    if (!updated?.length) return NextResponse.json({ error: "Nhóm nguồn chưa được khởi tạo. Hãy tải lại trang." }, { status: 409 });

    await admin.from("audit_logs").insert({
      actor_user_id: auth.user.id,
      table_name: "criterion_responsibilities",
      action_type: "CONFIRM_CRITERIA_RESPONSIBILITY_GROUP",
      new_value: { work_year: 2026, source_lead_label: sourceLeadLabel, department_id: departmentId, criteria_count: updated.length },
      request_meta: { source: "qlcl-ui", automation: "criteria-responsibility-v1" },
    });

    return NextResponse.json({ ok: true, confirmed: updated.length, department_name: department.name });
  }

  return NextResponse.json({ error: "Thao tác phân công tiêu chí không hợp lệ." }, { status: 400 });
}
