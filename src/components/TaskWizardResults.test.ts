import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, h, nextTick, reactive, type App } from "vue";
import Antd from "ant-design-vue";
import TaskWizardResults from "./TaskWizardResults.vue";
import { getResultHierarchy, type BatchResultSummary, type ResultHierarchy } from "@/api/results";
import { listTaskExecutions, type InspectionTask } from "@/api/tasks";
vi.mock("@/api/results", () => ({getResultHierarchy:vi.fn()}));
vi.mock("@/api/tasks", () => ({listTaskExecutions:vi.fn()}));
const task = {id:"t1",ruleSnapshotJson:JSON.stringify({schemaVersion:"iqc-task-wizard-v1",enginePlan:{engines:[{operation:"INSPECTION"},{operation:"LABELING"}]}})} as InspectionTask;
const summary = {taskId:"t1",conversations:[{conversationId:"c1",sourceFileName:"会话一"},{conversationId:"c2",sourceFileName:"会话二"}]} as BatchResultSummary;
function fixture():ResultHierarchy {
  return {conversation:null,rules:[],evidenceByRuleResult:{},executionId:"run-1",engineResultSet:{
    resultSetId:"rs1",taskId:"t1",executionId:"run-1",conversationId:"c1",
    input:{snapshotId:"s1",messages:[{messageId:"m1",sequence:1,speakerRole:"CUSTOMER",relativeTime:"00:01",content:"退款"}]},
    taskConfiguration:{enginePlan:{engines:[]},resultProcessing:{labelSnapshot:{labels:[{id:"label1",name:"是否退款"}]}}},
    engines:[{engineResultId:"r1",operation:"LABELING",engineInstanceId:"regex1",engineType:"REGEX",sequence:1,status:"SUCCEEDED",startedAt:0,finishedAt:1,configuration:{engineName:"退款标签判断"},rawOutput:"原始退款响应",observations:[],evidence:[{evidenceId:"proof1",messageId:"m1",start:0,end:2,quote:"退款"}]},
    {engineResultId:"r2",operation:"INSPECTION",engineInstanceId:"llm1",engineType:"LLM",sequence:1,status:"FAILED",startedAt:0,finishedAt:1,configuration:{},rawOutput:"invalid",failure:{code:"TIMEOUT",message:"调用超时"},observations:[],evidence:[]}]},
    processedResult:{sourceResultSetId:"rs1",sourceEngineResultIds:["r1","r2"],output:{inspectionItems:[{targetId:"服务规范",status:"CONFLICT",candidates:[]}],labels:[{targetId:"label1",valueCode:"yes",status:"KNOWN",value:false,candidates:[{engineInstanceId:"regex1",sourceEngineResultId:"r1",status:"DETERMINED",mappedValue:false,evidenceIds:["proof1"]}]}]}}};
}
let app:App, root:HTMLDivElement;
async function settle() { for (let i=0;i<8;i++) { await Promise.resolve(); await nextTick(); } }
function mount(overrides:Partial<{summary:BatchResultSummary;task:InspectionTask}> = {}) {
  const props = reactive({summary,task,...overrides}); root = document.createElement("div");document.body.append(root);
  app = createApp({render:() => h(TaskWizardResults,props)}).use(Antd); app.mount(root); return props;
}
async function tab(name:string) { const button = [...root.querySelectorAll<HTMLElement>('[role="tab"]')].find(item => item.textContent?.includes(name)); expect(button).toBeDefined();button!.click();await settle(); }
beforeEach(() => { vi.clearAllMocks();vi.mocked(listTaskExecutions).mockResolvedValue([]);vi.mocked(getResultHierarchy).mockResolvedValue(fixture()); });
afterEach(() => {app?.unmount();root?.remove();});
describe("wizard result presentation", () => {
  it("shows unresolved quality as pending and preserves false label values with source evidence", async () => {
    mount();await settle(); expect(root.textContent).toContain("最终评分：待确认");expect(root.textContent).toContain("冲突");
    await tab("打标标签");expect(root.textContent).toContain("是否退款");expect(root.textContent).toContain("yes：false");expect(root.textContent).toContain("退款标签判断");
    expect(root.textContent).toContain('m1：“退款”');
    await tab("引擎记录"); expect(root.textContent).toContain("TIMEOUT：调用超时");expect(root.textContent).toContain("原始退款响应");
  });
  it("does not display a final score until processing completes", async () => {
    const data = fixture();data.processedResult=null;vi.mocked(getResultHierarchy).mockResolvedValue(data);
    mount();await settle();expect(root.textContent).toContain("结果处理尚未完成");expect(root.textContent).toContain("最终评分：待确认");
  });
  it("does not let an old conversation response replace a newer selection", async () => {
    let resolveOld!:(value:ResultHierarchy)=>void;
    vi.mocked(getResultHierarchy).mockImplementationOnce(() => new Promise(resolve => {resolveOld=resolve;}));
    const props=mount();await settle();
    props.summary={...summary,conversations:[{...summary.conversations[1]!}]};await settle();
    expect(getResultHierarchy).toHaveBeenLastCalledWith("t1","c2",undefined);
    const old=fixture();old.executionId="obsolete-run";resolveOld(old);await settle();
    expect(root.textContent).not.toContain("obsolete-run");expect(root.textContent).toContain("run-1");
  });
  it("shows an empty runtime selection without querying a made-up conversation", async () => {
    mount({summary:{...summary,conversations:[]}});await settle();expect(root.textContent).toContain("尚未确定执行数据");expect(getResultHierarchy).not.toHaveBeenCalled();
  });
  it("opens labeling-only results without a quality tab or a fabricated score", async () => {
    const data = fixture(); data.engineResultSet!.engines = data.engineResultSet!.engines.filter(engine => engine.operation === "LABELING");
    data.processedResult!.output.inspectionItems = [];
    vi.mocked(getResultHierarchy).mockResolvedValue(data);
    mount({task:{...task,ruleSnapshotJson:JSON.stringify({enginePlan:{engines:[{operation:"LABELING"}]}})}});
    await settle();
    const tabs = [...root.querySelectorAll('[role="tab"]')].map(item => item.textContent);
    expect(tabs).toEqual(["打标标签", "引擎记录"]);
    expect(root.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("打标标签");
    expect(root.textContent).toContain("yes：false");
    expect(root.textContent).not.toContain("最终评分");
  });
  it("shows unified stages and pending policy without a final label or score", async () => {
    const data = fixture();
    const config = {enginePlan:{engines:[{operation:"LABELING"}]},unifiedLabels:{labels:[{id:"label1",name:"是否退款"}]}};
    data.engineResultSet!.taskConfiguration = config;
    const engine = data.engineResultSet!.engines[0]!;
    engine.configuration = {schemaVersion:"iqc-unified-tags-v1"};
    engine.rawOutput = JSON.stringify({metadata:{applicableTagCount:2,pendingTagCount:1,filteredTagCount:1,elapsedMs:5,modelCalled:false}});
    data.engineResultSet!.engines = [engine];
    data.processedResult!.output = {labels:[],processingStatus:"PENDING_POLICY",reason:"匹配已保存；正式标签与扣分策略待确认"};
    vi.mocked(getResultHierarchy).mockResolvedValue(data);
    mount({task:{...task,ruleSnapshotJson:JSON.stringify(config)}});await settle();
    expect(root.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("引擎记录");
    expect(root.textContent).toContain("正式标签与扣分策略待确认");
    expect(root.textContent).toContain("适用标签 2 个");
    expect(root.textContent).toContain("已过滤 1 个");
    expect(root.textContent).not.toContain("最终评分");
  });
  it.each([
    {provider:{model:"reported-model-v2",inputTokens:123,outputTokens:45}, expected:"输入 123 / 输出 45 Token"},
    {provider:{inputTokens:0,outputTokens:0}, expected:"输入 0 / 输出 0 Token"},
    {provider:undefined, expected:"输入 未知 / 输出 未知 Token"},
  ])("shows provider usage without inventing missing counts: $expected", async ({provider,expected}) => {
    const data = fixture();
    const config = {enginePlan:{engines:[{operation:"LABELING"}]},unifiedLabels:{labels:[]}};
    data.engineResultSet!.taskConfiguration = config;
    const engine = data.engineResultSet!.engines[0]!;
    engine.engineType = "LLM";
    engine.configuration = {schemaVersion:"iqc-unified-tags-v1"};
    engine.rawOutput = JSON.stringify({metadata:{applicableTagCount:2,pendingTagCount:1,
      filteredTagCount:1,elapsedMs:5,modelCalled:true,provider}});
    data.engineResultSet!.engines = [engine];
    vi.mocked(getResultHierarchy).mockResolvedValue(data);
    mount({task:{...task,ruleSnapshotJson:JSON.stringify(config)}});await settle();
    expect(root.textContent).toContain(expected);
    expect(root.textContent).toContain("已过滤 1 个");
    if (provider?.model) expect(root.textContent).toContain("模型 reported-model-v2");
  });
  it("switches between old and successful executions through the history selector", async () => {
    const previous = fixture();
    const latest = fixture();
    latest.executionId = "run-2";
    latest.engineResultSet!.executionId = "run-2";
    latest.engineResultSet!.engines[1]!.status = "SUCCEEDED";
    delete latest.engineResultSet!.engines[1]!.failure;
    latest.engineResultSet!.engines[0]!.rawOutput = "重试后原始响应";
    latest.processedResult!.output.scoring = {mode:"DEDUCTION",scoreStatus:"FINAL",finalScore:90,conclusion:"PASS",lines:[]};
    latest.processedResult!.output.labels[0]!.value = true;
    vi.mocked(listTaskExecutions).mockResolvedValue([
      {id:"run-1",attemptNo:1,status:"PARTIAL_FAILED",processedMessages:1,failedMessages:0,current:false},
      {id:"run-2",attemptNo:2,status:"SUCCEEDED",processedMessages:1,failedMessages:0,current:true},
    ]);
    vi.mocked(getResultHierarchy).mockImplementation(async (_task, _conversation, execution) => execution === "run-1" ? previous : latest);
    async function selectExecution(label:string) {
      const selector = root.querySelector<HTMLElement>('#result-execution')!.closest('.ant-select')!.querySelector<HTMLElement>('.ant-select-selector')!;
      selector.dispatchEvent(new MouseEvent("mousedown", {bubbles:true}));
      await settle();
      const option = [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')].find(item => item.textContent?.includes(label));
      expect(option).toBeDefined();
      option!.click();
      await settle();
    }
    mount(); await settle();
    expect(root.textContent).toContain("来源执行：run-2");
    await selectExecution("第 1 次");
    expect(getResultHierarchy).toHaveBeenLastCalledWith("t1","c1","run-1");
    expect(root.textContent).toContain("来源执行：run-1");
    expect(root.textContent).toContain("最终评分：待确认");
    await tab("打标标签"); expect(root.textContent).toContain("yes：false");
    await tab("引擎记录"); expect(root.textContent).toContain("TIMEOUT：调用超时");
    await selectExecution("第 2 次");
    expect(getResultHierarchy).toHaveBeenLastCalledWith("t1","c1","run-2");
    expect(root.textContent).toContain("来源执行：run-2");
    expect(root.textContent).not.toContain("TIMEOUT：调用超时");
    expect(root.textContent).toContain("重试后原始响应");
    await tab("质检评分"); expect(root.textContent).toContain("90.00");
    await tab("打标标签"); expect(root.textContent).toContain("yes：true");
  });

});
