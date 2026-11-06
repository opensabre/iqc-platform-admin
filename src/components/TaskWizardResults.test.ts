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
    engines:[{engineResultId:"r1",operation:"LABELING",engineInstanceId:"regex1",engineType:"REGEX",sequence:1,status:"SUCCEEDED",startedAt:0,finishedAt:1,configuration:{},rawOutput:"原始退款响应",observations:[],evidence:[{evidenceId:"proof1",messageId:"m1",start:0,end:2,quote:"退款"}]},
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
    await tab("打标标签");expect(root.textContent).toContain("是否退款");expect(root.textContent).toContain("yes：false");
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
});
