import { describe, expect, it } from "vitest";
import { rankBySimilarity, textSimilarity, tokenize } from "./text-similarity";

describe("tokenize", () => {
  it("lowercases, strips punctuation, and drops short/stop words", () => {
    const tokens = tokenize("Bệnh nhân bị TÉ NGÃ tại hành lang, và không có người theo dõi.");
    expect(tokens).toContain("ngã");
    expect(tokens).toContain("hành");
    expect(tokens).toContain("lang");
    expect(tokens).not.toContain("và");
    expect(tokens).not.toContain("có");
  });

  it("returns empty array for empty/whitespace input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   ")).toEqual([]);
  });
});

describe("textSimilarity", () => {
  it("scores identical text as 1", () => {
    const text = "Người bệnh té ngã tại hành lang khoa Nội lúc giao ca.";
    expect(textSimilarity(text, text)).toBe(1);
  });

  it("scores completely unrelated text near 0", () => {
    const score = textSimilarity(
      "Người bệnh té ngã tại hành lang khoa Nội.",
      "Máy siêu âm tại khoa Chẩn đoán hình ảnh bị lỗi phần mềm.",
    );
    expect(score).toBeLessThan(0.1);
  });

  it("scores paraphrased near-duplicates fairly high", () => {
    const a = "Người bệnh té ngã tại hành lang khoa Nội lúc giao ca, chưa ghi nhận tổn thương.";
    const b = "Té ngã ở hành lang khoa Nội vào lúc giao ca, người bệnh chưa có tổn thương ghi nhận.";
    expect(textSimilarity(a, b)).toBeGreaterThan(0.4);
  });

  it("returns 0 when either side is empty", () => {
    expect(textSimilarity("", "Người bệnh té ngã.")).toBe(0);
    expect(textSimilarity("Người bệnh té ngã.", "")).toBe(0);
  });

  it("is symmetric", () => {
    const a = "Nhầm thuốc do đọc sai y lệnh tại khoa Nội.";
    const b = "Sai sót nhầm thuốc, đọc sai y lệnh ở khoa Nội.";
    expect(textSimilarity(a, b)).toBe(textSimilarity(b, a));
  });
});

describe("rankBySimilarity", () => {
  const candidates = [
    { id: "1", text: "Người bệnh té ngã tại hành lang khoa Nội." },
    { id: "2", text: "Máy monitor tại khoa Hồi sức bị mất nguồn điện đột ngột." },
    { id: "3", text: "Té ngã ở hành lang khoa Nội, chưa ghi nhận tổn thương." },
  ];

  it("ranks closest matches first and respects the limit", () => {
    const ranked = rankBySimilarity("Người bệnh té ngã ở hành lang khoa Nội lúc sáng.", candidates, (c) => c.text, { limit: 2, minScore: 0 });
    expect(ranked.length).toBe(2);
    expect(ranked[0].id).not.toBe("2");
  });

  it("excludes candidates below minScore", () => {
    const ranked = rankBySimilarity("Người bệnh té ngã ở hành lang khoa Nội lúc sáng.", candidates, (c) => c.text, { minScore: 0.9 });
    expect(ranked.length).toBe(0);
  });

  it("preserves original candidate fields alongside similarity", () => {
    const ranked = rankBySimilarity("Người bệnh té ngã tại hành lang khoa Nội.", candidates, (c) => c.text, { minScore: 0 });
    expect(ranked[0]).toHaveProperty("id");
    expect(ranked[0]).toHaveProperty("similarity");
  });
});
