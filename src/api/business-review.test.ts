import { describe, it, expect, vi } from "vitest";
import http from "./http";
import { getBusinessQualityReport, getQualityReport, listBusinessReviews, listBusinessReviewQueue, requestBusinessReview, decideBusinessReview, requestReview } from "./quality";
vi.mock("./http", () => ({ default: { get: vi.fn().mockResolvedValue({ data: [] }), post: vi.fn().mockResolvedValue({ data: {} }) } }));

describe("business review API contract", () => {
  it("requests bounded business statistics without altering the legacy report", async () => {
    await getBusinessQualityReport(["a", "b"]);
    expect(http.get).toHaveBeenLastCalledWith("/iqc/quality-operations/report", { params: { view: "BUSINESS", taskIds: "a,b" } });
    await getQualityReport();
    expect(http.get).toHaveBeenLastCalledWith("/iqc/quality-operations/report");
  });
  it("reuses review routes with explicit business discriminator and revision", async () => {
    await listBusinessReviews("canonical");
    expect(http.get).toHaveBeenLastCalledWith("/iqc/quality-operations/reviews", { params: { targetType: "BUSINESS", resultId: "canonical" } });
    await requestBusinessReview("canonical", { expectedRevision: 0, requestId: "stable-key", comment: "原因" });
    expect(http.post).toHaveBeenLastCalledWith("/iqc/quality-operations/results/canonical/reviews", { targetType: "BUSINESS", expectedRevision: 0, requestId: "stable-key", comment: "原因" });
    await decideBusinessReview("review", { expectedRevision: 1, decision: "REJECTED", comment: "退回", items: [] });
    expect(http.post).toHaveBeenLastCalledWith("/iqc/quality-operations/reviews/review/decision", { targetType: "BUSINESS", expectedRevision: 1, decision: "REJECTED", comment: "退回", items: [] });
  });
  it("keeps the old message request unchanged", async () => {
    await requestReview("message", "原因");
    expect(http.post).toHaveBeenLastCalledWith("/iqc/quality-operations/results/message/reviews", { comment: "原因" });
  });
  it("requests the explicit paginated business queue without replacing history", async () => {
    await listBusinessReviewQueue({ status: "PENDING", current: 2, size: 20 });
    expect(http.get).toHaveBeenLastCalledWith("/iqc/quality-operations/reviews", { params: {
      targetType: "BUSINESS", view: "QUEUE", status: "PENDING", current: 2, size: 20
    } });
  });
});
