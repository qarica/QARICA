import {PageHeader} from "@/components/page-header";
import {BrainGraphClient} from "@/components/brain-graph-client";
import {requireUserContext} from "@/lib/auth";
export default async function BrainMapPage(){await requireUserContext();return <div className="page-stack"><PageHeader eyebrow="Brain" title="Brain Map" description="Bản đồ tri thức và kết nối ghi chú" icon="network"/><BrainGraphClient/></div>}
