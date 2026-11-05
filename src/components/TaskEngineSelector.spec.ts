import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick, ref, type App } from "vue";
import TaskEngineSelector from "./TaskEngineSelector.vue";
import type { TaskEngineConfiguration } from "@/api/tasks";
import type { QualityRule } from "@/api/config";

let app: App, host: HTMLDivElement;
const model = ref<TaskEngineConfiguration>({ schemaVersion: "iqc-task-processing-v1" });
let control: { validate(): boolean };
const rules: QualityRule[] = [
  { id: "regex", name: "退款正则", ruleType: "REGEX", code: "r", status: "PUBLISHED", expression: "退款" },
  { id: "draft", name: "未发布规则", ruleType: "REGEX", code: "d", status: "DRAFT" },
  { id: "llm", name: "模型规则", ruleType: "LLM", code: "l", status: "PUBLISHED" },
];
async function settle() { await nextTick(); await nextTick(); }
function mount(value: TaskEngineConfiguration = { schemaVersion: "iqc-task-processing-v1" }, disabled = false) {
  model.value = value;
  host = document.createElement("div"); document.body.append(host);
  app = createApp({ setup: () => () => h(TaskEngineSelector, {
    ref: (value: any) => { control = value; }, modelValue: model.value,
    "onUpdate:modelValue": value => { model.value = value; }, rules, disabled,
    agents: [
      { id: "model", name: "已发布模型", code: "m", status: "PUBLISHED", configJson: "{}" },
      { id: "rule-only", name: "普通规则旧配置", code: "r", status: "PUBLISHED", configJson: '{"mode":"RULE_ONLY"}' },
      { id: "draft-agent", name: "未发布模型", code: "d", status: "DRAFT", configJson: "{}" },
    ],
    inspectionTargets: [{ value: "check", label: "服务质检项" }],
    labelingTargets: [{ value: "label", label: "咨询标签" }],
  }) });
  const pass = defineComponent({ setup(_, { slots }) { return () => h("div", slots.default?.()); } });
  for (const name of ["ASpace", "AAlert", "AForm", "AFormItem"]) app.component(name, pass);
  app.component("AButton", defineComponent({ setup(_, { slots, attrs }) { return () => h("button", attrs, slots.default?.()); } }));
  app.component("ACheckbox", defineComponent({ props: ["checked", "disabled"], emits: ["change"], setup(props, { slots, emit }) {
    return () => h("label", [h("input", { type: "checkbox", checked: props.checked, disabled: props.disabled, onChange: (event: Event) => emit("change", event) }), slots.default?.()]);
  } }));
  app.component("ASelect", defineComponent({ props: ["value", "options", "disabled"], emits: ["update:value"], setup(props, { emit }) {
    return () => h("select", { value: props.value || "", disabled: props.disabled,
      onChange: (event: Event) => emit("update:value", (event.target as HTMLSelectElement).value) },
    [h("option", { value: "" }, "请选择"), ...(props.options || []).map((option: any) => h("option", { value: option.value }, option.label))]);
  } }));
  app.mount(host);
}
function click(text: string, scope: Element = host) {
  const button = [...scope.querySelectorAll("button")].find(button => button.textContent === text)!;
  button.click();
}
function select(index: number, value: string) {
  const element = host.querySelectorAll("select")[index]!;
  element.value = value; element.dispatchEvent(new Event("change"));
}
afterEach(() => { app?.unmount(); host?.remove(); });

describe("task operation engines", () => {
  it("adds and reorders duplicate engine types independently for both operations", async () => {
    mount();
    const checkboxes = host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    checkboxes[0]!.click(); await settle(); checkboxes[1]!.click(); await settle();
    const panels = host.querySelectorAll("section");
    click("添加正则引擎", panels[0]); await settle();
    click("添加大模型引擎", panels[0]); await settle();
    click("添加正则引擎", panels[1]); await settle();
    click("添加正则引擎", panels[1]); await settle();
    const ids = model.value.inspection!.engines.map(engine => engine.id);
    expect(new Set([...ids, ...model.value.labeling!.engines.map(engine => engine.id)]).size).toBe(4);
    click("上移", panels[0].querySelectorAll("article")[1]); await settle();
    expect(model.value.inspection!.engines.map(engine => engine.id)).toEqual([...ids].reverse());
    expect(model.value.labeling!.engines).toHaveLength(2);
    expect(model.value.labeling!.engines.map(engine => engine.type)).toEqual(["REGEX", "REGEX"]);
    checkboxes[0]!.click(); await settle(); expect(model.value.inspection).toBeUndefined();
    checkboxes[0]!.click(); await settle();
    expect(model.value.inspection!.engines.map(engine => engine.id)).toEqual([...ids].reverse());
  });

  it("requires real published references and validates separate targets", async () => {
    mount({ schemaVersion: "iqc-task-processing-v1", inspection: { engines: [{ id: "i1", type: "REGEX", parameters: {} }] },
      labeling: { engines: [{ id: "l1", type: "LLM", parameters: {} }] } });
    expect(control.validate()).toBe(false); await settle();
    expect(host.textContent).toContain("请选择识别目标");
    expect(host.textContent).not.toContain("未发布规则");
    expect(host.textContent).not.toContain("普通规则旧配置");
    expect(host.textContent).not.toContain("未发布模型");
    select(0, "check"); await settle(); select(1, "regex"); await settle();
    select(2, "label"); await settle(); select(3, "llm"); await settle(); select(4, "model"); await settle();
    expect(control.validate()).toBe(true);
    expect(model.value.inspection!.engines[0]!.parameters).toEqual({ targetId: "check", ruleId: "regex" });
    expect(model.value.labeling!.engines[0]!.parameters).toEqual({ targetId: "label", ruleId: "llm", agentId: "model" });
    click("移除", host.querySelectorAll("section")[0]); await settle();
    expect(control.validate()).toBe(false); expect(model.value.labeling!.engines).toHaveLength(1);
  });

  it("disables configuration changes and rejects empty operation selection", async () => {
    mount({ schemaVersion: "iqc-task-processing-v1", inspection: { engines: [] } }, true);
    click("添加正则引擎"); await settle(); expect(model.value.inspection!.engines).toHaveLength(0);
    expect(control.validate()).toBe(false);
    app.unmount(); host.remove(); mount(); expect(control.validate()).toBe(false); await settle();
    expect(host.textContent).toContain("请至少选择质检或打标");
    expect(host.querySelectorAll("section")).toHaveLength(0);
  });
});
