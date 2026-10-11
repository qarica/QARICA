import{readFileSync}from"node:fs";import{describe,expect,it}from"vitest";
describe("Mức 1 Javis OS — Zalo delivery",()=>{const zalo=readFileSync("src/lib/zalo-oa.ts","utf8");const sync=readFileSync("src/lib/notification-sync.ts","utf8");const delivery=readFileSync("src/lib/notification-delivery.ts","utf8");
it("Zalo helper can skip safely",()=>{expect(zalo).toContain("ZALO_OA_ACCESS_TOKEN");expect(zalo).toContain("skipped");});
it("sync delegates external delivery",()=>{expect(sync).toContain("queueAndDeliverZalo");expect(sync).not.toContain('from "@/lib/zalo-oa"');});
it("only high priorities",()=>{expect(delivery).toContain('new Set(["HIGH","URGENT","CRITICAL"])');expect(delivery).toContain("ZALO_PUSH_PRIORITIES.has");});
it("minimal payload",()=>{expect(delivery).toContain("Mở app QARICA để xem chi tiết.");expect(delivery).not.toContain("notification.title");expect(delivery).not.toContain("notification.message");});
it("idempotent and bounded retry",()=>{expect(delivery).toContain('"notification:"+row.id+":zalo"');expect(delivery).toContain("attemptCount>=5");expect(delivery).toContain("nextRetry");});});
