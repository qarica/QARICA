import { DomainPrintableRecordPage } from "@/components/domain-printable-record-page";
export default async function Page({params}:{params:Promise<{id:string}>}){const{id}=await params;return <DomainPrintableRecordPage id={id} recordType="FINDING" title="PHIẾU TỔNG HỢP FINDING" backHref="/findings" permissions={["findings.view","findings.manage"]}/>}
