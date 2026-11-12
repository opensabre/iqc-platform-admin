import { describe, expect, it } from "vitest";
import { buildResultPolicy, validMappedValue, type ResultPolicyDraft } from "./task-result-policy";
import type { TaskEngineConfiguration } from "@/api/tasks";
import type { LabelDetail } from "@/api/labels";

const config: TaskEngineConfiguration = { schemaVersion: "iqc-task-processing-v1",
  inspection: { engines: ["first", "second"].map(id => ({ id, type: "REGEX", parameters: { targetId: "check", ruleId: "rule" } })) },
  labeling: { engines: [{ id: "label-engine", type: "DLS", parameters: { targetId: "label", ruleId: "dls" } }] } };
const labels = { label: { label: { id: "label", status: "PUBLISHED" }, values: [{ valueCode: "flag", valueType: "BOOLEAN" }], bindings: [] } } as unknown as Record<string, LabelDetail>;
function draft(): ResultPolicyDraft {
  return { mode: "DEDUCTION", baseScore: 100, passingScore: 80,
    inspection: { check: { points: 10, veto: false, aggregation: "REQUIRE_AGREEMENT", engines: {
      first: { onHit: "FAIL", onMiss: "PASS" }, second: { onHit: "PASS", onMiss: "FAIL" } } } },
    labeling: { label: { valueCode: "flag", veto: false, aggregation: "REQUIRE_AGREEMENT", engines: { "label-engine": { onHit: false, onMiss: null } } } } };
}
describe("task result policy", () => {
  it("keeps every engine mapping but creates only one score item per target and preserves false/unknown label values", () => {
    const result = buildResultPolicy(config, draft(), labels);
    expect(result.errors).toEqual([]);
    expect(result.configuration?.inspection?.scoring.items).toEqual([{ itemCode: "check", points: 10, veto: false }]);
    expect(result.configuration?.inspection?.checks[0]?.engines).toHaveLength(2);
    expect(result.configuration?.labeling[0]?.engines).toEqual([{ engineInstanceId: "label-engine", onHit: false, onMiss: null }]);
  });
  it("does not infer score, aggregation or mappings, and never emits an incomplete request", () => {
    const empty: ResultPolicyDraft = { inspection: {}, labeling: {} };
    const result = buildResultPolicy(config, empty, labels);
    expect(result.configuration).toBeUndefined();
    expect(result.errors.join(" ")).toContain("评分方式");
    expect(result.errors.join(" ")).toContain("汇总规则");
    const value = draft(); delete value.labeling.label!.engines["label-engine"]!.onMiss;
    expect(buildResultPolicy(config, value, labels).configuration).toBeUndefined();
  });
  it("drops disabled operations and removed engines without resetting retained mappings on reorder", () => {
    const value = draft();
    const changed = { ...config, inspection: { engines: [config.inspection!.engines[1]!] }, labeling: undefined };
    const result = buildResultPolicy(changed, value, labels).configuration!;
    expect(result.labeling).toEqual([]);
    expect(result.inspection!.checks[0]!.engines).toEqual([{ engineInstanceId: "second", onHit: "PASS", onMiss: "FAIL" }]);
    expect(value.inspection.check!.engines.first).toBeDefined();
  });
  it("requires a unique published label definition and checks actual value types", () => {
    const value = draft(); value.labeling.label!.engines["label-engine"]!.onHit = "false";
    expect(buildResultPolicy(config, value, labels).configuration).toBeUndefined();
    const unpublished = structuredClone(labels); unpublished.label!.label.status = "DRAFT";
    expect(buildResultPolicy(config, draft(), unpublished).configuration).toBeUndefined();
  });
  it("validates numeric limits, real dates and explicit unknown independently of truthiness", () => {
    expect(validMappedValue("BOOLEAN", false)).toBe(true);
    expect(validMappedValue("BOOLEAN", undefined)).toBe(false);
    expect(validMappedValue("BOOLEAN", null)).toBe(true);
    expect(validMappedValue("DATE", "2026-02-30")).toBe(false);
    expect(validMappedValue("DATE", "2028-02-29")).toBe(true);
    expect(validMappedValue("MONTH", 0)).toBe(false);
    expect(validMappedValue("MONTH", 12)).toBe(true);
    expect(validMappedValue("PERCENTAGE", 100.1)).toBe(false);
    const value = draft(); value.passingScore = 101;
    expect(buildResultPolicy(config, value, labels).configuration).toBeUndefined();
  });
});
