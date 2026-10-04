import { describe, expect, it, vi } from "vitest";
import http from "./http";
import { exportResults, exportSchemeResults, exportBusinessReview, exportTaskBusinessReviews } from "./results";

vi.mock("./http", () => ({ default: { get: vi.fn().mockResolvedValue({ data: new Blob() }) } }));

describe("result export scopes", () => {
  it("exports task reviews as a separate blob view without a round selector", async () => {
    await exportTaskBusinessReviews("task-1");
    expect(http.get).toHaveBeenLastCalledWith("/iqc/results/export", {
      params: { taskId: "task-1", view: "BUSINESS_REVIEW_TASK" }, responseType: "blob"
    });
  });
  it("pins review export to an explicit round without task filters", async () => {
    await exportBusinessReview("round-1");
    expect(http.get).toHaveBeenLastCalledWith("/iqc/results/export", {
      params: { reviewId: "round-1", view: "BUSINESS_REVIEW" }, responseType: "blob"
    });
  });
  it("exports business results with only the whole-task selector", async () => {
    await exportSchemeResults("task-1");
    expect(http.get).toHaveBeenLastCalledWith("/iqc/results/export", {
      params: { taskId: "task-1", view: "SCHEME" }, responseType: "blob"
    });
  });
  it("preserves legacy message filters", async () => {
    await exportResults({ taskId: "old-task", status: "HIT" });
    expect(http.get).toHaveBeenLastCalledWith("/iqc/results/export", {
      params: { taskId: "old-task", status: "HIT" }, responseType: "blob"
    });
  });
});
