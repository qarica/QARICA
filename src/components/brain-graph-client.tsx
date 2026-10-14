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
 const[statusFilter,setStatusFilter]=useState<"ALL"|"ACTIVE"|"ARCHIVED">("ALL");
 const[inspectorOpen,setInspectorOpen]=useState(true),[explorerOpen,setExplorerOpen]=useState(true),[focusMode,setFocusMode]=useState(false);
 const[typeFilter,setTypeFilter]=useState("ALL");
 const[showLabels,setShowLabels]=useState(true);
 const[onlyConnected,setOnlyConnected]=useState(false);
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
 const visible=useMemo(()=>{const q=query.trim().toLowerCase();const ids=new Set<string>();if(local&&focus){ids.add(focus);edges.forEach(e=>{if(e.source===focus)ids.add(e.target);if(e.target===focus)ids.add(e.source)})}return nodes.filter(n=>(!local||!focus||ids.has(n.id))&&(statusFilter==="ALL"||n.status===statusFilter)&&(typeFilter==="ALL"||n.type===typeFilter)&&(!onlyConnected||edges.some(e=>e.source===n.id||e.target===n.id))&&(!q||n.label.toLowerCase().includes(q)||n.id===focus));},[nodes,edges,query,local,focus,statusFilter,typeFilter,onlyConnected]);
 const points=useMemo(()=>{
  const out=new Map<string,{x:number;y:number}>();const count=visible.length;
  if(count===0)return out;
  const visibleIds=new Set(visible.map(n=>n.id));
  const neighbors=new Map<string,Set<string>>(visible.map(n=>[n.id,new Set<string>()]));
  edges.forEach(e=>{if(visibleIds.has(e.source)&&visibleIds.has(e.target)&&e.source!==e.target){neighbors.get(e.source)?.add(e.target);neighbors.get(e.target)?.add(e.source)}});
  const ordered=[...visible].sort((a,b)=>(neighbors.get(b.id)?.size??0)-(neighbors.get(a.id)?.size??0)||a.id.localeCompare(b.id));
  const visited=new Set<string>();const components:string[][]=[];
  for(const node of ordered){if(visited.has(node.id))continue;const component:string[]=[];const queue=[node.id];visited.add(node.id);
   for(let i=0;i<queue.length;i++){const id=queue[i];component.push(id);for(const neighbor of neighbors.get(id)??[]){if(!visited.has(neighbor)){visited.add(neighbor);queue.push(neighbor)}}}
   components.push(component);
  }
  components.sort((a,b)=>b.length-a.length);
  if(count===1){out.set(visible[0].id,{x:500,y:340});return out}
  const columns=Math.ceil(Math.sqrt(components.length));const rows=Math.ceil(components.length/columns);
  components.forEach((component,index)=>{
   const col=index%columns,row=Math.floor(index/columns);
   const cx=(col+.5)*1000/columns,cy=(row+.5)*680/rows;
   const radius=Math.min(170,Math.max(30,Math.min(1000/columns,680/rows)*.35));
   component.forEach((id,i)=>{const angle=i*2.399963229728653;const r=component.length===1?0:Math.sqrt((i+.5)/component.length)*radius;out.set(id,{x:cx+Math.cos(angle)*r,y:cy+Math.sin(angle)*r})});
  });
  return out;
 },[visible,edges]);
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
 const related=useMemo(()=>{if(!focus)return [];const ids=new Set<string>();edges.forEach(e=>{if(e.source===focus)ids.add(e.target);if(e.target===focus)ids.add(e.source)});return nodes.filter(n=>ids.has(n.id)).sort((a,b)=>a.label.localeCompare(b.label))},[nodes,edges,focus]);
 const grouped=useMemo(()=>Object.entries(nodes.reduce<Record<string,Node[]>>((acc,n)=>{(acc[n.type]??=[]).push(n);return acc},{})).sort(([a],[b])=>a.localeCompare(b)),[nodes]);
 const typeNames:Record<string,string>={NOTE:"Ghi chú",JOURNAL:"Nhật ký",DECISION:"Quyết định",LESSON:"Bài học",REFERENCE:"Tham khảo"};
 return <section className={`brain-workspace ${focusMode?"brain-focus-mode":""}`} style={{display:"grid",gap:12,minWidth:0}}>
 <header className="brain-heading"><div><h2 style={{margin:0}}>Không gian Brain</h2><p style={{margin:"6px 0 0"}}>Chọn nút để xem và kết nối tri thức</p></div><div className="brain-heading-actions"><button type="button" className="button secondary small" onClick={()=>setExplorerOpen(v=>!v)} aria-expanded={explorerOpen}>{explorerOpen?"Ẩn Explorer":"Explorer"}</button><button type="button" className="button secondary small" onClick={()=>setInspectorOpen(v=>!v)} aria-expanded={inspectorOpen}>{inspectorOpen?"Ẩn chi tiết":"Hiện chi tiết"}</button><button type="button" className="button secondary small" onClick={()=>setFocusMode(v=>!v)} aria-pressed={focusMode}>{focusMode?"Thoát tập trung":"Tập trung"}</button></div></header>
 <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
 <input className="input" aria-label="Tìm nút Brain Map" placeholder="Tìm ghi chú..." value={query} onChange={e=>setQuery(e.target.value)} style={{flex:"1 1 200px"}}/>
 <select className="input" aria-label="Lọc trạng thái ghi chú" value={statusFilter} onChange={e=>setStatusFilter(e.target.value as "ALL"|"ACTIVE"|"ARCHIVED")}><option value="ALL">Tất cả ghi chú</option><option value="ACTIVE">Đang sử dụng</option><option value="ARCHIVED">Đã lưu trữ</option></select>
 <select className="input" aria-label="Lọc loại tri thức" value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="ALL">Mọi loại tri thức</option>{Object.entries(typeNames).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
 <button type="button" className="button secondary small" aria-pressed={onlyConnected} onClick={()=>setOnlyConnected(v=>!v)}>{onlyConnected?"Có liên kết ✓":"Chỉ nút liên kết"}</button>
 <button type="button" className="button secondary small" aria-pressed={!local} onClick={()=>setLocal(false)}>Toàn bộ</button>
 <button type="button" className="button secondary small" aria-pressed={local} disabled={!focus} onClick={()=>setLocal(true)}>Lân cận</button>
 <button type="button" className="button secondary small" onClick={()=>{setFocus(null);setLocal(false);setQuery("");setStatusFilter("ALL");setTypeFilter("ALL");setOnlyConnected(false);resetViewport()}}>Đặt lại</button>
 </div>
 {!loading&&!error?<p role="status" style={{margin:0,fontSize:13}}>Đang hiển thị {visible.length}/{nodes.length} ghi chú · {nodes.filter(n=>n.status==="ARCHIVED").length} đã lưu trữ. Chọn nút để mở đúng ghi chú.</p>:null}
 {loading?<p role="status">Đang tải bản đồ...</p>:null}{error?<p role="alert">{error}</p>:null}
 {!loading&&!error&&nodes.length>0&&visible.length===0?<p>Không có ghi chú phù hợp bộ lọc. Thử chọn Tất cả ghi chú hoặc xóa từ khóa tìm kiếm.</p>:null}
 {!loading&&!error&&nodes.length===0?<p>Chưa có ghi chú. Hãy tạo ghi chú để bắt đầu xây dựng Brain Map.</p>:null}
 {!loading&&!error&&visible.length>35&&showLabels?<p className="brain-label-hint">Bản đồ có nhiều nút: chỉ hiện nhãn của ghi chú được chọn để tránh chồng chữ. Có thể chọn ghi chú từ Explorer.</p>:null}
 {truncated?<p role="status">Bản đồ hiển thị tối đa 250 ghi chú và 1.000 liên kết gần nhất.</p>:null}
 <div className="brain-viewport-tools" style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><button type="button" className="button secondary small" aria-label="Thu nhỏ bản đồ" onClick={()=>setZoom(v=>clampZoom(v/1.25))}>−</button><span aria-live="polite">{Math.round(zoom*100)}%</span><button type="button" className="button secondary small" aria-label="Phóng to bản đồ" onClick={()=>setZoom(v=>clampZoom(v*1.25))}>+</button><button type="button" className="button secondary small" onClick={resetViewport}>Về giữa</button><button type="button" className="button secondary small" aria-pressed={showLabels} onClick={()=>setShowLabels(v=>!v)}>{showLabels?"Ẩn nhãn":"Hiện nhãn"}</button><small className="brain-drag-hint">Kéo vùng trống để di chuyển bản đồ</small></div>
 <div className={`brain-content ${inspectorOpen?"with-inspector":""} ${explorerOpen?"with-explorer":""}`}>
 {explorerOpen?<aside className="brain-explorer" aria-label="Knowledge Explorer"><div className="brain-pane-heading"><strong>Knowledge Explorer</strong><span>{nodes.length} ghi chú</span></div><button className="brain-explorer-all" type="button" onClick={()=>{setTypeFilter("ALL");setStatusFilter("ALL");setOnlyConnected(false);setQuery("");setLocal(false)}}>▦ Tất cả tri thức</button><div className="brain-explorer-groups">{grouped.map(([type,items])=><details key={type} open><summary>{typeNames[type]||type} <small>{items.length}</small></summary><div className="brain-explorer-items">{items.map(n=><button key={n.id} type="button" className={focus===n.id?"selected":""} onClick={()=>{setFocus(n.id);setInspectorOpen(true);setLocal(false);setQuery("");setTypeFilter("ALL");setStatusFilter("ALL")}} title={n.label}><span className="brain-node-dot" style={{background:colors[n.type]||"#a9a9d4"}}/>{n.label}{n.status==="ARCHIVED"?<small>Đã lưu</small>:null}</button>)}</div></details>)}</div><a className="brain-explorer-new" href="/me#knowledge-journal">+ Tạo ghi chú</a></aside>:null}
 <div className="brain-canvas">
 <svg ref={svg} viewBox="0 0 1000 680" role="img" aria-label="Bản đồ kết nối các ghi chú" style={{display:"block",width:"100%",height:"100%",touchAction:"none",cursor:"grab"}} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
 <g transform={`translate(${pan.x} ${pan.y}) translate(500 340) scale(${zoom}) translate(-500 -340)`}>
 {edges.filter(e=>points.has(e.source)&&points.has(e.target)).map(e=>{const a=points.get(e.source)!,b=points.get(e.target)!;return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#7873b3" strokeOpacity=".65" strokeWidth="1.5"/>})}
 {visible.map(n=>{const p=points.get(n.id)!;return <g key={n.id} onClick={()=>{if(!suppressClick.current)setFocus(n.id)}} style={{cursor:"pointer"}}><circle cx={p.x} cy={p.y} r={focus===n.id?19:14} fill={colors[n.type]||"#a9a9d4"} stroke={focus===n.id?"#fff":"none"} strokeWidth="2"/>{(showLabels&&(visible.length<=35||focus===n.id))?<text x={p.x} y={p.y+30} fill="#f0efff" fontSize="18" textAnchor="middle">{n.label.length>28?n.label.slice(0,28)+"…":n.label}</text>:null}<title>{n.label}</title></g>})}
 </g></svg></div>{inspectorOpen?<aside className="brain-inspector" aria-label="Chi tiết nút Brain"><h3>Chi tiết ghi chú</h3>{selected?<><strong>{selected.label}</strong><p>{selected.status==="ARCHIVED"?"Đã lưu trữ":"Đang sử dụng"}</p><p>{related.length} ghi chú liên quan</p><a href={`/me?note=${encodeURIComponent(selected.id)}#knowledge-journal`}>Mở sổ tay →</a><div className="brain-related"><h4>Ghi chú liên kết</h4>{related.length?related.map(n=><button type="button" key={n.id} onClick={()=>{setFocus(n.id);setQuery("");setStatusFilter("ALL");setTypeFilter("ALL");setOnlyConnected(false);setLocal(false)}}><span className="brain-node-dot" style={{background:colors[n.type]||"#a9a9d4"}}/>{n.label}</button>):<p>Chưa có liên kết. Chọn ghi chú bên dưới để tạo liên kết mới.</p>}</div></>:<p>Chọn một nút để xem thông tin và kết nối.</p>}</aside>:null}</div>
 {selected?<div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}><label htmlFor="brain-link-target">Liên kết ghi chú này với</label><select id="brain-link-target" className="input" value={target} onChange={e=>setTarget(e.target.value)} style={{flex:"1 1 200px"}}><option value="">Chọn ghi chú khác...</option>{nodes.filter(n=>n.id!==focus).map(n=><option key={n.id} value={n.id}>{n.label}</option>)}</select><button type="button" className="button primary small" disabled={!target||saving} onClick={()=>void connectNotes()}>{saving?"Đang liên kết...":"Tạo liên kết"}</button></div>:null}
 {feedback?<p role="status">{feedback}</p>:null}
 <div aria-live="polite">{selected?<p><strong>{selected.label}</strong> · {selected.status==="ARCHIVED"?"Đã lưu trữ":"Đang sử dụng"} · {edges.filter(e=>e.source===selected.id||e.target===selected.id).length} liên kết. <a href={`/me?note=${encodeURIComponent(selected.id)}#knowledge-journal`}>Mở sổ tay</a></p>:<p>Chọn một nút trên bản đồ để xem thông tin.</p>}</div>
 </section>;
}
