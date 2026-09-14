import { RegistryModulePage } from "@/components/registry-module-page";

export default function AuditsPage() {
  return <RegistryModulePage config={{
    eyebrow: "ĐÁNH GIÁ CHẤT LƯỢNG",
    title: "Audit / Tracer",
    description: "Theo dõi audit, tracer, đơn vị được đánh giá và các follow-up phát sinh.",
    permissions: ["audit.view", "audit.perform", "audit.manage"],
    recordTypes: ["AUDIT"],
  }} />;
}
