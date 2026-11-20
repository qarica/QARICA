import { describe, expect, it, beforeAll } from "vitest";
import { createHash } from "node:crypto";
import { decryptToken, encryptToken, randomOpaqueToken, verifyPkce } from "./mcp-oauth-crypto";

beforeAll(() => {
  process.env.MCP_TOKEN_ENCRYPTION_KEY = "0".repeat(64); // 32-byte hex test key
});

describe("mcp-oauth-crypto: mã hoá access/refresh token thật của Supabase trước khi lưu", () => {
  it("mã hoá rồi giải mã lại đúng chuỗi gốc", () => {
    const plaintext = "sb-access-token-abc.def.ghi";
    const stored = encryptToken(plaintext);
    expect(stored).not.toContain(plaintext);
    expect(decryptToken(stored)).toBe(plaintext);
  });

  it("đổi 1 ký tự trong chuỗi đã mã hoá thì giải mã phải lỗi (GCM phát hiện chỉnh sửa)", () => {
    const stored = encryptToken("secret");
    const tampered = stored.slice(0, -1) + (stored.at(-1) === "A" ? "B" : "A");
    expect(() => decryptToken(tampered)).toThrow();
  });

  it("mỗi lần mã hoá cùng 1 plaintext ra 1 chuỗi khác nhau (IV ngẫu nhiên)", () => {
    const a = encryptToken("same");
    const b = encryptToken("same");
    expect(a).not.toBe(b);
  });
});

describe("randomOpaqueToken: đủ dài, không trùng lặp", () => {
  it("sinh ra chuỗi khác nhau mỗi lần gọi", () => {
    expect(randomOpaqueToken()).not.toBe(randomOpaqueToken());
  });
});

describe("verifyPkce: chống đánh cắp authorization code (RFC 7636)", () => {
  it("verifier đúng khớp challenge S256 thì hợp lệ", () => {
    const verifier = "test-code-verifier-1234567890";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    expect(verifyPkce(verifier, challenge, "S256")).toBe(true);
  });

  it("verifier sai thì không hợp lệ", () => {
    const challenge = createHash("sha256").update("real-verifier").digest("base64url");
    expect(verifyPkce("wrong-verifier", challenge, "S256")).toBe(false);
  });

  it("method khác S256 (vd 'plain') luôn bị từ chối", () => {
    expect(verifyPkce("abc", "abc", "plain")).toBe(false);
  });
});
