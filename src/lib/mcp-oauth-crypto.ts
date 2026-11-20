import { createCipheriv, createDecipheriv, randomBytes, createHash, timingSafeEqual } from "node:crypto";

// Mã hoá đối xứng (AES-256-GCM) cho access/refresh token THẬT của Supabase
// trước khi lưu vào mcp_oauth_tokens — bảng này dù đã khoá RLS hoàn toàn
// (xem migration 20261130000010) vẫn là nơi giữ tương đương 1 phiên đăng
// nhập đầy đủ, nên mã hoá thêm 1 lớp bằng khoá chỉ server có (không nằm
// trong Postgres) là hợp lý. Định dạng lưu: "<iv_base64>.<tag_base64>.
// <ciphertext_base64>".
function getEncryptionKey(): Buffer {
  const raw = process.env.MCP_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("Missing MCP_TOKEN_ENCRYPTION_KEY");
  // Chấp nhận khoá dạng hex (64 ký tự = 32 byte) hoặc base64 — tiện tạo bằng
  // `openssl rand -hex 32` hoặc `openssl rand -base64 32`.
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("MCP_TOKEN_ENCRYPTION_KEY phải là 32 byte (hex 64 ký tự hoặc base64).");
  return buf;
}

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ciphertext.toString("base64")}`;
}

export function decryptToken(stored: string): string {
  const key = getEncryptionKey();
  const [ivB64, tagB64, ctB64] = stored.split(".");
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("Dữ liệu token đã mã hoá sai định dạng.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}

export function randomOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

// PKCE (RFC 7636) — bắt buộc với public client (Claude không giữ client
// secret), chống đánh cắp authorization code giữa /authorize và /token.
export function verifyPkce(codeVerifier: string, codeChallenge: string, method: string): boolean {
  if (method !== "S256") return false;
  const computed = createHash("sha256").update(codeVerifier).digest("base64url");
  const a = Buffer.from(computed);
  const b = Buffer.from(codeChallenge);
  return a.length === b.length && timingSafeEqual(a, b);
}
