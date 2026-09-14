import React from "react";

type Tone="brand"|"success"|"warning"|"danger"|"info"|"purple";
const COLORS:Record<Tone,string>={brand:"#0b857c",success:"#2f9b6b",warning:"#d58a2f",danger:"#d34b57",info:"#4f87d8",purple:"#7a63c6"};
const clamp=(n:number)=>Math.max(0,Math.min(100,Number.isFinite(n)?n:0));

export function PercentDonut({value,label,caption,tone="brand"}:{value:number;label:string;caption?:string;tone?:Tone}){
 const v=clamp(value),c=COLORS[tone];
 return <div className="qv-donut-wrap"><div className="qv-donut" style={{background:`conic-gradient(${c} ${v*3.6}deg,#e9eff1 0)`}}><div><strong>{Math.round(v)}%</strong><span>{label}</span></div></div>{caption?<p>{caption}</p>:null}</div>;
}

export function HorizontalBars({items,max}:{items:{label:string;value:number;tone?:Tone;hint?:string}[];max?:number}){
 const ceiling=max||Math.max(1,...items.map(i=>i.value));
 return <div className="qv-bars">{items.map((i,idx)=><div className="qv-bar-row" key={`${i.label}-${idx}`}><div className="qv-bar-label"><span>{i.label}</span>{i.hint?<small>{i.hint}</small>:null}</div><div className="qv-bar-track"><i style={{width:`${Math.max(3,Math.min(100,i.value/ceiling*100))}%`,background:COLORS[i.tone||"brand"]}}/></div><strong>{i.value}</strong></div>)}</div>;
}

export function StackedQuarterBars({quarters}:{quarters:{label:string;done:number;doing:number;todo:number}[]}){
 const max=Math.max(1,...quarters.map(q=>q.done+q.doing+q.todo));
 return <div className="qv-quarter-chart">{quarters.map(q=>{const total=q.done+q.doing+q.todo;return <div className="qv-quarter" key={q.label}><div className="qv-quarter-total">{total}</div><div className="qv-quarter-stack" style={{height:`${Math.max(18,total/max*145)}px`}}><i className="done" style={{height:`${total?q.done/total*100:0}%`}}/><i className="doing" style={{height:`${total?q.doing/total*100:0}%`}}/><i className="todo" style={{height:`${total?q.todo/total*100:0}%`}}/></div><b>{q.label}</b></div>})}</div>;
}

function monthSpan(start?:string|null,end?:string|null,year?:number){
 const y=year||new Date().getFullYear();const s=start?new Date(`${start}T00:00:00`):new Date(y,0,1);const e=end?new Date(`${end}T00:00:00`):new Date(y,11,31);
 const sm=Math.max(0,Math.min(11,s.getFullYear()===y?s.getMonth():s<new Date(y,0,1)?0:11));const em=Math.max(sm,Math.min(11,e.getFullYear()===y?e.getMonth():e>new Date(y,11,31)?11:sm));return{sm,em};
}
export function GanttChart({items,year}:{items:{label:string;start?:string|null;end?:string|null;progress?:number;tone?:Tone}[];year:number}){
 const months=["T1","T2","T3","T4","T5","T6","T7","T8","T9","T10","T11","T12"];
 return <div className="qv-gantt"><div className="qv-gantt-head"><span>Đầu việc / đề án</span>{months.map(m=><b key={m}>{m}</b>)}</div>{items.map((it,idx)=>{const{sm,em}=monthSpan(it.start,it.end,year);return <div className="qv-gantt-row" key={`${it.label}-${idx}`}><span title={it.label}>{it.label}</span><div className="qv-gantt-grid">{months.map(m=><i key={m}/>) }<div className="qv-gantt-bar" style={{left:`${sm/12*100}%`,width:`${(em-sm+1)/12*100}%`,background:COLORS[it.tone||"info"]}}><em style={{width:`${clamp(it.progress||0)}%`}}/></div></div></div>})}</div>;
}

export function ProgressRows({items}:{items:{label:string;value:number;status?:string;tone?:Tone}[]}){
 return <div className="qv-progress-list">{items.map((it,idx)=><div className="qv-progress-row" key={`${it.label}-${idx}`}><div><strong>{it.label}</strong>{it.status?<span>{it.status}</span>:null}</div><div className="qv-progress-track"><i style={{width:`${clamp(it.value)}%`,background:COLORS[it.tone||"brand"]}}/></div><b>{Math.round(clamp(it.value))}%</b></div>)}</div>;
}
