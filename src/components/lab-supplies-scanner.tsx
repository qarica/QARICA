"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { normalizeScanCode } from "../lib/lab-supplies";

// Khung quét mã cho Kho hóa chất & VTYT: 3 cách đưa mã vào, cùng 1 kết quả (onCode):
//  1) Camera điện thoại/máy tính: dùng BarcodeDetector của trình duyệt nếu có (Chrome/Android), không thì
//     tự nạp @zxing/browser (tải khi cần, không làm nặng trang). Camera chỉ chạy trên HTTPS.
//  2) Máy quét mã vạch USB/Bluetooth: máy gõ mã như bàn phím rồi Enter → ô nhập luôn được focus sẵn.
//  3) Gõ tay mã vạch / mã vật tư.
const FORMATS = ["qr_code", "code_128", "code_39", "code_93", "ean_13", "ean_8", "upc_a", "upc_e", "itf", "codabar", "data_matrix"];

function cameraError(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "Chưa được cấp quyền dùng camera. Hãy cho phép camera cho trang này rồi mở lại, hoặc nhập mã bằng tay / máy quét.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Không tìm thấy camera trên thiết bị này. Hãy nhập mã bằng tay hoặc dùng máy quét mã vạch.";
  if (name === "NotReadableError") return "Camera đang được ứng dụng khác sử dụng. Hãy đóng ứng dụng đó rồi thử lại.";
  return "Không mở được camera. Hãy nhập mã bằng tay hoặc dùng máy quét mã vạch.";
}

function CameraScanner({ onCode }: { onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const [state, setState] = useState<"starting" | "scanning" | "error">("starting");
  const [error, setError] = useState("");

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let controls: { stop: () => void } | null = null;
    let raf = 0;
    const found = (value: string) => {
      if (stopped) return;
      const code = normalizeScanCode(value);
      if (code) {
        stopped = true;
        onCodeRef.current(code);
      }
    };

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Trình duyệt hoặc kết nối này không hỗ trợ camera (cần mở bằng HTTPS). Hãy nhập mã bằng tay hoặc dùng máy quét mã vạch.");
        setState("error");
        return;
      }
      try {
        const Detector = (window as unknown as { BarcodeDetector?: { new (o?: unknown): { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> }; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
        const video = videoRef.current;
        if (!video) return;
        if (Detector) {
          const supported = Detector.getSupportedFormats ? await Detector.getSupportedFormats() : FORMATS;
          const formats = FORMATS.filter((f) => supported.includes(f));
          const detector = new Detector({ formats: formats.length ? formats : undefined });
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
          if (stopped) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          video.srcObject = stream;
          await video.play();
          setState("scanning");
          const tick = async () => {
            if (stopped) return;
            try {
              const hits = await detector.detect(video);
              if (hits.length) return found(hits[0].rawValue);
            } catch {
              /* khung hình chưa sẵn sàng — thử lại */
            }
            raf = requestAnimationFrame(tick);
          };
          tick();
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          const reader = new BrowserMultiFormatReader();
          controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } }, audio: false }, video, (result) => {
            if (result) found(result.getText());
          });
          if (stopped) controls.stop();
          else setState("scanning");
        }
      } catch (e) {
        if (!stopped) {
          setError(cameraError(e));
          setState("error");
        }
      }
    }
    void start();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      controls?.stop();
    };
  }, []);

  return (
    <div className="ls-camera">
      {state === "error" ? <div className="alert error">{error}</div> : null}
      <video ref={videoRef} playsInline muted aria-label="Khung camera quét mã" style={{ display: state === "error" ? "none" : "block" }} />
      {state === "starting" ? <p className="muted tiny">Đang mở camera...</p> : null}
      {state === "scanning" ? <p className="muted tiny">Đưa mã vạch hoặc mã QR vào khung hình, giữ máy ổn định.</p> : null}
    </div>
  );
}

// continuous: ở màn Nhập/Xuất, quét xong KHÔNG đóng — camera tự quét tiếp để thêm dòng liên tục; `feedback` hiện kết quả lần quét trước.
export function LabScanDialog({ onCode, onClose, notFound, onCreateItem, continuous = false, feedback = null }: { onCode: (code: string) => void; onClose: () => void; notFound: string | null; onCreateItem?: (code: string) => void; continuous?: boolean; feedback?: string | null }) {
  const [manual, setManual] = useState("");
  const [camera, setCamera] = useState(true);
  const [camKey, setCamKey] = useState(0);
  const handleCode = (code: string) => {
    onCode(code);
    if (continuous) setTimeout(() => setCamKey((k) => k + 1), 900);
  };
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    const code = normalizeScanCode(manual);
    if (!code) return;
    handleCode(code);
    setManual("");
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card" role="dialog" aria-label="Quét mã vật tư">
        <div className="modal-head">
          <div>
            <div className="eyebrow">TRA CỨU NHANH</div>
            <h2>Quét mã vật tư</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng"><Icon name="x" /></button>
        </div>
        <div className="modal-body form-stack">
          {feedback ? <div className="alert success">{feedback}</div> : null}
          {notFound ? (
            <div className="alert error">
              Không tìm thấy vật tư có mã “{notFound}”. Kiểm tra lại mã{onCreateItem ? " hoặc thêm vật tư mới gắn mã này" : ""}.
              {onCreateItem ? <div style={{ marginTop: 8 }}><button type="button" className="button secondary small" onClick={() => onCreateItem(notFound)}>+ Thêm vật tư mới với mã này</button></div> : null}
            </div>
          ) : null}
          <form onSubmit={submit} className="ls-scan-manual">
            <label>
              Máy quét mã vạch / nhập tay
              <input ref={inputRef} value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Quét hoặc gõ mã vạch / mã vật tư rồi Enter" autoComplete="off" inputMode="text" />
            </label>
            <button className="button primary" disabled={!manual.trim()}><Icon name="search" size={17} /> Tra cứu</button>
          </form>
          {camera ? (
            <>
              <CameraScanner key={camKey} onCode={handleCode} />
              <button type="button" className="button tertiary small" onClick={() => setCamera(false)}>Tắt camera</button>
            </>
          ) : (
            <button type="button" className="button secondary" onClick={() => setCamera(true)}><Icon name="camera" size={17} /> Bật camera quét</button>
          )}
        </div>
      </div>
    </div>
  );
}
