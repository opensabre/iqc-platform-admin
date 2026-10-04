import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import Results from "./index.vue";
import { Modal } from "ant-design-vue";
import { exportTaskBusinessReviews, exportTaskLabelResults, listBusinessResults, listResults } from "@/api/results";
const state = vi.hoisted(() => ({ actual: "canonical", warning: vi.fn(), exportAllowed: true, status: "SUCCEEDED", labelOnly: false, push: vi.fn() }));
vi.mock("vue-router", () => ({ useRoute: () => ({ query: { taskId: "task", conversationId: "conversation", sourceResultId: "canonical" } }), useRouter: () => ({ push: state.push }) }));
vi.mock("@/composables/permission", () => ({ usePermission: () => ({ can: (permission: string) => permission !== "iqc:result:export" || state.exportAllowed }) }));
vi.mock("ant-design-vue", () => ({ message: { warning: state.warning, error: vi.fn() }, Modal: { confirm: vi.fn() } }));
vi.mock("@/api/results", () => ({
  listBusinessResults: vi.fn().mockResolvedValue({ records: [], total: 0 }),
  listResults: vi.fn().mockResolvedValue({ records: [], total: 0 }),
  getConversationResultDetail: vi.fn(async () => ({ task: { id: "task", status: state.status, ruleSnapshotJson: state.labelOnly
    ? '{"schemeSnapshot":{"release":{"definition":{"items":[],"labels":[{"id":"house","versionNo":1}]}}}}' : '{"schemeSnapshot":{}}' }, messages: [], results: [] })),
  getResultHierarchy: vi.fn(async () => ({ conversation: { id: state.actual, scoreStatus: "PENDING", resultStatus: "PENDING", businessItemResultsJson: "[]" }, rules: [], evidenceByRuleResult: {} })),
  exportResults: vi.fn(), exportSchemeResults: vi.fn(), exportTaskBusinessReviews: vi.fn(), exportTaskLabelResults: vi.fn(), getResultDetail: vi.fn(), getBatchResultSummary: vi.fn()
}));
vi.mock("@/api/dictionaries", () => ({ dictionaryLabel: (_: unknown, value: string) => value, getCachedDictionaries: vi.fn().mockResolvedValue({}) }));
vi.mock("@/api/quality", () => ({ createFeedback: vi.fn(), createSample: vi.fn(), requestReview: vi.fn() }));
vi.mock("@/components/BusinessReviewPanel.vue", () => ({ default: defineComponent({ props: ["resultId"], setup(props) { return () => h("div", `review-for:${props.resultId}`); } }) }));
vi.mock("@/components/ConversationDetailDrawer.vue", () => ({ default: defineComponent({ setup: () => () => null }) }));
vi.mock("@/components/ReviewTaskSelector.vue", () => ({ default: defineComponent({
  props: ["modelValue"], emits: ["update:modelValue"], setup(props, {emit}) { return () => h("input", {
    "aria-label":"任务选择", value:props.modelValue,
    onInput:(event:Event) => emit("update:modelValue", (event.target as HTMLInputElement).value)
  }); }
}) }));
let app: App, host: HTMLDivElement;
const pass = defineComponent({ setup(_, { slots, attrs }) { return () => h("div", "data-source" in attrs ? [] : slots.default?.()); } });
async function mount() {
  host = document.createElement("div"); document.body.append(host); app = createApp(Results);
  for (const name of ["ARadioGroup","ARadioButton","ACard","AForm","AFormItem","AInput","ASelect","ASelectOption","AInputNumber","ATable","ATableColumn","APagination","ADrawer","ASpin","ARow","ACol","AStatistic","ATag","AAlert","ASpace","AList","ACollapse","ACollapsePanel","ADescriptions","ADescriptionsItem"]) app.component(name, pass);
  app.component("AButton", defineComponent({ setup(_, { slots, attrs }) { return () => h("button", attrs, slots.default?.()); } }));
  for (const name of ["ATypographyText", "ATooltip", "AListItemMeta", "AListItem"]) app.component(name, pass);
  app.mount(host); for (let i = 0; i < 12; i++) { await Promise.resolve(); await nextTick(); }
}
describe("review navigation version guard", () => {
  beforeEach(() => { state.actual = "canonical"; state.exportAllowed = true; state.status = "SUCCEEDED"; state.labelOnly = false; vi.clearAllMocks(); });
  afterEach(() => { app?.unmount(); host?.remove(); });
  it("defaults to service-paged current business results rather than grouped message observations", async () => {
    await mount();
    expect(listBusinessResults).toHaveBeenCalledWith(expect.objectContaining({taskId:"task"}), {current:1,size:20});
    expect(listResults).not.toHaveBeenCalled();
  });
  it("uses the selected task ID only after filtering and clears it on reset", async () => {
    await mount();
    const input = host.querySelector<HTMLInputElement>('input[aria-label="任务选择"]')!;
    input.value = "chosen-task"; input.dispatchEvent(new Event("input")); await nextTick();
    expect(listBusinessResults).toHaveBeenCalledTimes(1);
    [...host.querySelectorAll("button")].find(button => button.textContent === "筛选")!.click();
    for(let i=0;i<6;i++){await Promise.resolve(); await nextTick();}
    expect(listBusinessResults).toHaveBeenLastCalledWith(expect.objectContaining({taskId:"chosen-task"}), {current:1,size:20});
    [...host.querySelectorAll("button")].find(button => button.textContent === "重置")!.click();
    for(let i=0;i<6;i++){await Promise.resolve(); await nextTick();}
    expect(listBusinessResults).toHaveBeenLastCalledWith(expect.objectContaining({taskId:undefined}), {current:1,size:20});
  });
  it("opens the review panel only for the pinned result", async () => { await mount(); expect(host.textContent).toContain("review-for:canonical"); });
  it("does not silently open a new execution for an old review", async () => {
    state.actual = "new-execution-result"; await mount();
    expect(state.warning).toHaveBeenCalledWith(expect.stringContaining("已被新执行替代"));
    expect(host.textContent).not.toContain("review-for:");
  });
  it("requires confirmation and exports only the selected task", async () => {
    await mount();
    const button = [...host.querySelectorAll("button")].find(button => button.textContent === "导出本任务人工复核 ZIP")!;
    button.click();
    expect(Modal.confirm).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("不会用机器分数补齐") }));
    expect(exportTaskBusinessReviews).not.toHaveBeenCalled();
    vi.mocked(exportTaskBusinessReviews).mockRejectedValueOnce(new Error("denied"));
    await vi.mocked(Modal.confirm).mock.calls[0][0].onOk?.();
    expect(exportTaskBusinessReviews).toHaveBeenCalledWith("task");
  });
  it("hides batch export without export permission and disables it while running", async () => {
    state.exportAllowed = false; await mount();
    expect(host.textContent).not.toContain("导出本任务人工复核 ZIP");
    app.unmount(); host.remove(); state.exportAllowed = true; state.status = "RUNNING"; await mount();
    const button = [...host.querySelectorAll("button")].find(button => button.textContent === "导出本任务人工复核 ZIP")!;
    expect(button.disabled).toBe(true); button.click(); expect(Modal.confirm).not.toHaveBeenCalled();
  });
  it("routes a label-only result to existing label details without offering an empty check export", async () => {
    state.labelOnly = true; await mount();
    expect(host.textContent).toContain("仅识别标签");
    expect(host.textContent).toContain("导出本任务标签 XLSX");
    expect(host.textContent).not.toContain("导出本任务业务质检项 CSV");
    expect(host.textContent).not.toContain("机器质检项与独立评分");
    vi.mocked(exportTaskLabelResults).mockRejectedValueOnce(new Error("denied"));
    [...host.querySelectorAll("button")].find(value => value.textContent === "导出本任务标签 XLSX")!.click();
    expect(exportTaskLabelResults).toHaveBeenCalledWith("task");
    const button = [...host.querySelectorAll("button")].find(value => value.textContent === "查看本任务洞察标签")!;
    button.click();
    expect(state.push).toHaveBeenCalledWith({ path: "/tasks", query: { taskId: "task", view: "results", tab: "labels" } });
  });
});
