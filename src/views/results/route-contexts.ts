import type { HierarchicalRuleResult } from "@/api/results";

export interface RouteContextRow { key: string; ruleId: string; phase: string; scope: string; execution: string; status: string; rounds: string; consumers: string }

/** Read retained stage observations, never infer business verdicts from a rule-level HIT. */
export function routeContextRows(rules: HierarchicalRuleResult[], items: Array<{ itemCode: string; name: string }> = []): RouteContextRow[] {
  const names = new Map(items.map(item => [item.itemCode, item.name]));
  return rules.filter(rule => rule.evaluationScope === "CONTEXT").flatMap(rule => {
    try {
      const payload = JSON.parse(rule.findingJson || "null");
      if (payload?.schemaVersion !== "iqc-rule-contexts-v1" || !Array.isArray(payload.contexts) || !payload.contexts.length)
        throw new Error("missing contexts");
      const seen = new Set<string>();
      return payload.contexts.map((context: any) => {
        if (typeof context.contextKey !== "string" || !context.contextKey || seen.has(context.contextKey)
          || typeof context.executed !== "boolean"
          || !["DIRECT", "APPLICABILITY", "PREFILTER", "REVIEW", "CANDIDATE", "VERIFY"].includes(context.phase)
          || !["MESSAGE", "CONVERSATION"].includes(context.inputScope)
          || !["HIT", "NOT_HIT", "ERROR", "REVIEW_REQUIRED", "NOT_EVALUATED"].includes(context.status))
          throw new Error("invalid context");
        seen.add(context.contextKey);
        let rounds = "—";
        let execution = context.executed ? "已执行" : "未执行／跳过";
        if (context.result?.findingJson) {
          const vote = JSON.parse(context.result.findingJson);
          if (vote?.schemaVersion === "iqc-route-round-v1") {
            if (!Number.isInteger(vote.runCount) || vote.runCount < 2 || vote.runCount > 5
              || !Array.isArray(vote.runs) || vote.runs.length !== vote.runCount
              || typeof vote.confidence !== "number" || !Number.isFinite(vote.confidence) || vote.confidence < 0 || vote.confidence > 1
              || !vote.runs.every((run: any, index: number) => run?.runIndex === index + 1 && typeof run.executed === "boolean"
                && ["HIT", "NOT_HIT", "ERROR", "REVIEW_REQUIRED", "NOT_EVALUATED"].includes(run.status)))
              throw new Error("invalid vote details");
            const hits = vote.runs.filter((run: any) => run.status === "HIT").length;
            const misses = vote.runs.filter((run: any) => run.status === "NOT_HIT").length;
            const expectedConfidence = Math.max(hits, misses) / vote.runCount;
            if (vote.hitCount !== hits || vote.missCount !== misses || vote.status !== context.status
              || Math.abs(vote.confidence - expectedConfidence) > 0.000001)
              throw new Error("inconsistent vote details");
            const executedRuns = vote.runs.filter((run: any) => run.executed).length;
            rounds = `${vote.runCount} 轮 · 命中 ${hits} / 未命中 ${misses} · 一致率 ${Math.round(vote.confidence * 100)}%`;
            execution = `${executedRuns}/${vote.runCount} 轮阶段执行`;
          }
        }
        let consumers = "未提供项目关联";
        if (Array.isArray(payload.itemRoutes)) {
          const relevant = payload.itemRoutes.filter((route: any) => route?.applicabilityContextKey === context.contextKey
            || route?.stageContextKey === context.contextKey || route?.finalContextKey === context.contextKey);
          if (relevant.some((route: any) => typeof route.itemCode !== "string" || !route.itemCode))
            throw new Error("invalid item association");
          if (relevant.length) consumers = relevant.map((route: any) =>
            `${names.get(route.itemCode) || route.itemCode}（${route.applicabilityContextKey === context.contextKey ? "适用条件" : route.finalContextKey === context.contextKey ? "最终裁决" : "中间阶段"}）`).join("；");
        }
        return { key: `${rule.id}:${context.contextKey}`, ruleId: rule.ruleId,
          consumers,
          phase: ({ DIRECT: "直接检测", APPLICABILITY: "适用条件", PREFILTER: "规则初筛", REVIEW: "LLM 复核", CANDIDATE: "LLM 候选提取", VERIFY: "规则片段验证" } as Record<string, string>)[context.phase],
          scope: context.inputScope === "CONVERSATION" ? "完整会话" : "单条消息",
          execution,
          rounds,
          status: ({ HIT: "命中", NOT_HIT: "未命中", ERROR: "执行错误", REVIEW_REQUIRED: "待复核", NOT_EVALUATED: "未评估" } as Record<string, string>)[context.status] };
      });
    } catch {
      return [{ key: `${rule.id}:invalid`, ruleId: rule.ruleId, phase: "阶段明细不可用", scope: "—", execution: "无法确认", status: "数据缺失或格式异常", consumers: "无法确认" }];
    }
  });
}
