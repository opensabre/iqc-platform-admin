import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createApp, h, nextTick, type App } from "vue";
import Antd from "ant-design-vue";
import Tasks from "./index.vue";
import CreateTask from "./create.vue";
import { listTasks } from "@/api/tasks";
import { listAgents, listRules, listRuleSets } from "@/api/config";
import { getLabelTree } from "@/api/labels";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("vue-router", () => ({ useRouter: () => ({ push, currentRoute: { value: { query: {} } } }) }));
vi.mock("@/composables/permission", () => ({ usePermission: () => ({ can: () => true }) }));
vi.mock("@/api/dictionaries", () => ({ getCachedDictionaries: async () => ({}) }));
vi.mock("@/api/tasks", async original => ({ ...await original<any>(), listTasks: vi.fn() }));
vi.mock("@/api/config", async original => ({ ...await original<any>(), listAgents: vi.fn(), listRules: vi.fn(), listRuleSets: vi.fn() }));
vi.mock("@/api/labels", async original => ({ ...await original<any>(), getLabelTree: vi.fn() }));
// Observe the real page's catalog handoff without retesting the wizard's own fields.
vi.mock("@/components/TaskCreateWizard.vue", () => ({ default: {
  props: ["agents", "labelingTargets"], emits: ["cancel", "created"],
  render(this: any) { return h("div", [h("output", { "data-catalogs": true }, JSON.stringify({ agents: this.agents, labels: this.labelingTargets })),
    h("button", { onClick: () => this.$emit("cancel") }, "取消"),
    h("button", { onClick: () => this.$emit("created", { id: "created-task" }) }, "完成创建")]); },
} }));
let app: App, root: HTMLDivElement;
async function settle() { for (let i = 0; i < 15; i++) { await Promise.resolve(); await nextTick(); } }
function click(text: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.replace(/\s/g, "") === text);
  expect(button).toBeDefined(); button!.click();
}
function catalogs() { return JSON.parse(document.querySelector("[data-catalogs]")!.textContent!); }
async function mount(component = CreateTask) { app = createApp(component).use(Antd); app.mount(root); await settle(); }
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listTasks).mockResolvedValue({ records: [{ id: "task-1", name: "已有任务", taskType: "BATCH", status: "CREATED", totalMessages: 0, processedMessages: 0 }], total: 1 } as any);
  vi.mocked(listAgents).mockResolvedValue([{ id: "agent-1", name: "已发布智能体", status: "PUBLISHED" }, { id: "draft-agent", status: "DRAFT" }] as any);
  vi.mocked(listRules).mockResolvedValue([{ id: "published-rule", name: "已发布规则", status: "PUBLISHED" }, { id: "draft", status: "DRAFT" }] as any);
  vi.mocked(listRuleSets).mockResolvedValue([]);
  vi.mocked(getLabelTree).mockResolvedValue({ categories: [], groups: [], labels: [{ id: "label-1", name: "退款标签", status: "PUBLISHED" }] } as any);
  root = document.createElement("div"); document.body.append(root);
});
afterEach(() => { app?.unmount(); root.remove(); document.body.innerHTML = ""; });
it("opens a standalone creation route from the task list without loading creation catalogs", async () => {
  await mount(Tasks); expect(root.textContent).toContain("已有任务");
  click("创建任务"); await settle(); expect(push).toHaveBeenCalledWith("/tasks/create");
  expect(getLabelTree).not.toHaveBeenCalled(); expect(listAgents).not.toHaveBeenCalled();
  expect(root.querySelector("[data-catalogs]")).toBeNull();
});
it("keeps published agents when the creation page label catalog fails", async () => {
  vi.mocked(getLabelTree).mockRejectedValue(new Error("label catalog unavailable"));
  await mount(); expect(root.textContent).toContain("标签配置加载失败");
  expect(catalogs().agents.map((row: any) => row.id)).toEqual(["agent-1"]);
  expect(catalogs().labels).toEqual([]); expect(listTasks).not.toHaveBeenCalled();
});
it("keeps labels when the agent catalog fails and does not load unused rule catalogs", async () => {
  vi.mocked(listAgents).mockRejectedValue(new Error("agents unavailable"));
  await mount(); expect(root.textContent).toContain("智能体配置加载失败");
  expect(catalogs().agents).toEqual([]); expect(catalogs().labels).toEqual([{ value: "label-1", label: "退款标签" }]);
  expect(listRules).not.toHaveBeenCalled(); expect(listRuleSets).not.toHaveBeenCalled();
});
it("restores a failed catalog on explicit retry", async () => {
  vi.mocked(getLabelTree).mockRejectedValueOnce(new Error("temporary failure"));
  await mount(); expect(catalogs().labels).toEqual([]);
  click("重试加载"); await settle(); expect(catalogs().labels).toHaveLength(1);
  expect(root.textContent).not.toContain("配置加载失败");
});
it("returns to the task list from the page header or cancellation", async () => {
  await mount(); click("返回任务列表"); await settle(); expect(push).toHaveBeenLastCalledWith("/tasks");
  push.mockClear(); click("取消"); await settle(); expect(push).toHaveBeenCalledWith("/tasks");
});
it("returns to the task list after successful creation", async () => {
  await mount(); click("完成创建"); await settle(); expect(push).toHaveBeenCalledWith("/tasks");
});
