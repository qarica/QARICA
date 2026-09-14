import type { PreparedPhoto } from "@/lib/checklist-photo";

type StoredPreparedPhoto = {
  file: File;
  capturedAt: string;
  geo: PreparedPhoto["geo"];
  source: PreparedPhoto["source"];
};

type StoredDraft = {
  key: string;
  photos: Record<string, StoredPreparedPhoto[]>;
  updatedAt: string;
};

const DB_NAME = "qlcl-monitoring-drafts";
const STORE_NAME = "photo-drafts";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Không mở được bộ nhớ nháp."));
  });
}

export async function saveDraftPhotos(key: string, photos: Record<string, PreparedPhoto[]>) {
  try {
    const db = await openDb();
    if (!db) return;
    const stored: Record<string, StoredPreparedPhoto[]> = {};
    for (const [itemId, list] of Object.entries(photos)) {
      if (!list.length) continue;
      stored[itemId] = list.map((photo) => ({
        file: photo.file,
        capturedAt: photo.capturedAt,
        geo: photo.geo,
        source: photo.source,
      }));
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put({ key, photos: stored, updatedAt: new Date().toISOString() } satisfies StoredDraft);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Không lưu được ảnh nháp."));
    });
    db.close();
  } catch {
    // Draft photo persistence is best-effort. The checklist itself remains usable.
  }
}

export async function loadDraftPhotos(key: string): Promise<Record<string, PreparedPhoto[]>> {
  try {
    const db = await openDb();
    if (!db) return {};
    const row = await new Promise<StoredDraft | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result as StoredDraft | undefined);
      request.onerror = () => reject(request.error || new Error("Không đọc được ảnh nháp."));
    });
    db.close();
    if (!row?.photos) return {};
    const restored: Record<string, PreparedPhoto[]> = {};
    for (const [itemId, list] of Object.entries(row.photos)) {
      restored[itemId] = list.map((photo) => ({
        file: photo.file,
        previewUrl: URL.createObjectURL(photo.file),
        capturedAt: photo.capturedAt,
        geo: photo.geo,
        source: photo.source,
      }));
    }
    return restored;
  } catch {
    return {};
  }
}

export async function clearDraftPhotos(key: string) {
  try {
    const db = await openDb();
    if (!db) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Không xóa được ảnh nháp."));
    });
    db.close();
  } catch {
    // Best-effort cleanup only.
  }
}
