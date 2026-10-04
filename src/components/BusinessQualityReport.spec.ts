import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import BusinessQualityReport from "./BusinessQualityReport.vue";
import { getBusinessQualityReport, type BusinessQualityReport as Report } from "@/api/quality";
import { listTaskExecutions, listTasks } from "@/api/tasks";

const state = vi.hoisted(() => ({ permissions: ["iqc:report:view", "iqc:task:view"] }));
vi.mock("@/composables/permission", () => ({ usePermission: () => ({ can: (value: string) => state.permissions.includes(value) }) }));
vi.mock("@/api/quality", () => ({ getBusinessQualityReport: vi.fn() }));
vi.mock("@/api/tasks", () => ({ listTasks: vi.fn(), listTaskExecutions: vi.fn() }));
const score = { resultCount: 1, finalCount: 1, pendingCount: 0, notApplicableCount: 0, qualifiedCount: 0, averageScore: 0, qualifiedRate: 0 };
const report: Report = { scope: "SELECTED_TASK_RUNS", runPolicy: "SELECTED_RUNS", taskCount: 1, conversationCount: 2, groups: [{
  groupKey: "key", schemeId: "scheme", versionNo: "1", draftRevision: "", kind: "PUBLISHED", mode: "DEDUCTION", passingScore: 90,
  taskIds: ["task"], conversationCount: 2, executionIds: ["e1"], missingResultCount: 1, missingReviewCount: 2, pendingReviewCount: 1,
  machine: score, reviewed: { ...score, resultCount: 0, finalCount: 0, averageScore: null, qualifiedRate: null }
}] };
const pass = defineComponent({ setup(_, { slots, attrs }) { return () => h("div", [attrs.message as string, attrs.title as string, slots.default?.()]); } });
let app: App, host: HTMLDivElement;
async function settle() { for (let i = 0; i < 12; i++) { await Promise.resolve(); await nextTick(); } }
function button(text: string) { return [...host.querySelectorAll("button")].find(item => item.textContent === text)!; }
async function select(ids: string[]) {
  const input = host.querySelector<HTMLTextAreaElement>("textarea")!;
  input.value = ids.join(","); input.dispatchEvent(new Event("input")); await settle();
  const policy = host.querySelector<HTMLSelectElement>('select[aria-label="运行统计口径"]')!;
  policy.value = "SELECTED_RUNS"; policy.dispatchEvent(new Event("change", { bubbles: true })); await settle();
}
function mount() {
  host = document.createElement("div"); document.body.append(host); app = createApp(BusinessQualityReport);
  for (const name of ["AAlert", "AForm", "AFormItem", "ASpace", "ATag", "ACard"]) app.component(name, pass);
  app.component("AButton", defineComponent({ setup(_, { slots, attrs }) { return () => h("button", attrs, slots.default?.()); } }));
  app.component("AInput", defineComponent({ props: ["value"], emits: ["update:value"], setup(props, { emit }) {
    return () => h("input", { value: props.value, onInput: (event: Event) => emit("update:value", (event.target as HTMLInputElement).value) });
  } }));
  app.component("ASelect", defineComponent({ props: ["value", "options"], emits: ["update:value"], setup(props, { emit }) {
    return () => h("div", [h("textarea", { value: props.value.join(","), onInput: (event: Event) => emit("update:value", (event.target as HTMLTextAreaElement).value.split(",").filter(Boolean)) }),
      h("span", JSON.stringify(props.options))]);
  } }));
  app.component("ATable", defineComponent({ props: ["dataSource", "columns"], setup(props, { slots }) {
    return () => h("table", props.dataSource.map((row: Record<string, unknown>) => h("tr", props.columns.map((column: { dataIndex: string }) =>
      h("td", ["averageScore", "qualifiedRate", "failureRate", "scored", "points", "veto"].includes(column.dataIndex)
        ? slots.bodyCell?.({ column, text: row[column.dataIndex] }) : String(row[column.dataIndex]))))));
  } }));
  app.mount(host);
}
describe("business quality report", () => {
  beforeEach(() => { vi.clearAllMocks(); state.permissions = ["iqc:report:view", "iqc:task:view"];
    vi.mocked(getBusinessQualityReport).mockResolvedValue(report);
    vi.mocked(listTaskExecutions).mockResolvedValue([]);
    vi.mocked(listTasks).mockResolvedValue({ records: [{ id: "task", name: "电话销售" } as never], current: 1, size: 20, total: 1 }); });
  afterEach(() => { app?.unmount(); host?.remove(); });

  it("waits for explicit selection and query; shows zero separately from missing scores", async () => {
    mount(); await settle(); expect(getBusinessQualityReport).not.toHaveBeenCalled(); expect(listTasks).not.toHaveBeenCalled();
    expect(button("查询业务统计").disabled).toBe(true);
    await select(["task"]); button("查询业务统计").click(); await settle();
    expect(getBusinessQualityReport).toHaveBeenCalledWith(["task"], { task: "LATEST" }, "SELECTED_RUNS");
    expect(host.textContent).toContain("缺失机器结果：1"); expect(host.textContent).toContain("无完成复核：2");
    const rows = [...host.querySelectorAll("tr")];
    expect(rows[0].textContent).toContain("机器评分"); expect(rows[0].lastElementChild?.textContent).toBe("0%");
    expect(rows[1].lastElementChild?.textContent).toBe("—");
    expect(host.textContent).toContain("合格线 90");
  });
  it("reuses task search and bounds the selected task count", async () => {
    mount(); button("搜索任务").click(); await settle();
    expect(listTasks).toHaveBeenCalledWith({ keyword: undefined, current: 1, size: 20 });
    expect(host.textContent).toContain("电话销售");
    await select(Array.from({ length: 21 }, (_, i) => `task${i}`)); expect(button("查询业务统计").disabled).toBe(true);
  });
  it("shows separate item states, zero rate, missing reviewed rate and unscored items", async () => {
    const summary = { resultCount: 5, passCount: 1, failCount: 0, notApplicableCount: 1,
      notEvaluatedCount: 1, reviewRequiredCount: 1, errorCount: 1, failureRate: 0 };
    vi.mocked(getBusinessQualityReport).mockResolvedValue({ ...report, groups: [{ ...report.groups[0], items: [{
      itemCode: "notice", name: "风险说明", scored: false, points: null, veto: false, machine: summary,
      reviewed: { ...summary, resultCount: 0, passCount: 0, notApplicableCount: 0, notEvaluatedCount: 0,
        reviewRequiredCount: 0, errorCount: 0, failureRate: null }
    }] }] });
    mount(); await select(["task"]); button("查询业务统计").click(); await settle();
    const rows = [...host.querySelectorAll("table")][1].querySelectorAll("tr");
    expect(rows[0].textContent).toContain("风险说明机器结论—否0%");
    expect(rows[1].textContent).toContain("风险说明人工复核—否—");
    expect(rows[0].lastElementChild?.textContent).toBe("不计分");
    expect(rows[0].textContent).toContain("—否");
    expect(host.textContent).toContain("不满足 ÷（满足 + 不满足）");
  });
  it("warns when frozen scoring standards differ and shows their item weights and veto rules", async () => {
    const summary = { resultCount: 1, passCount: 1, failCount: 0, notApplicableCount: 0,
      notEvaluatedCount: 0, reviewRequiredCount: 0, errorCount: 0, failureRate: 0 };
    const item = { itemCode: "notice", name: "风险说明", scored: true, points: 20, veto: true,
      machine: summary, reviewed: { ...summary, resultCount: 0, passCount: 0, failureRate: null } };
    vi.mocked(getBusinessQualityReport).mockResolvedValue({ ...report, groups: [
      { ...report.groups[0], baseScore: 100, items: [item] },
      { ...report.groups[0], groupKey: "key-v2", versionNo: "2", mode: "POINTS", passingScore: 80,
        baseScore: 100, items: [{ ...item, points: 30, veto: false }] }
    ] });
    mount(); await select(["task"]); button("查询业务统计").click(); await settle();
    expect(host.textContent).toContain("跨组分数不可直接比较");
    expect(host.textContent).toContain("基础分 100");
    expect(host.textContent).toContain("一票否决");
    expect(host.textContent).toContain("否");
    expect(host.textContent).toContain("30");
  });
  it("does not fabricate item statistics for older responses", async () => {
    mount(); await select(["task"]); button("查询业务统计").click(); await settle();
    expect(host.textContent).toContain("当前响应未提供质检项统计");
    expect(host.querySelectorAll("table")).toHaveLength(1);
  });
  it("clears stale reports on selection changes and ignores late responses", async () => {
    let resolve!: (value: Report) => void;
    vi.mocked(getBusinessQualityReport).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    mount(); await select(["task"]); button("查询业务统计").click(); await settle();
    await select(["other"]); resolve(report); await settle();
    expect(host.querySelector("table")).toBeNull();
    button("查询业务统计").click(); await settle(); expect(host.querySelector("table")).not.toBeNull();
    await select(["third"]); expect(host.querySelector("table")).toBeNull();
  });
  it("clears prior data on failure and permits retry", async () => {
    mount(); await select(["task"]); button("查询业务统计").click(); await settle();
    vi.mocked(getBusinessQualityReport).mockRejectedValueOnce(new Error("offline"));
    button("查询业务统计").click(); await settle();
    expect(host.querySelector("table")).toBeNull(); expect(host.textContent).toContain("统计查询失败");
    expect(button("查询业务统计").disabled).toBe(false);
  });
  it("requires report permission and does not require task search permission for known IDs", async () => {
    state.permissions = []; mount(); await settle(); expect(button("查询业务统计")).toBeUndefined();
    expect(getBusinessQualityReport).not.toHaveBeenCalled(); expect(listTasks).not.toHaveBeenCalled();
    app.unmount(); host.remove(); state.permissions = ["iqc:report:view"]; mount(); await settle();
    expect(button("搜索任务")).toBeUndefined(); await select(["task"]); button("查询业务统计").click(); await settle();
    expect(getBusinessQualityReport).toHaveBeenCalledWith(["task"], { task: "LATEST" }, "SELECTED_RUNS"); expect(listTasks).not.toHaveBeenCalled();
  });

  it("requires a run policy and separates trend selection from an exact execution choice", async () => {
    vi.mocked(listTaskExecutions).mockResolvedValue([{ id: "e2", attemptNo: 2, status: "SUCCEEDED",
      processedMessages: 1, failedMessages: 0, current: true }]);
    mount();
    const input = host.querySelector<HTMLTextAreaElement>("textarea")!;
    input.value = "task"; input.dispatchEvent(new Event("input")); await settle();
    expect(button("查询业务统计").disabled).toBe(true);
    const policy = host.querySelector<HTMLSelectElement>('select[aria-label="运行统计口径"]')!;
    policy.value = "LATEST_PER_CONVERSATION"; policy.dispatchEvent(new Event("change", { bubbles: true })); await settle();
    expect(host.querySelector('select[aria-label="执行轮次 task"]')).toBeNull();
    button("查询业务统计").click(); await settle();
    expect(getBusinessQualityReport).toHaveBeenCalledWith(["task"], undefined, "LATEST_PER_CONVERSATION");
    expect(host.textContent).toContain("从所选任务全部执行实例中取每个会话最新结果");
  });
});
