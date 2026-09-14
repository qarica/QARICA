import { NextResponse } from "next/server";
import { getPublicSupabaseKey, getPublicSupabaseUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = getPublicSupabaseUrl().replace(/\/+$/, "");
  const key = getPublicSupabaseKey();

  try {
    const response = await fetch(`${url}/auth/v1/health`, {
      method: "GET",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      cache: "no-store",
    });

    const body = await response.text();

    return NextResponse.json(
      {
        ok: response.ok,
        supabase_host: new URL(url).host,
        upstream_status: response.status,
        upstream_body: body.slice(0, 300),
      },
      { status: response.ok ? 200 : 502 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        supabase_host: new URL(url).host,
        upstream_status: null,
        upstream_body: null,
        error: error instanceof Error ? error.message : "Unknown upstream error",
      },
      { status: 502 },
    );
  }
}
