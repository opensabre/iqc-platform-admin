import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, reactive, ref, type App } from "vue";
import ReviewTaskSelector from "./ReviewTaskSelector.vue";
import { listTasks } from "@/api/tasks";

const state = vi.hoisted(() => ({ taskView: true }));
vi.mock("@/composables/permission", () => ({ usePermission: () => ({ can: (code: string) => code === "iqc:task:view" && access.taskView }) }));
vi.mock("@/api/tasks", () => ({ listTasks: vi.fn() }));

const access = reactive(state);
const controls = reactive({ disabled: false, taskType: undefined as string | undefined });
let app: App, host: HTMLDivElement;
async function settle() { for (let i = 0; i < 12; i++) { await Promise.resolve(); await nextTick(); } }
function mount(initialTaskId = "") {
  const taskId = ref(initialTaskId);
  host = document.createElement("div"); document.body.append(host);
  app = createApp(defineComponent({ setup() { return () => h(ReviewTaskSelector, {
    disabled: controls.disabled, taskType: controls.taskType, modelValue: taskId.value, "onUpdate:modelValue": (value: string) => { taskId.value = value; }
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
  beforeEach(() => { vi.resetAllMocks(); access.taskView = true; controls.disabled = false; controls.taskType = undefined; });
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
    access.taskView = false;
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

function selector() { return (app as any)._instance.subTree.component.setupState; }
function pendingPage() { let resolve!: (value: any) => void; const promise = new Promise<any>(r => { resolve = r; }); return { promise, resolve }; }
const privatePage = { records: [{ id: "private-task", name: "私有搜索结果" }], total: 1, current: 1, size: 20 };

it("revoking and restoring task directory access rejects the old result and keeps manual ID", async () => {
  const slow = pendingPage(); vi.mocked(listTasks).mockReturnValueOnce(slow.promise);
  const taskId = mount("manual-task"); await settle(); const vm = selector(); const request = vm.search();
  access.taskView = false; await settle(); access.taskView = true; await settle();
  slow.resolve(privatePage); await request; await settle();
  expect(vm.options).toEqual([]); expect(vm.searching).toBe(false); expect(taskId.value).toBe("manual-task");
  expect(host.textContent).not.toContain("私有搜索结果");
  vi.mocked(listTasks).mockResolvedValueOnce(privatePage as never); await vm.search(); await settle();
  expect(host.textContent).toContain("私有搜索结果");
});
it("revocation clears already loaded search data and blocks a captured selection callback", async () => {
  vi.mocked(listTasks).mockResolvedValueOnce(privatePage as never); const taskId = mount("manual-task"); await settle();
  const vm = selector(); await vm.search(); const select = vm.selectTask; access.taskView = false; await settle();
  select("private-task"); expect(vm.options).toEqual([]); expect(taskId.value).toBe("manual-task");
  vm.editTaskId("known-other"); expect(taskId.value).toBe("known-other");
});
it("disabling during search discards the response and prevents both selection and ID editing", async () => {
  const slow = pendingPage(); vi.mocked(listTasks).mockReturnValueOnce(slow.promise); const taskId = mount("manual-task"); await settle();
  const vm = selector(); const request = vm.search(); controls.disabled = true; await settle();
  slow.resolve(privatePage); await request; vm.selectTask("private-task"); vm.editTaskId("replacement"); await vm.search();
  expect(listTasks).toHaveBeenCalledOnce(); expect(vm.options).toEqual([]); expect(vm.searching).toBe(false); expect(taskId.value).toBe("manual-task");
});
it("unmounting rejects a late search response and selection callback", async () => {
  const slow = pendingPage(); vi.mocked(listTasks).mockReturnValueOnce(slow.promise); const taskId = mount("manual-task"); await settle();
  const vm = selector(); const request = vm.search(); app.unmount(); slow.resolve(privatePage); await request;
  vm.selectTask("private-task"); vm.editTaskId("unmounted-edit"); expect(vm.options).toEqual([]); expect(taskId.value).toBe("manual-task");
});
it("changing task type rejects a late result from the previous task directory", async () => {
  controls.taskType = "EVALUATION"; const slow = pendingPage(); vi.mocked(listTasks).mockReturnValueOnce(slow.promise);
  const taskId = mount("manual-task"); await settle(); const vm = selector(); const request = vm.search();
  controls.taskType = "BENCHMARK"; await settle(); slow.resolve(privatePage); await request;
  expect(vm.options).toEqual([]); expect(taskId.value).toBe("manual-task"); expect(vm.searching).toBe(false);
  vi.mocked(listTasks).mockResolvedValueOnce(privatePage as never); await vm.search();
  expect(listTasks).toHaveBeenLastCalledWith({taskType: "BENCHMARK", keyword: undefined, current: 1, size: 20});
});

});
