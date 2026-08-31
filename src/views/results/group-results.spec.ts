import { describe, expect, it } from "vitest";
import type { InspectionResult } from "@/api/results";
import { groupResultsByTaskAndConversation } from "./group-results";

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
