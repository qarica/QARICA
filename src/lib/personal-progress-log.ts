// Nhật ký tiến độ của việc cá nhân được lưu trong 1 ô văn bản: mỗi lần cập nhật là một khối
//   [<giờ ngày> · Tiến độ NN%]\n<nội dung>
// nối vào CUỐI ô (cũ → mới), các khối cách nhau bằng 1 dòng trống. Khi chuyển/giao việc, một dòng
// "[Chuyển từ …]" / "[Đã giao cho …]" được thêm lên ĐẦU ô. Hàm thuần (không import "@/...") để kiểm thử.
export type ProgressEntry = { stamp: string; percent: number | null; body: string };
export type ProgressLog = { entries: ProgressEntry[]; notices: string[] };

const SPLIT = /\n\n(?=\[[^\]\n]*Tiến độ \d+%\])/;
const HEAD = /^\[([^\]\n]*?)\s*·\s*Tiến độ (\d+)%\]\s*\n?/;
const NOTICE = /^\[(?:Chuyển từ|Đã giao cho)[^\n]*\]\s*$/;

/** Tách nhật ký thành các lần cập nhật, MỚI NHẤT Ở TRÊN, và các dòng ghi chú chuyển/giao việc. */
export function parseProgressLog(note: string | null | undefined): ProgressLog {
  const notices: string[] = [];
  const text = (note || "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    if (NOTICE.test(line.trim())) notices.push(line.trim().slice(1, -1));
    else kept.push(line);
  }
  const parts = kept.join("\n").split(SPLIT).map((p) => p.trim()).filter(Boolean);
  const entries = parts.map((p): ProgressEntry => {
    const m = p.match(HEAD);
    if (!m) return { stamp: "", percent: null, body: p };
    return { stamp: m[1].trim(), percent: Number(m[2]), body: p.slice(m[0].length).trim() };
  });
  return { entries: entries.reverse(), notices };
}
