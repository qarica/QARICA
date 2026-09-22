import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { rpcErrorMessage } from "@/lib/rpc-compat";
import { createAdminClient } from "@/lib/supabase/admin";

const CREATE_RPC = "qlcl_create_indicator_definition_v1";
const clean = (value: unknown) => String(value ?? "").trim();
const DIRECTIONS = new Set(["HIGHER_IS_BETTER", "LOWER_IS_BETTER", "TARGET_RANGE", "NEUTRAL"]);
const CALC_TYPES = new Set(["RAW", "PERCENTAGE", "RATIO", "RATE", "AVERAGE", "COUNT"]);
const FREQUENCIES = new Set(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"]);

export async function POST(request: Request) {
  const auth = await requireApiPermission("indicators.manage");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const name = clean(body.name);
  const code = clean(body.code).toUpperCase() || null;
  const purpose = clean(body.purpose) || null;
  const qualityDimension = clean(body.quality_dimension) || null;
  const calculationType = clean(body.calculation_type || "RAW").toUpperCase();
  const direction = clean(body.desired_direction || "NEUTRAL").toUpperCase();
  const frequency = clean(body.frequency || "MONTHLY").toUpperCase();
  const unit = clean(body.unit) || null;
  const effectiveFrom = clean(body.effective_from) || null;

  if (!name) return NextResponse.json({ error: "Tên chỉ số là bắt buộc." }, { status: 400 });
  if (!CALC_TYPES.has(calculationType)) return NextResponse.json({ error: "Loại tính chỉ số không hợp lệ." }, { status: 400 });
  if (!DIRECTIONS.has(direction)) return NextResponse.json({ error: "Chiều mong muốn không hợp lệ." }, { status: 400 });
  if (!FREQUENCIES.has(frequency)) return NextResponse.json({ error: "Tần suất không hợp lệ." }, { status: 400 });

  const multiplier =
    body.multiplier === null || body.multiplier === undefined || String(body.multiplier).trim() === ""
      ? null
      : Number(body.multiplier);
  if (multiplier !== null && !Number.isFinite(multiplier)) {
    return NextResponse.json({ error: "Hệ số nhân không hợp lệ." }, { status: 400 });
  }
  if (effectiveFrom && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
    return NextResponse.json({ error: "Ngày hiệu lực không hợp lệ." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: tx, error } = await admin.rpc(CREATE_RPC, {
    p_actor_user_id: auth.user.id,
    p_code: code,
    p_name: name,
    p_purpose: purpose,
    p_quality_dimension: qualityDimension,
    p_calculation_type: calculationType,
    p_desired_direction: direction,
    p_frequency: frequency,
    p_unit: unit,
    p_multiplier: multiplier,
    p_effective_from: effectiveFrom,
  });

  if (error) {
    const message = rpcErrorMessage(error, "Không tạo được chỉ số.");
    const status =
      /not active/i.test(message) ? 403 :
      /already exists|required|invalid/i.test(message) ? 409 :
      400;
    return NextResponse.json({ error: message }, { status });
  }

  const result = tx && typeof tx === "object" ? tx as Record<string, unknown> : {};
  const id = typeof result.id === "string" ? result.id : null;
  const versionId = typeof result.version_id === "string" ? result.version_id : null;
  const persistedCode = typeof result.code === "string" ? result.code : null;

  if (!id || !versionId || !persistedCode) {
    return NextResponse.json({ error: "Kết quả tạo chỉ số không hợp lệ." }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    id,
    code: persistedCode,
    name: typeof result.name === "string" ? result.name : name,
    version_id: versionId,
    version_no: 1,
    status: "DRAFT",
    transaction: "atomic",
  });
}
