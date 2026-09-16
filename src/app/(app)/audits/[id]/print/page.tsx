import { DomainPrintableRecordPage } from "@/components/domain-printable-record-page";
export default async function Page({params}:{params:Promise<{id:string}>}){const{id}=await params;return <DomainPrintableRecordPage id={id} recordType="AUDIT" title="PHIẾU TỔNG HỢP AUDIT / TRACER" backHref="/audits" permissions={["audit.view","audit.perform","audit.manage"]}/>}
