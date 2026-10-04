import { describe, expect, it } from "vitest";
import type { ReleasedSchemeVersion } from "@/api/schemes";
import { diffReleasedStandards } from "./history-diff";

function release(versionNo: number): ReleasedSchemeVersion {
  return { versionNo, contentHash: String(versionNo), snapshot: {
    name: "销售标准", code: "sales", businessScene: "电话销售", description: "原说明",
    dependencies: { executionMode: "RULE_ONLY" },
    definition: { schemaVersion: "iqc-scheme-v2", agent: null, items: [
      { itemCode: "fees", name: "费用告知", rule: { id: "rule-a", versionNo: 1 }, hitMeaning: "VIOLATION" }
    ], labels: [{ id: "loan", versionNo: 1 }],
    scoring: { version: "iqc-score-v2", mode: "DEDUCTION", baseScore: 100, passingScore: 60,
      items: [{ itemCode: "fees", points: 10, veto: false }] } }
  } };
}

describe("frozen release comparison", () => {
  it("compares frozen item route stages and scope without merging them into scoring", () => {
    const left = release(1), right = release(2);
    left.snapshot.definition.items[0].execution = { route: "RULE_THEN_LLM",
      prefilter: { id: "local", versionNo: 2 }, prefilterCoversViolation: true };
    right.snapshot.definition.items[0].execution = { route: "LLM_THEN_RULE",
      candidate: { id: "extract", versionNo: 3 }, stageInputScope: "CONVERSATION" };
    const rows = diffReleasedStandards(left, right);
    expect(rows.map(row => [row.field, row.before, row.after])).toEqual([
      ["逐项执行路线", "RULE_THEN_LLM", "LLM_THEN_RULE"],
      ["初筛规则版本", "local · V2", "—"],
      ["候选规则版本", "—", "extract · V3"],
      ["阶段 LLM 输入范围", "—", "CONVERSATION"],
      ["初筛覆盖全部违规", "是", "—"]
    ]);
    expect(diffReleasedStandards(right, left).map(row => [row.field, row.before, row.after]))
      .toEqual(rows.map(row => [row.field, row.after, row.before]));
    expect(left.snapshot.definition.items[0].execution.prefilter?.versionNo).toBe(2);
  });
  it("distinguishes an explicit direct route from historical absence", () => {
    const left = release(1), right = release(2);
    right.snapshot.definition.items[0].execution = { route: "RULE_ONLY" };
    expect(diffReleasedStandards(left, right)).toEqual([expect.objectContaining({
      field: "逐项执行路线", before: "—", after: "RULE_ONLY"
    })]);
  });
  it("distinguishes explicit message and conversation input from historical absence", () => {
    const left = release(1), right = release(2);
    right.snapshot.definition.items[0].inputScope = "CONVERSATION";
    expect(diffReleasedStandards(left, right)).toEqual([expect.objectContaining({ field: "LLM 输入范围", before: "—", after: "CONVERSATION" })]);
    left.snapshot.definition.items[0].inputScope = "MESSAGE";
    expect(diffReleasedStandards(left, right)[0]).toMatchObject({ before: "MESSAGE", after: "CONVERSATION" });
  });
  it("reports independent rule, applicability, scoring, label and route changes", () => {
    const left = release(1), right = release(2);
    right.snapshot.definition.items[0].rule.versionNo = 2;
    right.snapshot.definition.items[0].appliesWhen = { id: "stage", versionNo: 1 };
    right.snapshot.definition.scoring.items[0].points = 20;
    right.snapshot.definition.labels![0].versionNo = 2;
    right.snapshot.dependencies.executionMode = "LLM_FALLBACK";
    right.snapshot.definition.scoring.passingScore = 75;
    const rows = diffReleasedStandards(left, right);
    expect(rows.map(row => `${row.scope}/${row.field}`)).toEqual([
      "执行/推荐路线", "质检项 fees/检测规则版本", "质检项 fees/适用条件版本",
      "评分/及格线", "评分项 fees/分值", "标签 loan/版本"
    ]);
    expect(rows.find(row => row.field === "分值")).toMatchObject({ before: "10", after: "20" });
    expect(left.snapshot.definition.scoring.passingScore).toBe(60);
  });

  it("does not invent differences from hash, provenance or item order", () => {
    const left = release(1), right = release(2);
    right.snapshot.definition.items.unshift({ itemCode: "opening", name: "开场", rule: { id: "rule-b", versionNo: 1 }, hitMeaning: "COMPLIANCE" });
    expect(diffReleasedStandards(left, right)).toEqual([
      { key: "质检项 opening/项目", scope: "质检项 opening", field: "项目", before: "—", after: "开场" },
      { key: "质检项 opening/检测规则版本", scope: "质检项 opening", field: "检测规则版本", before: "—", after: "rule-b · V1" },
      { key: "质检项 opening/命中含义", scope: "质检项 opening", field: "命中含义", before: "—", after: "COMPLIANCE" }
    ]);
    right.snapshot.definition.items.shift();
    expect(diffReleasedStandards(left, right)).toEqual([]);
  });

  it("shows added scoring values including zero and false, and reverses deletions", () => {
    const left = release(1), right = release(2);
    left.snapshot.definition.scoring.items = [];
    right.snapshot.definition.scoring.items[0] = { itemCode: "fees", points: 0, veto: false };
    const rows = diffReleasedStandards(left, right);
    expect(rows.map(row => [row.field, row.before, row.after])).toEqual([
      ["是否计分", "否", "是"], ["分值", "—", "0"], ["一票否决", "—", "否"]
    ]);
    expect(diffReleasedStandards(right, left).map(row => [row.field, row.before, row.after])).toEqual(
      rows.map(row => [row.field, row.after, row.before])
    );
  });
});
