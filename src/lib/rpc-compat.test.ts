import { describe, expect, it } from "vitest";
import { isMissingRpcFunction, rpcErrorMessage } from "./rpc-compat";

describe("transaction RPC compatibility", () => {
  it("detects PostgREST missing function errors", () => {
    expect(isMissingRpcFunction({ code: "PGRST202", message: "Could not find the function public.example" }, "example")).toBe(true);
  });

  it("detects PostgreSQL undefined function errors", () => {
    expect(isMissingRpcFunction({ code: "42883", message: "function example(uuid) does not exist" }, "example")).toBe(true);
  });

  it("does not fallback for a real transaction failure", () => {
    expect(isMissingRpcFunction({ code: "P0001", message: "Finding already escalated to CAPA" }, "qlcl_escalate_finding_to_capa_v1")).toBe(false);
  });

  it("does not hide unrelated database errors", () => {
    expect(isMissingRpcFunction({ code: "23505", message: "duplicate key value violates unique constraint" })).toBe(false);
  });

  it("returns a useful RPC error message", () => {
    expect(rpcErrorMessage({ message: "transaction failed" }, "fallback")).toBe("transaction failed");
  });
});


describe("rpcErrorMessage Vietnamese UI guard", () => {
  it("translates known English business exceptions", () => {
    expect(rpcErrorMessage({ message: "Finding record is not active" }, "Không xử lý được Finding.")).toBe("Finding không còn hoạt động.");
    expect(rpcErrorMessage({ message: "CAPA can only effective close" }, "Không đóng được CAPA.")).toBe("Chỉ CAPA đã xác nhận có hiệu lực mới được đóng.");
    expect(rpcErrorMessage({ message: "Record is outside organization scope" }, "Không xử lý được hồ sơ.")).toBe("Hồ sơ nằm ngoài phạm vi tổ chức hiện tại.");
  });

  it("keeps Vietnamese business messages but hides unknown English/internal details", () => {
    expect(rpcErrorMessage({ message: "Hồ sơ không còn hoạt động." }, "Fallback")).toBe("Hồ sơ không còn hoạt động.");
    expect(rpcErrorMessage({ message: "Unexpected workflow state" }, "Không xử lý được hồ sơ.")).toBe("Không xử lý được hồ sơ.");
    expect(rpcErrorMessage({ message: "relation public.capas does not exist" }, "Không xử lý được CAPA.")).toBe("Không xử lý được CAPA.");
  });
});
