import { beforeEach, describe, expect, it, vi } from "vitest";
import http from "./http";
import { createTask, previewTaskSelection, type CreateTaskRequest } from "./tasks";

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

// Selection simulation is read-only and must not silently create an old-format sampled task.
describe("task selection preview", () => {
  it("sends the selection definition to the preview endpoint", async () => {
    const definition = { mode: "RANDOM" as const, filter: { channel: "WEB" }, sampleSize: 30 };
    await previewTaskSelection(definition, 2, 10);
    expect(http.post).toHaveBeenLastCalledWith("/iqc/conversations/selection-preview", definition, { params: { current: 2, size: 10 } });
  });
});

describe("execution-time selection creation", () => {
  it("submits conditions without a fixed list, legacy task type or preview seed", async () => {
    const request: CreateTaskRequest = { name: "执行时抽样", concurrencyLimit: 1,
      dataSelection: { mode: "RANDOM", filter: { channel: "WEB" }, sampleSize: 100 },
      ruleIds: ["r1"], executionMode: "RULE_ONLY" };
    await createTask(request);
    expect(http.post).toHaveBeenLastCalledWith("/iqc/tasks", request);
    expect(request).not.toHaveProperty("taskType");
    expect(request).not.toHaveProperty("conversationIds");
    expect(request.dataSelection).not.toHaveProperty("sampleSeed");
  });
});
