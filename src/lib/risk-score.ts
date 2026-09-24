// Công cụ tính điểm nguy cơ dùng lại được cho nhiều thang điểm dạng "chọn mức độ
// theo từng yếu tố -> cộng điểm có trọng số -> phân loại mức nguy cơ -> gợi ý can
// thiệp". Đây là mẫu lặp lại ở nhiều đề án cải tiến chất lượng thực tế (thang điểm
// Braden đánh giá tổn thương da do áp lực, thang điểm đánh giá nguy cơ hít sặc...).
//
// Bản thân module này KHÔNG mã hoá cứng một thang điểm lâm sàng cụ thể nào ngoài
// thang điểm Braden (là thang điểm đã được chuẩn hoá, công bố rộng rãi, có thể
// tra cứu công khai). Với các thang điểm khác (ví dụ thang điểm nguy cơ hít sặc
// riêng của từng bệnh viện), khoa lâm sàng/chuyên gia cần tự định nghĩa qua
// `RiskScaleDefinition` — không tự suy diễn hoặc bịa điểm số cho một công cụ lâm
// sàng khi chưa được xác nhận, vì sẽ gây rủi ro an toàn người bệnh nếu dùng sai.

export type RiskFactorOption = {
  value: number;
  label: string;
};

export type RiskFactor = {
  code: string;
  label: string;
  options: RiskFactorOption[];
};

export type RiskBand = {
  code: string;
  label: string;
  /** Điểm tối thiểu để rơi vào mức này (bao gồm) */
  minScore: number;
  /** Điểm tối đa để rơi vào mức này (bao gồm) */
  maxScore: number;
  interventions: string[];
};

export type RiskScaleDefinition = {
  id: string;
  name: string;
  /** Nguồn/căn cứ của thang điểm — bắt buộc ghi rõ để tránh dùng nhầm thang điểm chưa xác nhận */
  sourceNote: string;
  factors: RiskFactor[];
  bands: RiskBand[];
};

export type RiskScoreResult = {
  totalScore: number | null;
  minPossibleScore: number;
  maxPossibleScore: number;
  complete: boolean;
  missingFactorCodes: string[];
  band: RiskBand | null;
};

/**
 * Tính điểm nguy cơ theo `scale`, với `answers` là map factorCode -> giá trị
 * điểm đã chọn (option.value). Trả về null cho totalScore nếu chưa trả lời đủ
 * tất cả các yếu tố — KHÔNG suy diễn điểm còn thiếu, tránh đưa ra kết luận sai.
 */
export function scoreRiskScale(scale: RiskScaleDefinition, answers: Record<string, number | null | undefined>): RiskScoreResult {
  const minPossibleScore = scale.factors.reduce((sum, f) => sum + Math.min(...f.options.map((o) => o.value)), 0);
  const maxPossibleScore = scale.factors.reduce((sum, f) => sum + Math.max(...f.options.map((o) => o.value)), 0);

  const missingFactorCodes = scale.factors
    .filter((f) => answers[f.code] === null || answers[f.code] === undefined || !Number.isFinite(Number(answers[f.code])))
    .map((f) => f.code);

  const complete = missingFactorCodes.length === 0;
  if (!complete) {
    return { totalScore: null, minPossibleScore, maxPossibleScore, complete, missingFactorCodes, band: null };
  }

  const totalScore = scale.factors.reduce((sum, f) => sum + Number(answers[f.code]), 0);
  const band = scale.bands.find((b) => totalScore >= b.minScore && totalScore <= b.maxScore) ?? null;

  return { totalScore, minPossibleScore, maxPossibleScore, complete, missingFactorCodes, band };
}

// Thang điểm Braden — đánh giá nguy cơ tổn thương da do áp lực (pressure injury),
// 6 yếu tố, tổng điểm 6-23, điểm càng THẤP nguy cơ càng CAO. Đây là thang điểm
// lâm sàng đã chuẩn hoá và được công bố công khai (Braden & Bergstrom, 1987),
// dùng phổ biến tại nhiều bệnh viện — bao gồm mô hình đã thấy tại BV ĐHYD TPHCM
// (ứng dụng trên bệnh án điện tử điều dưỡng).
export const BRADEN_SCALE: RiskScaleDefinition = {
  id: "BRADEN",
  name: "Thang điểm Braden — Nguy cơ tổn thương da do áp lực",
  sourceNote: "Braden & Bergstrom (1987); thang điểm chuẩn hoá, sử dụng phổ biến trong đánh giá điều dưỡng.",
  factors: [
    {
      code: "SENSORY_PERCEPTION",
      label: "Cảm nhận giác quan",
      options: [
        { value: 1, label: "1 — Hoàn toàn hạn chế" },
        { value: 2, label: "2 — Rất hạn chế" },
        { value: 3, label: "3 — Hạn chế nhẹ" },
        { value: 4, label: "4 — Không hạn chế" },
      ],
    },
    {
      code: "MOISTURE",
      label: "Độ ẩm da",
      options: [
        { value: 1, label: "1 — Luôn ẩm ướt" },
        { value: 2, label: "2 — Rất ẩm ướt" },
        { value: 3, label: "3 — Thỉnh thoảng ẩm ướt" },
        { value: 4, label: "4 — Hiếm khi ẩm ướt" },
      ],
    },
    {
      code: "ACTIVITY",
      label: "Hoạt động",
      options: [
        { value: 1, label: "1 — Nằm tại giường" },
        { value: 2, label: "2 — Ngồi tại ghế" },
        { value: 3, label: "3 — Đi lại thỉnh thoảng" },
        { value: 4, label: "4 — Đi lại thường xuyên" },
      ],
    },
    {
      code: "MOBILITY",
      label: "Khả năng vận động",
      options: [
        { value: 1, label: "1 — Hoàn toàn bất động" },
        { value: 2, label: "2 — Rất hạn chế" },
        { value: 3, label: "3 — Hạn chế nhẹ" },
        { value: 4, label: "4 — Không hạn chế" },
      ],
    },
    {
      code: "NUTRITION",
      label: "Dinh dưỡng",
      options: [
        { value: 1, label: "1 — Rất kém" },
        { value: 2, label: "2 — Có thể không đầy đủ" },
        { value: 3, label: "3 — Đầy đủ" },
        { value: 4, label: "4 — Rất tốt" },
      ],
    },
    {
      code: "FRICTION_SHEAR",
      label: "Ma sát và lực kéo trượt",
      options: [
        { value: 1, label: "1 — Có vấn đề" },
        { value: 2, label: "2 — Có khả năng có vấn đề" },
        { value: 3, label: "3 — Không có vấn đề rõ rệt" },
      ],
    },
  ],
  bands: [
    { code: "SEVERE", label: "Nguy cơ rất cao", minScore: 6, maxScore: 9, interventions: [
      "Xoay trở tư thế tối thiểu mỗi 1-2 giờ, có lịch xoay trở bằng văn bản",
      "Sử dụng đệm/nệm giảm áp lực chuyên dụng",
      "Đánh giá lại da tối thiểu mỗi ca trực, báo bác sĩ nếu có dấu hiệu tổn thương",
      "Hội chẩn dinh dưỡng nếu điểm Dinh dưỡng ≤ 2",
    ] },
    { code: "HIGH", label: "Nguy cơ cao", minScore: 10, maxScore: 12, interventions: [
      "Xoay trở tư thế mỗi 2 giờ",
      "Sử dụng đệm/nệm giảm áp lực",
      "Giữ da khô, sạch; kiểm tra da mỗi ca trực",
    ] },
    { code: "MODERATE", label: "Nguy cơ trung bình", minScore: 13, maxScore: 14, interventions: [
      "Xoay trở tư thế mỗi 2-4 giờ",
      "Theo dõi vùng da tỳ đè hàng ngày",
    ] },
    { code: "MILD", label: "Nguy cơ thấp", minScore: 15, maxScore: 18, interventions: [
      "Khuyến khích vận động/thay đổi tư thế thường xuyên",
      "Theo dõi da định kỳ theo thường quy khoa",
    ] },
    { code: "NONE", label: "Không có nguy cơ hiện tại", minScore: 19, maxScore: 23, interventions: [
      "Theo dõi thường quy, đánh giá lại khi tình trạng người bệnh thay đổi",
    ] },
  ],
};

export const BUILT_IN_RISK_SCALES: RiskScaleDefinition[] = [BRADEN_SCALE];
