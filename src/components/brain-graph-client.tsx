"use client";
import {useEffect,useMemo,useRef,useState} from "react";
type Node={id:string;label:string;type:string;status:string};
type Edge={id:string;source:string;target:string;label:string};
const colors:Record<string,string>={NOTE:"#9585ff",JOURNAL:"#59b4ed",DECISION:"#efae6d",LESSON:"#64cda4",REFERENCE:"#e5ce78"};
export function BrainGraphClient(){
 const[nodes,setNodes]=useState<Node[]>([]),[edges,setEdges]=useState<Edge[]>([]);
 const[query,setQuery]=useState(""),[focus,setFocus]=useState<string|null>(null);
 const[error,setError]=useState(""),[loading,setLoading]=useState(true),[truncated,setTruncated]=useState(false);
 const[local,setLocal]=useState(false);
 const[layout,setLayout]=useState<"CLUSTERS"|"SPIRAL">("CLUSTERS");
 const[target,setTarget]=useState(""),[saving,setSaving]=useState(false),[feedback,setFeedback]=useState("");
 const svg=useRef<SVGSVGElement|null>(null);
 const[zoom,setZoom]=useState(1),[pan,setPan]=useState({x:0,y:0});
 const suppressClick=useRef(false);
 const drag=useRef<{x:number;y:number;px:number;py:number;moved:boolean}|null>(null);
 const clampZoom=(value:number)=>Math.max(.45,Math.min(3,value));
 function resetViewport(){setZoom(1);setPan({x:0,y:0})}
 function onPointerDown(e:React.PointerEvent<SVGSVGElement>){if(e.button!==0)return;suppressClick.current=false;drag.current={x:e.clientX,y:e.clientY,px:pan.x,py:pan.y,moved:false};e.currentTarget.setPointerCapture(e.pointerId)}
 function onPointerMove(e:React.PointerEvent<SVGSVGElement>){const d=drag.current;if(!d)return;const bounds=e.currentTarget.getBoundingClientRect();const dx=(e.clientX-d.x)*1000/bounds.width,dy=(e.clientY-d.y)*680/bounds.height;if(Math.abs(dx)+Math.abs(dy)>5)d.moved=true;setPan({x:d.px+dx,y:d.py+dy})}
 function onPointerUp(e:React.PointerEvent<SVGSVGElement>){if(drag.current?.moved){e.preventDefault();suppressClick.current=true;}drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}

 useEffect(()=>{let active=true;fetch("/api/knowledge/graph",{cache:"no-store"}).then(async r=>{const b=await r.json();if(!r.ok||!b.ok)throw Error(b.error||"Không tải được Brain Map");if(active){setNodes(b.nodes);setEdges(b.edges);setTruncated(b.truncated);}}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[]);
 const visible=useMemo(()=>{const q=query.trim().toLowerCase();const ids=new Set<string>();if(local&&focus){ids.add(focus);edges.forEach(e=>{if(e.source===focus)ids.add(e.target);if(e.target===focus)ids.add(e.source)})}return nodes.filter(n=>(!local||!focus||ids.has(n.id))&&(!q||n.label.toLowerCase().includes(q)||n.id===focus));},[nodes,edges,query,local,focus]);
 const points=useMemo(()=>{
  const out=new Map<string,{x:number;y:number}>();
  if(layout==="SPIRAL"){const count=visible.length;visible.forEach((n,i)=>{const a=i*2.399963229728653,r=Math.sqrt(i+1)*Math.min(34,410/Math.sqrt(Math.max(count,1)));out.set(n.id,{x:500+r*Math.cos(a),y:340+r*Math.sin(a)})});return out}
  // Deterministic component layout: only real persisted edges determine clusters.
  const ids=new Set(visible.map(n=>n.id)),neighbors=new Map<string,Set<string>>();
  visible.forEach(n=>neighbors.set(n.id,new Set()));
  edges.forEach(e=>{if(ids.has(e.source)&&ids.has(e.target)){neighbors.get(e.source)!.add(e.target);neighbors.get(e.target)!.add(e.source)}});
  const visited=new Set<string>(),components:Node[][]=[];
  for(const n of visible){if(visited.has(n.id))continue;const queue=[n.id],group:Node[]=[];visited.add(n.id);for(let i=0;i<queue.length;i++){const id=queue[i];const found=visible.find(v=>v.id===id);if(found)group.push(found);for(const next of neighbors.get(id)??[]){if(!visited.has(next)){visited.add(next);queue.push(next)}}}components.push(group)}
  components.sort((a,b)=>b.length-a.length);
  const cols=Math.max(1,Math.ceil(Math.sqrt(components.length*1.5))),rows=Math.ceil(components.length/cols);
  const cellW=920/cols,cellH=610/rows;
  components.forEach((group,index)=>{const cx=40+(index%cols+.5)*cellW,cy=35+(Math.floor(index/cols)+.5)*cellH;
   const radius=Math.min(cellW,cellH)*.38;
   group.forEach((n,i)=>{const a=i*2.399963229728653,r=group.length===1?0:radius*Math.sqrt((i+1)/group.length);out.set(n.id,{x:cx+r*Math.cos(a),y:cy+r*Math.sin(a)})});
  });
  return out;
 },[visible,edges,layout]);
 async function connectNotes(){
  if(!focus||!target||focus===target)return;
  setSaving(true);setFeedback("");
  try{
   const res=await fetch("/api/knowledge/"+encodeURIComponent(focus)+"/links",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({target_type:"NOTE",target_id:target,relation_type:"RELATED_TO"})});
   const body=await res.json().catch(()=>({}));
   if(!res.ok||!body.ok)throw new Error(body.error||"Không tạo được liên kết.");
   const l=body.link;setEdges(prev=>prev.some(e=>e.id===l.id)?prev:[...prev,{id:l.id,source:l.note_id,target:l.target_id,label:l.relation_type}]);setFeedback("Đã liên kết hai ghi chú.");setTarget("");
  }catch(e){setFeedback(e instanceof Error?e.message:"Có lỗi xảy ra.");}finally{setSaving(false)}
 }
 const selected=nodes.find(n=>n.id===focus);
 return <section className="card" style={{padding:16,display:"grid",gap:12}}>
 <header><h2 style={{margin:0}}>Brain Map</h2><p style={{margin:"6px 0 0"}}>Bản đồ ghi chú của tôi · Các nhóm chỉ dựa trên liên kết đã lưu, không suy đoán quan hệ</p></header>
 <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
 <input className="input" aria-label="Tìm nút Brain Map" placeholder="Tìm ghi chú..." value={query} onChange={e=>setQuery(e.target.value)} style={{flex:"1 1 200px"}}/>
 <label htmlFor="brain-layout">Bố cục</label><select id="brain-layout" className="input" value={layout} onChange={e=>{setLayout(e.target.value as "CLUSTERS"|"SPIRAL");resetViewport()}}><option value="CLUSTERS">Nhóm kết nối</option><option value="SPIRAL">Xoắn ốc</option></select>
 <button type="button" className="button secondary small" aria-pressed={!local} onClick={()=>setLocal(false)}>Toàn bộ</button>
 <button type="button" className="button secondary small" aria-pressed={local} disabled={!focus} onClick={()=>setLocal(true)}>Lân cận</button>
 <button type="button" className="button secondary small" onClick={()=>{setFocus(null);setLocal(false);setQuery("");resetViewport()}}>Đặt lại</button>
 </div>
 {loading?<p role="status">Đang tải bản đồ...</p>:null}{error?<p role="alert">{error}</p>:null}
 {!loading&&!error&&nodes.length===0?<p>Chưa có ghi chú. Hãy tạo ghi chú để bắt đầu xây dựng Brain Map.</p>:null}
 {truncated?<p role="status">Bản đồ hiển thị tối đa 250 ghi chú và 1.000 liên kết gần nhất.</p>:null}
 <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><button type="button" className="button secondary small" aria-label="Thu nhỏ bản đồ" onClick={()=>setZoom(v=>clampZoom(v/1.25))}>−</button><span aria-live="polite">{Math.round(zoom*100)}%</span><button type="button" className="button secondary small" aria-label="Phóng to bản đồ" onClick={()=>setZoom(v=>clampZoom(v*1.25))}>+</button><button type="button" className="button secondary small" onClick={resetViewport}>Về giữa</button><small>Kéo vùng trống để di chuyển bản đồ</small></div>
 <div style={{background:"#10131d",borderRadius:16,overflow:"hidden",position:"relative"}}>
 <svg ref={svg} viewBox="0 0 1000 680" role="img" aria-label="Bản đồ kết nối các ghi chú" style={{display:"block",width:"100%",maxHeight:560,touchAction:"none",cursor:"grab"}} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
 <g transform={`translate(${pan.x} ${pan.y}) translate(500 340) scale(${zoom}) translate(-500 -340)`}>
 {edges.filter(e=>points.has(e.source)&&points.has(e.target)).map(e=>{const a=points.get(e.source)!,b=points.get(e.target)!;return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#7873b3" strokeOpacity=".65" strokeWidth="1.5"/>})}
 {visible.map(n=>{const p=points.get(n.id)!;return <g key={n.id} onClick={()=>{if(!suppressClick.current)setFocus(n.id)}} style={{cursor:"pointer"}}><circle cx={p.x} cy={p.y} r={focus===n.id?15:10} fill={colors[n.type]||"#a9a9d4"} stroke={focus===n.id?"#fff":"none"} strokeWidth="2"/><text x={p.x} y={p.y+26} fill="#f0efff" fontSize="13" textAnchor="middle">{n.label.length>24?n.label.slice(0,24)+"…":n.label}</text><title>{n.label}</title></g>})}
 </g></svg></div>
 {selected?<div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}><label htmlFor="brain-link-target">Liên kết ghi chú này với</label><select id="brain-link-target" className="input" value={target} onChange={e=>setTarget(e.target.value)} style={{flex:"1 1 200px"}}><option value="">Chọn ghi chú khác...</option>{nodes.filter(n=>n.id!==focus).map(n=><option key={n.id} value={n.id}>{n.label}</option>)}</select><button type="button" className="button primary small" disabled={!target||saving} onClick={()=>void connectNotes()}>{saving?"Đang liên kết...":"Tạo liên kết"}</button></div>:null}
 {feedback?<p role="status">{feedback}</p>:null}
 <div aria-live="polite">{selected?<p><strong>{selected.label}</strong> · {selected.status==="ARCHIVED"?"Đã lưu trữ":"Đang sử dụng"} · {edges.filter(e=>e.source===selected.id||e.target===selected.id).length} liên kết. <a href="/me#knowledge-journal">Mở sổ tay</a></p>:<p>Chọn một nút trên bản đồ để xem thông tin.</p>}</div>
 </section>;
}
