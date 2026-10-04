import { describe, expect, it } from "vitest";
import type { InspectionResult } from "@/api/results";
import { businessConversationRow, groupResultsByTaskAndConversation } from "./group-results";

function result(id: string, taskId: string, status: string): InspectionResult {
  return {
    id,
    taskId,
    conversationId: "conversation-1",
    messageId: `message-${id}`,
    speakerRole: "agent",
    resultStatus: status,
    score: status === "HIT" ? 80 : 100,
    reason: "test",
  };
}

describe("groupResultsByTaskAndConversation", () => {
  it("uses canonical item counts and preserves zero scores without regrouping business rows", () => {
    const row = businessConversationRow({id:"current",taskId:"t",taskName:"电话销售质检",conversationId:"c",scoreStatus:"FINAL",
      finalScore:0,itemCount:3,failureCount:2,errorCount:1,riskLevel:"HIGH"});
    expect(row).toMatchObject({taskName:"电话销售质检",sourceResultId:"current",averageScore:0,resultCount:3,hitCount:2,errorCount:1});
    expect(businessConversationRow({id:"label",taskId:"t",conversationId:"c",scoreStatus:"NOT_APPLICABLE",
      finalScore:100,itemCount:0,failureCount:0,errorCount:0}).averageScore).toBeNull();
  });
  it("does not turn unscored detector observations into zero scores", () => {
    const observation = { ...result("1", "task-v2", "HIT"), score: null };
    expect(groupResultsByTaskAndConversation([observation])[0].averageScore).toBeNull();
  });
  it("lists repeated inspections of one conversation separately by task", () => {
    const rows = groupResultsByTaskAndConversation([
      result("1", "task-a", "HIT"),
      result("2", "task-a", "NOT_HIT"),
      result("3", "task-b", "HIT"),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.taskId)).toEqual(["task-a", "task-b"]);
    expect(rows[0]).toMatchObject({ resultCount: 2, hitCount: 1 });
    expect(rows[1]).toMatchObject({ resultCount: 1, hitCount: 1 });
  });
});
