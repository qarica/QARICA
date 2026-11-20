import { NextResponse } from "next/server";
import { userScopedClientFromMcpToken } from "@/lib/supabase/mcp-user-client";
import { MCP_TOOLS, callMcpTool } from "@/lib/mcp-tools";

type JsonRpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

function rpcResult(id: string | number | null | undefined, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result });
}
function rpcError(id: string | number | null | undefined, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}

// Endpoint MCP thật (Streamable HTTP transport, JSON-RPC 2.0 qua POST) —
// mọi request phải mang Authorization: Bearer <mcp access_token> đã đổi ở
// /api/mcp/token. Không có khái niệm "phiên trình duyệt" ở đây — token tự
// nó xác định người dùng (xem userScopedClientFromMcpToken).
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });

  const auth = await userScopedClientFromMcpToken(token);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });

  const body = (await request.json().catch(() => null)) as JsonRpcRequest | null;
  if (!body || body.jsonrpc !== "2.0" || !body.method) return rpcError(body?.id, -32600, "Invalid Request");

  // Notification (không có id) — client không chờ phản hồi, trả 202 trống.
  if (body.method === "notifications/initialized") return new NextResponse(null, { status: 202 });

  if (body.method === "initialize") {
    return rpcResult(body.id, {
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "qarica-mcp", version: "1.0.0" },
    });
  }

  if (body.method === "tools/list") {
    return rpcResult(body.id, { tools: MCP_TOOLS });
  }

  if (body.method === "tools/call") {
    const toolName = String(body.params?.name || "");
    const args = (body.params?.arguments as Record<string, unknown>) || {};
    try {
      const data = await callMcpTool(auth.supabase, auth.userId, toolName, args);
      return rpcResult(body.id, { content: [{ type: "text", text: JSON.stringify(data) }] });
    } catch (err) {
      return rpcResult(body.id, { content: [{ type: "text", text: err instanceof Error ? err.message : "Lỗi không xác định." }], isError: true });
    }
  }

  return rpcError(body.id, -32601, "Method not found");
}
