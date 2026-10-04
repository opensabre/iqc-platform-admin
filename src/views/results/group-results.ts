import type { BusinessConversationResult, ConversationResultSummary, InspectionResult } from "@/api/results";

/** A result row belongs to one inspection run of one conversation. */
export interface TaskConversationResultSummary extends ConversationResultSummary {
  taskId: string;
  taskName?: string;
  rowKey: string;
}

/** Server paging already contains one current result per task/conversation; never regroup these rows. */
export function businessConversationRow(result:BusinessConversationResult) {
  return {rowKey:`${result.taskId}:${result.conversationId}`, taskId:result.taskId, taskName:result.taskName,
    conversationId:result.conversationId, sourceFileName:result.sourceFileName, sourceResultId:result.id,
    messageCount:0, resultCount:result.itemCount, averageScore:result.scoreStatus === "FINAL" ? result.finalScore : null,
    scoreStatus:result.scoreStatus, hitCount:result.failureCount, highRiskCount:result.riskLevel === "HIGH" ? 1 : 0,
    errorCount:result.errorCount};
}

/** Keeps repeated inspections of the same conversation separated by task. */
export function groupResultsByTaskAndConversation(
  results: InspectionResult[]
): TaskConversationResultSummary[] {
  const grouped = new Map<string, InspectionResult[]>();
  results.forEach((item) => {
    const key = `${item.taskId}:${item.conversationId || item.id}`;
    grouped.set(key, [...(grouped.get(key) || []), item]);
  });

  return [...grouped.entries()].map(([rowKey, items]) => {
    const first = items[0];
    const scored = items.filter((item) => item.score != null);
    return {
      rowKey,
      taskId: first.taskId,
      conversationId: first.conversationId || first.id,
      sourceFileName: items.find((item) => item.sourceFileName)?.sourceFileName,
      messageCount: items.length,
      resultCount: items.length,
      averageScore:
        scored.length ? scored.reduce((sum, item) => sum + item.score!, 0) / scored.length : null,
      hitCount: items.filter((item) => item.resultStatus === "HIT").length,
      highRiskCount: items.filter((item) => item.riskLevel === "HIGH").length,
      errorCount: items.filter((item) => item.resultStatus?.endsWith("ERROR"))
        .length,
    };
  });
}
