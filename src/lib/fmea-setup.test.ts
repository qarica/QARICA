import { describe, expect, it } from "vitest";
import { calculateFmeaRpn, normalizeFmeaFailureMode, normalizeFmeaStep, normalizedFmeaText, validFmeaScore } from "./fmea-setup";

describe("FMEA setup helpers", () => {
  it("normalizes process steps across compatible column names", () => {
    expect(normalizeFmeaStep({ id: "s1", step_no: 2, step_name: "Chuẩn bị người bệnh", notes: "Xác nhận danh tính" })).toEqual({
      id: "s1",
      order: 2,
      label: "Chuẩn bị người bệnh",
      description: "Xác nhận danh tính",
    });
  });

  it("calculates RPN only when all S/O/D scores are valid", () => {
    expect(calculateFmeaRpn(4, 5, 3)).toBe(60);
    expect(calculateFmeaRpn(4, "", 3)).toBeNull();
    expect(validFmeaScore(11)).toBeNull();
  });

  it("normalizes failure mode and falls back to calculated RPN", () => {
    const mode = normalizeFmeaFailureMode({
      id: "m1",
      process_step_id: "s1",
      failure_mode_description: "Nhầm người bệnh",
      potential_effect: "Can thiệp sai",
      potential_cause: "Không đối chiếu",
      current_controls: "Hai định danh",
      severity_score: 5,
      occurrence_score: 2,
      detection_score: 4,
      is_high_priority: true,
    });
    expect(mode.label).toBe("Nhầm người bệnh");
    expect(mode.rpn).toBe(40);
    expect(mode.is_high_priority).toBe(true);
  });

  it("normalizes Vietnamese labels for duplicate checks", () => {
    expect(normalizedFmeaText("  Kiểm tra   hồ sơ ")).toBe("kiểm tra hồ sơ");
  });
});
