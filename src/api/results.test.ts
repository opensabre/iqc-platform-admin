import { describe, expect, it, vi } from "vitest";
import { getResultHierarchy, normalizeResultHierarchy, type ResultHierarchy } from "./results";

import http from "./http";
vi.mock("./http", () => ({ default:{get:vi.fn()} }));

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

it("queries the selected historical execution without dropping its identity", async () => {
  vi.mocked(http.get).mockResolvedValue({data:undefined});
  await getResultHierarchy("t1","c1","attempt-1");
  expect(http.get).toHaveBeenLastCalledWith("/iqc/tasks/t1/conversations/c1/result-hierarchy",{params:{executionId:"attempt-1"}});
});
