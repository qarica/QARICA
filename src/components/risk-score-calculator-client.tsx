"use client";

import { useMemo, useState } from "react";
import { BUILT_IN_RISK_SCALES, scoreRiskScale, type RiskScaleDefinition } from "@/lib/risk-score";

const bandTone = (code: string | null | undefined) => {
  const v = String(code || "").toUpperCase();
  if (["SEVERE", "HIGH"].includes(v)) return "red";
  if (["MODERATE", "MILD"].includes(v)) return "amber";
  return "green";
};

export function RiskScoreCalculatorClient({ scales = BUILT_IN_RISK_SCALES }: { scales?: RiskScaleDefinition[] }) {
  const [scaleId, setScaleId] = useState(scales[0]?.id ?? "");
  const scale = scales.find((s) => s.id === scaleId) ?? scales[0] ?? null;
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [copied, setCopied] = useState(false);

  const result = useMemo(() => (scale ? scoreRiskScale(scale, answers) : null), [scale, answers]);

  function setFactor(code: string, value: number) {
    setAnswers((current) => ({ ...current, [code]: value }));
    setCopied(false);
  }

  function selectScale(id: string) {
    setScaleId(id);
    setAnswers({});
    setCopied(false);
  }

  async function copySummary() {
    if (!scale || !result || !result.complete || !result.band) return;
    const lines = [
      `${scale.name}`,
      `Tổng điểm: ${result.totalScore}/${result.maxPossibleScore} (thấp nhất có thể: ${result.minPossibleScore})`,
      `Phân loại: ${result.band.label}`,
      `Gợi ý can thiệp:`,
      ...result.band.interventions.map((x) => `- ${x}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (!scale) return <div className="empty-state">Chưa có thang điểm nào được cấu hình.</div>;

  return <>
    <style>{`
      .rsc-wrap{display:grid;gap:16px}
      .rsc-picker{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
      .rsc-picker select{padding:8px 10px;border-radius:10px;border:1px solid #d7e0e3;font-size:12px}
      .rsc-source{font-size:11px;color:#74838a;margin:0}
      .rsc-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
      .rsc-factor{border:1px solid #e4eaec;border-radius:13px;padding:12px}
      .rsc-factor strong{display:block;font-size:12px;margin-bottom:8px}
      .rsc-options{display:grid;gap:6px}
      .rsc-options label{display:flex;gap:7px;align-items:center;font-size:11.5px;color:#3a4a50}
      .rsc-result{border:1px solid #e4eaec;border-radius:15px;padding:16px 18px;display:grid;gap:10px}
      .rsc-result.red{border-color:#f2c7cc;background:#fffafb}
      .rsc-result.amber{border-color:#f0d59e;background:#fffdf5}
      .rsc-result.green{border-color:#bfe3cd;background:#f6fdf9}
      .rsc-score-row{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
      .rsc-score-row strong{font-size:30px;line-height:1}
      .rsc-badge{display:inline-flex;padding:5px 10px;border-radius:999px;font-size:11px;font-weight:800}
      .rsc-badge.red{background:#fff0f1;color:#b42335}
      .rsc-badge.amber{background:#fff7e6;color:#92400e}
      .rsc-badge.green{background:#eaf7ef;color:#166534}
      .rsc-interventions{margin:0;padding-left:18px;font-size:12px;color:#3a4a50;display:grid;gap:4px}
      .rsc-missing{font-size:11.5px;color:#92400e}
      .rsc-actions{display:flex;gap:10px;align-items:center}
      .rsc-note{font-size:10.5px;color:#8a969b}
    `}</style>
    <div className="rsc-wrap">
      <div className="rsc-picker">
        <label htmlFor="rsc-scale">Thang điểm:</label>
        <select id="rsc-scale" value={scale.id} onChange={(e) => selectScale(e.target.value)}>
          {scales.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <p className="rsc-source">Căn cứ: {scale.sourceNote}</p>

      <div className="rsc-grid">
        {scale.factors.map((factor) => <div className="rsc-factor" key={factor.code}>
          <strong>{factor.label}</strong>
          <div className="rsc-options">
            {factor.options.map((opt) => <label key={opt.value}>
              <input
                type="radio"
                name={`rsc-${factor.code}`}
                checked={answers[factor.code] === opt.value}
                onChange={() => setFactor(factor.code, opt.value)}
              />
              {opt.label}
            </label>)}
          </div>
        </div>)}
      </div>

      {result ? <div className={`rsc-result ${result.band ? bandTone(result.band.code) : ""}`}>
        {result.complete && result.band ? <>
          <div className="rsc-score-row">
            <strong>{result.totalScore}</strong>
            <span>/ {result.maxPossibleScore} điểm</span>
            <span className={`rsc-badge ${bandTone(result.band.code)}`}>{result.band.label}</span>
          </div>
          <div>
            <strong style={{ fontSize: 12 }}>Gợi ý can thiệp:</strong>
            <ul className="rsc-interventions">{result.band.interventions.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
          <div className="rsc-actions">
            <button type="button" className="button tertiary small" onClick={copySummary}>Sao chép kết quả</button>
            {copied ? <span style={{ fontSize: 11, color: "#166534" }}>Đã sao chép — dán vào ghi chú/hồ sơ liên quan.</span> : null}
          </div>
        </> : <div className="rsc-missing">Chưa chọn đủ tất cả {scale.factors.length} yếu tố ({scale.factors.length - result.missingFactorCodes.length}/{scale.factors.length} đã chọn) — chưa đủ căn cứ để tính điểm và phân loại.</div>}
      </div> : null}

      <p className="rsc-note">Công cụ tính điểm độc lập, không tự động lưu vào hồ sơ người bệnh. Sao chép kết quả để đính kèm vào bệnh án/hồ sơ điều dưỡng theo quy trình hiện hành của khoa.</p>
    </div>
  </>;
}
