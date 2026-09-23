import { describe, expect, it } from "vitest";
import { evidenceFilePolicy, evidenceInlineSafe } from "./evidence-file-policy";

describe("evidence file policy", () => {
  it("rejects active-content file extensions", () => {
    expect(evidenceFilePolicy("proof.html")).toBeNull();
    expect(evidenceFilePolicy("proof.svg")).toBeNull();
    expect(evidenceFilePolicy("proof.js")).toBeNull();
  });

  it("assigns canonical MIME instead of trusting the client", () => {
    expect(evidenceFilePolicy("proof.pdf")?.mimeType).toBe("application/pdf");
    expect(evidenceFilePolicy("proof.docx")?.inlineSafe).toBe(false);
  });

  it("only permits inline rendering when extension and stored MIME agree", () => {
    expect(evidenceInlineSafe("photo.png","image/png")).toBe(true);
    expect(evidenceInlineSafe("photo.png","text/html")).toBe(false);
    expect(evidenceInlineSafe("table.xlsx","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe(false);
  });
});
