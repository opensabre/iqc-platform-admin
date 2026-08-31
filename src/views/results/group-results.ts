import type { ConversationResultSummary, InspectionResult } from "@/api/results";

/** A result row belongs to one inspection run of one conversation. */
export interface TaskConversationResultSummary extends ConversationResultSummary {
  taskId: string;
  rowKey: string;
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
    return {
      rowKey,
      taskId: first.taskId,
      conversationId: first.conversationId || first.id,
      sourceFileName: items.find((item) => item.sourceFileName)?.sourceFileName,
      messageCount: items.length,
      resultCount: items.length,
      averageScore:
        items.reduce((sum, item) => sum + (item.score || 0), 0) /
        Math.max(items.length, 1),
      hitCount: items.filter((item) => item.resultStatus === "HIT").length,
      highRiskCount: items.filter((item) => item.riskLevel === "HIGH").length,
      errorCount: items.filter((item) => item.resultStatus?.endsWith("ERROR"))
        .length,
    };
  });
}
