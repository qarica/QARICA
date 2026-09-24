type RpcErrorLike = { code?: string | null; message?: string | null; details?: string | null; hint?: string | null } | null | undefined;

export function isMissingRpcFunction(error: RpcErrorLike, functionName?: string): boolean {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "42883") return true;
  const haystack = `${error.message || ""} ${error.details || ""} ${error.hint || ""}`.toLowerCase();
  const missing = haystack.includes("could not find the function") || haystack.includes("function") && haystack.includes("does not exist");
  if (!missing) return false;
  return !functionName || haystack.includes(functionName.toLowerCase());
}

const VIETNAMESE_CHARS = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

function translatedRpcMessage(raw: string): string | null {
  const value = raw.toLowerCase();
  if (/finding.*not active|finding record is not active/.test(value)) return "Finding không còn hoạt động.";
  if (/capa.*not active|capa record is not active/.test(value)) return "CAPA không còn hoạt động.";
  if (/record.*not active|must be active/.test(value)) return "Hồ sơ không còn ở trạng thái hoạt động.";
  if (/outside organization|organization scope|different organization/.test(value)) return "Hồ sơ nằm ngoài phạm vi tổ chức hiện tại.";
  if (/only effective/.test(value)) return "Chỉ CAPA đã xác nhận có hiệu lực mới được đóng.";
  if (/root cause.*required|requires.*root cause|root cause.*missing/.test(value)) return "Cần hoàn tất nguyên nhân gốc trước khi tiếp tục.";
  if (/evidence.*required|requires.*evidence|missing evidence/.test(value)) return "Chưa đủ minh chứng để thực hiện bước này.";
  if (/incomplete.*action|action.*incomplete/.test(value)) return "Vẫn còn Action chưa hoàn tất.";
  if (/already closed|already completed/.test(value)) return "Hồ sơ đã hoàn tất hoặc đã đóng.";
  if (/not found/.test(value)) return "Không tìm thấy dữ liệu phù hợp hoặc ngoài phạm vi truy cập.";
  if (/invalid status|status.*invalid/.test(value)) return "Trạng thái hồ sơ không hợp lệ cho thao tác này.";
  return null;
}

export function rpcErrorMessage(error: RpcErrorLike, fallback: string): string {
  if (!error) return fallback;
  const raw = String(error.message || error.details || "").trim();
  if (!raw) return fallback;

  const translated = translatedRpcMessage(raw);
  if (translated) return translated;

  const looksInternal = /postgres|sql|schema|relation|column|function|constraint|stack|syntax|pgrst|uuid|jsonb/i.test(raw);
  if (looksInternal) return fallback;

  // Business exceptions authored in Vietnamese may be shown directly.
  // Unknown English strings stay behind the caller's Vietnamese fallback
  // so database implementation details never leak into the UI.
  if (VIETNAMESE_CHARS.test(raw)) return raw;
  return fallback;
}
