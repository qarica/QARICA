import{routeForRecord}from"@/lib/record-route";
const RECORD_TYPE_LABELS:Record<string,string>={INCIDENT:"Sự cố y khoa",CAPA:"CAPA",FINDING:"Finding",RISK:"Rủi ro",FMEA:"FMEA",AUDIT:"Audit",ASSESSMENT:"Tự đánh giá",INSPECTION:"Tiếp đoàn",ACTION:"Action",IMPROVEMENT_PROJECT:"Đề án cải tiến",IMPROVEMENT_PROPOSAL:"Đề xuất cải tiến",DIRECTIVE:"Chỉ đạo",REPORT:"Nghĩa vụ báo cáo",FEEDBACK:"Phản ánh",SAFETY_ALERT:"Bài học/Cảnh báo"};
const KNOWLEDGE_TYPE_LABELS:Record<string,string>={NOTE:"Knowledge · Ghi chú",JOURNAL:"Knowledge · Nhật ký",DECISION:"Knowledge · Quyết định",LESSON:"Knowledge · Bài học",REFERENCE:"Knowledge · Tham khảo"};
export function mapSearchResults(records:any[],notes:any[]){
const a=records.map(r=>({id:r.id,kind:"RECORD",label:RECORD_TYPE_LABELS[r.record_type]||r.record_type,title:r.title,code:r.record_code,href:routeForRecord(r.record_type,r.id)}));
const b=notes.map(n=>({id:"knowledge:"+n.id,kind:"KNOWLEDGE",label:KNOWLEDGE_TYPE_LABELS[n.note_type]||"Knowledge",title:n.title,code:n.visibility==="PRIVATE"?"Riêng tư":n.visibility==="TEAM"?"Cùng tổ chức":"Theo hồ sơ",href:"/me#knowledge-journal"}));
return [...a,...b];}
