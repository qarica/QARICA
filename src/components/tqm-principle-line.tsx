import Link from "next/link";

// Dòng "Quản lý theo quá trình" dùng chung: mục đích + (tùy chọn) các bước quy trình + nguyên tắc + nghiệp vụ liên kết.
// showSteps: dùng khi trang đã có thanh luồng việc riêng (khuôn Kho hóa chất) — các bước quy trình của hồ sơ được gộp vào
// dòng này thay cho khối 6 ô bước riêng, để trang không có 2 dãy bước chồng nhau. Không bỏ nội dung nào.
export function TqmPrincipleLine({ purpose, workflow, principle, related, showSteps = false }: { purpose: string; workflow: string[]; principle?: string; related: { label: string; href: string }[]; showSteps?: boolean }) {
  return <p className="tqm-principle-line">
    <b>Quản lý theo quá trình</b>
    <span>{purpose}</span>
    {showSteps && workflow.length ? <span className="tqm-principle-steps">Quy trình hồ sơ: {workflow.join(" → ")}</span> : null}
    {showSteps && principle && principle !== purpose ? <span className="tqm-principle-rule">{principle}</span> : null}
    <span className="tqm-principle-meta">{showSteps ? null : <>{workflow.length} bước quy trình</>}{related.length ? <>{showSteps ? "" : " · "}Liên kết: {related.map((x, i) => <span key={x.href + x.label}>{i ? ", " : ""}<Link href={x.href}>{x.label}</Link></span>)}</> : null}</span>
  </p>;
}
