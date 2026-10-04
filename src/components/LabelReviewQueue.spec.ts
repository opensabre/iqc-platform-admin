import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, inject, nextTick, provide, type App } from "vue";
import LabelReviewQueue from "./LabelReviewQueue.vue";
import { listLabelReviewQueue, listLabelValueReviews, type LabelReviewQueueItem } from "@/api/quality";

const state = vi.hoisted(() => ({ permissions: ["iqc:review:view", "iqc:result:view", "iqc:task:view"], push: vi.fn() }));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock("@/composables/permission", () => ({ usePermission: () => ({ can: (code: string) => state.permissions.includes(code) }) }));
vi.mock("@/api/quality", () => ({ listLabelReviewQueue: vi.fn(), listLabelValueReviews: vi.fn() }));
const item: LabelReviewQueueItem = { reviewId: "review", labelResultId: "label-result", taskId: "task", taskName: "标签任务",
  conversationId: "conversation", labelId: "house", valueCode: "owned", reviewRevision: 1, status: "PENDING", currentResult: true };
const pass = defineComponent({ setup(_, { slots, attrs }) { return () => h("div", [attrs.message as string, slots.default?.()]); } });
let app: App, host: HTMLDivElement;
async function settle() { for (let i = 0; i < 12; i++) { await Promise.resolve(); await nextTick(); } }
function button(label: string) { return [...host.querySelectorAll("button")].find(value => value.textContent === label)!; }
function mount() {
  host = document.createElement("div"); document.body.append(host); app = createApp(LabelReviewQueue);
  for (const name of ["AAlert", "AForm", "AFormItem", "ASelect", "AInput", "AInputSearch", "APagination", "ATag", "ASpace", "ADrawer", "ASpin", "ATimeline", "ATimelineItem", "AEmpty"]) app.component(name, pass);
  app.component("AButton", defineComponent({ setup(_, { slots, attrs }) { return () => h("button", attrs, slots.default?.()); } }));
  app.component("ATable", defineComponent({ props: ["dataSource"], setup(props, { slots }) { provide("rows", () => props.dataSource); return () => h("div", slots.default?.()); } }));
  app.component("ATableColumn", defineComponent({ setup(_, { slots }) { const rows = inject<() => LabelReviewQueueItem[]>("rows")!; return () => h("div", rows().map(record => slots.default?.({ record }))); } }));
  app.mount(host);
}
describe("label review queue", () => {
  beforeEach(() => { vi.clearAllMocks(); state.permissions = ["iqc:review:view", "iqc:result:view", "iqc:task:view"];
    vi.mocked(listLabelReviewQueue).mockResolvedValue({ records: [item], current: 1, size: 20, total: 1 });
    vi.mocked(listLabelValueReviews).mockResolvedValue([]); });
  afterEach(() => { app?.unmount(); host?.remove(); });
  it("defaults to pending and opens the exact current label result", async () => {
    mount(); await settle();
    expect(listLabelReviewQueue).toHaveBeenCalledWith({ status: "PENDING", taskId: undefined, current: 1, size: 20 });
    button("打开结果").click(); await settle();
    expect(state.push).toHaveBeenCalledWith({ path: "/tasks", query: { taskId: "task", view: "results", labelResultId: "label-result" } });
  });
  it("shows frozen business names with technical codes retained for tracing", async () => {
    vi.mocked(listLabelReviewQueue).mockResolvedValue({ records: [{ ...item, labelVersionNo: 2,
      labelName: "是否有房", valueDescription: "拥有房产" }], current: 1, size: 20, total: 1 });
    mount(); await settle();
    expect(host.textContent).toContain("是否有房");
    expect(host.textContent).toContain("house · V2");
    expect(host.textContent).toContain("拥有房产");
    expect(host.textContent).toContain("编码：owned");
  });
  it("keeps superseded results history-only", async () => {
    vi.mocked(listLabelReviewQueue).mockResolvedValue({ records: [{ ...item, currentResult: false }], current: 1, size: 20, total: 1 });
    vi.mocked(listLabelValueReviews).mockResolvedValue([{ id: "review", targetType: "LABEL", labelResultId: "label-result", reviewRevision: 1,
      status: "COMPLETED", reviewedResultJson: JSON.stringify({ sourceLabelResultId: "label-result", status: "KNOWN", value: false }) }]);
    mount(); await settle(); expect(button("打开结果").disabled).toBe(true);
    button("复核历史").click(); await settle();
    expect(listLabelValueReviews).toHaveBeenCalledWith("label-result");
    expect(host.textContent).toContain("人工结论：否");
    expect(state.push).not.toHaveBeenCalled();
  });
  it("requires review permission and clears stale rows on refresh failure", async () => {
    state.permissions = []; mount(); await settle(); expect(listLabelReviewQueue).not.toHaveBeenCalled();
    app.unmount(); host.remove(); state.permissions = ["iqc:review:view"]; mount(); await settle();
    expect(button("打开结果")).toBeUndefined();
    vi.mocked(listLabelReviewQueue).mockRejectedValueOnce(new Error("offline"));
    button("查询标签复核").click(); await settle();
    expect(host.textContent).toContain("待办加载失败"); expect(button("复核历史")).toBeUndefined();
  });
  it("does not send result readers without task permission to a forbidden route", async () => {
    state.permissions = ["iqc:review:view", "iqc:result:view"];
    mount(); await settle();
    expect(button("打开结果").disabled).toBe(true);
    expect(button("打开结果").title).toBe("需要任务查看权限");
    button("打开结果").click(); await settle();
    expect(state.push).not.toHaveBeenCalled();
  });
});
