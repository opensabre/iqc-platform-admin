import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createApp, h, nextTick, type App } from "vue";
import Antd from "ant-design-vue";
import Tasks from "./index.vue";
import { listTasks } from "@/api/tasks";
import { listAgents, listRules, listRuleSets } from "@/api/config";
import { getLabelTree } from "@/api/labels";

vi.mock("vue-router", () => ({ useRouter: () => ({ currentRoute: { value: { query: {} } } }) }));
vi.mock("@/composables/permission", () => ({ usePermission: () => ({ can: () => true }) }));
vi.mock("@/api/dictionaries", () => ({ getCachedDictionaries: async () => ({}) }));
vi.mock("@/api/tasks", async original => ({ ...await original<any>(), listTasks: vi.fn() }));
vi.mock("@/api/config", async original => ({ ...await original<any>(), listAgents: vi.fn(), listRules: vi.fn(), listRuleSets: vi.fn() }));
vi.mock("@/api/labels", async original => ({ ...await original<any>(), getLabelTree: vi.fn() }));
// Observe the real page's catalog handoff without retesting the wizard's own fields.
vi.mock("@/components/TaskCreateWizard.vue", () => ({ default: {
  props: ["agents", "rules", "labelingTargets"],
  render(this: any) { return h("output", { "data-catalogs": true }, JSON.stringify({ rules: this.rules, labels: this.labelingTargets })); },
} }));
let app: App, root: HTMLDivElement;
async function settle() { for (let i = 0; i < 15; i++) { await Promise.resolve(); await nextTick(); } }
function click(text: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.replace(/\s/g, "") === text);
  expect(button).toBeDefined(); button!.click();
}
function catalogs() { return JSON.parse(document.querySelector("[data-catalogs]")!.textContent!); }
async function mount() { app = createApp(Tasks).use(Antd); app.mount(root); await settle(); }
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listTasks).mockResolvedValue({ records: [{ id: "task-1", name: "已有任务", taskType: "BATCH", status: "CREATED", totalMessages: 0, processedMessages: 0 }], total: 1 } as any);
  vi.mocked(listAgents).mockResolvedValue([]);
  vi.mocked(listRules).mockResolvedValue([{ id: "published-rule", name: "已发布规则", status: "PUBLISHED" }, { id: "draft", status: "DRAFT" }] as any);
  vi.mocked(listRuleSets).mockResolvedValue([]);
  vi.mocked(getLabelTree).mockResolvedValue({ categories: [], groups: [], labels: [{ id: "label-1", name: "退款标签", status: "PUBLISHED" }] } as any);
  root = document.createElement("div"); document.body.append(root);
});
afterEach(() => { app?.unmount(); root.remove(); document.body.innerHTML = ""; });
it("keeps tasks and inspection references when the label catalog fails", async () => {
  vi.mocked(getLabelTree).mockRejectedValue(new Error("label catalog unavailable"));
  await mount();
  expect(root.textContent).toContain("已有任务"); expect(root.textContent).toContain("标签配置加载失败");
  click("创建任务"); await settle();
  expect(catalogs().rules.map((row: any) => row.id)).toEqual(["published-rule"]);
  expect(catalogs().labels).toEqual([]);
});
it("keeps labeling references when rule and legacy rule-set catalogs fail", async () => {
  vi.mocked(listRules).mockRejectedValue(new Error("rules unavailable"));
  vi.mocked(listRuleSets).mockRejectedValue(new Error("rule sets unavailable"));
  await mount(); click("创建任务"); await settle();
  expect(root.textContent).toContain("已有任务");
  expect(catalogs().rules).toEqual([]); expect(catalogs().labels).toEqual([{ value: "label-1", label: "退款标签" }]);
});
it("clears stale references after failure and restores the catalog on explicit retry", async () => {
  await mount(); click("创建任务"); await settle(); expect(catalogs().labels).toHaveLength(1);
  vi.mocked(getLabelTree).mockRejectedValueOnce(new Error("temporary failure"));
  click("查询"); await settle(); expect(catalogs().labels).toEqual([]);
  expect(root.textContent).toContain("标签配置加载失败");
  click("重试加载"); await settle(); expect(catalogs().labels).toHaveLength(1);
  expect(root.textContent).not.toContain("配置加载失败");
});
