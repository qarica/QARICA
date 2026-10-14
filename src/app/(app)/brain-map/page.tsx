import {PageHeader} from "@/components/page-header";
import {BrainGraphClient} from "@/components/brain-graph-client";
import {requireUserContext} from "@/lib/auth";
export default async function BrainMapPage(){await requireUserContext();return <div className="brain-map-page" style={{width:"100%",maxWidth:"none",minWidth:0,padding:"8px clamp(4px,1vw,16px)"}}><BrainGraphClient/></div>}
