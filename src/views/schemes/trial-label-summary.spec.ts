import { describe, expect, it } from "vitest";
import type { LabelResult } from "@/api/results";
import type { InspectionTask } from "@/api/tasks";
import { summarizeTrialLabels } from "./trial-label-summary";

const task = {
  id: "trial", conversationIdsJson: '["c1","c2"]',
  labelScopeSnapshotJson: JSON.stringify({ schemaVersion: "2.0", labels: [
    { id: "house", versionNo: 2, values: [{ valueCode: "owns" }] },
  ] }),
} as InspectionTask;
function row(conversationId: string, state: "KNOWN" | "UNKNOWN" | "CONFLICT" | "ERROR"): LabelResult {
  return { id: `${conversationId}-${state}`, conversationId, labelId: "house", labelName: "有房",
    labelVersionNo: 2, valueCode: "owns", generationSource: "RULE", status: state,
    valueJson: JSON.stringify({ schemaVersion: "iqc-label-result-v2", status: state,
      candidates: [], reasons: [], ...(state === "KNOWN" ? { value: false } : {}) }),
  };
}
describe("joint trial label summary", () => {
  it("compares frozen value coverage and keeps explicit states separate", () => {
    const result = summarizeTrialLabels(task, [row("c1", "UNKNOWN"), row("c2", "ERROR")]);
    expect(result).toEqual({ expected: 2, received: 2,
      counts: { KNOWN: 0, UNKNOWN: 1, CONFLICT: 0, ERROR: 1 }, complete: true, invalid: false });
  });
  it("does not call partial, duplicate or out-of-scope rows complete", () => {
    expect(summarizeTrialLabels(task, [row("c1", "UNKNOWN")]).complete).toBe(false);
    expect(summarizeTrialLabels(task, [row("c1", "UNKNOWN"), row("c1", "UNKNOWN")]).invalid).toBe(true);
    expect(summarizeTrialLabels(task, [row("c1", "UNKNOWN"), row("c3", "UNKNOWN")]).invalid).toBe(true);
  });
  it("does not trust malformed frozen scope or a legacy result as joint coverage", () => {
    expect(summarizeTrialLabels({ ...task, labelScopeSnapshotJson: "{" }, []).invalid).toBe(true);
    const legacy = { ...row("c1", "UNKNOWN"), status: "HIT" as const, valueJson: "{}" };
    expect(summarizeTrialLabels(task, [legacy, row("c2", "UNKNOWN")]).invalid).toBe(true);
  });
  it("does not call malformed rows complete even when all frozen keys are present", () => {
    const malformed = { ...row("c1", "ERROR"), valueJson: '{"schemaVersion":"iqc-label-result-v2","status":"ERROR"}' };
    const summary = summarizeTrialLabels(task, [malformed, row("c2", "UNKNOWN")]);
    expect(summary).toMatchObject({ expected: 2, received: 2, complete: false, invalid: true });
    expect(summary.counts.ERROR).toBe(1);
    const mismatched = { ...row("c1", "UNKNOWN"), status: "KNOWN" as const };
    expect(summarizeTrialLabels(task, [mismatched, row("c2", "UNKNOWN")]).invalid).toBe(true);
  });
});
