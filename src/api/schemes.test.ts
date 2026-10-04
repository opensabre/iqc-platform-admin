import { describe, expect, it, vi } from "vitest";
import http from "./http";
import { changeSchemeAvailability, changeSchemeVersionArchive, publishScheme, trialScheme } from "./schemes";
vi.mock("./http", () => ({ default: { post: vi.fn().mockResolvedValue({ data: {} }) } }));

describe("scheme publication and availability contracts", () => {
  it("keeps legacy publication payload unchanged", async () => {
    await publishScheme("s", 2, "trial", true);
    expect(http.post).toHaveBeenLastCalledWith("/iqc/schemes/s/publish", { expectedRevision: 2, trialTaskId: "trial", resultsReviewed: true });
  });
  it("uses explicit availability actions without trial or definition overrides", async () => {
    await changeSchemeAvailability("s", 2, false);
    expect(http.post).toHaveBeenLastCalledWith("/iqc/schemes/s/publish", { expectedRevision: 2, action: "DISABLE" });
    await changeSchemeAvailability("s", 3, true);
    expect(http.post).toHaveBeenLastCalledWith("/iqc/schemes/s/publish", { expectedRevision: 3, action: "ENABLE" });
  });
  it("archives and restores a specific historical version through the publication contract", async () => {
    await changeSchemeVersionArchive("s", 4, 2, true);
    expect(http.post).toHaveBeenLastCalledWith("/iqc/schemes/s/publish", { expectedRevision: 4, action: "ARCHIVE_VERSION", versionNo: 2 });
    await changeSchemeVersionArchive("s", 5, 2, false);
    expect(http.post).toHaveBeenLastCalledWith("/iqc/schemes/s/publish", { expectedRevision: 5, action: "RESTORE_VERSION", versionNo: 2 });
  });
  it("keeps old trial payloads valid and sends a retry identity when provided", async () => {
    await trialScheme("s", 2, ["c1"]);
    expect(http.post).toHaveBeenLastCalledWith("/iqc/schemes/s/trials", { expectedRevision: 2, conversationIds: ["c1"] });
    await trialScheme("s", 2, ["c1"], "trial-request-1234567890");
    expect(http.post).toHaveBeenLastCalledWith("/iqc/schemes/s/trials", {
      expectedRevision: 2, conversationIds: ["c1"], requestId: "trial-request-1234567890" });
  });
});
