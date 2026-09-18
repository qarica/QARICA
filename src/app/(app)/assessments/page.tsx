import { RegistryModulePage } from "@/components/registry-module-page";
import Link from "next/link";

export default function AssessmentsPage() {
  return <><div className="page-stack"><Link className="button secondary" href="/catalogs" style={{ alignSelf: "flex-start" }}>Khai báo bộ tiêu chí, tiêu chí và tiểu mục →</Link></div><RegistryModulePage config={{
    eyebrow: "ĐÁNH GIÁ & TIẾP ĐOÀN",
    title: "Tự đánh giá chất lượng",
    description: "Theo dõi các đợt tự đánh giá, kết quả tiêu chí, tiến độ hoàn thiện và minh chứng theo bộ tiêu chí áp dụng.",
    permissions: ["criteria.view", "criteria.assess", "criteria.review", "criteria.manage"],
    recordTypes: ["ASSESSMENT"],
  }} /></>;
}
