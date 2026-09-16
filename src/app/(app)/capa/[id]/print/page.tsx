import { DomainPrintableRecordPage } from "@/components/domain-printable-record-page";
export default async function Page({params}:{params:Promise<{id:string}>}){const{id}=await params;return <DomainPrintableRecordPage id={id} recordType="CAPA" title="PHIẾU TỔNG HỢP CAPA" backHref="/capa" permissions={["capa.view","capa.manage"]}/>}
