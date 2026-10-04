import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import LabelValueReviewPanel from "./LabelValueReviewPanel.vue";
import { listLabelValueReviews, requestLabelValueReview, decideLabelValueReview, type LabelValueReview } from "@/api/quality";
import { getConversationResultDetail, type LabelResult } from "@/api/results";

const state = vi.hoisted(() => ({ permissions: ["iqc:review:view", "iqc:review:create", "iqc:review:decide"] }));
vi.mock("@/composables/permission", () => ({ usePermission: () => ({ can: (key: string) => state.permissions.includes(key) }) }));
vi.mock("@/api/quality", () => ({ listLabelValueReviews: vi.fn(), requestLabelValueReview: vi.fn(), decideLabelValueReview: vi.fn() }));
vi.mock("@/api/results", () => ({ getConversationResultDetail: vi.fn() }));
vi.mock("ant-design-vue", () => ({ message: { success: vi.fn() } }));
const label: LabelResult = { id: "label-result", conversationId: "conversation", labelId: "house", labelName: "有房",
  labelVersionNo: 2, valueCode: "owned", generationSource: "RULE", status: "UNKNOWN",
  valueJson: JSON.stringify({ schemaVersion: "iqc-label-result-v2", status: "UNKNOWN", valueCode: "owned", valueType: "BOOLEAN",
    subjectRole: "customer", candidates: [], reasons: ["NOT_MENTIONED"] }) };
const completed: LabelValueReview = { id: "round", targetType: "LABEL", labelResultId: "label-result", reviewRevision: 1,
  status: "COMPLETED", reviewedResultJson: JSON.stringify({ sourceLabelResultId: "label-result", status: "KNOWN", value: false,
    evidenceMessageIds: ["m1"] }) };
const pending: LabelValueReview = { ...completed, status: "PENDING", reviewedResultJson: undefined };
const pass = defineComponent({ setup(_, { slots, attrs }) { return () => h("div", [attrs.message as string, attrs.header as string, slots.default?.()]); } });
let app: App, host: HTMLDivElement;
async function settle() { for (let i = 0; i < 12; i++) { await Promise.resolve(); await nextTick(); } }
function mount() {
  host = document.createElement("div"); document.body.append(host);
  app = createApp(LabelValueReviewPanel, { label, taskId: "task", taskStatus: "SUCCEEDED" });
  for (const name of ["AAlert", "ASpace", "ASpin", "AForm", "AFormItem", "ACard", "ACollapse", "ACollapsePanel",
    "AInput", "AInputNumber"]) app.component(name, pass);
  app.component("ASelect", defineComponent({ props: ["value", "options"], emits: ["update:value"], setup(props, { emit }) {
    return () => h("select", { value: props.value, onChange: (event: Event) => emit("update:value", (event.target as HTMLSelectElement).value) },
      [h("option", { value: "" }, "请选择"), ...(props.options || []).map((option: { value: string; label: string }) =>
        h("option", { value: option.value }, option.label))]);
  } }));
  app.component("AButton", defineComponent({ setup(_, { slots, attrs }) { return () => h("button", attrs, slots.default?.()); } }));
  app.component("ATextarea", defineComponent({ props: ["value"], emits: ["update:value"], setup(props, { emit }) {
    return () => h("textarea", { value: props.value, onInput: (event: Event) => emit("update:value", (event.target as HTMLTextAreaElement).value) });
  } }));
  app.mount(host);
}

describe("label value review panel", () => {
  beforeEach(() => {
    vi.clearAllMocks(); state.permissions = ["iqc:review:view", "iqc:review:create", "iqc:review:decide"];
    vi.mocked(listLabelValueReviews).mockResolvedValue([]);
    vi.mocked(getConversationResultDetail).mockResolvedValue({ conversation: { id: "conversation", sourceFileName: "file" },
      summary: {} as never, messages: [{ id: "m1", sequenceNo: 1, content: "没有房子", speakerRole: "customer", relativeTime: "0" }], results: [] });
  });
  afterEach(() => { app?.unmount(); host?.remove(); });

  it("shows a human false correction separately from the unknown machine value", async () => {
    vi.mocked(listLabelValueReviews).mockResolvedValue([completed]);
    mount(); await settle();
    expect(host.textContent).toContain("机器结果：未知 · —");
    expect(host.textContent).toContain("当前有效人工修订：否");
    expect(host.textContent).toContain("机器值仍保留");
  });

  it("does not load review data without the view permission", async () => {
    state.permissions = []; mount(); await settle();
    expect(listLabelValueReviews).not.toHaveBeenCalled();
    expect(getConversationResultDetail).not.toHaveBeenCalled();
    expect(host.textContent).toContain("没有查看标签复核的权限");
  });

  it("retries an uncertain request with the same frozen token and reason", async () => {
    vi.mocked(requestLabelValueReview).mockRejectedValueOnce(new Error("timeout"));
    mount(); await settle();
    const input = host.querySelector("textarea")!;
    input.value = "请核对是否有房"; input.dispatchEvent(new Event("input")); await settle();
    [...host.querySelectorAll("button")].find(button => button.textContent === "发起标签复核")!.click(); await settle();
    [...host.querySelectorAll("button")].find(button => button.textContent === "重试原提交")!.click(); await settle();
    expect(vi.mocked(requestLabelValueReview).mock.calls[0]).toEqual(vi.mocked(requestLabelValueReview).mock.calls[1]);
  });

  it("submits an unknown correction without a false value or score", async () => {
    vi.mocked(listLabelValueReviews).mockResolvedValue([pending]);
    vi.mocked(decideLabelValueReview).mockResolvedValue({ ...pending, status: "COMPLETED" });
    mount(); await settle();
    const select = host.querySelector("select")!;
    select.value = "UNKNOWN"; select.dispatchEvent(new Event("change")); await settle();
    const input = host.querySelector("textarea")!;
    input.value = "无法确定"; input.dispatchEvent(new Event("input")); await settle();
    [...host.querySelectorAll("button")].find(button => button.textContent === "保存标签修订")!.click(); await settle();
    expect(decideLabelValueReview).toHaveBeenCalledWith("round", { expectedRevision: 1, decision: "COMPLETED",
      comment: "无法确定", labelDecision: { status: "UNKNOWN", value: null, evidenceMessageIds: [] } });
  });
});
