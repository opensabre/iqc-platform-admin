import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, inject, provide, nextTick, type App } from "vue";
import BusinessReviewQueue from "./BusinessReviewQueue.vue";
import { listBusinessReviewQueue, type BusinessReviewQueueItem } from "@/api/quality";

const state = vi.hoisted(() => ({ permissions: ["iqc:review:view", "iqc:result:view"], push: vi.fn() }));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock("@/composables/permission", () => ({ usePermission: () => ({ can: (value: string) => state.permissions.includes(value) }) }));
vi.mock("@/api/quality", () => ({ listBusinessReviewQueue: vi.fn() }));
vi.mock("./BusinessReviewPanel.vue", () => ({ default: defineComponent({ props: { resultId: String, readOnly: Boolean }, setup(props) {
  return () => h("div", `history:${props.resultId}:${props.readOnly}`);
} }) }));
const item: BusinessReviewQueueItem = { reviewId: "review", resultId: "canonical", taskId: "task", taskName: "业务任务",
  conversationId: "conversation", reviewRevision: 1, status: "PENDING", taskStatus: "SUCCEEDED", currentResult: true };
const pass = defineComponent({ setup(_, { slots, attrs }) { return () => h("div", [attrs.message as string, slots.default?.()]); } });
let app: App, host: HTMLDivElement;
async function settle() { for (let i = 0; i < 12; i++) { await Promise.resolve(); await nextTick(); } }
function button(text: string) { return [...host.querySelectorAll("button")].find(item => item.textContent === text)!; }
function mount() {
  host = document.createElement("div"); document.body.append(host); app = createApp(BusinessReviewQueue);
  for (const name of ["AAlert", "AForm", "AFormItem", "ASelect", "AInput", "AInputSearch", "APagination", "ATag", "ASpace", "ADrawer"]) app.component(name, pass);
  app.component("AButton", defineComponent({ setup(_, { slots, attrs }) { return () => h("button", attrs, slots.default?.()); } }));
  app.component("ATable", defineComponent({ props: ["dataSource"], setup(props, { slots }) { provide("rows", () => props.dataSource); return () => h("div", slots.default?.()); } }));
  app.component("ATableColumn", defineComponent({ setup(_, { slots }) { const rows = inject<() => BusinessReviewQueueItem[]>("rows")!; return () => h("div", rows().map(record => slots.default?.({ record }))); } }));
  app.mount(host);
}
describe("business review queue", () => {
  beforeEach(() => { vi.clearAllMocks(); state.permissions = ["iqc:review:view", "iqc:result:view"];
    vi.mocked(listBusinessReviewQueue).mockResolvedValue({ records: [item], current: 1, size: 20, total: 1 }); });
  afterEach(() => { app?.unmount(); host?.remove(); });
  it("defaults to pending and pins navigation to the original result", async () => {
    mount(); await settle();
    expect(listBusinessReviewQueue).toHaveBeenCalledWith({ status: "PENDING", taskId: undefined, current: 1, size: 20 });
    button("打开结果").click(); await settle();
    expect(state.push).toHaveBeenCalledWith({ path: "/results", query: { taskId: "task", conversationId: "conversation", sourceResultId: "canonical" } });
  });
  it("keeps superseded results history-only", async () => {
    vi.mocked(listBusinessReviewQueue).mockResolvedValue({ records: [{ ...item, currentResult: false }], current: 1, size: 20, total: 1 });
    mount(); await settle(); expect(button("打开结果").disabled).toBe(true);
    button("复核历史").click(); await settle();
    expect(host.textContent).toContain("history:canonical:true"); expect(state.push).not.toHaveBeenCalled();
  });
  it("does not fetch without review permission and does not navigate without result permission", async () => {
    state.permissions = []; mount(); await settle(); expect(listBusinessReviewQueue).not.toHaveBeenCalled();
    app.unmount(); host.remove(); state.permissions = ["iqc:review:view"]; mount(); await settle();
    expect(button("打开结果")).toBeUndefined(); expect(button("复核历史")).toBeDefined();
  });
  it("removes stale rows when refresh fails", async () => {
    mount(); await settle(); vi.mocked(listBusinessReviewQueue).mockRejectedValueOnce(new Error("offline"));
    button("查询业务复核").click(); await settle();
    expect(host.textContent).toContain("待办加载失败"); expect(button("打开结果")).toBeUndefined();
  });
});
