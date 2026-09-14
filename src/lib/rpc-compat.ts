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
  return String(error?.message || error?.details || fallback);
}
