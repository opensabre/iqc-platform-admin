import { beforeEach, describe, expect, it, vi } from "vitest";
import http from "./http";
import { createTask, type CreateTaskRequest } from "./tasks";

vi.mock("./http", () => ({ default: { post: vi.fn() } }));

describe("task-owned execution strategy", () => {
  beforeEach(() => vi.mocked(http.post).mockResolvedValue({ data: { id: "task-1" } }));

  it("submits a rule-only task without an Agent", async () => {
    const request: CreateTaskRequest = {
      taskType: "BATCH", conversationIds: ["c1"], ruleIds: ["r1"],
      executionMode: "RULE_ONLY", concurrencyLimit: 1,
    };
    expect(await createTask(request)).toEqual({ id: "task-1" });
    expect(http.post).toHaveBeenLastCalledWith("/iqc/tasks", request);
    expect(request).not.toHaveProperty("agentId");
  });

  it("keeps the selected route on the task instead of altering Agent configuration", async () => {
    const request: CreateTaskRequest = {
      taskType: "BATCH", conversationIds: ["c1"], ruleIds: ["r1"],
      agentId: "a1", executionMode: "INDEPENDENT", concurrencyLimit: 1,
    };
    await createTask(request);
    expect(http.post).toHaveBeenLastCalledWith("/iqc/tasks", request);
  });
});
