// So khớp văn bản tiếng Việt kiểu "lexical" (dựa trên từ/cụm từ trùng nhau) —
// KHÔNG PHẢI semantic/AI embedding. Dùng để gợi ý "có thể trùng/giống" cho con
// người tự xem lại, không dùng để tự động gộp/từ chối hồ sơ.
//
// Cách làm: tách từ tiếng Việt theo khoảng trắng/dấu câu, bỏ một danh sách nhỏ
// hư từ (stopword) tiếng Việt phổ biến, rồi tính Jaccard similarity trên tập
// từ đơn (unigram) kết hợp trọng số nhẹ cho các cụm 2 từ liền kề (bigram) để
// bắt được cả các câu diễn đạt gần giống nhau, không chỉ trùng từng từ.

const STOPWORDS = new Set([
  "và","của","cho","tại","trong","là","có","được","đã","này","các","với",
  "khi","về","do","bị","sẽ","không","một","những","để","theo","sau","trước",
  "đến","từ","ra","vào","lúc","như","nên","thì","mà","nếu","hay","hoặc",
  "cũng","rất","người","bệnh","nhân","viên","đó","ở","tôi","chúng","ta",
  "đang","vẫn","còn","lại","nơi","nào","gì","ai","bằng","qua",
]);

/** Tách văn bản thành danh sách từ đã chuẩn hoá (thường, bỏ dấu câu, bỏ stopword). */
export function tokenize(text: string): string[] {
  const normalized = String(text || "").toLocaleLowerCase("vi");
  const words = normalized
    .split(/[^\p{L}\p{N}]+/u)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
  return words;
}

function bigrams(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) out.push(`${tokens[i]}_${tokens[i + 1]}`);
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return union ? intersection / union : 0;
}

/**
 * Điểm tương đồng 0..1 giữa 2 đoạn văn bản. Trộn Jaccard trên unigram (70%) và
 * trên bigram liền kề (30%) — bigram giúp câu diễn đạt gần giống nhau (đảo từ
 * ít) vẫn được nhận ra hơn so với chỉ đếm từ đơn lẻ.
 */
export function textSimilarity(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (!tokensA.length || !tokensB.length) return 0;

  const unigramScore = jaccard(new Set(tokensA), new Set(tokensB));
  const bigramsA = bigrams(tokensA);
  const bigramsB = bigrams(tokensB);
  const bigramScore = bigramsA.length && bigramsB.length ? jaccard(new Set(bigramsA), new Set(bigramsB)) : 0;

  return Math.round((unigramScore * 0.7 + bigramScore * 0.3) * 1000) / 1000;
}

export type SimilarityCandidate<T> = T & { __similarityText: string };

/**
 * Xếp hạng danh sách ứng viên theo độ tương đồng văn bản với `targetText`,
 * chỉ giữ những ứng viên có điểm >= `minScore`, tối đa `limit` kết quả.
 */
export function rankBySimilarity<T>(
  targetText: string,
  candidates: T[],
  getText: (item: T) => string,
  options?: { limit?: number; minScore?: number },
): Array<T & { similarity: number }> {
  const limit = options?.limit ?? 5;
  const minScore = options?.minScore ?? 0.08;
  return candidates
    .map((item) => ({ ...item, similarity: textSimilarity(targetText, getText(item)) }))
    .filter((item) => item.similarity >= minScore)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}
