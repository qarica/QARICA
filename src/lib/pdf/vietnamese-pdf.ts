import fs from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";

// QUAN TRỌNG — ĐỌC TRƯỚC KHI SỬA:
// pdf-lib's 14 standard font (Helvetica...) KHÔNG encode được tiếng Việt có dấu
// (WinAnsi thiếu rất nhiều ký tự Việt) — sẽ throw lỗi ngay khi drawText. Vì vậy
// PDF tiếng Việt PHẢI nhúng font Unicode thật (Noto Sans, đã bundle sẵn trong
// src/assets/fonts/, giấy phép OFL-1.1 — an toàn để nhúng/phân phối trong PDF).
//
// ĐÃ KIỂM CHỨNG BẰNG CÁCH RENDER RA ẢNH VÀ XEM TRỰC TIẾP (không chỉ "không lỗi"):
// - embedFont(bytes, { subset: true }) tạo PDF KHÔNG lỗi khi build nhưng render
//   ra SAI/THIẾU chữ khi mở bằng Poppler (chỉ còn vài ký tự rời rạc) — đây là
//   lỗi âm thầm rất nguy hiểm vì code không hề báo lỗi.
// - embedFont(bytes, { subset: false }) render đúng 100% dấu tiếng Việt.
// => LUÔN dùng subset: false cho font tiếng Việt trong dự án này. Đổi lại
//    subset:true PHẢI tự render thử ra ảnh (pdftoppm) và xem lại bằng mắt
//    trước khi merge, không được chỉ tin "build không lỗi".
const FONT_DIR = path.join(process.cwd(), "src/assets/fonts");

function readFont(fileName: string): Buffer {
  return fs.readFileSync(path.join(FONT_DIR, fileName));
}

export type VietnamesePdf = {
  doc: PDFDocument;
  regular: PDFFont;
  bold: PDFFont;
};

export async function createVietnamesePdf(): Promise<VietnamesePdf> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [regular, bold] = await Promise.all([
    doc.embedFont(readFont("NotoSans-Regular.ttf"), { subset: false }),
    doc.embedFont(readFont("NotoSans-Bold.ttf"), { subset: false }),
  ]);
  return { doc, regular, bold };
}

/** Cắt `text` thành các dòng vừa `maxWidth` (đơn vị PDF point) ở `size` cho `font`. */
export function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

/** Vẽ nhiều dòng liên tiếp, tự xuống dòng theo maxWidth, trả về y sau khi vẽ xong. */
export function drawWrappedText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  options: { x: number; y: number; size: number; maxWidth: number; lineHeight?: number; color?: ReturnType<typeof rgb> },
): number {
  const lineHeight = options.lineHeight ?? options.size * 1.35;
  const lines = wrapText(font, text, options.size, options.maxWidth);
  let y = options.y;
  for (const line of lines) {
    page.drawText(line, { x: options.x, y, size: options.size, font, color: options.color ?? rgb(0, 0, 0) });
    y -= lineHeight;
  }
  return y;
}
