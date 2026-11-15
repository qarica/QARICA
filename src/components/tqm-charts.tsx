"use client";
import React, { useId, useState } from "react";

// Màu đã được kiểm tra bằng dataviz skill's validate_palette.js (mù màu đỏ/lục,
// tương phản, độ sáng...). KHÔNG đổi các mã hex dưới đây theo cảm tính — nếu cần
// đổi brand, chạy lại validator trước khi thay.
//  - brand/blue: cặp categorical đã pass toàn bộ check (kể cả all-pairs).
//  - green/amber/red: bộ "status" chính thức (good/warning/critical). Cặp
//    green<->red về bản chất KHÔNG thể phân biệt được bằng mắt mù màu đỏ-lục dù
//    chọn mã nào (đây là giới hạn vật lý của phổ màu, không phải lỗi chọn màu) —
//    vì vậy mọi nơi dùng 2 màu này PHẢI luôn kèm số liệu/nhãn chữ nhìn thấy được,
//    không được chỉ dựa vào màu sắc để phân biệt tốt/xấu.
export type Tone = "brand" | "blue" | "amber" | "red" | "green" | "slate";
const COLORS: Record<Tone,string> = {
  brand:"#0b8a7f", blue:"#2a78d6", amber:"#c9860a", red:"#d03b3b", green:"#0ca30c", slate:"#93a1a6"
};
const TARGET_LINE_COLOR = "#c1571f"; // đã kiểm tra: phân biệt rõ với brand teal (ΔE 28, mù màu ΔE 9.8)

export function TqmDonut({value,label,segments}:{value:number;label:string;segments:{label:string;value:number;tone?:Tone}[]}){
  const total=Math.max(1,segments.reduce((s,x)=>s+Math.max(0,x.value),0));
  let offset=0;
  return <div className="tqm-donut-wrap"><div className="tqm-donut" style={{background:`conic-gradient(${segments.map((s)=>{const start=offset;offset+=s.value/total*360;return `${COLORS[s.tone||"brand"]} ${start}deg ${offset}deg`}).join(",")})`}}><div className="tqm-donut-hole"><strong>{value}%</strong><span>{label}</span></div></div><div className="tqm-donut-legend">{segments.map((s,i)=><div key={`${s.label}-${i}`}><i style={{background:COLORS[s.tone||"brand"]}}/><span>{s.label}</span><strong>{s.value}</strong></div>)}</div></div>
}

export function TqmHorizontalBars({rows,max}:{rows:{label:string;value:number;tone?:Tone;caption?:string}[];max?:number}){
  if(!rows.length) return <div className="empty-state compact">Chưa có dữ liệu.</div>;
  const ceiling=Math.max(1,max??Math.max(1,...rows.map(r=>r.value)));
  return <div className="tqm-hbars">{rows.map((r,i)=><div className="tqm-hbar-row" key={`${r.label}-${i}`}><div className="tqm-hbar-label"><strong>{r.label}</strong>{r.caption?<span>{r.caption}</span>:null}</div><div className="tqm-hbar-track"><span className="tqm-hbar-fill" style={{width:`${Math.max(0,Math.min(100,r.value/ceiling*100))}%`,background:COLORS[r.tone||"brand"]}}/></div><b>{r.value}</b></div>)}</div>
}

/**
 * Biểu đồ xu hướng có tương tác: rê chuột/focus bàn phím để xem giá trị chính
 * xác tại một điểm (crosshair + tooltip), thay vì in số lên mọi điểm (rối mắt
 * khi có nhiều kỳ). Vẫn ghi trực tiếp giá trị đầu/cuối + điểm cao/thấp nhất để
 * không mất thông tin quan trọng khi không rê chuột. Có thêm bảng số liệu ẩn/hiện
 * để mọi giá trị đều xem được mà không bắt buộc phải hover (đúng theo yêu cầu
 * "mọi giá trị phải xem được không cần hover" của bộ hướng dẫn trực quan hoá).
 */
export function TqmTrend({points,unit="%",targetLine,targetLabel="Mục tiêu"}:{points:{label:string;value:number}[];unit?:string;targetLine?:number|null;targetLabel?:string}){
  const width=640,height=230,pad=34;
  const [hover,setHover]=useState<number|null>(null);
  const [showTable,setShowTable]=useState(false);
  const gradId=useId().replace(/:/g,"");
  const hasTarget=targetLine!==null&&targetLine!==undefined&&Number.isFinite(targetLine);
  const vals=points.map(p=>p.value).concat(hasTarget?[targetLine as number]:[]);
  const min=Math.min(...vals,0),max=Math.max(...vals,1);const span=Math.max(1,max-min);
  const yFor=(v:number)=>height-pad-(v-min)/span*(height-pad*2);
  const pts=points.map((p,i)=>{const x=pad+(points.length===1?0:i*(width-pad*2)/(points.length-1));const y=yFor(p.value);return{x,y,...p}});
  const poly=pts.map(p=>`${p.x},${p.y}`).join(" ");
  const area=pts.length?`${pad},${height-pad} ${poly} ${pts[pts.length-1].x},${height-pad}`:"";
  const targetY=hasTarget?yFor(targetLine as number):null;
  const maxIdx=pts.reduce((best,p,i)=>p.value>pts[best].value?i:best,0);
  const minIdx=pts.reduce((best,p,i)=>p.value<pts[best].value?i:best,0);
  const directLabelIdx=new Set([0,pts.length-1,maxIdx,minIdx].filter((i)=>i>=0&&i<pts.length));
  const active=hover!==null?pts[hover]:null;

  function nearestIndex(clientX:number,svg:SVGSVGElement){
    const rect=svg.getBoundingClientRect();
    const relX=(clientX-rect.left)/rect.width*width;
    let best=0,bestDist=Infinity;
    pts.forEach((p,i)=>{const d=Math.abs(p.x-relX);if(d<bestDist){bestDist=d;best=i}});
    return best;
  }

  return <div className="tqm-trend">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Biểu đồ xu hướng, rê chuột hoặc dùng phím mũi tên để xem từng điểm"
      onMouseMove={(e)=>setHover(nearestIndex(e.clientX,e.currentTarget))}
      onMouseLeave={()=>setHover(null)}
      onKeyDown={(e)=>{
        if(e.key==="ArrowRight"){setHover((h)=>Math.min(pts.length-1,(h??-1)+1));e.preventDefault()}
        if(e.key==="ArrowLeft"){setHover((h)=>Math.max(0,(h??pts.length)-1));e.preventDefault()}
        if(e.key==="Escape")setHover(null);
      }}
      tabIndex={0}
    >
      <defs><linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#14a394" stopOpacity=".28"/><stop offset="100%" stopColor="#14a394" stopOpacity=".02"/></linearGradient></defs>
      <line x1={pad} y1={height-pad} x2={width-pad} y2={height-pad} stroke="#dce7ea"/>
      <polygon points={area} fill={`url(#${gradId})`}/>
      {targetY!==null?<g><line x1={pad} y1={targetY} x2={width-pad} y2={targetY} stroke={TARGET_LINE_COLOR} strokeWidth="2" strokeDasharray="6 5"/><text x={width-pad} y={targetY-7} textAnchor="end" fontSize="10" fontWeight="800" fill={TARGET_LINE_COLOR}>{targetLabel}: {targetLine}{unit}</text></g>:null}
      {active?<line x1={active.x} y1={pad*0.4} x2={active.x} y2={height-pad} stroke="#31515a" strokeWidth="1" strokeDasharray="3 3" opacity=".55"/>:null}
      <polyline points={poly} fill="none" stroke="#0b8a7f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      {pts.map((p,i)=><g key={i}>
        {/* vùng bắt sự kiện lớn hơn chấm thật, để rê/chạm dễ trúng */}
        <circle cx={p.x} cy={p.y} r="14" fill="transparent" onFocus={()=>setHover(i)} />
        <circle cx={p.x} cy={p.y} r={hover===i?6:4.5} fill={hover===i?"#0b8a7f":"#fff"} stroke="#0b8a7f" strokeWidth="3"/>
        {directLabelIdx.has(i)&&hover!==i?<text x={p.x} y={p.y-11} textAnchor="middle" fontSize="11" fontWeight="800" fill="#31515a">{p.value}{unit}</text>:null}
        <text x={p.x} y={height-10} textAnchor="middle" fontSize="10" fill="#71848b">{p.label}</text>
      </g>)}
    </svg>
    {active?<div className="tqm-trend-tip" style={{left:`${active.x/width*100}%`}}>
      <strong>{active.value}{unit}</strong><span>{active.label}</span>
      {hasTarget?<em>{targetLabel}: {targetLine}{unit}</em>:null}
    </div>:null}
    <button type="button" className="tqm-trend-table-toggle" onClick={()=>setShowTable((v)=>!v)} aria-expanded={showTable}>
      {showTable?"Ẩn bảng số liệu":"Xem bảng số liệu"}
    </button>
    {showTable?<div className="table-wrap"><table className="tqm-trend-table"><thead><tr><th>Kỳ</th><th>Giá trị</th></tr></thead><tbody>{pts.map((p,i)=><tr key={i}><td>{p.label}</td><td>{p.value}{unit}</td></tr>)}</tbody></table></div>:null}
  </div>
}

/**
 * Biến thể nhiều-đường của TqmTrend: dùng khi tham chiếu cần so sánh nhiều
 * chuỗi cùng trục thời gian (vd. số lượng theo từng mức độ qua các tháng).
 * Giữ đơn giản hơn TqmTrend (không crosshair/hover từng điểm) nhưng vẫn có
 * legend màu + bảng số liệu ẩn/hiện để không bắt buộc phải đọc màu để hiểu dữ liệu.
 */
export function TqmMultiTrend({series,unit=""}:{series:{label:string;tone:Tone;points:{label:string;value:number}[]}[];unit?:string}){
  const width=640,height=230,pad=34;
  const [showTable,setShowTable]=useState(false);
  const labels=series[0]?.points.map(p=>p.label)||[];
  const allVals=series.flatMap(s=>s.points.map(p=>p.value));
  const min=Math.min(0,...allVals),max=Math.max(1,...allVals);const span=Math.max(1,max-min);
  const yFor=(v:number)=>height-pad-(v-min)/span*(height-pad*2);
  const xFor=(i:number,len:number)=>pad+(len<=1?0:i*(width-pad*2)/(len-1));
  const seriesPts=series.map(s=>s.points.map((p,i)=>({x:xFor(i,s.points.length),y:yFor(p.value),...p})));
  return <div className="tqm-trend tqm-multi-trend">
    <div className="tqm-multi-trend-legend">{series.map((s,i)=><span key={`${s.label}-${i}`}><i style={{background:COLORS[s.tone]}}/>{s.label}</span>)}</div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Biểu đồ xu hướng nhiều chuỗi: ${series.map(s=>s.label).join(", ")}`}>
      <line x1={pad} y1={height-pad} x2={width-pad} y2={height-pad} stroke="#dce7ea"/>
      {seriesPts.map((pts,si)=><g key={si}>
        <polyline points={pts.map(p=>`${p.x},${p.y}`).join(" ")} fill="none" stroke={COLORS[series[si].tone]} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        {pts.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="3" fill={COLORS[series[si].tone]}/>)}
      </g>)}
      {labels.map((l,i)=><text key={i} x={xFor(i,labels.length)} y={height-10} textAnchor="middle" fontSize="10" fill="#71848b">{l}</text>)}
    </svg>
    <button type="button" className="tqm-trend-table-toggle" onClick={()=>setShowTable((v)=>!v)} aria-expanded={showTable}>
      {showTable?"Ẩn bảng số liệu":"Xem bảng số liệu"}
    </button>
    {showTable?<div className="table-wrap"><table className="tqm-trend-table"><thead><tr><th>Kỳ</th>{series.map((s,i)=><th key={i}>{s.label}</th>)}</tr></thead><tbody>{labels.map((l,i)=><tr key={i}><td>{l}</td>{series.map((s,si)=><td key={si}>{s.points[i]?.value ?? 0}{unit}</td>)}</tr>)}</tbody></table></div>:null}
  </div>
}

export function TqmGantt({year,rows}:{year:number;rows:{label:string;start:string|null;end:string|null;progress?:number;tone?:Tone}[]}){
  const months=Array.from({length:15},(_,i)=>({year:year+Math.floor(i/12),month:i%12+1}));
  function monthPos(date:string|null){if(!date)return null;const d=new Date(`${date}T00:00:00Z`);if(Number.isNaN(d.getTime()))return null;const pos=(d.getUTCFullYear()-year)*12+d.getUTCMonth();return pos>=0&&pos<15?pos:null;}
  return <div className="tqm-gantt"><div className="tqm-gantt-head"><div>Công việc / đề án</div>{months.map((m,i)=><span key={`${m.year}-${m.month}`}>{m.month===1&&i>0?`T1/${String(m.year).slice(-2)}`:`T${m.month}`}</span>)}</div>{rows.map((r,i)=>{const s=monthPos(r.start),e=monthPos(r.end);return <div className="tqm-gantt-row" key={`${r.label}-${i}`}><div className="tqm-gantt-name"><strong>{r.label}</strong><small>{r.start||"—"} → {r.end||"—"}</small></div><div className="tqm-gantt-grid">{months.map((m,i)=><i key={`${m.year}-${m.month}-${i}`}/>)}{s!==null&&e!==null?<span className="tqm-gantt-bar" title={`${r.label}: ${r.progress??0}% · ${r.start} → ${r.end}`} style={{left:`${s/15*100}%`,width:`${(Math.max(s,e)-s+1)/15*100}%`,background:COLORS[r.tone||"brand"]}}><em style={{width:`${Math.max(0,Math.min(100,r.progress??0))}%`}}/></span>:null}</div></div>})}</div>
}

/**
 * Gauge hình cung 270° (không phải donut tròn đủ 360° như TqmDonut) — dùng
 * cho KPI dạng % đạt mục tiêu/công suất, có thể kèm 1 vạch mốc mục tiêu.
 * Kỹ thuật: 2 vòng <circle> chồng nhau, dùng pathLength=100 để stroke-
 * dasharray tính trực tiếp theo %, xoay cả nhóm 135° để khoảng hở (90°,
 * 25% chưa vẽ) nằm đúng dưới đáy — cách dựng gauge kiểu đồng hồ tốc độ
 * chuẩn, không cần tính chu vi hình tròn thủ công.
 */
export function TqmGauge({ value, max = 100, label, tone = "brand", target }: {
  value: number; max?: number; label: string; tone?: Tone; target?: number | null;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const trackLen = 75; // 270° / 360° của vòng tròn, biểu diễn bằng % của pathLength=100
  const fillLen = pct * trackLen;
  const hasTarget = target !== null && target !== undefined && Number.isFinite(target) && max > 0;
  const targetFrac = hasTarget ? Math.max(0, Math.min(1, (target as number) / max)) : 0;
  const cx = 60, cy = 60, rInner = 42, rOuter = 51;
  const targetAngleRad = ((135 + targetFrac * 270) * Math.PI) / 180;
  const tickX1 = cx + rInner * Math.cos(targetAngleRad), tickY1 = cy + rInner * Math.sin(targetAngleRad);
  const tickX2 = cx + rOuter * Math.cos(targetAngleRad), tickY2 = cy + rOuter * Math.sin(targetAngleRad);
  return <div className="tqm-gauge">
    <svg viewBox="0 0 120 120" role="img" aria-label={`${label}: ${Math.round(pct * 100)}%${hasTarget ? `, mục tiêu ${target}%` : ""}`}>
      <g transform="rotate(135 60 60)">
        <circle cx={cx} cy={cy} r="50" pathLength={100} fill="none" stroke="#edf2f3" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${trackLen} ${100 - trackLen}`} />
        <circle cx={cx} cy={cy} r="50" pathLength={100} fill="none" stroke={COLORS[tone]} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${fillLen} ${100 - fillLen}`} />
      </g>
      {hasTarget ? <line x1={tickX1} y1={tickY1} x2={tickX2} y2={tickY2} stroke="#31515a" strokeWidth="3" strokeLinecap="round" /> : null}
      <text x={cx} y={cy + 7} textAnchor="middle" fontSize="22" fontWeight="800" fill="#172126">{Math.round(pct * 100)}%</text>
    </svg>
    <div className="tqm-gauge-label">{label}</div>
  </div>;
}

/**
 * Bẻ nhãn dài thành tối đa `maxLines` dòng ngang (không xoay chữ) — xoay
 * chữ ở trục dưới cho nhiều cột sát nhau (vd nhiều khoa/phòng) dễ bị chữ
 * đè lên nhau/biến dạng khi footprint ngang của chữ xoay vượt quá khoảng
 * cách giữa các cột (báo cáo thực tế: "Ko thấy tên đơn vị khoa phòng" —
 * đúng lỗi này). Bẻ dòng ngang giữ chữ luôn thẳng, dễ đọc, không phụ thuộc
 * số lượng cột.
 */
function wrapLabel(label: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = label.split(/\s+/).filter(Boolean);
  if (!words.length) return [label];
  const lines: string[] = [];
  let current = "";
  let idx = 0;
  while (idx < words.length && lines.length < maxLines - 1) {
    const next = current ? `${current} ${words[idx]}` : words[idx];
    if (next.length > maxCharsPerLine && current) {
      lines.push(current);
      current = "";
      continue;
    }
    current = next;
    idx++;
  }
  const rest = [current, ...words.slice(idx)].filter(Boolean).join(" ");
  if (rest) lines.push(rest.length > maxCharsPerLine ? `${rest.slice(0, maxCharsPerLine - 1).trimEnd()}…` : rest);
  return lines.length ? lines : [label];
}

/**
 * Nhãn số trên đầu cột, có nền trắng đục phía sau — che đường mốc (threshold
 * dashed line) hoặc bất kỳ nét kẻ nào đi ngang qua đúng vị trí nhãn khi giá
 * trị cột gần bằng mốc, tránh chữ số bị nét kẻ "cắt" qua trông như số khác
 * (báo cáo thực tế: cột 13.0 gần mốc 14 bị đường kẻ cắt qua trông như
 * "43.0" — "rất xấu"). Độ rộng nền ước lượng theo số ký tự, không cần đo
 * canvas thật vì chỉ cần đủ che, không cần khít tuyệt đối.
 */
function ValueLabel({ x, y, text, fill = "#31515a" }: { x: number; y: number; text: string; fill?: string }) {
  const w = text.length * 6 + 6;
  return (
    <g>
      <rect x={x - w / 2} y={y - 9} width={w} height={11} fill="#fff" />
      <text x={x} y={y} textAnchor="middle" fontSize="9" fontWeight="800" fill={fill}>
        {text}
      </text>
    </g>
  );
}

/**
 * Biểu đồ cột nhóm: so sánh 2 giá trị (vd trước/sau) theo từng đơn vị, mỗi
 * đơn vị 2 cột cạnh nhau 2 màu khác nhau, kèm 1 đường ngang cắt ngang đánh
 * dấu 1 mốc (vd mức điểm đạt) — theo yêu cầu thực tế "1 khoa gồm 2 cột
 * trước và sau tương ứng 2 màu, thêm 1 dòng mức điểm đạt cắt ngang". Giá
 * trị luôn in trực tiếp trên đầu mỗi cột (không bắt buộc phải hover mới
 * xem được), cuộn ngang khi nhiều đơn vị (như TqmGantt). `width`/`height`
 * gắn thẳng làm thuộc tính SVG (không chỉ CSS min-width) để khớp đúng 1:1
 * với viewBox — tránh trình duyệt co giãn lệch tỷ lệ làm chữ biến dạng.
 */
export function TqmGroupedBars({ groups, beforeLabel, afterLabel, threshold, thresholdLabel = "Mức đạt" }: {
  groups: { label: string; before: number | null; after: number | null }[];
  beforeLabel: string; afterLabel: string; threshold?: number | null; thresholdLabel?: string;
}) {
  if (!groups.length) return <div className="empty-state compact">Chưa có dữ liệu.</div>;
  const hasThreshold = threshold !== null && threshold !== undefined && Number.isFinite(threshold);
  const allVals = groups.flatMap((g) => [g.before, g.after]).filter((v): v is number => v != null).concat(hasThreshold ? [threshold as number] : []);
  const ceiling = Math.max(1, ...allVals) * 1.2;
  const barW = 20, gapInGroup = 4, groupGap = 26, sidePad = 20, topPad = 18, bottomPad = 58, height = 234;
  const groupW = barW * 2 + gapInGroup;
  const width = sidePad * 2 + groups.length * groupW + Math.max(0, groups.length - 1) * groupGap;
  const baseY = height - bottomPad;
  const yFor = (v: number) => topPad + (1 - Math.max(0, v) / ceiling) * (baseY - topPad);
  const thresholdY = hasThreshold ? yFor(threshold as number) : null;
  return (
    <div className="tqm-grouped-bars">
      <div className="tqm-grouped-bars-legend">
        <span><i className="tqm-swatch" style={{ background: COLORS.blue }} />{beforeLabel}</span>
        <span><i className="tqm-swatch" style={{ background: COLORS.green }} />{afterLabel}</span>
        {hasThreshold ? <span><i className="tqm-swatch" style={{ background: TARGET_LINE_COLOR }} />{thresholdLabel}: {threshold}</span> : null}
      </div>
      <div className="tqm-grouped-bars-scroll">
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={`Biểu đồ cột so sánh ${beforeLabel} và ${afterLabel} theo đơn vị${hasThreshold ? `, ${thresholdLabel} ${threshold}` : ""}`}>
          <line x1={sidePad} y1={baseY} x2={width - sidePad} y2={baseY} stroke="#dce7ea" />
          {/* Chỉ vẽ đường mốc, KHÔNG in nhãn số trong biểu đồ nữa — nhãn
              "Mức đạt: X" luôn neo sát mép phải (textAnchor="end") nên đè lên
              cột/nhãn số cuối cùng khi biểu đồ vừa đúng khít nội dung (báo
              cáo thực tế "rất xấu" — đúng lỗi này); giá trị mốc đã có sẵn
              trong chú giải (legend) phía trên, không mất thông tin. */}
          {thresholdY !== null ? <line x1={sidePad} y1={thresholdY} x2={width - sidePad} y2={thresholdY} stroke={TARGET_LINE_COLOR} strokeWidth="2" strokeDasharray="6 5" /> : null}
          {groups.map((g, i) => {
            const gx = sidePad + i * (groupW + groupGap);
            const labelLines = wrapLabel(g.label, 13, 4);
            return (
              <g key={`${g.label}-${i}`}>
                {g.before != null ? (
                  <g>
                    <rect x={gx} y={yFor(g.before)} width={barW} height={Math.max(0, baseY - yFor(g.before))} rx="3" fill={COLORS.blue} />
                    <ValueLabel x={gx + barW / 2} y={yFor(g.before) - 4} text={g.before.toFixed(1)} />
                  </g>
                ) : null}
                {g.after != null ? (
                  <g>
                    <rect x={gx + barW + gapInGroup} y={yFor(g.after)} width={barW} height={Math.max(0, baseY - yFor(g.after))} rx="3" fill={COLORS.green} />
                    <ValueLabel x={gx + barW + gapInGroup + barW / 2} y={yFor(g.after) - 4} text={g.after.toFixed(1)} />
                  </g>
                ) : null}
                <text x={gx + groupW / 2} y={baseY + 13} textAnchor="middle" fontSize="9" fill="#71848b">
                  {labelLines.map((line, li) => (
                    <tspan key={li} x={gx + groupW / 2} dy={li === 0 ? 0 : 11}>
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/**
 * Biểu đồ cột đơn giản (1 cột/hạng mục, dựng đứng) — bản thay thế
 * TqmHorizontalBars khi cần so sánh trực quan kiểu "cột cao thấp" thay vì
 * thanh ngang (báo cáo thực tế: "chuyển hết các biểu đồ hàng ngang thành
 * biểu đồ cột để dễ so sánh", phạm vi tab Phân tích đào tạo). Dùng cùng
 * wrapLabel với TqmGroupedBars để nhãn trục dưới không bị đè khi nhiều
 * hạng mục.
 */
export function TqmColumnBars({ rows, max, unit = "" }: { rows: { label: string; value: number; tone?: Tone }[]; max?: number; unit?: string }) {
  if (!rows.length) return <div className="empty-state compact">Chưa có dữ liệu.</div>;
  const ceiling = Math.max(1, max ?? Math.max(1, ...rows.map((r) => r.value)));
  const barW = 34, gap = 22, sidePad = 20, topPad = 20, bottomPad = 58, height = 214;
  const width = sidePad * 2 + rows.length * barW + Math.max(0, rows.length - 1) * gap;
  const baseY = height - bottomPad;
  const yFor = (v: number) => topPad + (1 - Math.max(0, Math.min(ceiling, v)) / ceiling) * (baseY - topPad);
  return (
    <div className="tqm-col-bars">
      <div className="tqm-col-bars-scroll">
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={`Biểu đồ cột: ${rows.map((r) => `${r.label} ${r.value}${unit}`).join(", ")}`}>
          <line x1={sidePad} y1={baseY} x2={width - sidePad} y2={baseY} stroke="#dce7ea" />
          {rows.map((r, i) => {
            const x = sidePad + i * (barW + gap);
            const y = yFor(r.value);
            const labelLines = wrapLabel(r.label, 12, 4);
            return (
              <g key={`${r.label}-${i}`}>
                <rect x={x} y={y} width={barW} height={Math.max(0, baseY - y)} rx="4" fill={COLORS[r.tone || "brand"]} />
                <ValueLabel x={x + barW / 2} y={y - 5} text={`${r.value}${unit}`} fill="#172126" />
                <text x={x + barW / 2} y={baseY + 13} textAnchor="middle" fontSize="9" fill="#46545a">
                  {labelLines.map((line, li) => (
                    <tspan key={li} x={x + barW / 2} dy={li === 0 ? 0 : 11}>
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export const TQM_CHART_CSS = `
.tqm-donut-wrap{display:grid;grid-template-columns:minmax(190px,.8fr) minmax(180px,1fr);gap:20px;align-items:center;padding:10px 18px 20px}.tqm-donut{width:190px;height:190px;border-radius:50%;display:grid;place-items:center;margin:auto}.tqm-donut-hole{width:122px;height:122px;border-radius:50%;background:white;display:grid;place-items:center;align-content:center;box-shadow:inset 0 0 0 1px #edf2f3;text-align:center}.tqm-donut-hole strong{font-size:34px;line-height:1}.tqm-donut-hole span{font-size:10px;color:#718187;margin-top:7px}.tqm-donut-legend{display:grid;gap:10px}.tqm-donut-legend>div{display:grid;grid-template-columns:10px 1fr auto;gap:9px;align-items:center;font-size:11px}.tqm-donut-legend i{width:9px;height:9px;border-radius:50%}.tqm-donut-legend span{color:#5d6f76}.tqm-donut-legend strong{font-size:12px}.tqm-hbars{display:grid;gap:10px;padding:8px 18px 20px}.tqm-hbar-row{display:grid;grid-template-columns:minmax(110px,180px) 1fr 42px;gap:11px;align-items:center}.tqm-hbar-label{display:grid}.tqm-hbar-label strong{font-size:11px}.tqm-hbar-label span{font-size:9px;color:#7a8b91;margin-top:2px}.tqm-hbar-track{height:10px;background:#edf2f3;border-radius:999px;overflow:hidden}.tqm-hbar-fill{display:block;height:100%;border-radius:999px;transition:filter .15s ease}.tqm-hbar-row:hover .tqm-hbar-fill{filter:brightness(.92)}.tqm-hbar-row>b{font-size:11px;text-align:right}
.tqm-trend{padding:6px 12px 12px;overflow-x:auto;position:relative}.tqm-trend svg{min-width:520px;width:100%;height:auto;cursor:crosshair}.tqm-trend svg:focus{outline:2px solid #0b8a7f;outline-offset:2px}
.tqm-trend-tip{position:absolute;top:4px;transform:translateX(-50%);background:#12313a;color:#fff;border-radius:10px;padding:7px 11px;font-size:11px;pointer-events:none;box-shadow:0 10px 24px rgba(10,30,36,.25);white-space:nowrap;z-index:2}.tqm-trend-tip strong{font-size:14px;margin-right:6px}.tqm-trend-tip em{display:block;font-style:normal;color:#ffcfa8;font-size:10px;margin-top:2px}
.tqm-trend-table-toggle{margin-top:8px;border:1px solid #d7e0e3;background:#fff;border-radius:999px;padding:5px 12px;font-size:11px;font-weight:700;color:#31515a;cursor:pointer}.tqm-trend-table-toggle:hover{background:#f3f7f8}
.tqm-multi-trend-legend{display:flex;flex-wrap:wrap;gap:12px;padding:0 4px 8px}.tqm-multi-trend-legend span{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#5d6f76;font-weight:700}.tqm-multi-trend-legend i{width:9px;height:9px;border-radius:50%}.tqm-multi-trend svg{cursor:default}
.tqm-trend-table{margin-top:10px;border-collapse:collapse;font-size:11px;width:100%;max-width:420px}.tqm-trend-table th,.tqm-trend-table td{text-align:left;padding:5px 10px;border-bottom:1px solid #edf2f3}.tqm-trend-table th{color:#718187;font-weight:800;text-transform:uppercase;font-size:10px}
.tqm-gantt{overflow-x:auto;padding:0 16px 18px}.tqm-gantt-head,.tqm-gantt-row{min-width:860px;display:grid;grid-template-columns:240px 1fr}.tqm-gantt-head>div{font-size:10px;font-weight:900;color:#607279;padding:9px}.tqm-gantt-head{grid-template-columns:240px repeat(15,1fr);border-bottom:1px solid #e3eaec}.tqm-gantt-head span{font-size:9px;text-align:center;padding:9px 2px;color:#71838a}.tqm-gantt-row{min-height:54px;border-bottom:1px solid #edf2f3}.tqm-gantt-name{padding:9px;display:grid;align-content:center}.tqm-gantt-name strong{font-size:11px}.tqm-gantt-name small{font-size:9px;color:#7a8b91;margin-top:3px}.tqm-gantt-grid{position:relative;display:grid;grid-template-columns:repeat(15,1fr)}.tqm-gantt-grid>i{border-left:1px solid #edf2f3}.tqm-gantt-bar{position:absolute;top:15px;height:24px;border-radius:7px;overflow:hidden;box-shadow:0 4px 10px rgba(20,50,58,.12)}.tqm-gantt-bar em{display:block;height:100%;background:rgba(255,255,255,.28)}
@media(max-width:700px){.tqm-gantt-head,.tqm-gantt-row{grid-template-columns:170px 1fr;min-width:980px}.tqm-gantt-head{grid-template-columns:170px repeat(15,1fr)}.tqm-gantt-name{position:sticky;left:0;z-index:2;background:#fff;border-right:1px solid #e3eaec}.tqm-gantt-head>div{position:sticky;left:0;z-index:3;background:#fff;border-right:1px solid #e3eaec}.tqm-donut-wrap{grid-template-columns:1fr}.tqm-donut{width:170px;height:170px}.tqm-donut-hole{width:110px;height:110px}.tqm-hbar-row{grid-template-columns:100px 1fr 34px}.tqm-gantt{padding-inline:8px}}
.tqm-gauge{display:flex;flex-direction:column;align-items:center;gap:2px;width:100px;max-width:100px;flex:0 0 100px}.tqm-gauge svg{width:100px;height:100px}.tqm-gauge-label{font-size:10px;color:#718187;text-align:center;width:100%}
.tqm-grouped-bars{padding:8px 18px 20px}.tqm-grouped-bars-legend{display:flex;flex-wrap:wrap;gap:14px;padding-bottom:10px;font-size:11px;font-weight:700;color:#5d6f76}.tqm-grouped-bars-legend span{display:inline-flex;align-items:center;gap:6px}.tqm-swatch{width:10px;height:10px;border-radius:3px;display:inline-block}.tqm-grouped-bars-scroll{overflow-x:auto}.tqm-grouped-bars-scroll svg{display:block}
`;
