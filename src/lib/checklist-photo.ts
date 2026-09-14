export type PhotoGeo = { latitude: number | null; longitude: number | null; accuracy: number | null };
export type PreparedPhoto = { file: File; previewUrl: string; capturedAt: string; geo: PhotoGeo; source: "camera" | "upload" };

function getGeo(): Promise<PhotoGeo> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve({ latitude: null, longitude: null, accuracy: null });
  return new Promise((resolve) => navigator.geolocation.getCurrentPosition(
    (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }),
    () => resolve({ latitude: null, longitude: null, accuracy: null }),
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
  ));
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Không đọc được hình ảnh.")); };
    img.src = url;
  });
}

function short(text: string, max = 72) { return text.length > max ? `${text.slice(0, max - 1)}…` : text; }

export async function prepareChecklistPhoto(file: File, context: { itemNo: number; itemContent: string; area: string; source: "camera" | "upload" }): Promise<PreparedPhoto> {
  if (!file.type.startsWith("image/")) throw new Error("Chỉ chấp nhận file hình ảnh.");
  const [img, geo] = await Promise.all([loadImage(file), getGeo()]);
  const capturedAt = new Date().toISOString();
  const maxWidth = 1600;
  const scale = Math.min(1, maxWidth / img.naturalWidth);
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const photoHeight = Math.max(1, Math.round(img.naturalHeight * scale));
  const footer = Math.max(118, Math.round(width * 0.085));
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = photoHeight + footer;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Thiết bị không hỗ trợ xử lý ảnh.");
  ctx.drawImage(img, 0, 0, width, photoHeight);
  ctx.fillStyle = "rgba(0,0,0,.82)"; ctx.fillRect(0, photoHeight, width, footer);
  const fs = Math.max(18, Math.round(width * 0.018));
  ctx.font = `600 ${fs}px Arial`; ctx.fillStyle = "#fff";
  const localTime = new Date(capturedAt).toLocaleString("vi-VN");
  const gps = geo.latitude == null ? "GPS: Không có dữ liệu vị trí" : `GPS: ${geo.latitude.toFixed(6)}, ${geo.longitude!.toFixed(6)} · ±${Math.round(geo.accuracy || 0)}m`;
  const lines = [
    `QLCL-TTSG · ${localTime}`,
    `Tiêu chí ${context.itemNo}: ${short(context.itemContent)}`,
    `Khu vực: ${short(context.area || "Chưa xác định")}`,
    gps,
  ];
  lines.forEach((line, i) => ctx.fillText(line, 18, photoHeight + 28 + i * (fs + 6), width - 36));
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error("Không tạo được ảnh.")), "image/jpeg", 0.86));
  const stamped = new File([blob], `qlcl-${Date.now()}.jpg`, { type: "image/jpeg" });
  return { file: stamped, previewUrl: URL.createObjectURL(stamped), capturedAt, geo, source: context.source };
}
