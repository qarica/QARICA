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
type Tone = "brand" | "blue" | "amber" | "red" | "green" | "slate";
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
    {showTable?<table className="tqm-trend-table"><thead><tr><th>Kỳ</th><th>Giá trị</th></tr></thead><tbody>{pts.map((p,i)=><tr key={i}><td>{p.label}</td><td>{p.value}{unit}</td></tr>)}</tbody></table>:null}
  </div>
}

export function TqmGantt({year,rows}:{year:number;rows:{label:string;start:string|null;end:string|null;progress?:number;tone?:Tone}[]}){
  const months=Array.from({length:15},(_,i)=>({year:year+Math.floor(i/12),month:i%12+1}));
  function monthPos(date:string|null){if(!date)return null;const d=new Date(`${date}T00:00:00Z`);if(Number.isNaN(d.getTime()))return null;const pos=(d.getUTCFullYear()-year)*12+d.getUTCMonth();return pos>=0&&pos<15?pos:null;}
  return <div className="tqm-gantt"><div className="tqm-gantt-head"><div>Công việc / đề án</div>{months.map((m,i)=><span key={`${m.year}-${m.month}`}>{m.month===1&&i>0?`T1/${String(m.year).slice(-2)}`:`T${m.month}`}</span>)}</div>{rows.map((r,i)=>{const s=monthPos(r.start),e=monthPos(r.end);return <div className="tqm-gantt-row" key={`${r.label}-${i}`}><div className="tqm-gantt-name"><strong>{r.label}</strong><small>{r.start||"—"} → {r.end||"—"}</small></div><div className="tqm-gantt-grid">{months.map((m,i)=><i key={`${m.year}-${m.month}-${i}`}/>)}{s!==null&&e!==null?<span className="tqm-gantt-bar" title={`${r.label}: ${r.progress??0}% · ${r.start} → ${r.end}`} style={{left:`${s/15*100}%`,width:`${(Math.max(s,e)-s+1)/15*100}%`,background:COLORS[r.tone||"brand"]}}><em style={{width:`${Math.max(0,Math.min(100,r.progress??0))}%`}}/></span>:null}</div></div>})}</div>
}

export const TQM_CHART_CSS = `
.tqm-donut-wrap{display:grid;grid-template-columns:minmax(190px,.8fr) minmax(180px,1fr);gap:20px;align-items:center;padding:10px 18px 20px}.tqm-donut{width:190px;height:190px;border-radius:50%;display:grid;place-items:center;margin:auto}.tqm-donut-hole{width:122px;height:122px;border-radius:50%;background:white;display:grid;place-items:center;align-content:center;box-shadow:inset 0 0 0 1px #edf2f3;text-align:center}.tqm-donut-hole strong{font-size:34px;line-height:1}.tqm-donut-hole span{font-size:10px;color:#718187;margin-top:7px}.tqm-donut-legend{display:grid;gap:10px}.tqm-donut-legend>div{display:grid;grid-template-columns:10px 1fr auto;gap:9px;align-items:center;font-size:11px}.tqm-donut-legend i{width:9px;height:9px;border-radius:50%}.tqm-donut-legend span{color:#5d6f76}.tqm-donut-legend strong{font-size:12px}.tqm-hbars{display:grid;gap:10px;padding:8px 18px 20px}.tqm-hbar-row{display:grid;grid-template-columns:minmax(110px,180px) 1fr 42px;gap:11px;align-items:center}.tqm-hbar-label{display:grid}.tqm-hbar-label strong{font-size:10.5px}.tqm-hbar-label span{font-size:9px;color:#7a8b91;margin-top:2px}.tqm-hbar-track{height:10px;background:#edf2f3;border-radius:999px;overflow:hidden}.tqm-hbar-fill{display:block;height:100%;border-radius:999px;transition:filter .15s ease}.tqm-hbar-row:hover .tqm-hbar-fill{filter:brightness(.92)}.tqm-hbar-row>b{font-size:11px;text-align:right}
.tqm-trend{padding:6px 12px 12px;overflow-x:auto;position:relative}.tqm-trend svg{min-width:520px;width:100%;height:auto;cursor:crosshair}.tqm-trend svg:focus{outline:2px solid #0b8a7f;outline-offset:2px}
.tqm-trend-tip{position:absolute;top:4px;transform:translateX(-50%);background:#12313a;color:#fff;border-radius:10px;padding:7px 11px;font-size:11px;pointer-events:none;box-shadow:0 10px 24px rgba(10,30,36,.25);white-space:nowrap;z-index:2}.tqm-trend-tip strong{font-size:14px;margin-right:6px}.tqm-trend-tip em{display:block;font-style:normal;color:#ffcfa8;font-size:10px;margin-top:2px}
.tqm-trend-table-toggle{margin-top:8px;border:1px solid #d7e0e3;background:#fff;border-radius:999px;padding:5px 12px;font-size:10.5px;font-weight:700;color:#31515a;cursor:pointer}.tqm-trend-table-toggle:hover{background:#f3f7f8}
.tqm-trend-table{margin-top:10px;border-collapse:collapse;font-size:11px;width:100%;max-width:420px}.tqm-trend-table th,.tqm-trend-table td{text-align:left;padding:5px 10px;border-bottom:1px solid #edf2f3}.tqm-trend-table th{color:#718187;font-weight:800;text-transform:uppercase;font-size:9.5px}
.tqm-gantt{overflow-x:auto;padding:0 16px 18px}.tqm-gantt-head,.tqm-gantt-row{min-width:860px;display:grid;grid-template-columns:240px 1fr}.tqm-gantt-head>div{font-size:10px;font-weight:900;color:#607279;padding:9px}.tqm-gantt-head{grid-template-columns:240px repeat(15,1fr);border-bottom:1px solid #e3eaec}.tqm-gantt-head span{font-size:9px;text-align:center;padding:9px 2px;color:#71838a}.tqm-gantt-row{min-height:54px;border-bottom:1px solid #edf2f3}.tqm-gantt-name{padding:9px;display:grid;align-content:center}.tqm-gantt-name strong{font-size:10.5px}.tqm-gantt-name small{font-size:9px;color:#7a8b91;margin-top:3px}.tqm-gantt-grid{position:relative;display:grid;grid-template-columns:repeat(15,1fr)}.tqm-gantt-grid>i{border-left:1px solid #edf2f3}.tqm-gantt-bar{position:absolute;top:15px;height:24px;border-radius:7px;overflow:hidden;box-shadow:0 4px 10px rgba(20,50,58,.12)}.tqm-gantt-bar em{display:block;height:100%;background:rgba(255,255,255,.28)}
@media(max-width:700px){.tqm-gantt-head,.tqm-gantt-row{grid-template-columns:170px 1fr;min-width:980px}.tqm-gantt-head{grid-template-columns:170px repeat(15,1fr)}.tqm-gantt-name{position:sticky;left:0;z-index:2;background:#fff;border-right:1px solid #e3eaec}.tqm-gantt-head>div{position:sticky;left:0;z-index:3;background:#fff;border-right:1px solid #e3eaec}.tqm-donut-wrap{grid-template-columns:1fr}.tqm-donut{width:170px;height:170px}.tqm-donut-hole{width:110px;height:110px}.tqm-hbar-row{grid-template-columns:100px 1fr 34px}.tqm-gantt{padding-inline:8px}}
`;
