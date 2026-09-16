"use client";

export function MonitoringPrintClient({ roundId, isConfirmed = false }: { roundId: string; isConfirmed?: boolean }) {
  function printRecord() {
    if (!isConfirmed) {
      const ok = window.confirm("Hồ sơ chưa được Phòng QLCL xác nhận. Bản in sẽ được đánh dấu CHƯA XÁC NHẬN. Bạn vẫn muốn tiếp tục?");
      if (!ok) return;
    }
    window.print();
  }

  return <>
    <a className="button secondary no-print" href={`/api/monitoring/rounds/${roundId}/export`} download>
      Xuất Excel (CSV)
    </a>
    <button type="button" className="button primary no-print" onClick={printRecord}>
      {isConfirmed ? "Xuất PDF / In" : "In bản chưa xác nhận"}
    </button>
  </>;
}
