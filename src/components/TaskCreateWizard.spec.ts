import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import { AxiosError } from "axios";
import { createTask } from "@/api/tasks";
import { getLabelDetail } from "@/api/labels";
import TaskCreateWizard from "./TaskCreateWizard.vue";

vi.mock("@/api/tasks", () => ({ createTask: vi.fn() }));
vi.mock("@/api/labels", () => ({ getLabelDetail: vi.fn() }));
vi.mock("./TaskDataSelector.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return { default: defineComponent({ emits: ["update:modelValue"], setup(_, { emit }) {
    return () => h("button", { onClick: () => emit("update:modelValue", { mode: "RANDOM", filter: { channel: "WEB" }, sampleSize: 30, sampleSeed: "preview-only" }) }, "选择抽样条件");
  } }) };
});
vi.mock("./TaskEngineSelector.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return { default: defineComponent({ props: ["modelValue"], emits: ["update:modelValue"], setup(props, { emit, expose }) {
    expose({ validate: () => Boolean(props.modelValue.inspection && props.modelValue.labeling) });
    return () => h("button", { onClick: () => emit("update:modelValue", { schemaVersion: "iqc-task-processing-v1",
      inspection: { engines: [{ id: "quality", type: "REGEX", parameters: { targetId: "check", ruleId: "rule" } }] },
      labeling: { engines: [{ id: "tag", type: "DLS", parameters: { targetId: "label", ruleId: "dls" } }] } }) }, "配置联合任务");
  } }) };
});
vi.mock("./TaskResultProcessingEditor.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return { default: defineComponent({ setup(_, { expose }) {
    expose({ validate: () => true, getConfiguration: () => ({ schemaVersion: "iqc-task-result-processing-v1", labeling: [] }) });
    return () => h("p", "独立结果处理");
  } }) };
});
let app: App, host: HTMLDivElement;
const created = vi.fn();
async function settle() { for (let i = 0; i < 8; i++) await nextTick(); }
function mount() {
  host = document.createElement("div"); document.body.append(host);
  app = createApp({ render: () => h(TaskCreateWizard, { agents: [], rules: [], labelingTargets: [{ value: "label", label: "客户意向" }], onCreated: created }) });
  const pass = defineComponent({ setup(_, { slots }) { return () => h("div", [slots.default?.(), slots.footer?.()]); } });
  for (const name of ["AModal", "AForm", "AFormItem", "ASpace", "ARow", "ACol", "ASpin", "ATag"]) app.component(name, pass);
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
async function confirm() {
  click("选择抽样条件"); await settle(); click("下一步"); await settle();
  click("配置联合任务"); await settle(); click("下一步"); await settle(); click("下一步"); await settle();
  const input = host.querySelector<HTMLInputElement>('input[placeholder="请输入任务名称"]')!;
  input.value = "联合任务"; input.dispatchEvent(new Event("input")); await settle();
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getLabelDetail).mockResolvedValue({ label: { id: "label", status: "PUBLISHED" }, values: [], bindings: [] } as any);
  vi.mocked(createTask).mockResolvedValue({ id: "created" } as any);
});
afterEach(() => { app?.unmount(); host?.remove(); });
describe("four-step task creation", () => {
  it("uses the approved names, validates each step, and submits separate operation/result policies without freezing preview sampling", async () => {
    mount(); await settle();
    expect(host.querySelector("nav")!.textContent).toBe("数据筛选 / 任务类型 / 结果处理 / 任务确认");
    click("下一步"); await settle(); expect(host.querySelector("nav")!.getAttribute("data-step")).toBe("0");
    await confirm(); expect(getLabelDetail).toHaveBeenCalledWith("label");
    click("创建任务"); await settle();
    const request = vi.mocked(createTask).mock.calls[0]![0];
    expect(request.dataSelection).toEqual({ mode: "RANDOM", filter: { channel: "WEB" }, sampleSize: 30 });
    expect(request).toHaveProperty("processingConfiguration.inspection.engines");
    expect(request).toHaveProperty("processingConfiguration.labeling.engines");
    expect(request).toHaveProperty("resultProcessing.schemaVersion", "iqc-task-result-processing-v1");
    expect(request).not.toHaveProperty("taskType"); expect(request).not.toHaveProperty("ruleIds");
    expect(created).toHaveBeenCalledWith({ id: "created" });
  });
  it("keeps the draft and prevents duplicate resubmission when the network cannot confirm creation", async () => {
    vi.mocked(createTask).mockRejectedValue(new AxiosError("Network Error"));
    mount(); await settle(); await confirm(); click("创建任务"); await settle();
    expect(host.textContent).toContain("提交未确认");
    expect(host.querySelector<HTMLInputElement>('input[placeholder="请输入任务名称"]')!.value).toBe("联合任务");
    click("创建任务"); await settle(); expect(createTask).toHaveBeenCalledTimes(1); expect(created).not.toHaveBeenCalled();
  });
});
