// Service worker CHỈ phục vụ khu vực /monitoring/ (giám sát 5S/hiện trường) —
// đăng ký với scope "/monitoring/" nên KHÔNG can thiệp vào bất kỳ route nào
// khác của QARICA. Mục tiêu: giữ được app-shell (HTML/CSS/JS đã tải) khi mất
// sóng tạm thời trong lúc đi giám sát, không phải lưu offline toàn bộ dữ liệu.
//
// PHẠM VI CÓ CHỦ ĐÍCH GIỚI HẠN (đọc trước khi mở rộng):
// - KHÔNG cache bất kỳ request nào tới /api/** — dữ liệu chấm điểm luôn phải
//   là dữ liệu mới nhất từ server, không phục vụ từ cache.
// - Chỉ cache-first cho tài nguyên tĩnh (icon, manifest); network-first cho
//   HTML để không giữ người dùng kẹt ở bản trang cũ khi có mạng trở lại.
//
// Hàng đợi ghi offline (IndexedDB "qlcl-offline-queue", store
// "pending-submissions") giờ có — xem src/lib/offline-submission-queue.ts,
// đó mới là bản mô tả đầy đủ/có thẩm quyền của luồng này. Đường chính (mọi
// trình duyệt, kể cả iOS Safari không có Background Sync) là retry từ chính
// tab đang mở: sự kiện "online" + poll định kỳ, trong
// initOfflineQueueAutoFlush(). Handler "sync" dưới đây chỉ là lớp tăng cường
// tốt-nhất-có-thể cho các trình duyệt có hỗ trợ Background Sync
// (Chrome/Android) khi tab đã đóng — cố tình trùng lặp logic mở
// IndexedDB/gửi lại tối thiểu ở đây vì service worker không import được
// module TS; KHÔNG sửa logic nghiệp vụ ở một bên mà quên bên kia.
const OFFLINE_QUEUE_DB_NAME = "qlcl-offline-queue";
const OFFLINE_QUEUE_STORE_NAME = "pending-submissions";

function openOfflineQueueDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_QUEUE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OFFLINE_QUEUE_STORE_NAME)) db.createObjectStore(OFFLINE_QUEUE_STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function flushOfflineQueueFromServiceWorker() {
  const db = await openOfflineQueueDb();
  const items = await new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_QUEUE_STORE_NAME, "readonly");
    const request = tx.objectStore(OFFLINE_QUEUE_STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  for (const item of items) {
    try {
      const formData = new FormData();
      for (const [k, v] of Object.entries(item.fields || {})) formData.append(k, v);
      for (const f of item.files || []) formData.append(f.key, f.file);
      const res = await fetch(item.endpoint, { method: "POST", body: formData });
      if (!res.ok) continue;
      await new Promise((resolve, reject) => {
        const tx = db.transaction(OFFLINE_QUEUE_STORE_NAME, "readwrite");
        tx.objectStore(OFFLINE_QUEUE_STORE_NAME).delete(item.id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      break; // vẫn mất mạng — dừng lại, lần sync sau thử lại từ đầu
    }
  }
  db.close();
}

self.addEventListener("sync", (event) => {
  if (event.tag === "qlcl-offline-queue-flush") event.waitUntil(flushOfflineQueueFromServiceWorker());
});

// v2: bumped after the QARICA brand refresh (checkmark -> Q mark) so any client that
// already cached the old icon.svg/apple-icon/manifest under v1 gets the new assets —
// the activate handler below purges every cache key that isn't CACHE_NAME.
const CACHE_NAME = "qarica-5s-shell-v2";
const STATIC_ALLOWLIST = [/^\/icons\//, /^\/manifest\.webmanifest$/, /^\/apple-icon\.png$/, /^\/icon\.svg$/];

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

function isStaticAsset(pathname) {
  return STATIC_ALLOWLIST.some((re) => re.test(pathname));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return; // không bao giờ cache API

  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  if (request.mode === "navigate" && url.pathname.startsWith("/monitoring")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          return response;
        })
        .catch(() => caches.open(CACHE_NAME).then((cache) => cache.match(request))),
    );
  }
});
