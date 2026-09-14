"use client";

import { useMemo, useState } from "react";

type Item = { id: string; content: string; metadata?: any };
type Section = { id: string; title: string; items: Item[] };
type Result = "PASS" | "FAIL" | "NA" | "";

type Correction = {
  description: string;
  reportedAt: string;
  recheckedAt: string;
  recheckResult: "PASS" | "FAIL" | "";
};

const FALLBACK_AREAS = [
  "Sảnh đón khách và cửa ra về",
  "Khu vực bãi đỗ xe",
  "Khu vực sân xung quanh bệnh viện",
  "Khu vực đường bao quanh khuôn viên BV",
  "Khu vực cầu thang bộ lối lên khu Văn Phòng",
  "Bảng hiệu của bệnh viện",
  "Khu vực phía trước các ki-ốt",
  "Khu vực tập kết rác thải y tế và rác thải thông thường",
];

const radioStyle = {
  width: 20,
  height: 20,
  minWidth: 20,
  padding: 0,
  margin: 0,
  cursor: "pointer",
  accentColor: "#0b8f87",
} as const;

export function FiveSChecklistPreviewClient({
  templateCode,
  sections,
}: {
  templateCode: string | null;
  sections: Section[];
}) {
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [otherAreaEnabled, setOtherAreaEnabled] = useState(false);
  const [otherArea, setOtherArea] = useState("");
  const [staffName, setStaffName] = useState("");
  const [monitoringDate, setMonitoringDate] = useState("");
  const [assessorName, setAssessorName] = useState("");
  const [qlclName, setQlclName] = useState("");
  const [results, setResults] = useState<Record<string, Result>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [corrections, setCorrections] = useState<Record<string, Correction>>({});

  const items = useMemo(() => sections.flatMap((section) => section.items.map((item) => ({ ...item, sectionTitle: section.title }))), [sections]);
  const metadataAreas = items.find((item) => Array.isArray(item.metadata?.area_options))?.metadata?.area_options as string[] | undefined;
  const areas = (metadataAreas?.length ? metadataAreas : FALLBACK_AREAS)
    .filter((area) => !area.toLocaleLowerCase("vi-VN").includes("trung tâm đào tạo"))
    .filter((area) => area.trim().toLocaleLowerCase("vi-VN") !== "khác");

  if (templateCode !== "BK01.V1_QLCL.QĐ.06") return null;

  const assessed = items.filter((item) => !!results[item.id]);
  const passCount = items.filter((item) => results[item.id] === "PASS").length;
  const failCount = items.filter((item) => results[item.id] === "FAIL").length;
  const naCount = items.filter((item) => results[item.id] === "NA").length;
  const denominator = passCount + failCount;
  const compliance = denominator ? Math.round((passCount / denominator) * 1000) / 10 : 0;
  const progress = items.length ? Math.round((assessed.length / items.length) * 100) : 0;

  function toggleArea(area: string) {
    setSelectedAreas((current) => current.includes(area) ? current.filter((value) => value !== area) : [...current, area]);
  }

  function setResult(itemId: string, value: Result) {
    setResults((current) => ({ ...current, [itemId]: value }));
    if (value !== "FAIL") {
      setCorrections((current) => {
        const next = { ...current };
        delete next[itemId];
        return next;
      });
    }
  }

  function correctionFor(itemId: string): Correction {
    return corrections[itemId] || { description: "", reportedAt: "", recheckedAt: "", recheckResult: "" };
  }

  function updateCorrection(itemId: string, patch: Partial<Correction>) {
    setCorrections((current) => ({ ...current, [itemId]: { ...correctionFor(itemId), ...patch } }));
  }

  function recheckMinutes(correction: Correction) {
    if (!correction.reportedAt || !correction.recheckedAt) return null;
    const [h1, m1] = correction.reportedAt.split(":").map(Number);
    const [h2, m2] = correction.recheckedAt.split(":").map(Number);
    if ([h1, m1, h2, m2].some(Number.isNaN)) return null;
    let minutes = h2 * 60 + m2 - (h1 * 60 + m1);
    if (minutes < 0) minutes += 24 * 60;
    return minutes;
  }

  return <section className="panel" style={{ overflow: "hidden" }}>
    <div className="panel-title">
      <div>
        <div className="eyebrow">XEM TRƯỚC BIỂU MẪU THỰC HIỆN · {templateCode}</div>
        <h2>Bảng kiểm 5S - Khu vực: Bên ngoài bệnh viện</h2>
        <p>Đây là màn hình kiểm thử trước khi phát hành v1. Dữ liệu nhập tại đây chưa lưu vào hồ sơ giám sát.</p>
      </div>
      <span className="status-badge warning">Bản nháp kiểm thử</span>
    </div>

    <div style={{ padding: "0 18px 18px", display: "grid", gap: 18 }}>
      <div>
        <strong>Khu vực đánh giá</strong>
        <div className="check-grid" style={{ marginTop: 10 }}>
          {areas.map((area) => <label className="check-card" key={area}>
            <input type="checkbox" checked={selectedAreas.includes(area)} onChange={() => toggleArea(area)} />
            <span><strong>{area}</strong></span>
          </label>)}
          <label className="check-card">
            <input
              type="checkbox"
              checked={otherAreaEnabled}
              onChange={(event) => {
                setOtherAreaEnabled(event.target.checked);
                if (!event.target.checked) setOtherArea("");
              }}
            />
            <span><strong>Khác</strong></span>
          </label>
        </div>
        {otherAreaEnabled ? <div style={{ marginTop: 10 }}>
          <label>
            <span>Vị trí khác</span>
            <input value={otherArea} onChange={(e) => setOtherArea(e.target.value)} placeholder="Nhập vị trí khác; có thể nhập nhiều vị trí và phân cách bằng dấu ;" />
          </label>
        </div> : null}
      </div>

      <div className="form-grid two">
        <label><span>Nhân viên thực hiện (ký xác nhận)</span><input value={staffName} onChange={(e) => setStaffName(e.target.value)} placeholder="Nhập họ tên nhân viên thực hiện" /></label>
        <label><span>Ngày giám sát</span><input type="date" value={monitoringDate} onChange={(e) => setMonitoringDate(e.target.value)} /></label>
      </div>
    </div>

    <div className="table-wrap">
      <table style={{ fontSize: 13.5 }}>
        <thead>
          <tr><th style={{ width: 54, fontSize: 12.5 }}>#</th><th style={{ minWidth: 130, fontSize: 12.5 }}>Tiêu chuẩn</th><th style={{ minWidth: 330, fontSize: 12.5 }}>Nội dung</th><th style={{ width: 80, textAlign: "center", fontSize: 12.5 }}>Đạt</th><th style={{ width: 100, textAlign: "center", fontSize: 12.5 }}>Không đạt</th><th style={{ width: 74, textAlign: "center", fontSize: 12.5 }}>/</th><th style={{ minWidth: 220, fontSize: 12.5 }}>Ghi chú</th></tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const value = results[item.id] || "";
            const correction = correctionFor(item.id);
            const elapsed = recheckMinutes(correction);
            return <>
              <tr key={item.id}>
                <td>{index + 1}</td>
                <td><strong>{item.sectionTitle}</strong></td>
                <td style={{ lineHeight: 1.5 }}>{item.content.split("\n").map((line, lineIndex) => <div key={lineIndex}>{line}</div>)}</td>
                <td style={{ textAlign: "center" }}><input style={radioStyle} aria-label={`Đạt - ${item.content}`} type="radio" name={`result-${item.id}`} checked={value === "PASS"} onChange={() => setResult(item.id, "PASS")} /></td>
                <td style={{ textAlign: "center" }}><input style={radioStyle} aria-label={`Không đạt - ${item.content}`} type="radio" name={`result-${item.id}`} checked={value === "FAIL"} onChange={() => setResult(item.id, "FAIL")} /></td>
                <td style={{ textAlign: "center" }}><input style={radioStyle} aria-label={`Không thực hiện - ${item.content}`} type="radio" name={`result-${item.id}`} checked={value === "NA"} onChange={() => setResult(item.id, "NA")} /></td>
                <td><input style={{ fontSize: 13 }} value={notes[item.id] || ""} onChange={(e) => setNotes((current) => ({ ...current, [item.id]: e.target.value }))} placeholder="Ghi chú" /></td>
              </tr>
              {value === "FAIL" ? <tr key={`${item.id}-correction`}>
                <td></td>
                <td colSpan={6}>
                  <div className="scope-note" style={{ margin: "8px 0", display: "grid", gap: 10 }}>
                    <div><strong>Khắc phục ngay và kiểm tra lại trong vòng 05 phút sau khi báo</strong></div>
                    <div className="form-grid two">
                      <label className="span-2"><span>Nội dung khắc phục</span><input value={correction.description} onChange={(e) => updateCorrection(item.id, { description: e.target.value })} placeholder="Mô tả biện pháp đã thực hiện" /></label>
                      <label><span>Thời điểm báo</span><input type="time" value={correction.reportedAt} onChange={(e) => updateCorrection(item.id, { reportedAt: e.target.value })} /></label>
                      <label><span>Thời điểm kiểm tra lại</span><input type="time" value={correction.recheckedAt} onChange={(e) => updateCorrection(item.id, { recheckedAt: e.target.value })} /></label>
                      <label><span>Kết quả kiểm tra lại</span><select value={correction.recheckResult} onChange={(e) => updateCorrection(item.id, { recheckResult: e.target.value as "PASS" | "FAIL" | "" })}><option value="">— Chưa kiểm tra —</option><option value="PASS">Đạt sau khắc phục</option><option value="FAIL">Vẫn không đạt</option></select></label>
                      <div style={{ alignSelf: "end" }}>{elapsed == null ? <span className="muted tiny">Hệ thống sẽ kiểm tra mốc 05 phút khi đủ thời gian.</span> : <span className={`status-badge ${elapsed <= 5 ? "success" : "danger"}`}>{elapsed <= 5 ? `Kiểm tra lại sau ${elapsed} phút` : `Quá 05 phút · ${elapsed} phút`}</span>}</div>
                    </div>
                  </div>
                </td>
              </tr> : null}
            </>;
          })}
        </tbody>
      </table>
    </div>

    <div style={{ padding: 18, display: "grid", gap: 18 }}>
      <section className="kpi-grid">
        <article className="kpi-card"><span>Đã đánh giá</span><strong>{assessed.length}/{items.length}</strong><small>Tiến độ {progress}% · phải đủ {items.length}/{items.length} trước khi hoàn tất</small></article>
        <article className="kpi-card success"><span>Đạt</span><strong>{passCount}</strong><small>Được tính vào tỷ lệ</small></article>
        <article className="kpi-card warning"><span>Không đạt</span><strong>{failCount}</strong><small>Phải khắc phục và kiểm tra lại</small></article>
        <article className="kpi-card"><span>Tỷ lệ đạt</span><strong>{compliance}%</strong><small>{compliance}% trên {assessed.length} nội dung đã đánh giá · loại trừ “/” ({naCount})</small></article>
      </section>

      <div className="form-grid two">
        <label><span>Người giám sát 5S (ký và ghi rõ họ tên)</span><input value={assessorName} onChange={(e) => setAssessorName(e.target.value)} placeholder="Người giám sát" /></label>
        <label><span>Phòng QLCL (ký và ghi rõ họ tên)</span><input value={qlclName} onChange={(e) => setQlclName(e.target.value)} placeholder="Người xác nhận Phòng QLCL" /></label>
      </div>

      <div className="scope-note">
        <strong>Ghi chú theo biểu mẫu nguồn:</strong> Đánh giá Đạt (✓) hoặc KHÔNG ĐẠT (x). Trường hợp KHÔNG ĐẠT, nhân viên thực hiện 5S phải khắc phục ngay (nếu có) hoặc điều động nhân viên HK thực hiện biện pháp khắc phục và kiểm tra lại trong vòng 05 phút sau khi báo. Dấu “/” dùng cho nội dung không thực hiện.
      </div>
    </div>
  </section>;
}
