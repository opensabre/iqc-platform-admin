// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createApp, h, nextTick, reactive, type App } from "vue";
import Antd from "ant-design-vue";
import TaskExecutionSnapshot from "./TaskExecutionSnapshot.vue";
import { getTaskExecutionSnapshot, listTaskExecutions } from "@/api/tasks";
vi.mock("@/api/tasks", () => ({ getTaskExecutionSnapshot: vi.fn(), listTaskExecutions: vi.fn() }));
let app: App, root: HTMLDivElement;
async function settle() { for (let i=0; i<10; i++) { await Promise.resolve(); await nextTick(); } }
function mount() {
  const props = reactive({taskId:"task"}); root = document.createElement("div"); document.body.append(root);
  app = createApp({render:() => h(TaskExecutionSnapshot,props)}).use(Antd); app.mount(root); return props;
}
const frozen = {executionId:"attempt-2",runId:"root-1",attemptNo:2,status:"SUCCEEDED",configurationSnapshotJson:'{"ruleVersion":1,"actionVersion":2}',selectionSnapshotJson:'{"conversationIds":[]}'};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listTaskExecutions).mockResolvedValue([{id:"attempt-1",runId:"root-1",attemptNo:1,status:"FAILED",current:false,processedMessages:0,failedMessages:0},{id:"attempt-2",runId:"root-1",attemptNo:2,status:"SUCCEEDED",current:true,processedMessages:0,failedMessages:0}]);
  vi.mocked(getTaskExecutionSnapshot).mockResolvedValue(frozen);
});
afterEach(() => { app?.unmount(); root?.remove(); });
it("loads the current immutable attempt on demand even when no conversations were selected", async () => {
  mount(); await settle(); expect(listTaskExecutions).not.toHaveBeenCalled();
  root.querySelector("button")!.click(); await settle();
  expect(getTaskExecutionSnapshot).toHaveBeenCalledWith("task","attempt-2");
  expect(root.textContent).toContain('"ruleVersion": 1'); expect(root.textContent).toContain('"actionVersion": 2');
  expect(root.textContent).toContain('"conversationIds": []'); expect(root.textContent).toContain("root-1");
});
it("reports a missing snapshot as an error without substituting current configuration", async () => {
  vi.mocked(getTaskExecutionSnapshot).mockRejectedValueOnce(new Error("missing"));
  mount(); root.querySelector("button")!.click(); await settle();
  expect(root.textContent).toContain("执行快照加载失败"); expect(root.textContent).not.toContain("ruleVersion");
  [...root.querySelectorAll("button")].find(button => button.textContent?.replace(/\s/g, "").includes("重试"))!.click(); await settle();
  expect(root.textContent).toContain('"ruleVersion": 1');
});
it("discards an old task's in-flight snapshot when the detail changes", async () => {
  let finish!: (value:typeof frozen) => void;
  vi.mocked(getTaskExecutionSnapshot).mockReturnValueOnce(new Promise(resolve => {finish=resolve;}));
  const props = mount(); root.querySelector("button")!.click(); await settle();
  props.taskId = "another-task"; await settle(); finish(frozen); await settle();
  expect(root.textContent).not.toContain("ruleVersion"); expect(root.textContent).toContain("查看各次执行快照");
});
it("shows no execution without querying a fabricated attempt", async () => {
  vi.mocked(listTaskExecutions).mockResolvedValue([]);
  mount(); root.querySelector("button")!.click(); await settle();
  expect(root.textContent).toContain("尚未生成执行实例"); expect(getTaskExecutionSnapshot).not.toHaveBeenCalled();
});

it("requests the selected historical attempt without resolving current definitions", async () => {
  mount(); root.querySelector("button")!.click(); await settle();
  const selector = root.querySelector<HTMLElement>(".ant-select-selector")!;
  selector.dispatchEvent(new MouseEvent("mousedown", {bubbles:true})); await settle();
  const option = [...document.querySelectorAll<HTMLElement>(".ant-select-item-option")].find(item => item.textContent?.includes("第 1 次"));
  expect(option).toBeDefined(); option!.click(); await settle();
  expect(getTaskExecutionSnapshot).toHaveBeenLastCalledWith("task", "attempt-1");
});
