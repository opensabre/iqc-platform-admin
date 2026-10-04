import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import BusinessReviewPanel from "./BusinessReviewPanel.vue";
import { listBusinessReviews, requestBusinessReview, decideBusinessReview, type BusinessReview } from "@/api/quality";
import { exportBusinessReview } from "@/api/results";
import { Modal } from "ant-design-vue";

const state = vi.hoisted(() => ({ permissions: ["iqc:review:view", "iqc:review:create", "iqc:review:decide"] }));
vi.mock("@/composables/permission", () => ({ usePermission: () => ({ can: (permission: string) => state.permissions.includes(permission) }) }));
vi.mock("@/api/quality", () => ({ listBusinessReviews: vi.fn(), requestBusinessReview: vi.fn(), decideBusinessReview: vi.fn() }));
vi.mock("@/api/results", () => ({ exportBusinessReview: vi.fn() }));
vi.mock("ant-design-vue", () => ({ message: { success: vi.fn(), error: vi.fn() }, Modal: { confirm: vi.fn() } }));
let app: App, host: HTMLDivElement;
const pending: BusinessReview = { id: "review", targetType: "BUSINESS", businessResultId: "canonical", reviewRevision: 1, status: "PENDING", requestComment: "申请" };
const pass = defineComponent({ setup(_, { slots, attrs }) { return () => h("div", [attrs.message as string, attrs.header as string, slots.default?.()]); } });
async function settle() { for (let i = 0; i < 12; i++) { await Promise.resolve(); await nextTick(); } }
function button(label: string) { return [...host.querySelectorAll("button")].find(item => item.textContent === label)!; }
function mount(status = "SUCCEEDED", readOnly = false) {
  host = document.createElement("div"); document.body.append(host);
  app = createApp(BusinessReviewPanel, { resultId: "canonical", taskStatus: status, readOnly,
    items: [{ itemCode: "a", name: "问候", ruleId: "r1", ruleVersionNo: 1, status: "FAIL", matchedMessageIds: [] }], messages: [] });
  for (const name of ["AAlert", "ASpace", "ASpin", "AEmpty", "AForm", "AFormItem", "ACard", "ACollapse", "ACollapsePanel"]) app.component(name, pass);
  app.component("AButton", defineComponent({ setup(_, { slots, attrs }) { return () => h("button", attrs, slots.default?.()); } }));
  app.component("ATextarea", defineComponent({ props: ["value", "disabled"], emits: ["update:value"], setup(props, { emit }) {
    return () => h("textarea", { value: props.value, disabled: props.disabled, onInput: (event: Event) => emit("update:value", (event.target as HTMLTextAreaElement).value) });
  } }));
  app.component("ASelect", defineComponent({ props: ["value", "options", "disabled"], emits: ["update:value"], setup(props, { emit }) {
    return () => h("select", { value: props.value, disabled: props.disabled, onChange: (event: Event) => emit("update:value", (event.target as HTMLSelectElement).value) },
      [h("option", { value: "" }, "选择"), ...(props.options || []).map((option: { value: string; label: string }) => h("option", { value: option.value }, option.label))]);
  } }));
  app.mount(host);
}
async function type(text: string) { const input = host.querySelector("textarea")!; input.value = text; input.dispatchEvent(new Event("input")); await settle(); }
async function click(label: string) { expect(button(label)).toBeDefined(); button(label).click(); await settle(); }

describe("business review detail panel", () => {
  beforeEach(() => {
    vi.clearAllMocks(); state.permissions = ["iqc:review:view", "iqc:review:create", "iqc:review:decide"];
    vi.mocked(listBusinessReviews).mockResolvedValue([]);
    vi.mocked(requestBusinessReview).mockResolvedValue(pending);
    vi.mocked(decideBusinessReview).mockResolvedValue({ ...pending, status: "COMPLETED" });
  });
  afterEach(() => { app?.unmount(); host?.remove(); });

  it("freezes request and retry token after an uncertain response", async () => {
    vi.mocked(requestBusinessReview).mockRejectedValueOnce(new Error("timeout"));
    mount(); await settle(); await type("请核对问候"); await click("发起业务复核");
    expect(host.querySelector("textarea")?.disabled).toBe(true);
    await click("重试原提交");
    expect(vi.mocked(requestBusinessReview).mock.calls[0]).toEqual(vi.mocked(requestBusinessReview).mock.calls[1]);
    expect(vi.mocked(requestBusinessReview).mock.calls[0][1]).toEqual({ expectedRevision: 0, requestId: expect.any(String), comment: "请核对问候" });
  });

  it("submits one explicit business decision with no manually entered score", async () => {
    vi.mocked(listBusinessReviews).mockResolvedValue([pending]);
    mount(); await settle();
    const selects = host.querySelectorAll("select");
    selects[0].value = "a"; selects[0].dispatchEvent(new Event("change"));
    selects[1].value = "PASS"; selects[1].dispatchEvent(new Event("change"));
    await type("核对后满足"); await click("保存项目裁决并重算");
    expect(decideBusinessReview).toHaveBeenCalledWith("review", { expectedRevision: 1, decision: "COMPLETED", comment: "核对后满足",
      items: [{ sourceResultId: "canonical", itemCode: "a", expectedStatus: "FAIL", finalStatus: "PASS", reason: "核对后满足", evidenceMessageIds: [] }] });
    expect(vi.mocked(decideBusinessReview).mock.calls[0][1]).not.toHaveProperty("finalScore");
  });

  it("does not load or expose actions without view permission", async () => {
    state.permissions = []; mount(); await settle();
    expect(listBusinessReviews).not.toHaveBeenCalled(); expect(button("发起业务复核")).toBeUndefined();
    expect(host.textContent).toContain("没有查看复核历史的权限");
  });

  it("blocks writes when history fails or the task is running", async () => {
    vi.mocked(listBusinessReviews).mockRejectedValueOnce(new Error("offline"));
    mount("RUNNING"); await settle();
    expect(button("发起业务复核")).toBeUndefined(); expect(host.textContent).toContain("历史加载失败");
    await click("刷新复核历史"); await type("原因");
    expect(button("发起业务复核").disabled).toBe(true); expect(requestBusinessReview).not.toHaveBeenCalled();
  });

  it("allows history viewing without exposing adjudication to a read-only user", async () => {
    state.permissions = ["iqc:review:view"];
    vi.mocked(listBusinessReviews).mockResolvedValue([pending]);
    mount(); await settle();
    expect(listBusinessReviews).toHaveBeenCalledWith("canonical");
    expect(button("保存项目裁决并重算")).toBeUndefined();
    expect(button("退回本轮")).toBeUndefined();
    expect(host.textContent).toContain("没有裁决权限");
  });

  it("keeps the history drawer read-only even for an authorized reviewer", async () => {
    vi.mocked(listBusinessReviews).mockResolvedValue([pending]);
    mount("SUCCEEDED", true); await settle();
    expect(host.textContent).toContain("当前为只读历史");
    expect(button("保存项目裁决并重算")).toBeUndefined();
    expect(button("退回本轮")).toBeUndefined();
  });

  it("shows legitimate zero reviewed score separately from the machine score", async () => {
    vi.mocked(listBusinessReviews).mockResolvedValue([{ ...pending, status: "COMPLETED", reviewedResultJson: JSON.stringify({
      sourceResultId: "canonical", original: { scoring: { scoreStatus: "FINAL", finalScore: 80 } },
      reviewed: { items: [], scoring: { scoreStatus: "FINAL", finalScore: 0 } }, decisions: []
    }) }]);
    mount(); await settle();
    expect(host.textContent).toContain("机器分数：80.00 → 本轮人工复核分数：0.00");
    expect(host.textContent).toContain("CSV 仅导出机器结果");
    expect(button("导出本轮人工复核 CSV")).toBeUndefined();
  });

  it("confirms a completed round export without making a review decision", async () => {
    state.permissions = ["iqc:review:view", "iqc:result:export"];
    vi.mocked(listBusinessReviews).mockResolvedValue([{ ...pending, status: "COMPLETED", reviewedResultJson: JSON.stringify({
      sourceResultId: "canonical", original: { scoring: { scoreStatus: "FINAL", finalScore: 80 } },
      reviewed: { items: [], scoring: { scoreStatus: "FINAL", finalScore: 100 } }, decisions: []
    }) }]);
    mount("SUCCEEDED", true); await settle(); await click("导出本轮人工复核 CSV");
    expect(Modal.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: "导出第 1 轮人工复核？" }));
    expect(exportBusinessReview).not.toHaveBeenCalled();
    vi.mocked(exportBusinessReview).mockRejectedValueOnce(new Error("denied"));
    const config = vi.mocked(Modal.confirm).mock.calls[0][0];
    await config.onOk?.();
    expect(exportBusinessReview).toHaveBeenCalledWith("review");
    expect(decideBusinessReview).not.toHaveBeenCalled();
  });

  it("does not offer an export for a pending round even with export permission", async () => {
    state.permissions = ["iqc:review:view", "iqc:result:export"];
    vi.mocked(listBusinessReviews).mockResolvedValue([pending]);
    mount(); await settle();
    expect(button("导出本轮人工复核 CSV")).toBeUndefined();
  });
});
