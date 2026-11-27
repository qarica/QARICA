import { Icon } from "@/components/icon";

export function PageHeader({title,description,actions,icon}:{eyebrow?:string;title:string;description?:string;actions?:React.ReactNode;icon?:string}){
  // Khuôn tiêu đề chung: [biểu tượng] + tiêu đề + 1 dòng mô tả + nút thao tác bên phải. `eyebrow` còn nhận để các trang cũ
  // không vỡ kiểu, nhưng không hiển thị (nó lặp tên module đã có ở sidebar/thanh tab).
  const copy = <div><h1>{title}</h1>{description?<p>{description}</p>:null}</div>;
  // .page-header-main carries the mobile min-width:0/width:100% safety net
  // (globals.css); without icon it used to be skipped and the bare copy div
  // had no such net, so always render it regardless of icon.
  return <div className="page-header">
    <div className="page-header-main">{icon?<span className="page-header-icon"><Icon name={icon} size={22}/></span>:null}{copy}</div>
    {actions?<div className="page-actions">{actions}</div>:null}
  </div>;
}
