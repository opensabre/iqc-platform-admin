import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createApp, h, nextTick, type App } from "vue";
import Antd from "ant-design-vue";
import Results from "./index.vue";
import { getBatchResultSummary, getConversationResultDetail, getResultHierarchy, listBusinessResults } from "@/api/results";
const state = vi.hoisted(() => ({query:{taskId:"t1",conversationId:"c2",sourceResultId:"result2"}}));
vi.mock("vue-router", () => ({useRoute:() => ({query:state.query}),useRouter:() => ({push:vi.fn()})}));
vi.mock("@/composables/permission", () => ({usePermission:() => ({can:() => false})}));
vi.mock("@/components/ReviewTaskSelector.vue", () => ({default:{render:() => null}}));
vi.mock("@/components/ConversationDetailDrawer.vue", () => ({default:{render:() => null}}));
vi.mock("@/components/TaskWizardResults.vue", () => ({default:{props:["summary","task"],render(this:any) {
  return h("div", {"data-wizard":true}, `${this.task.id}:${this.summary.conversations.map((row:any) => row.conversationId).join(",")}`);
}}}));
vi.mock("@/api/results", async original => ({...await original<any>(),getBatchResultSummary:vi.fn(),getConversationResultDetail:vi.fn(),getResultHierarchy:vi.fn(),listBusinessResults:vi.fn()}));
vi.mock("@/api/dictionaries", () => ({getCachedDictionaries:async () => ({}),dictionaryLabel:(_items:unknown,value:string) => value}));
let app:App, root:HTMLDivElement;
async function settle() { for (let i=0;i<15;i++) { await Promise.resolve(); await nextTick(); } }
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listBusinessResults).mockResolvedValue({records:[],total:0,current:1,size:20});
  vi.mocked(getConversationResultDetail).mockResolvedValue({task:{id:"t1",ruleSnapshotJson:'{"schemaVersion":"iqc-task-wizard-v1"}'},messages:[],results:[]} as any);
  vi.mocked(getResultHierarchy).mockResolvedValue({conversation:{id:"result2"}} as any);
  vi.mocked(getBatchResultSummary).mockResolvedValue({taskId:"t1",conversations:[{conversationId:"c1"},{conversationId:"c2"}]} as any);
  root = document.createElement("div"); document.body.append(root);
});
afterEach(() => { app?.unmount(); root.remove(); document.body.innerHTML = ""; });
function mount() { app = createApp(Results).use(Antd); app.mount(root); }
it("opens the clicked wizard conversation instead of the first conversation and excludes legacy conclusions", async () => {
  mount(); await settle();
  expect(getConversationResultDetail).toHaveBeenCalledWith("t1","c2");
  expect(document.querySelector("[data-wizard]")?.textContent).toBe("t1:c2");
  expect(document.body.textContent).not.toContain("本条消息未发现不满足项");
  expect(document.body.textContent).not.toContain("风险等级");
});
it("does not substitute another conversation when the clicked one is missing", async () => {
  vi.mocked(getBatchResultSummary).mockResolvedValue({taskId:"t1",conversations:[{conversationId:"c1"}]} as any);
  mount(); await settle();
  expect(document.querySelector("[data-wizard]")).toBeNull();
});
it("keeps stale review result protection before opening the wizard component", async () => {
  vi.mocked(getResultHierarchy).mockResolvedValue({conversation:{id:"replacement"}} as any);
  mount(); await settle();
  expect(getBatchResultSummary).not.toHaveBeenCalled();
  expect(document.querySelector("[data-wizard]")).toBeNull();
});
