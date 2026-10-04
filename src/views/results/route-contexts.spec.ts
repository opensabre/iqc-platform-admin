import { describe, expect, it } from "vitest";
import type { HierarchicalRuleResult } from "@/api/results";
import { routeContextRows } from "./route-contexts";
function rule(contexts: unknown[]): HierarchicalRuleResult {
  return { id: "row", ruleId: "r", ruleType: "LLM", evaluationScope: "CONTEXT", resultStatus: "HIT",
    score: null, riskLevel: "LOW", deduction: 0, reason: "汇总", findingJson: JSON.stringify({ schemaVersion: "iqc-rule-contexts-v1", contexts }) };
}
const stage = { contextKey: "a", phase: "REVIEW", inputScope: "CONVERSATION", executed: true, status: "NOT_HIT" };
describe("route context trace", () => {
  it("explains shared contexts using frozen business names and keeps terminal roles separate", () => {
    const result = rule([stage]);
    const payload = JSON.parse(result.findingJson!);
    payload.itemRoutes = [{ itemCode: "fees", finalContextKey: "a", stageContextKey: "pre" },
      { itemCode: "promise", finalContextKey: "verify", stageContextKey: "a" }];
    result.findingJson = JSON.stringify(payload);
    expect(routeContextRows([result], [{ itemCode: "fees", name: "费用告知" }])[0].consumers)
      .toBe("费用告知（最终裁决）；promise（中间阶段）");
    expect(payload.itemRoutes[0].finalContextKey).toBe("a");
  });
  it("shows stage outcomes independently of aggregate hits and distinguishes skipped stages", () => {
    expect(routeContextRows([rule([stage, { ...stage, contextKey: "b", executed: false, status: "NOT_EVALUATED" }])]))
      .toEqual([expect.objectContaining({ phase: "LLM 复核", status: "未命中", execution: "已执行" }),
        expect.objectContaining({ status: "未评估", execution: "未执行／跳过" })]);
  });
  it("shows frozen applicability contexts as item conditions", () => {
    const gate = { contextKey: "gate", phase: "APPLICABILITY", inputScope: "MESSAGE", executed: true, status: "NOT_HIT" };
    const result = rule([gate]);
    const payload = JSON.parse(result.findingJson!);
    payload.itemRoutes = [{ itemCode: "fees", applicabilityContextKey: "gate", finalContextKey: "final" }];
    result.findingJson = JSON.stringify(payload);
    expect(routeContextRows([result], [{ itemCode: "fees", name: "费用告知" }])[0]).toMatchObject({
      phase: "适用条件", consumers: "费用告知（适用条件）", status: "未命中", execution: "已执行"
    });
  });
  it("shows per-stage vote counts without describing agreement as accuracy", () => {
    const vote = { schemaVersion: "iqc-route-round-v1", runCount: 3, hitCount: 2, missCount: 1,
      confidence: 2 / 3, status: "HIT", runs: [
        { runIndex: 1, executed: true, status: "HIT" }, { runIndex: 2, executed: true, status: "NOT_HIT" },
        { runIndex: 3, executed: true, status: "HIT" }] };
    const observed = { ...stage, status: "HIT", result: { findingJson: JSON.stringify(vote) } };
    expect(routeContextRows([rule([observed])])[0]).toMatchObject({
      execution: "3/3 轮阶段执行", rounds: "3 轮 · 命中 2 / 未命中 1 · 一致率 67%", status: "命中" });
  });
  it("does not silently interpret missing, duplicate or unknown stage data as a pass", () => {
    for (const contexts of [[], [stage, stage], [{ ...stage, status: "SUCCESS" }]])
      expect(routeContextRows([rule(contexts)])[0].status).toBe("数据缺失或格式异常");
    expect(routeContextRows([{ ...rule([stage]), findingJson: "broken" }])[0].execution).toBe("无法确认");
  });
  it("keeps legacy observations out of item route traces", () => {
    expect(routeContextRows([{ ...rule([stage]), evaluationScope: "MESSAGE" }])).toEqual([]);
  });
});
