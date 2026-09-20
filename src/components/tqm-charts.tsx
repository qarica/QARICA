import React from "react";

type Tone = "brand" | "blue" | "amber" | "red" | "green" | "slate";
const COLORS: Record<Tone,string> = {
  brand:"#0b8a7f", blue:"#4a86e8", amber:"#e3a33c", red:"#df5a67", green:"#2ca56f", slate:"#b9c7cc"
};

export function TqmDonut({value,label,segments}:{value:number;label:string;segments:{label:string;value:number;tone?:Tone}[]}){
  const total=Math.max(1,segments.reduce((s,x)=>s+Math.max(0,x.value),0));
  let offset=0;
  return <div className="tqm-donut-wrap"><div className="tqm-donut" style={{background:`conic-gradient(${segments.map((s)=>{const start=offset;offset+=s.value/total*360;return `${COLORS[s.tone||"brand"]} ${start}deg ${offset}deg`}).join(",")})`}}><div className="tqm-donut-hole"><strong>{value}%</strong><span>{label}</span></div></div><div className="tqm-donut-legend">{segments.map((s,i)=><div key={`${s.label}-${i}`}><i style={{background:COLORS[s.tone||"brand"]}}/><span>{s.label}</span><strong>{s.value}</strong></div>)}</div></div>
}

export function TqmHorizontalBars({rows,max}:{rows:{label:string;value:number;tone?:Tone;caption?:string}[];max?:number}){
  const ceiling=Math.max(1,max??Math.max(1,...rows.map(r=>r.value)));
  return <div className="tqm-hbars">{rows.map((r,i)=><div className="tqm-hbar-row" key={`${r.label}-${i}`}><div className="tqm-hbar-label"><strong>{r.label}</strong>{r.caption?<span>{r.caption}</span>:null}</div><div className="tqm-hbar-track"><span style={{width:`${Math.max(0,Math.min(100,r.value/ceiling*100))}%`,background:COLORS[r.tone||"brand"]}}/></div><b>{r.value}</b></div>)}</div>
}

export function TqmTrend({points,unit="%"}:{points:{label:string;value:number}[];unit?:string}){
  const width=640,height=230,pad=34;
  const vals=points.map(p=>p.value);const min=Math.min(...vals,0),max=Math.max(...vals,1);const span=Math.max(1,max-min);
  const pts=points.map((p,i)=>{const x=pad+(points.length===1?0:i*(width-pad*2)/(points.length-1));const y=height-pad-(p.value-min)/span*(height-pad*2);return{x,y,...p}});
  const poly=pts.map(p=>`${p.x},${p.y}`).join(" ");
  const area=pts.length?`${pad},${height-pad} ${poly} ${pts[pts.length-1].x},${height-pad}`:"";
  return <div className="tqm-trend"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Biểu đồ xu hướng"><defs><linearGradient id="tqmArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#14a394" stopOpacity=".28"/><stop offset="100%" stopColor="#14a394" stopOpacity=".02"/></linearGradient></defs><line x1={pad} y1={height-pad} x2={width-pad} y2={height-pad} stroke="#dce7ea"/><polygon points={area} fill="url(#tqmArea)"/><polyline points={poly} fill="none" stroke="#0b8a7f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>{pts.map((p,i)=><g key={i}><circle cx={p.x} cy={p.y} r="4.5" fill="#fff" stroke="#0b8a7f" strokeWidth="3"/><text x={p.x} y={p.y-11} textAnchor="middle" fontSize="11" fontWeight="800" fill="#31515a">{p.value}{unit}</text><text x={p.x} y={height-10} textAnchor="middle" fontSize="10" fill="#71848b">{p.label}</text></g>)}</svg></div>
}

export function TqmGantt({year,rows}:{year:number;rows:{label:string;start:string|null;end:string|null;progress?:number;tone?:Tone}[]}){
  const months=Array.from({length:15},(_,i)=>({year:year+Math.floor(i/12),month:i%12+1}));
  function monthPos(date:string|null){if(!date)return null;const d=new Date(`${date}T00:00:00Z`);if(Number.isNaN(d.getTime()))return null;const pos=(d.getUTCFullYear()-year)*12+d.getUTCMonth();return pos>=0&&pos<15?pos:null;}
  return <div className="tqm-gantt"><div className="tqm-gantt-head"><div>Công việc / đề án</div>{months.map((m,i)=><span key={`${m.year}-${m.month}`}>{m.month===1&&i>0?`T1/${String(m.year).slice(-2)}`:`T${m.month}`}</span>)}</div>{rows.map((r,i)=>{const s=monthPos(r.start),e=monthPos(r.end);return <div className="tqm-gantt-row" key={`${r.label}-${i}`}><div className="tqm-gantt-name"><strong>{r.label}</strong><small>{r.start||"—"} → {r.end||"—"}</small></div><div className="tqm-gantt-grid">{months.map((m,i)=><i key={`${m.year}-${m.month}-${i}`}/>)}{s!==null&&e!==null?<span className="tqm-gantt-bar" style={{left:`${s/15*100}%`,width:`${(Math.max(s,e)-s+1)/15*100}%`,background:COLORS[r.tone||"brand"]}}><em style={{width:`${Math.max(0,Math.min(100,r.progress??0))}%`}}/></span>:null}</div></div>})}</div>
}

export const TQM_CHART_CSS = `
.tqm-donut-wrap{display:grid;grid-template-columns:minmax(190px,.8fr) minmax(180px,1fr);gap:20px;align-items:center;padding:10px 18px 20px}.tqm-donut{width:190px;height:190px;border-radius:50%;display:grid;place-items:center;margin:auto}.tqm-donut-hole{width:122px;height:122px;border-radius:50%;background:white;display:grid;place-items:center;align-content:center;box-shadow:inset 0 0 0 1px #edf2f3;text-align:center}.tqm-donut-hole strong{font-size:34px;line-height:1}.tqm-donut-hole span{font-size:10px;color:#718187;margin-top:7px}.tqm-donut-legend{display:grid;gap:10px}.tqm-donut-legend>div{display:grid;grid-template-columns:10px 1fr auto;gap:9px;align-items:center;font-size:11px}.tqm-donut-legend i{width:9px;height:9px;border-radius:50%}.tqm-donut-legend span{color:#5d6f76}.tqm-donut-legend strong{font-size:12px}.tqm-hbars{display:grid;gap:10px;padding:8px 18px 20px}.tqm-hbar-row{display:grid;grid-template-columns:minmax(110px,180px) 1fr 42px;gap:11px;align-items:center}.tqm-hbar-label{display:grid}.tqm-hbar-label strong{font-size:10.5px}.tqm-hbar-label span{font-size:9px;color:#7a8b91;margin-top:2px}.tqm-hbar-track{height:10px;background:#edf2f3;border-radius:999px;overflow:hidden}.tqm-hbar-track span{display:block;height:100%;border-radius:999px}.tqm-hbar-row>b{font-size:11px;text-align:right}.tqm-trend{padding:6px 12px 12px;overflow-x:auto}.tqm-trend svg{min-width:520px;width:100%;height:auto}.tqm-gantt{overflow-x:auto;padding:0 16px 18px}.tqm-gantt-head,.tqm-gantt-row{min-width:860px;display:grid;grid-template-columns:240px 1fr}.tqm-gantt-head>div{font-size:10px;font-weight:900;color:#607279;padding:9px}.tqm-gantt-head{grid-template-columns:240px repeat(15,1fr);border-bottom:1px solid #e3eaec}.tqm-gantt-head span{font-size:9px;text-align:center;padding:9px 2px;color:#71838a}.tqm-gantt-row{min-height:54px;border-bottom:1px solid #edf2f3}.tqm-gantt-name{padding:9px;display:grid;align-content:center}.tqm-gantt-name strong{font-size:10.5px}.tqm-gantt-name small{font-size:9px;color:#7a8b91;margin-top:3px}.tqm-gantt-grid{position:relative;display:grid;grid-template-columns:repeat(15,1fr)}.tqm-gantt-grid>i{border-left:1px solid #edf2f3}.tqm-gantt-bar{position:absolute;top:15px;height:24px;border-radius:7px;overflow:hidden;box-shadow:0 4px 10px rgba(20,50,58,.12)}.tqm-gantt-bar em{display:block;height:100%;background:rgba(255,255,255,.28)}
@media(max-width:700px){.tqm-gantt-head,.tqm-gantt-row{grid-template-columns:170px 1fr;min-width:980px}.tqm-gantt-head{grid-template-columns:170px repeat(15,1fr)}.tqm-gantt-name{position:sticky;left:0;z-index:2;background:#fff;border-right:1px solid #e3eaec}.tqm-gantt-head>div{position:sticky;left:0;z-index:3;background:#fff;border-right:1px solid #e3eaec}.tqm-donut-wrap{grid-template-columns:1fr}.tqm-donut{width:170px;height:170px}.tqm-donut-hole{width:110px;height:110px}.tqm-hbar-row{grid-template-columns:100px 1fr 34px}.tqm-gantt{padding-inline:8px}}
`;
