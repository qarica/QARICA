import { describe, expect, it } from "vitest";
import { actionCreatePermissions, canCreateLinkedAction } from "./source-action-policy";

describe("linked Action permission boundaries", () => {
  it("keeps PROGRAM Actions on the dedicated plan workflow", () => {
    expect(actionCreatePermissions("PROGRAM")).toEqual([]);
    expect(canCreateLinkedAction(["plans.manage"], "PROGRAM")).toBe(false);
  });

  it("does not let plans.manage create generic Actions from Finding/CAPA/Risk/Incident", () => {
    for (const type of ["FINDING", "CAPA", "RISK", "INCIDENT"]) {
      expect(canCreateLinkedAction(["plans.manage"], type)).toBe(false);
    }
  });

  it("keeps Inspection compatible with inspection or plan managers", () => {
    expect(canCreateLinkedAction(["inspections.manage"], "INSPECTION")).toBe(true);
    expect(canCreateLinkedAction(["plans.manage"], "INSPECTION")).toBe(true);
  });

  it("requires the source module permission for specialized workflows", () => {
    expect(canCreateLinkedAction(["findings.manage"], "FINDING")).toBe(true);
    expect(canCreateLinkedAction(["capa.manage"], "CAPA")).toBe(true);
    expect(canCreateLinkedAction(["risk.manage"], "RISK")).toBe(true);
    expect(canCreateLinkedAction(["incident.investigate"], "INCIDENT")).toBe(true);
  });
});
