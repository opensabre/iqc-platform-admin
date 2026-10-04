import { describe, expect, it, vi } from "vitest";
import http from "./http";
import { listLabelValueReviews, requestLabelValueReview, decideLabelValueReview, listLabelReviewQueue } from "./quality";
vi.mock("./http", () => ({ default: { get: vi.fn().mockResolvedValue({ data: [] }), post: vi.fn().mockResolvedValue({ data: {} }) } }));

describe("label value review API contract", () => {
  it("requests a scoped, bounded label review worklist", async () => {
    await listLabelReviewQueue({ status: "PENDING", taskId: "task", current: 2, size: 10 });
    expect(http.get).toHaveBeenLastCalledWith("/iqc/quality-operations/label-reviews",
      { params: { status: "PENDING", taskId: "task", current: 2, size: 10 } });
  });
  it("uses the label result identity and preserves the exact revision and correction payload", async () => {
    await listLabelValueReviews("label-result");
    expect(http.get).toHaveBeenLastCalledWith("/iqc/quality-operations/label-results/label-result/reviews");
    await requestLabelValueReview("label-result", { expectedRevision: 0, requestId: "request-token-0001", comment: "申请" });
    expect(http.post).toHaveBeenLastCalledWith("/iqc/quality-operations/label-results/label-result/reviews",
      { expectedRevision: 0, requestId: "request-token-0001", comment: "申请" });
    const decision = { status: "KNOWN" as const, value: false, evidenceMessageIds: ["m1"] };
    await decideLabelValueReview("round", { expectedRevision: 1, decision: "COMPLETED", labelDecision: decision, comment: "明确否认" });
    expect(http.post).toHaveBeenLastCalledWith("/iqc/quality-operations/label-reviews/round/decision",
      { expectedRevision: 1, decision: "COMPLETED", labelDecision: decision, comment: "明确否认" });
  });
});
