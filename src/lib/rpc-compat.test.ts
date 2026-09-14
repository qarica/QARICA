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
