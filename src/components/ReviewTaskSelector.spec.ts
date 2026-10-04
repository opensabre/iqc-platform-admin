import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref, type App } from "vue";
import ReviewTaskSelector from "./ReviewTaskSelector.vue";
import { listTasks } from "@/api/tasks";

const state = vi.hoisted(() => ({ taskView: true }));
vi.mock("@/composables/permission", () => ({ usePermission: () => ({ can: (code: string) => code === "iqc:task:view" && state.taskView }) }));
vi.mock("@/api/tasks", () => ({ listTasks: vi.fn() }));

let app: App, host: HTMLDivElement;
async function settle() { for (let i = 0; i < 12; i++) { await Promise.resolve(); await nextTick(); } }
function mount(initialTaskId = "") {
  const taskId = ref(initialTaskId);
  host = document.createElement("div"); document.body.append(host);
  app = createApp(defineComponent({ setup() { return () => h(ReviewTaskSelector, {
    modelValue: taskId.value, "onUpdate:modelValue": (value: string) => { taskId.value = value; }
  }); } }));
  app.component("AInputSearch", defineComponent({ props: ["value"], setup(props, { attrs }) { return () => h("div", [
    h("input", { "aria-label": "按任务名称查找", value: props.value,
      onInput: (event: Event) => (attrs["onUpdate:value"] as (value: string) => void)((event.target as HTMLInputElement).value) }),
    h("button", { onClick: () => (attrs.onSearch as () => void)() }, "搜索任务")
  ]); } }));
  app.component("ASelect", defineComponent({ props: ["options"], setup(props, { attrs }) { return () => h("div", (props.options as { value: string; label: string }[])
    .map(option => h("button", { onClick: () => (attrs.onChange as (value: string | undefined) => void)(option.value) }, option.label))
    .concat(h("button", { onClick: () => (attrs.onChange as (value: string | undefined) => void)(undefined) }, "清空选择"))); } }));
  app.component("AButton", defineComponent({ setup(_, { slots, attrs }) { return () => h("button", attrs, slots.default?.()); } }));
  app.component("AInput", defineComponent({ props: ["value"], setup(props, { attrs }) { return () => h("input", {
    "aria-label": "任务 ID 筛选", value: props.value,
    onInput: (event: Event) => (attrs["onUpdate:value"] as (value: string) => void)((event.target as HTMLInputElement).value)
  }); } }));
  app.mount(host);
  return taskId;
}

describe("review task selector", () => {
  beforeEach(() => { vi.clearAllMocks(); state.taskView = true; });
  afterEach(() => { app?.unmount(); host?.remove(); });

  it("keeps a deep-linked ID visibly selected and clearable before searching", async () => {
    const taskId = mount("deep-link-task"); await settle();
    expect(host.textContent).toContain("任务 · deep-link-task");
    expect(listTasks).not.toHaveBeenCalled();
    [...host.querySelectorAll("button")].find(button => button.textContent === "清空选择")!.click(); await settle();
    expect(taskId.value).toBe("");
    expect(host.textContent).not.toContain("任务 · deep-link-task");
  });

  it("finds a task by name, then writes its ID only when selected", async () => {
    vi.mocked(listTasks).mockResolvedValue({ records: [{ id: "task-1", name: "电话销售质检" }], total: 1, current: 1, size: 20 } as never);
    const taskId = mount();
    const input = host.querySelector<HTMLInputElement>('input[aria-label="按任务名称查找"]')!;
    input.value = "电话销售"; input.dispatchEvent(new Event("input")); await settle();
    host.querySelector<HTMLButtonElement>("button")!.click(); await settle();
    expect(listTasks).toHaveBeenCalledWith({ keyword: "电话销售", current: 1, size: 20 });
    expect(taskId.value).toBe("");
    [...host.querySelectorAll("button")].find(button => button.textContent?.includes("电话销售质检"))!.click(); await settle();
    expect(taskId.value).toBe("task-1");
    [...host.querySelectorAll("button")].find(button => button.textContent === "清空选择")!.click(); await settle();
    expect(taskId.value).toBe("");
  });

  it("retains direct ID filtering without task-view permission", async () => {
    state.taskView = false;
    const taskId = mount();
    expect(host.textContent).not.toContain("搜索任务");
    const input = host.querySelector<HTMLInputElement>('input[aria-label="任务 ID 筛选"]')!;
    input.value = "known-task"; input.dispatchEvent(new Event("input")); await settle();
    expect(taskId.value).toBe("known-task");
    expect(listTasks).not.toHaveBeenCalled();
  });

  it("does not erase the selected task or show stale responses on failed search", async () => {
    let finishFirst!: (value: unknown) => void;
    vi.mocked(listTasks).mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }) as never)
      .mockRejectedValueOnce(new Error("offline"));
    const taskId = mount();
    [...host.querySelectorAll("button")].find(button => button.textContent === "按 ID 筛选")!.click(); await settle();
    const idInput = host.querySelector<HTMLInputElement>('input[aria-label="任务 ID 筛选"]')!;
    idInput.value = "known-task"; idInput.dispatchEvent(new Event("input")); await settle();
    const search = host.querySelector<HTMLButtonElement>("button")!;
    search.click(); await settle(); search.click(); await settle();
    finishFirst({ records: [{ id: "stale", name: "旧结果" }], total: 1, current: 1, size: 20 }); await settle();
    expect(taskId.value).toBe("known-task");
    expect(host.textContent).toContain("任务搜索失败");
    expect(host.textContent).not.toContain("旧结果");
  });
});
