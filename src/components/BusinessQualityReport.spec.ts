import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, reactive, type App } from "vue";
import BusinessQualityReport from "./BusinessQualityReport.vue";
import { getBusinessQualityReport, type BusinessClaimSourceSupportSummary as Support, type BusinessQualityReport as Report } from "@/api/quality";
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
  for (const name of ["AAlert", "AForm", "AFormItem", "ASpace", "ATag", "ACard", "ATableColumn"]) app.component(name, pass);
  app.component("AButton", defineComponent({ setup(_, { slots, attrs }) { return () => h("button", attrs, slots.default?.()); } }));
  app.component("AInput", defineComponent({ props: ["value"], emits: ["update:value"], setup(props, { emit }) {
    return () => h("input", { value: props.value, onInput: (event: Event) => emit("update:value", (event.target as HTMLInputElement).value) });
  } }));
  app.component("ASelect", defineComponent({ props: ["value", "options"], emits: ["update:value"], setup(props, { emit }) {
    return () => h("div", [h("textarea", { value: props.value.join(","), onInput: (event: Event) => emit("update:value", (event.target as HTMLTextAreaElement).value.split(",").filter(Boolean)) }),
      h("span", JSON.stringify(props.options))]);
  } }));
  app.component("ATable", defineComponent({ props: ["dataSource", "columns"], setup(props, { slots }) {
    return () => h("table", props.dataSource.map((row: Record<string, unknown>) => h("tr", (props.columns ?? []).map((column: { dataIndex: string }) =>
      h("td", ["averageScore", "qualifiedRate", "failureRate", "scored", "points", "veto"].includes(column.dataIndex)
        ? slots.bodyCell?.({ column, text: row[column.dataIndex] }) : String(row[column.dataIndex]))))));
  } }));
  app.component("ACheckbox", defineComponent({ props: ["checked"], emits: ["update:checked"], setup(props, { emit, slots }) {
    return () => h("label", [h("input", { type: "checkbox", checked: props.checked,
      onChange: (event: Event) => emit("update:checked", (event.target as HTMLInputElement).checked) }), slots.default?.()]);
  } }));
  app.mount(host);
}
describe("business quality report", () => {
  beforeEach(() => { vi.clearAllMocks(); state.permissions = reactive(["iqc:report:view", "iqc:task:view"]);
    vi.mocked(getBusinessQualityReport).mockResolvedValue(report);
    vi.mocked(listTaskExecutions).mockResolvedValue([]);
    vi.mocked(listTasks).mockResolvedValue({ records: [{ id: "task", name: "电话销售" } as never], current: 1, size: 20, total: 1 }); });
  afterEach(() => { app?.unmount(); host?.remove(); });

  it("identifies pipeline versions and separates calculated scores from manual override denominators", async () => {
    vi.mocked(getBusinessQualityReport).mockResolvedValue({ ...report, groups: [{
      ...report.groups[0], schemeId: "", pipelineId: "pipeline", versionNo: "2",
      reviewed: { ...score, averageScore: 100, manualOverrides: {
        appliedCount: 1, staleCount: 1, averageOverrideScore: 90.25,
        effectiveNumericCount: 2, averageEffectiveScore: 95.13
      } }
    }] });
    mount(); await select(["task"]); button("查询业务统计").click(); await settle();
    expect(host.textContent).toContain("流水线 pipeline · 发布版本 2");
    expect(host.textContent).toContain("复核计算评分");
    expect(host.textContent).toContain("已生效：1 · 基准变化待确认：1");
    expect(host.textContent).toContain("已生效人工覆盖均分：90.25（仅已生效覆盖进入分母）");
    expect(host.textContent).toContain("有效数字均分（覆盖优先）：95.13 · 有效数字数量：2");
    expect(host.textContent).toContain("待定、不适用和缺失计算分数不补零");
  });

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
  function withTokens(): Report {
    return { ...report, groups: [{ ...report.groups[0], modelUsage: {
      schemaVersion: "iqc-business-model-usage-v1", selectedResults: 2, boundResults: 1, unboundResults: 1,
      costs: { callCount: "8", knownCount: "0", unknownCount: "8", currencies: [] },
      latency: { callCount: "8", measuredCount: "0", unknownCount: "8", averageMillis: null },
      tokens: { callCount: "8", input: { knownCount: "3", unknownCount: "5", knownSubtotal: "18446744073709551615" },
        output: { knownCount: "1", unknownCount: "7", knownSubtotal: "0" },
        total: { knownCount: "0", unknownCount: "8", knownSubtotal: null } }
    } }] };
  }
  async function enableUsage() {
    const checkbox=host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    checkbox.checked=true; checkbox.dispatchEvent(new Event("change", { bubbles: true })); await settle();
  }
  it("preserves exact token strings and distinguishes reported zero from missing totals", async () => {
    state.permissions.push("iqc:task:model-calls:view");
    vi.mocked(getBusinessQualityReport).mockResolvedValue(withTokens());
    mount(); await select(["task"]); await enableUsage(); button("查询业务统计").click(); await settle();
    expect(getBusinessQualityReport).toHaveBeenLastCalledWith(["task"], { task: "LATEST" }, "SELECTED_RUNS", true);
    expect(host.textContent).toContain("输入 Token：已知小计 18446744073709551615 · 已知 3 / 未知 5");
    expect(host.textContent).toContain("输出 Token：已知小计 0 · 已知 1 / 未知 7");
    expect(host.textContent).toContain("总量 Token：已知小计 未测量 · 已知 0 / 未知 8");
    expect(host.textContent).not.toContain("18446744073709552000");
    expect(host.textContent).toContain("费用未知 8");
  });
  it("clears token data on source changes and ignores late usage responses", async () => {
    state.permissions.push("iqc:task:model-calls:view");
    let resolve!: (value: Report) => void;
    vi.mocked(getBusinessQualityReport).mockReturnValueOnce(new Promise(done => { resolve=done; }));
    mount(); await select(["task"]); await enableUsage(); button("查询业务统计").click(); await settle();
    await select(["other"]); resolve(withTokens()); await settle();
    expect(host.textContent).not.toContain("18446744073709551615");
    expect(host.querySelector("table")).toBeNull();
    vi.mocked(getBusinessQualityReport).mockResolvedValue(withTokens());
    button("查询业务统计").click(); await settle();
    expect(host.textContent).toContain("18446744073709551615");
    await select(["third"]);
    expect(host.textContent).not.toContain("18446744073709551615");
  });
  it("keeps old responses without token summaries compatible", async () => {
    state.permissions.push("iqc:task:model-calls:view");
    const legacy=withTokens(); delete legacy.groups[0].modelUsage!.tokens;
    vi.mocked(getBusinessQualityReport).mockResolvedValue(legacy);
    mount(); await select(["task"]); await enableUsage(); button("查询业务统计").click(); await settle();
    expect(host.textContent).toContain("费用未知 8");
    expect(host.textContent).not.toContain("供应商已报告输入 Token");
  });

  it("requires a fresh query after report permission is revoked and restored", async () => {
    state.permissions.push("iqc:task:model-calls:view");
    vi.mocked(getBusinessQualityReport).mockResolvedValue(withTokens());
    mount(); await select(["task"]); await enableUsage(); button("查询业务统计").click(); await settle();
    expect(host.textContent).toContain("18446744073709551615");
    state.permissions.splice(state.permissions.indexOf("iqc:report:view"), 1); await settle();
    expect(host.textContent).toContain("暂无质检报表查看权限");
    state.permissions.push("iqc:report:view"); await settle();
    expect(host.textContent).not.toContain("18446744073709551615");
    expect(host.querySelector("table")).toBeNull();
    expect(getBusinessQualityReport).toHaveBeenCalledTimes(1);
  });
  it("discards in-flight reports across report permission revocation and restoration", async () => {
    state.permissions.push("iqc:task:model-calls:view");
    let resolve!: (value: Report) => void;
    vi.mocked(getBusinessQualityReport).mockReturnValueOnce(new Promise(done => { resolve=done; }));
    mount(); await select(["task"]); await enableUsage(); button("查询业务统计").click(); await settle();
    state.permissions.splice(state.permissions.indexOf("iqc:report:view"), 1); await settle();
    resolve(withTokens()); await settle();
    state.permissions.push("iqc:report:view"); await settle();
    expect(host.textContent).not.toContain("18446744073709551615");
    expect(host.querySelector("table")).toBeNull();
    expect(button("查询业务统计").disabled).toBe(false);
  });

  const actionGrant="iqc:action:history:view";
  function withActions():Report{return {...report,actionMetrics:{schemaVersion:"iqc-business-action-metrics-v1",selectedResults:2,boundResults:1,unboundResults:1,
    actionCount:"9007199254740993",confirmedSuccessCount:"1",confirmedFailureCount:"2",unresolvedCount:"9007199254740990",confirmedFailureRate:66.67,states:[]}};}
  async function enableActions(){
    const label=[...host.querySelectorAll("label")].find(item=>item.textContent?.includes("包含所选结果轮次的动作状态"))!;
    const checkbox=label.querySelector<HTMLInputElement>('input[type="checkbox"]')!;checkbox.checked=true;checkbox.dispatchEvent(new Event("change"));await settle();
  }
  it("hides action option without permission and preserves default request",async()=>{
    mount();await select(["task"]);expect(host.textContent).not.toContain("包含所选结果轮次的动作状态");button("查询业务统计").click();await settle();
    expect(getBusinessQualityReport).toHaveBeenCalledWith(["task"],{task:"LATEST"},"SELECTED_RUNS");
  });
  it("requests explicit action metrics and preserves exact count strings",async()=>{
    state.permissions.push(actionGrant);vi.mocked(getBusinessQualityReport).mockResolvedValue(withActions());
    mount();await select(["task"]);await enableActions();button("查询业务统计").click();await settle();
    expect(getBusinessQualityReport).toHaveBeenCalledWith(["task"],{task:"LATEST"},"SELECTED_RUNS",false,true);
    expect(host.textContent).toContain("9007199254740993");expect(host.textContent).toContain("66.67%");
  });
  it("clears loaded action data on revoke and requires fresh opt-in after restore",async()=>{
    state.permissions.push(actionGrant);vi.mocked(getBusinessQualityReport).mockResolvedValue(withActions());mount();await select(["task"]);await enableActions();button("查询业务统计").click();await settle();
    state.permissions.splice(state.permissions.indexOf(actionGrant),1);await settle();expect(host.textContent).not.toContain("9007199254740993");
    state.permissions.push(actionGrant);await settle();button("查询业务统计").click();await settle();
    expect(vi.mocked(getBusinessQualityReport).mock.calls.at(-1)).toEqual([["task"],{task:"LATEST"},"SELECTED_RUNS"]);
  });
  it("discards late action metrics after history permission revoke",async()=>{
    state.permissions.push(actionGrant);let resolve!:(value:Report)=>void;vi.mocked(getBusinessQualityReport).mockReturnValueOnce(new Promise(done=>{resolve=done;}));
    mount();await select(["task"]);await enableActions();button("查询业务统计").click();await settle();state.permissions.splice(state.permissions.indexOf(actionGrant),1);await settle();
    resolve(withActions());await settle();state.permissions.push(actionGrant);await settle();expect(host.textContent).not.toContain("9007199254740993");
  });
  it("warns when requested action metrics are absent instead of implying success",async()=>{
    state.permissions.push(actionGrant);mount();await select(["task"]);await enableActions();button("查询业务统计").click();await settle();
    expect(host.textContent).toContain("无法确认动作失败率");expect(host.textContent).not.toContain("已确认动作失败率：0%");
  });

  it("rejects unknown action metrics protocol",async()=>{
    state.permissions.push(actionGrant);const response=withActions();response.actionMetrics!.schemaVersion="future-protocol" as never;
    vi.mocked(getBusinessQualityReport).mockResolvedValue(response);mount();await select(["task"]);await enableActions();button("查询业务统计").click();await settle();
    expect(host.textContent).toContain("无法确认动作失败率");expect(host.textContent).not.toContain("9007199254740993");
  });
  it("keeps zero records distinct from a measured zero failure rate",async()=>{
    state.permissions.push(actionGrant);const response=withActions();Object.assign(response.actionMetrics!,{actionCount:"0",confirmedSuccessCount:"0",confirmedFailureCount:"0",unresolvedCount:"0",confirmedFailureRate:null});
    vi.mocked(getBusinessQualityReport).mockResolvedValue(response);mount();await select(["task"]);await enableActions();button("查询业务统计").click();await settle();
    expect(host.textContent).toContain("已确认动作失败率：未测量");expect(host.textContent).toContain("不代表动作已经执行成功");
  });


  describe("explicit claim source support summary", () => {
    const grants=["iqc:report:view","iqc:sensitive:conversation:read","iqc:sensitive:pii:read"];
    const partial:Support={schemaVersion:"iqc-model-claim-source-support-summary-v1",scope:"KNOWN_RAW_LLM_FINDINGS_IN_SELECTED_RESULT_RUNS",
      state:"PARTIAL",knownClaims:"6",annotatedClaims:"3",unannotatedClaims:"3",supportedClaims:"1",contradictedClaims:"1",insufficientSourceClaims:"1",annotationCoverage:0.5};
    function response(summary:Support|null=partial):Report {
      const source={expectedResults:2,sourceResults:1,unavailableResults:1,facts:[]};
      return {...report,groups:[{...report.groups[0],schemeId:"",pipelineId:"pipeline"}],findingDistributions:{key:{
        schemaVersion:"iqc-business-finding-distribution-v1",machine:{...source},reviewed:{...source},sourceSupport:summary&&{...summary}}}};
    }
    async function enableFindings(){
      const label=[...host.querySelectorAll("label")].find(item=>item.textContent?.includes("包含按冻结标准分组"))!;
      const checkbox=label.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
      checkbox.checked=true;checkbox.dispatchEvent(new Event("change"));await settle();
    }
    async function query(value:Report=response()){
      vi.mocked(getBusinessQualityReport).mockResolvedValue(value);mount();await select(["task"]);await enableFindings();
      button("查询业务统计").click();await settle();
    }
    beforeEach(()=>{state.permissions.push(...grants.slice(1));});

    it("keeps default request unchanged and only opts into the existing report endpoint",async()=>{
      mount();await select(["task"]);button("查询业务统计").click();await settle();
      expect(getBusinessQualityReport).toHaveBeenLastCalledWith(["task"],{task:"LATEST"},"SELECTED_RUNS");
      await enableFindings();expect(host.querySelector("table")).toBeNull();
      vi.mocked(getBusinessQualityReport).mockResolvedValue(response());button("查询业务统计").click();await settle();
      expect(getBusinessQualityReport).toHaveBeenLastCalledWith(["task"],{task:"LATEST"},"SELECTED_RUNS",false,false,true);
      expect(host.textContent).toContain("部分已标注 · 标注覆盖率 50.00%");
      expect(host.textContent).toContain("已知模型事实 6 · 已标注 3 · 未标注 3");
      expect(host.textContent).toContain("有来源支持 1 · 与来源矛盾 1 · 来源不足 1");
      expect(host.textContent).toContain("不代表完整幻觉率或金标准确率");
    });
    it.each([
      ["UNMEASURED","0","0","0",null,"没有已知模型声明 · 标注覆盖率 未测量"],
      ["UNANNOTATED","2","0","2",0,"尚未标注 · 标注覆盖率 0.00%"],
      ["COMPLETE","3","3","0",1,"本范围全部已标注 · 标注覆盖率 100.00%"]
    ] as const)("distinguishes %s from missing evidence",async(state,known,annotated,unannotated,coverage,label)=>{
      await query(response({...partial,state,knownClaims:known,annotatedClaims:annotated,unannotatedClaims:unannotated,
        supportedClaims:annotated==="0"?"0":"1",contradictedClaims:annotated==="0"?"0":"1",insufficientSourceClaims:annotated==="0"?"0":"1",annotationCoverage:coverage}));
      expect(host.textContent).toContain(label);expect(host.textContent).not.toContain("计数或覆盖率不一致");
    });
    it("preserves long counts above Number precision and exact PARTIAL even when coverage rounds to one",async()=>{
      await query(response({...partial,knownClaims:"9223372036854775807",annotatedClaims:"9223372036854775806",unannotatedClaims:"1",
        supportedClaims:"9223372036854775804",contradictedClaims:"1",insufficientSourceClaims:"1",annotationCoverage:1}));
      expect(host.textContent).toContain("已知模型事实 9223372036854775807 · 已标注 9223372036854775806 · 未标注 1");
      expect(host.textContent).toContain("有来源支持 9223372036854775804");
      expect(host.textContent).toContain("部分已标注 · 标注覆盖率 100.00%");
      expect(host.textContent).not.toContain("本范围全部已标注");
    });
    it("accepts six-place half-up coverage at a rounding tie",async()=>{
      await query(response({...partial,knownClaims:"128",annotatedClaims:"1",unannotatedClaims:"127",supportedClaims:"1",
        contradictedClaims:"0",insufficientSourceClaims:"0",annotationCoverage:0.007813}));
      expect(host.textContent).toContain("部分已标注 · 标注覆盖率 0.78%");
      expect(host.textContent).not.toContain("计数或覆盖率不一致");
    });
    it.each([null,undefined])("keeps absent legacy summary %s unmeasured instead of fabricating zero",async absent=>{
      const value=response();value.findingDistributions!.key.sourceSupport=absent;await query(value);
      expect(host.textContent).toContain("尚未提供模型事实来源支持摘要");
      expect(host.textContent).not.toContain("已知模型事实 0");expect(host.textContent).not.toContain("标注覆盖率 0.00%");
    });
    it.each([
      ["future schema",{schemaVersion:"future"}], ["wrong scope",{scope:"ALL"}], ["count conservation",{knownClaims:"7"}],
      ["verdict conservation",{supportedClaims:"2"}], ["noncanonical integer",{knownClaims:"06"}],
      ["overflow",{knownClaims:"9223372036854775808"}], ["numeric count",{knownClaims:6}],
      ["negative",{supportedClaims:"-1"}], ["wrong state",{state:"COMPLETE"}], ["wrong coverage",{annotationCoverage:0.500001}],
      ["NaN",{annotationCoverage:NaN}], ["infinite",{annotationCoverage:Infinity}], ["missing measured coverage",{annotationCoverage:null}]
    ])("rejects %s without presenting partial statistics",async(_label,patch)=>{
      await query(response({...partial,...patch} as Support));
      expect(host.textContent).toContain("来源支持摘要的计数或覆盖率不一致");
      expect(host.textContent).not.toContain("已知模型事实 6");expect(host.textContent).not.toContain("有来源支持 1");
    });
    it("rejects non-null zero-denominator coverage and claims without a machine source",async()=>{
      const value=response({...partial,state:"UNMEASURED",knownClaims:"0",annotatedClaims:"0",unannotatedClaims:"0",
        supportedClaims:"0",contradictedClaims:"0",insufficientSourceClaims:"0",annotationCoverage:0});
      await query(value);expect(host.textContent).toContain("计数或覆盖率不一致");
      const impossible=response();Object.assign(impossible.findingDistributions!.key.machine,{sourceResults:0,unavailableResults:2});
      vi.mocked(getBusinessQualityReport).mockResolvedValue(impossible);button("查询业务统计").click();await settle();
      expect(host.textContent).toContain("计数或覆盖率不一致");expect(host.textContent).not.toContain("已知模型事实 6");
    });
    it("keeps summaries in their frozen groups and clears them when the run policy changes",async()=>{
      const value=response();value.groups.push({...value.groups[0],groupKey:"key2",versionNo:"2"});
      value.findingDistributions!.key2={...value.findingDistributions!.key,sourceSupport:{...partial,state:"UNANNOTATED",knownClaims:"9",
        annotatedClaims:"0",unannotatedClaims:"9",supportedClaims:"0",contradictedClaims:"0",insufficientSourceClaims:"0",annotationCoverage:0}};
      await query(value);expect(host.textContent).toContain("已知模型事实 6 · 已标注 3 · 未标注 3");
      expect(host.textContent).toContain("已知模型事实 9 · 已标注 0 · 未标注 9");
      const policy=host.querySelector<HTMLSelectElement>('select[aria-label="运行统计口径"]')!;
      policy.value="FIRST_PER_CONVERSATION";policy.dispatchEvent(new Event("change"));await settle();
      expect(host.textContent).not.toContain("已知模型事实 6");button("查询业务统计").click();await settle();
      expect(getBusinessQualityReport).toHaveBeenLastCalledWith(["task"],undefined,"FIRST_PER_CONVERSATION",false,false,true);
    });
    it.each(grants)("clears loaded and late summaries across %s revoke and restore",async grant=>{
      await query();expect(host.textContent).toContain("已知模型事实 6");
      state.permissions.splice(state.permissions.indexOf(grant),1);await settle();
      expect(host.textContent).not.toContain("已知模型事实 6");
      state.permissions.push(grant);await settle();expect(host.textContent).not.toContain("已知模型事实 6");
      await enableFindings();button("查询业务统计").click();await settle();
      expect(host.textContent).toContain("已知模型事实 6");
      let resolve!:(value:Report)=>void;vi.mocked(getBusinessQualityReport).mockReturnValueOnce(new Promise(done=>{resolve=done;}));
      button("查询业务统计").click();await settle();state.permissions.splice(state.permissions.indexOf(grant),1);await settle();
      state.permissions.push(grant);await settle();resolve(response());await settle();
      expect(host.textContent).not.toContain("已知模型事实 6");expect(host.querySelector("table")).toBeNull();
      button("查询业务统计").click();await settle();
      expect(getBusinessQualityReport).toHaveBeenLastCalledWith(["task"],{task:"LATEST"},"SELECTED_RUNS");
      expect(host.textContent).not.toContain("已知模型事实 6");
      await enableFindings();button("查询业务统计").click();await settle();expect(host.textContent).toContain("已知模型事实 6");
    });
  });
});
