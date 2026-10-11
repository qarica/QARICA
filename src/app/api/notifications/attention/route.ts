import { NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-auth";
import { buildAttentionProjection } from "@/lib/attention-projection";

export async function GET() {
  const auth = await requireApiContext();
  if (!auth.ok) return auth.response;
  try {
    const attention = await buildAttentionProjection(auth.supabase, auth.context.user);
    return NextResponse.json({ ok: true, attention });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không tải được attention." }, { status: 500 });
  }
}
