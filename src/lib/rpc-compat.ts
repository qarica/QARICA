type RpcErrorLike = { code?: string | null; message?: string | null; details?: string | null; hint?: string | null } | null | undefined;

export function isMissingRpcFunction(error: RpcErrorLike, functionName?: string): boolean {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "42883") return true;
  const haystack = `${error.message || ""} ${error.details || ""} ${error.hint || ""}`.toLowerCase();
  const missing = haystack.includes("could not find the function") || haystack.includes("function") && haystack.includes("does not exist");
  if (!missing) return false;
  return !functionName || haystack.includes(functionName.toLowerCase());
}

export function rpcErrorMessage(error: RpcErrorLike, fallback: string): string {
  if (!error) return fallback;
  const raw = String(error.message || error.details || "").trim();
  if (!raw) return fallback;
  const safe = raw.toLowerCase();
  const known = ["required", "not active", "not found", "must be", "incomplete", "unsupported", "invalid", "already", "evidence", "action", "status"];
  const looksInternal = /postgres|sql|schema|relation|column|function|constraint|stack|syntax|pgrst|uuid|jsonb/i.test(raw);
  if (looksInternal || !known.some((token) => safe.includes(token))) return fallback;
  return raw;
}
