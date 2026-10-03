import { Icon } from "@/components/icon";

export function PageHeader({eyebrow,title,description,actions,icon}:{eyebrow?:string;title:string;description?:string;actions?:React.ReactNode;icon?:string}){
  const copy = <div>{eyebrow?<div className="eyebrow">{eyebrow}</div>:null}<h1>{title}</h1>{description?<p>{description}</p>:null}</div>;
  return <div className="page-header">
    {icon ? <div className="page-header-main"><span className="page-header-icon"><Icon name={icon} size={22}/></span>{copy}</div> : copy}
    {actions?<div className="page-actions">{actions}</div>:null}
  </div>;
}
