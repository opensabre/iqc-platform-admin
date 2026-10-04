import { describe, expect, it } from "vitest";
import type { LabelResult } from "@/api/results";
import { countConversationLabelStates, presentEffectiveLabel, presentLabel } from "./label-results";

const candidate = { value: false, sourceRuleResultId: "rr1", evidence: [{ messageId: "m1", text: "我没有房子" }] };
function row(status: LabelResult["status"] = "KNOWN", overrides: Record<string, unknown> = {}): LabelResult {
  return { id: "id", conversationId: "c1", labelId: "house", labelName: "有房", labelVersionNo: 1,
    generationSource: "RULE", status, valueJson: JSON.stringify({ schemaVersion: "iqc-label-result-v2", status,
      value: false, subjectRole: "customer", candidates: [candidate], reasons: [], ...overrides }) };
}
describe("label result presentation", () => {
  it("keeps machine and human values separate, including false and newer pending rounds", () => {
    const machine = row("UNKNOWN", { candidates: [], reasons: ["NOT_MENTIONED"] });
    expect(presentEffectiveLabel(machine)).toBe("未人工修订");
    expect(presentEffectiveLabel({ ...machine, reviewOverlay: { latestRevision: 1, latestStatus: "PENDING", evidenceMessageIds: [] } }))
      .toBe("待复核（暂无人工值）");
    const reviewed = { ...machine, reviewOverlay: { latestRevision: 2, latestStatus: "PENDING", effectiveReviewId: "r1",
      effectiveRevision: 1, effectiveStatus: "KNOWN" as const, effectiveValue: false, evidenceMessageIds: ["m1"] } };
    expect(presentLabel(reviewed).state).toBe("UNKNOWN");
    expect(presentEffectiveLabel(reviewed)).toBe("第 1 轮：否（新一轮待复核）");
    expect(presentEffectiveLabel({ ...reviewed, reviewOverlay: { ...reviewed.reviewOverlay, effectiveStatus: "UNKNOWN", effectiveValue: null } }))
      .toBe("第 1 轮：未知（新一轮待复核）");
  });
  it("preserves explicit false as a known denial with subject and evidence", () => {
    expect(presentLabel(row())).toMatchObject({ state: "KNOWN", title: "确定", value: "否", subject: "客户",
      candidates: [{ value: "否", source: "rr1", evidence: [{ messageId: "m1", text: "我没有房子" }] }] });
  });
  it("does not render unknown as false or a definitive value", () => {
    expect(presentLabel(row("UNKNOWN", { candidates: [], reasons: ["NOT_MENTIONED"] })))
      .toMatchObject({ state: "UNKNOWN", value: "—", reasons: ["未提及可靠事实"] });
  });
  it("shows the existing user role as customer and separates missing speaker from no mention", () => {
    expect(presentLabel(row("KNOWN", { subjectRole: "user" })).subject).toBe("客户");
    expect(presentLabel(row("UNKNOWN", { subjectRole: "user", candidates: [], reasons: ["NO_TARGET_SPEAKER", "UNMAPPED_SPEAKER_ROLE"] })))
      .toMatchObject({ state: "UNKNOWN", subject: "客户", value: "—",
        reasons: ["本会话没有可确认的目标说话人", "存在未识别的说话人角色，无法确认识别覆盖范围"] });
  });
  it("retains all conflicting candidates without choosing a final value", () => {
    const result = presentLabel(row("CONFLICT", { candidates: [candidate, { ...candidate, value: true, sourceRuleResultId: "rr2" }] }));
    expect(result.value).toBe("—"); expect(result.candidates.map(value => value.value)).toEqual(["否", "是"]);
    expect(result.candidates.map(value => value.source)).toEqual(["rr1", "rr2"]);
  });
  it("keeps valid candidates inspectable on detection error without claiming certainty", () => {
    expect(presentLabel(row("ERROR", { reasons: ["DETECTION_INCOMPLETE"] })))
      .toMatchObject({ state: "ERROR", valid: true, value: "—", reasons: ["检测未完整完成"], candidates: [{ value: "否" }] });
  });
  it("retains zero and nonboolean scalar values", () => {
    expect(presentLabel(row("KNOWN", { value: 0 })).value).toBe("0");
    expect(presentLabel(row("KNOWN", { value: "2026-09-23" })).value).toBe("2026-09-23");
  });
  it("labels old rows as compatible hits without inventing coverage", () => {
    expect(presentLabel({ ...row(), status: undefined, valueJson: '{"value":false}' }))
      .toMatchObject({ title: "命中（兼容）", value: "否" });
    expect(presentLabel({ ...row(), status: undefined, valueJson: undefined }).value).toBe("—");
  });
  it("rejects malformed payloads, inconsistent states and missing evidence", () => {
    for (const invalid of [
      { ...row(), valueJson: "broken" }, { ...row(), valueJson: "null" },
      row("KNOWN", { status: "HIT" }), row("KNOWN", { value: null }), row("KNOWN", { candidates: [] }),
      row("KNOWN", { candidates: [{ ...candidate, evidence: [] }] }),
      row("KNOWN", { candidates: [{ ...candidate, evidence: [{ messageId: "", text: "quote" }] }] }),
      { ...row(), valueJson: "{}" },
    ]) expect(presentLabel(invalid)).toMatchObject({ state: "ERROR", valid: false, value: "—", candidates: [] });
  });
  it("preserves quote text for escaped Vue interpolation rather than interpreting markup", () => {
    const text = '<img src=x onerror="alert(1)">';
    expect(presentLabel(row("KNOWN", { candidates: [{ ...candidate, evidence: [{ messageId: "m1", text }] }] }))
      .candidates[0].evidence[0].text).toBe(text);
  });
  it("counts returned states per conversation without inventing missing or negative values", () => {
    const counts = countConversationLabelStates([
      row(),
      { ...row("UNKNOWN", { candidates: [], reasons: ["NOT_MENTIONED"] }), id: "unknown" },
      { ...row("CONFLICT", { candidates: [candidate, { ...candidate, value: true, sourceRuleResultId: "rr2" }] }), id: "conflict" },
      { ...row(), id: "broken", valueJson: "broken" },
      { ...row(), id: "old", status: undefined, valueJson: '{"value":true}' },
      { ...row(), id: "other", conversationId: "c2" },
    ]);
    expect(counts.get("c1")).toEqual({ KNOWN: 1, UNKNOWN: 1, CONFLICT: 1, ERROR: 1, HIT: 1 });
    expect(counts.get("c2")).toEqual({ KNOWN: 1 });
    expect(counts.has("c3")).toBe(false);
  });
});
