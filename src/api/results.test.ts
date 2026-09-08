import { describe, expect, it } from "vitest";
import { normalizeResultHierarchy, type ResultHierarchy } from "./results";

describe("normalizeResultHierarchy", () => {
  it("unwraps legacy stringified result responses", () => {
    const hierarchy: ResultHierarchy = {
      conversation: { id: "conversation-1", resultStatus: "HIT", score: 80, riskLevel: "HIGH", deduction: 20, reason: "命中", aggregationMode: "ALL" },
      rules: [],
      evidenceByRuleResult: {},
    };

    expect(normalizeResultHierarchy(JSON.stringify({ code: "000000", data: hierarchy }))).toEqual(hierarchy);
  });

  it("turns legacy stringified null responses into undefined", () => {
    expect(normalizeResultHierarchy(JSON.stringify({ code: "000000" }))).toBeUndefined();
  });
});
