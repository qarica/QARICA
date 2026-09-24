// Service worker CHỈ phục vụ khu vực /monitoring/ (giám sát 5S/hiện trường) —
// đăng ký với scope "/monitoring/" nên KHÔNG can thiệp vào bất kỳ route nào
// khác của QARICA. Mục tiêu: giữ được app-shell (HTML/CSS/JS đã tải) khi mất
// sóng tạm thời trong lúc đi giám sát, không phải lưu offline toàn bộ dữ liệu.
//
// PHẠM VI CÓ CHỦ ĐÍCH GIỚI HẠN (đọc trước khi mở rộng):
// - KHÔNG cache bất kỳ request nào tới /api/** — dữ liệu chấm điểm luôn phải
//   là dữ liệu mới nhất từ server, không phục vụ từ cache.
// - KHÔNG có hàng đợi ghi offline (offline write queue) cho kết quả chấm điểm
//   — nếu mất mạng ngay lúc bấm lưu, người dùng vẫn cần thử lại khi có mạng.
//   Đây là việc cần làm thêm ở bản sau (IndexedDB + background sync) và PHẢI
//   kiểm thử trên thiết bị thật trước khi coi là hoàn chỉnh.
// - Chỉ cache-first cho tài nguyên tĩnh (icon, manifest); network-first cho
//   HTML để không giữ người dùng kẹt ở bản trang cũ khi có mạng trở lại.

const CACHE_NAME = "qarica-5s-shell-v1";
const STATIC_ALLOWLIST = [/^\/icons\//, /^\/manifest\.webmanifest$/, /^\/apple-icon\.svg$/, /^\/icon\.svg$/];

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
