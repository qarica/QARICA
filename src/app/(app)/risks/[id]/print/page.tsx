import { DomainPrintableRecordPage } from "@/components/domain-printable-record-page";
export default async function Page({params}:{params:Promise<{id:string}>}){const{id}=await params;return <DomainPrintableRecordPage id={id} recordType="RISK" title="PHIẾU TỔNG HỢP RỦI RO" backHref="/risks" permissions={["risk.view","risk.manage"]}/>}
