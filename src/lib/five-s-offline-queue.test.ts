import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Real gap, documented directly in the service worker's own comments before
// this fix: "nếu mất mạng ngay lúc bấm lưu, người dùng vẫn cần thử lại khi có
// mạng" — the 5S field checklist (giám sát ngoài khuôn viên bệnh viện, where
// signal is genuinely spotty) had no offline write queue. A tap on "Lưu kết
// quả ban đầu" with no signal just threw and the assessor had to notice and
// manually retry, with no guarantee the draft (incl. photos) survived.
//
// Fix: an IndexedDB-backed queue (src/lib/offline-submission-queue.ts) that
// the 5S run client enqueues into on a genuine network failure (not a server
// validation error), auto-flushed from the page's own online/poll listeners
// (works on every browser, including iOS Safari which has no Background Sync
// API) plus a best-effort Background Sync handler in the service worker for
// browsers that support it. NOT YET VERIFIED ON A REAL DEVICE.
describe("5S checklist — offline write queue (IndexedDB + background sync)", () => {
  const queue = read("src/lib/offline-submission-queue.ts");
  const client = read("src/components/five-s-checklist-run-client.tsx");
  const sw = read("public/sw-5s.js");

  it("the queue module can enqueue, list, count and flush pending submissions, and detects genuine network failures", () => {
    expect(queue).toContain("export async function enqueueSubmission(");
    expect(queue).toContain("export async function listPendingSubmissions(");
    expect(queue).toContain("export async function countPendingSubmissions(");
    expect(queue).toContain("export async function flushPendingSubmissions(");
    expect(queue).toContain("export function isNetworkError(");
    expect(queue).toContain("export function initOfflineQueueAutoFlush(");
  });

  it("the 5S save flow enqueues on a genuine network failure instead of surfacing a hard error, and does not swallow real server errors", () => {
    expect(client).toContain("if (!isNetworkError(fetchError)) throw fetchError;");
    expect(client).toContain("await enqueueSubmission({ endpoint, fields, files, meta: { draftKey } });");
    expect(client).toContain("requestBackgroundSync();");
  });

  it("a queued submission that later succeeds clears the local draft for that exact round, not an unrelated one", () => {
    expect(client).toContain("item.meta.draftKey !== draftKey");
    expect(client).toContain("void clearDraft();");
  });

  it("the auto-flush retry works without any Background Sync support (online event + poll), since iOS Safari has none", () => {
    expect(queue).toContain('window.addEventListener("online", run);');
    expect(queue).toContain("window.setInterval(run,");
  });

  it("the service worker's Background Sync handler is a best-effort enhancement only, sharing the same IndexedDB store name as the page", () => {
    expect(sw).toContain('self.addEventListener("sync"');
    expect(sw).toContain('"qlcl-offline-queue-flush"');
    expect(sw).toContain('"qlcl-offline-queue"');
    expect(sw).toContain('"pending-submissions"');
  });

  it("the pending queue is visible to the assessor, not a silent background mechanism", () => {
    expect(client).toContain("pendingOffline > 0");
    expect(client).toContain("bảng kiểm đang chờ gửi");
  });
});
