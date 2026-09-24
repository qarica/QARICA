import { describe, expect, it } from "vitest";
import { BRADEN_SCALE, scoreRiskScale, type RiskScaleDefinition } from "./risk-score";

describe("scoreRiskScale", () => {
  it("returns null score and lists missing factors when not all factors are answered", () => {
    const result = scoreRiskScale(BRADEN_SCALE, { SENSORY_PERCEPTION: 3, MOISTURE: 4 });
    expect(result.complete).toBe(false);
    expect(result.totalScore).toBeNull();
    expect(result.band).toBeNull();
    expect(result.missingFactorCodes).toEqual(["ACTIVITY", "MOBILITY", "NUTRITION", "FRICTION_SHEAR"]);
  });

  it("treats a null or undefined factor value as missing, not as 0", () => {
    const result = scoreRiskScale(BRADEN_SCALE, {
      SENSORY_PERCEPTION: 3, MOISTURE: 3, ACTIVITY: null, MOBILITY: 3, NUTRITION: 3, FRICTION_SHEAR: 2,
    });
    expect(result.complete).toBe(false);
    expect(result.missingFactorCodes).toEqual(["ACTIVITY"]);
  });

  it("computes the worst-case Braden score (6) and classifies it as severe risk", () => {
    const result = scoreRiskScale(BRADEN_SCALE, {
      SENSORY_PERCEPTION: 1, MOISTURE: 1, ACTIVITY: 1, MOBILITY: 1, NUTRITION: 1, FRICTION_SHEAR: 1,
    });
    expect(result.totalScore).toBe(6);
    expect(result.complete).toBe(true);
    expect(result.band?.code).toBe("SEVERE");
    expect(result.band?.interventions.length).toBeGreaterThan(0);
  });

  it("computes the best-case Braden score (23) and classifies it as no current risk", () => {
    const result = scoreRiskScale(BRADEN_SCALE, {
      SENSORY_PERCEPTION: 4, MOISTURE: 4, ACTIVITY: 4, MOBILITY: 4, NUTRITION: 4, FRICTION_SHEAR: 3,
    });
    expect(result.totalScore).toBe(23);
    expect(result.band?.code).toBe("NONE");
  });

  it.each([
    [9, "SEVERE"],
    [10, "HIGH"],
    [12, "HIGH"],
    [13, "MODERATE"],
    [14, "MODERATE"],
    [15, "MILD"],
    [18, "MILD"],
    [19, "NONE"],
  ])("classifies total score %i as band %s", (target, expectedBand) => {
    // Distribute the target score across the 6 factors (min 1 each, last factor max 3) to hit an exact total.
    const base = { SENSORY_PERCEPTION: 1, MOISTURE: 1, ACTIVITY: 1, MOBILITY: 1, NUTRITION: 1, FRICTION_SHEAR: 1 };
    let remaining = target - 6;
    const caps: Record<string, number> = { SENSORY_PERCEPTION: 4, MOISTURE: 4, ACTIVITY: 4, MOBILITY: 4, NUTRITION: 4, FRICTION_SHEAR: 3 };
    const answers: Record<string, number> = { ...base };
    for (const code of Object.keys(base)) {
      const room = caps[code] - answers[code];
      const add = Math.min(room, remaining);
      answers[code] += add;
      remaining -= add;
      if (remaining <= 0) break;
    }
    const result = scoreRiskScale(BRADEN_SCALE, answers);
    expect(result.totalScore).toBe(target);
    expect(result.band?.code).toBe(expectedBand);
  });

  it("reports min/max possible score for a scale regardless of answers given", () => {
    const result = scoreRiskScale(BRADEN_SCALE, {});
    expect(result.minPossibleScore).toBe(6);
    expect(result.maxPossibleScore).toBe(23);
  });

  it("works with a custom scale definition, not just the built-in Braden scale", () => {
    const custom: RiskScaleDefinition = {
      id: "CUSTOM",
      name: "Thang điểm tuỳ chỉnh",
      sourceNote: "test",
      factors: [
        { code: "A", label: "A", options: [{ value: 0, label: "0" }, { value: 1, label: "1" }] },
        { code: "B", label: "B", options: [{ value: 0, label: "0" }, { value: 1, label: "1" }] },
      ],
      bands: [
        { code: "LOW", label: "Thấp", minScore: 0, maxScore: 0, interventions: [] },
        { code: "HIGH", label: "Cao", minScore: 1, maxScore: 2, interventions: ["Can thiệp ngay"] },
      ],
    };
    const result = scoreRiskScale(custom, { A: 1, B: 1 });
    expect(result.totalScore).toBe(2);
    expect(result.band?.code).toBe("HIGH");
  });
});
