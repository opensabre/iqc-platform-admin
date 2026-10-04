import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, inject, nextTick, provide, type App } from "vue";
import QualityOperations from "./index.vue";
import { getQualityReport, listReviews } from "@/api/quality";

const state = vi.hoisted(() => ({ reportAllowed: true, refresh: vi.fn() }));
vi.mock("@/composables/permission", () => ({ usePermission: () => ({ can: (code: string) => code === "iqc:report:view" ? state.reportAllowed : true }) }));
vi.mock("ant-design-vue", () => ({ message: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/api/quality", () => ({ decideReview: vi.fn(), getQualityReport: vi.fn(), listFeedbacks: vi.fn(), listReviews: vi.fn(), listSamples: vi.fn() }));
vi.mock("@/components/BusinessReviewQueue.vue", () => ({ default: defineComponent({ setup() { return () => h("div", "queue"); } }) }));
vi.mock("@/components/LabelReviewQueue.vue", () => ({ default: defineComponent({ setup() { return () => h("div", "label-queue"); } }) }));
vi.mock("@/components/BusinessQualityReport.vue", () => ({ default: defineComponent({ setup(_, { expose }) {
  expose({ refresh: state.refresh }); return () => h("div", "business-report-panel");
} }) }));
let app: App, host: HTMLDivElement;
const pass = defineComponent({ setup(_, { slots, attrs }) { return () => h("div", [attrs.message as string, slots.default?.()]); } });
function mount() {
  host = document.createElement("div"); document.body.append(host); app = createApp(QualityOperations);
  for (const name of ["AAlert", "ACard", "AForm", "AFormItem", "ASelect", "ASelectOption", "AInputNumber", "ATextarea", "AStatistic", "ACol", "ARow", "ATableColumn", "ATag"]) app.component(name, pass);
  for (const name of ["ATable", "AModal"]) app.component(name, defineComponent({ setup() { return () => h("div"); } }));
  app.component("AButton", defineComponent({ setup(_, { slots, attrs }) { return () => h("button", attrs, slots.default?.()); } }));
  app.component("ATabs", defineComponent({ emits: ["update:activeKey", "change"], setup(_, { emit, slots }) {
    provide("selectTab", (key: string) => { emit("update:activeKey", key); emit("change", key); }); return () => h("div", slots.default?.());
  } }));
  app.component("ATabPane", defineComponent({ props: ["tab"], setup(props, { slots }) {
    const select = inject<(key: string) => void>("selectTab")!;
    return () => h("div", [h("button", { onClick: () => select(props.tab === "业务评分统计" ? "business-report" : "business") }, props.tab), slots.default?.()]);
  } }));
  app.mount(host);
}
afterEach(() => { app?.unmount(); host?.remove(); vi.clearAllMocks(); state.reportAllowed = true; });
describe("quality operations business report integration", () => {
  it("switches and refreshes independently of legacy endpoints", async () => {
    mount(); [...host.querySelectorAll("button")].find(button => button.textContent === "业务评分统计")!.click(); await nextTick();
    expect(state.refresh).toHaveBeenCalledOnce();
    expect(getQualityReport).not.toHaveBeenCalled(); expect(listReviews).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("此页签及下方统计仅包含旧消息结果");
  });
  it("hides the report tab without report permission", () => {
    state.reportAllowed = false; mount(); expect(host.textContent).not.toContain("business-report-panel");
    expect(getQualityReport).not.toHaveBeenCalled();
  });
});
