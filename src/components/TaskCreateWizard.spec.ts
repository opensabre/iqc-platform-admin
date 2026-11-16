import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import { AxiosError } from "axios";
import { createUnifiedTask } from "@/api/tasks";
import TaskCreateWizard from "./TaskCreateWizard.vue";
vi.mock("@/api/tasks", () => ({ createUnifiedTask: vi.fn() }));
vi.mock("./TaskDataSelector.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return { default: defineComponent({ emits: ["update:modelValue"], setup(_, { emit }) {
    return () => h("button", { onClick: () => emit("update:modelValue", { mode: "RANDOM", filter: { channel: "WEB" }, sampleSize: 30, sampleSeed: "preview-only" }) }, "选择抽样条件");
  } }) };
});
vi.mock("./UnifiedTagConfiguration.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return { default: defineComponent({ emits: ["update:modelValue"], setup(_, { emit }) {
    return () => h("button", { onClick: () => emit("update:modelValue", { engineSequence: ["DLS", "REGEX"], tagSelectionMode: "SELECTED", selectedTagIds: ["label"] }) }, "配置统一标签");
  } }) };
});
vi.mock("./TaskTriggerConfiguration.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return { default: defineComponent({ emits: ["update:modelValue"], setup(_, { emit }) {
    return () => h("div", [h("button", { onClick: () => emit("update:modelValue", { type: "SCHEDULED", enabled: true }) }, "缺少时间"),
      h("button", { onClick: () => emit("update:modelValue", { type: "SCHEDULED", scheduledAt: "2030-01-01T09:00", enabled: true }) }, "设置定时")]);
  } }) };
});
let app: App, host: HTMLDivElement;
const created = vi.fn();
async function settle() { for (let i = 0; i < 8; i++) await nextTick(); }
function mount() {
  host = document.createElement("div"); document.body.append(host);
  app = createApp({ render: () => h(TaskCreateWizard, { agents: [], labelingTargets: [{ value: "label", label: "客户意向" }], onCreated: created }) });
  const pass = defineComponent({ setup(_, { slots }) { return () => h("div", [slots.default?.(), slots.footer?.()]); } });
  for (const name of ["ACard", "AForm", "AFormItem"]) app.component(name, pass);
  app.component("AButton", defineComponent({ setup(_, { attrs, slots }) { return () => h("button", attrs, slots.default?.()); } }));
  app.component("ASteps", defineComponent({ props: ["items", "current"], setup(props) {
    return () => h("nav", { "data-step": props.current }, props.items.map((item: { title: string }) => item.title).join(" / "));
  } }));
  app.component("AAlert", defineComponent({ props: ["message"], setup(props) { return () => h("p", props.message); } }));
  app.component("AInput", defineComponent({ props: ["value", "placeholder"], emits: ["update:value"], setup(props, { emit }) {
    return () => h("input", { value: props.value, placeholder: props.placeholder, onInput: (event: Event) => emit("update:value", (event.target as HTMLInputElement).value) });
  } }));
  app.component("AInputNumber", defineComponent({ props: ["value"], setup(props) { return () => h("span", props.value); } }));
  app.mount(host);
}
function click(text: string) { [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === text)!.click(); }
async function configure() {
  click("选择抽样条件"); await settle(); click("下一步"); await settle();
  click("配置统一标签"); await settle(); click("下一步"); await settle();
}
async function nameTask() {
  const input = host.querySelector<HTMLInputElement>('input[placeholder="请输入任务名称"]')!;
  input.value = "统一识别"; input.dispatchEvent(new Event("input")); await settle();
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(createUnifiedTask).mockResolvedValue({ id: "unified" } as any); });
afterEach(() => { app?.unmount(); host?.remove(); });
describe("unified task creation", () => {
  it("validates data and submits only unified references and trigger without the preview seed", async () => {
    mount(); await settle();
    expect(host.querySelector("nav")!.textContent).toBe("数据筛选 / 规则与标签 / 触发计划 / 任务确认");
    click("下一步"); await settle(); expect(host.querySelector("nav")!.getAttribute("data-step")).toBe("0");
    await configure(); click("下一步"); await settle(); await nameTask(); click("创建任务"); await settle();
    expect(createUnifiedTask).toHaveBeenCalledWith({ name: "统一识别", concurrencyLimit: 1, trigger: { type: "IMMEDIATE", enabled: true },
      dataSelection: { mode: "RANDOM", filter: { channel: "WEB" }, sampleSize: 30 },
      configuration: { engineSequence: ["DLS", "REGEX"], tagSelectionMode: "SELECTED", selectedTagIds: ["label"] } });
    expect(created).toHaveBeenCalledWith({ id: "unified" }); expect(host.textContent).not.toContain("现有任务配置");
  });
  it("requires scheduled time before confirmation and preserves the chosen trigger", async () => {
    mount(); await configure(); click("缺少时间"); await settle(); click("下一步"); await settle();
    expect(host.querySelector("nav")!.getAttribute("data-step")).toBe("2"); expect(host.textContent).toContain("请填写执行时间或 Cron");
    click("设置定时"); await settle(); click("下一步"); await settle(); await nameTask(); click("创建任务"); await settle();
    expect(vi.mocked(createUnifiedTask).mock.calls[0]![0].trigger).toEqual({ type: "SCHEDULED", scheduledAt: "2030-01-01T09:00", enabled: true });
  });
  it("preserves inputs and prevents duplicate creation after an uncertain network response", async () => {
    vi.mocked(createUnifiedTask).mockRejectedValue(new AxiosError("Network Error", "ERR_NETWORK"));
    mount(); await configure(); click("下一步"); await settle(); await nameTask(); click("创建任务"); await settle();
    expect(host.textContent).toContain("任务提交未确认"); click("创建任务"); await settle();
    expect(createUnifiedTask).toHaveBeenCalledTimes(1); expect(created).not.toHaveBeenCalled();
  });
});
