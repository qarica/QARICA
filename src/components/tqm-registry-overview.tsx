import Link from "next/link";
import { TQM_CHART_CSS, TqmDonut, TqmHorizontalBars, TqmTrend } from "@/components/tqm-charts";
import { hcmMonthNumber } from "@/lib/hcm-date";

type Row={record_type:string;lifecycle_status:string;department_name:string;owner_name:string;created_at:string;updated_at:string};

const LABELS:Record<string,{total:string;active:string;closed:string;unassigned:string;trend:string;dept:string}>={
 INDICATOR_MEASUREMENT:{total:"Kỳ đo",active:"Đang xử lý",closed:"Đã hoàn tất",unassigned:"Thiếu phân công",trend:"Kỳ đo được ghi nhận theo tháng",dept:"Phân bố chỉ số theo đơn vị"},
 ASSESSMENT:{total:"Đợt tự đánh giá",active:"Đang đánh giá",closed:"Đã hoàn tất",unassigned:"Thiếu phân công",trend:"Đợt tự đánh giá được mở theo tháng",dept:"Khối lượng tự đánh giá theo đơn vị"},
 EXTERNAL_ASSESSMENT:{total:"Đợt đánh giá ngoài",active:"Đang xử lý",closed:"Đã hoàn tất",unassigned:"Thiếu phân công",trend:"Đợt đánh giá ngoài được ghi nhận",dept:"Phân bố hồ sơ theo đơn vị"},
 AUDIT:{total:"Đợt audit / tracer",active:"Đang thực hiện",closed:"Đã đóng",unassigned:"Thiếu phân công",trend:"Đợt Audit / Tracer được ghi nhận",dept:"Audit theo đơn vị"},
 INSPECTION:{total:"Đợt tiếp đoàn",active:"Đang chuẩn bị",closed:"Đã kết thúc",unassigned:"Thiếu phân công",trend:"Đợt tiếp đoàn được ghi nhận",dept:"Tiếp đoàn theo đơn vị"},
 INCIDENT:{total:"Sự cố",active:"Đang xử lý",closed:"Đã đóng",unassigned:"Thiếu phân công",trend:"Hồ sơ sự cố được ghi nhận",dept:"Sự cố theo đơn vị"},
 FEEDBACK:{total:"Phản ánh / góp ý",active:"Đang xử lý",closed:"Đã đóng",unassigned:"Thiếu phân công",trend:"Phản ánh được ghi nhận theo tháng",dept:"Phản ánh theo đơn vị"},
 SAFETY_ALERT:{total:"Bài học / cảnh báo",active:"Đang hiệu lực",closed:"Đã kết thúc",unassigned:"Thiếu phân công",trend:"Cảnh báo được ghi nhận theo tháng",dept:"Cảnh báo theo đơn vị"},
 RISK:{total:"Rủi ro",active:"Đang theo dõi",closed:"Đã đóng",unassigned:"Thiếu owner",trend:"Rủi ro được ghi nhận theo tháng",dept:"Rủi ro theo đơn vị"},
 FMEA:{total:"FMEA / HFMEA",active:"Đang phân tích",closed:"Đã hoàn tất",unassigned:"Thiếu owner",trend:"FMEA / HFMEA được khởi tạo",dept:"FMEA theo đơn vị"},
 FINDING:{total:"Finding",active:"Đang khắc phục",closed:"Đã đóng",unassigned:"Thiếu owner",trend:"Finding được ghi nhận theo tháng",dept:"Finding theo đơn vị"},
 CAPA:{total:"CAPA",active:"Đang triển khai",closed:"Đã xác nhận",unassigned:"Thiếu owner",trend:"CAPA được khởi tạo theo tháng",dept:"CAPA theo đơn vị"},
 IMPROVEMENT_PROPOSAL:{total:"Đề xuất",active:"Đang xem xét",closed:"Đã xử lý",unassigned:"Thiếu owner",trend:"Đề xuất được ghi nhận theo tháng",dept:"Đề xuất theo đơn vị"},
 DIRECTIVE:{total:"Chỉ đạo / yêu cầu",active:"Đang thực hiện",closed:"Đã hoàn tất",unassigned:"Thiếu owner",trend:"Yêu cầu được ghi nhận theo tháng",dept:"Chỉ đạo theo đơn vị"},
 REPORT:{total:"Nghĩa vụ báo cáo",active:"Đang chuẩn bị",closed:"Đã hoàn tất",unassigned:"Thiếu owner",trend:"Nghĩa vụ báo cáo được ghi nhận",dept:"Báo cáo theo đơn vị"},
};

function monthKey(value:string){const month=hcmMonthNumber(value);return month===null?null:month-1;}

export function TqmRegistryOverview({rows,recordType}:{rows:Row[];recordType:string}){
 const copy=LABELS[recordType]||{total:"Hồ sơ",active:"Đang hoạt động",closed:"Đã đóng",unassigned:"Thiếu phân công",trend:"Hồ sơ được ghi nhận theo tháng",dept:"Phân bố theo đơn vị"};
 const total=rows.length,active=rows.filter(r=>r.lifecycle_status==="ACTIVE").length,closed=rows.filter(r=>r.lifecycle_status==="CLOSED").length,unassigned=rows.filter(r=>r.department_name==="—"||r.owner_name==="Chưa gán người").length;
 const statusMap=new Map<string,number>();rows.forEach(r=>statusMap.set(r.lifecycle_status,(statusMap.get(r.lifecycle_status)||0)+1));
 const segments=Array.from(statusMap.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([label,value],i)=>({label:label.replaceAll("_"," "),value,tone:(i===0?"brand":i===1?"blue":i===2?"green":i===3?"amber":"slate") as any}));
 const depMap=new Map<string,number>();rows.forEach(r=>depMap.set(r.department_name,(depMap.get(r.department_name)||0)+1));
 const depBars=Array.from(depMap.entries()).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([label,value],i)=>({label,value,tone:(i<3?"brand":"blue") as any}));
 const months=Array.from({length:12},(_,i)=>({label:`T${i+1}`,value:0}));rows.forEach(r=>{const m=monthKey(r.created_at);if(m!==null)months[m].value++});
 const completion=total?Math.round(closed/total*100):0;
 return <>
  <style>{TQM_CHART_CSS+`.tqm-registry-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.tqm-registry-kpi{display:block;background:#fff;border:1px solid #e1e9ec;border-radius:17px;padding:15px 16px;text-decoration:none;color:inherit}.tqm-registry-kpi.clickable{transition:.18s ease}.tqm-registry-kpi.clickable:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(20,48,58,.08);border-color:#b8d9d5}.tqm-registry-kpi span{display:block;font-size:10px;color:#728188;font-weight:800;text-transform:uppercase;letter-spacing:.04em}.tqm-registry-kpi strong{display:block;font-size:30px;line-height:1;margin-top:8px}.tqm-registry-kpi small{display:block;font-size:10px;color:#7d8c92;margin-top:6px}.tqm-registry-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.tqm-registry-head{padding:16px 18px 4px}.tqm-registry-head h2{margin:0;font-size:15px}.tqm-registry-head p{margin:4px 0 0;color:#74838a;font-size:11px}@media(max-width:900px){.tqm-registry-grid{grid-template-columns:1fr}.tqm-registry-kpis{grid-template-columns:1fr 1fr}}`}</style>
  <section className="tqm-registry-kpis"><article className="tqm-registry-kpi"><span>{copy.total}</span><strong>{total}</strong><small>Trong năm đang chọn</small></article><Link className="tqm-registry-kpi clickable" href="?status=ACTIVE#registry-list"><span>{copy.active}</span><strong>{active}</strong><small>Bấm để lọc hồ sơ đang hoạt động</small></Link><Link className="tqm-registry-kpi clickable" href="?status=CLOSED#registry-list"><span>{copy.closed}</span><strong>{closed}</strong><small>{completion}% tổng hồ sơ · bấm để drill-down</small></Link><article className="tqm-registry-kpi"><span>{copy.unassigned}</span><strong>{unassigned}</strong><small>Cần hoàn thiện trách nhiệm</small></article></section>
  <section className="tqm-registry-grid"><article className="panel"><div className="tqm-registry-head"><h2>Cơ cấu trạng thái</h2><p>Cho biết hồ sơ đang nằm ở đâu trong vòng đời nghiệp vụ.</p></div><TqmDonut value={completion} label="Đã đóng" segments={segments.length?segments:[{label:"Chưa có dữ liệu",value:1,tone:"slate"}]}/></article><article className="panel"><div className="tqm-registry-head"><h2>{copy.dept}</h2><p>Giúp nhận diện đơn vị đang có khối lượng công việc lớn.</p></div><TqmHorizontalBars rows={depBars}/></article></section>
  <section className="panel"><div className="tqm-registry-head"><h2>{copy.trend}</h2><p>Biểu đồ này dùng ngày hồ sơ được ghi nhận trong Registry. Đây là nhịp phát sinh/tiếp nhận hồ sơ, không được diễn giải như xu hướng kết quả chất lượng.</p></div><TqmTrend points={months} unit=""/></section>
 </>;
}
