import { describe, expect, it } from "vitest";
import { capaEffectivenessGate, externalComparisonCloseGate, findingSubmitGate, incidentReadyToCloseGate, inspectionCloseGate } from "./quality-gates";

describe("quality workflow gates", () => {
  it("blocks Finding submit without actions", () => {
    expect(findingSubmitGate({ actionCount: 0, unfinishedActionCount: 0, evidenceCount: 1 }).ok).toBe(false);
  });

  it("blocks Finding submit while actions are unfinished", () => {
    expect(findingSubmitGate({ actionCount: 2, unfinishedActionCount: 1, evidenceCount: 1 })).toEqual({ ok: false, error: "Còn 1 Action chưa hoàn thành." });
  });

  it("allows Finding submit only with completed actions and evidence", () => {
    expect(findingSubmitGate({ actionCount: 2, unfinishedActionCount: 0, evidenceCount: 1 })).toEqual({ ok: true });
  });

  it("blocks CAPA effectiveness review without evidence", () => {
    expect(capaEffectivenessGate({ incompleteActionCount: 0, evidenceCount: 0 }).ok).toBe(false);
  });

  it("allows CAPA effectiveness review after actions and evidence are complete", () => {
    expect(capaEffectivenessGate({ incompleteActionCount: 0, evidenceCount: 2 })).toEqual({ ok: true });
  });

  it("blocks external assessment close while gap Findings remain open", () => {
    expect(externalComparisonCloseGate({ hasComparison: true, evidenceCount: 1, openFindingCount: 2 })).toEqual({ ok: false, error: "Còn 2 Finding chênh lệch chưa recheck/đóng." });
  });

  it("allows external assessment close when comparison, evidence and Findings are complete", () => {
    expect(externalComparisonCloseGate({ hasComparison: true, evidenceCount: 1, openFindingCount: 0 })).toEqual({ ok: true });
  });

  it("blocks inspection close without conclusion", () => {
    expect(inspectionCloseGate({ incompleteActionCount: 0, evidenceCount: 1, hasConclusion: false }).ok).toBe(false);
  });

  it("allows inspection close only after countdown actions, evidence and conclusion", () => {
    expect(inspectionCloseGate({ incompleteActionCount: 0, evidenceCount: 1, hasConclusion: true })).toEqual({ ok: true });
  });

  it("blocks incident closure readiness without an Action", () => {
    expect(incidentReadyToCloseGate({ actionCount: 0, incompleteActionCount: 0, evidenceCount: 1 }).ok).toBe(false);
  });

  it("blocks incident closure readiness while an Action is unfinished", () => {
    expect(incidentReadyToCloseGate({ actionCount: 2, incompleteActionCount: 1, evidenceCount: 1 })).toEqual({ ok: false, error: "Còn 1 Action chưa hoàn thành." });
  });

  it("allows incident closure readiness only with completed Actions and evidence", () => {
    expect(incidentReadyToCloseGate({ actionCount: 2, incompleteActionCount: 0, evidenceCount: 1 })).toEqual({ ok: true });
  });
});
