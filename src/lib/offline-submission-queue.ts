// Offline write queue for field submissions that can legitimately happen with
// no signal (5S giám sát bên ngoài bệnh viện — bãi đỗ xe, sân, tường rào...).
// Previously documented as a known gap directly in public/sw-5s.js's own
// comments: "nếu mất mạng ngay lúc bấm lưu, người dùng vẫn cần thử lại khi có
// mạng" — a tap on "Lưu kết quả ban đầu" with no signal just threw a fetch
// error and the assessor had to notice and manually retry.
//
// Design: IndexedDB queue is the single source of truth, driven primarily
// from the page's own main-thread listeners (online event + a short poll
// interval), because the Background Sync API this queue also opportunistically
// registers with (requestBackgroundSync) is Chrome/Android-only — it does NOT
// exist in Safari/iOS, which a meaningful share of ward staff use. The
// main-thread retry path works identically on every browser as long as the
// tab stays open; Background Sync is a best-effort bonus for when it is not.
// NOT YET VERIFIED ON A REAL DEVICE WITH AN ACTUAL ON/OFF-AIRPLANE-MODE TEST —
// treat as a first implementation needing that verification before relying on
// it for a real go-live.

type QueuedFile = { key: string; file: File };
export type QueuedSubmission = {
  id: string;
  endpoint: string;
  fields: Record<string, string>;
  files: QueuedFile[];
  meta: Record<string, string>;
  createdAt: string;
};

const DB_NAME = "qlcl-offline-queue";
const STORE_NAME = "pending-submissions";
const DB_VERSION = 1;
export const BACKGROUND_SYNC_TAG = "qlcl-offline-queue-flush";

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Không mở được hàng đợi ngoại tuyến."));
  });
}

export function isNetworkError(error: unknown) {
  return error instanceof TypeError || (typeof navigator !== "undefined" && navigator.onLine === false);
}

export async function enqueueSubmission(input: { endpoint: string; fields: Record<string, string>; files: QueuedFile[]; meta?: Record<string, string> }): Promise<string> {
  const db = await openDb();
  if (!db) throw new Error("Thiết bị này không hỗ trợ hàng đợi ngoại tuyến.");
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const item: QueuedSubmission = { id, endpoint: input.endpoint, fields: input.fields, files: input.files, meta: input.meta || {}, createdAt: new Date().toISOString() };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Không lưu được vào hàng đợi ngoại tuyến."));
  });
  db.close();
  return id;
}

export async function listPendingSubmissions(): Promise<QueuedSubmission[]> {
  const db = await openDb();
  if (!db) return [];
  const rows = await new Promise<QueuedSubmission[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as QueuedSubmission[]) || []);
    request.onerror = () => reject(request.error || new Error("Không đọc được hàng đợi ngoại tuyến."));
  });
  db.close();
  return rows;
}

export async function countPendingSubmissions(): Promise<number> {
  return (await listPendingSubmissions()).length;
}

async function removeSubmission(id: string) {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Không xóa được mục trong hàng đợi ngoại tuyến."));
  });
  db.close();
}

export async function flushPendingSubmissions(handlers?: { onSuccess?: (item: QueuedSubmission, data: any) => void; onFailure?: (item: QueuedSubmission, error: string) => void }) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { attempted: 0, succeeded: 0 };
  const pending = await listPendingSubmissions();
  let succeeded = 0;
  for (const item of pending) {
    try {
      const formData = new FormData();
      for (const [k, v] of Object.entries(item.fields)) formData.append(k, v);
      for (const f of item.files) formData.append(f.key, f.file);
      const res = await fetch(item.endpoint, { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        handlers?.onFailure?.(item, data.error || "Gửi thất bại.");
        continue;
      }
      await removeSubmission(item.id);
      succeeded += 1;
      handlers?.onSuccess?.(item, data);
    } catch (error) {
      if (isNetworkError(error)) break; // still offline — stop and retry everything next time
      handlers?.onFailure?.(item, error instanceof Error ? error.message : "Gửi thất bại.");
    }
  }
  return { attempted: pending.length, succeeded };
}

export function requestBackgroundSync() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready
    .then((registration: any) => {
      if (registration && "sync" in registration) return registration.sync.register(BACKGROUND_SYNC_TAG);
    })
    .catch(() => {
      // Best-effort only — the online-event/poll retry in initOfflineQueueAutoFlush covers browsers without Background Sync (notably iOS Safari).
    });
}

export function initOfflineQueueAutoFlush(handlers?: { onSuccess?: (item: QueuedSubmission, data: any) => void; onFailure?: (item: QueuedSubmission, error: string) => void }) {
  if (typeof window === "undefined") return () => {};
  const run = () => void flushPendingSubmissions(handlers);
  run();
  window.addEventListener("online", run);
  const interval = window.setInterval(run, 20000);
  return () => {
    window.removeEventListener("online", run);
    window.clearInterval(interval);
  };
}
