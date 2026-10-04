import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import Schemes from "./index.vue";
import { changeSchemeAvailability, listSchemeTrials, listSchemes, reviseScheme, trialScheme, publishScheme, type InspectionScheme } from "@/api/schemes";
import { listRules, listAgents, listRuleVersions, listAgentVersions } from "@/api/config";
import { getLabelTree } from "@/api/labels";
import { getTask, runTask, type InspectionTask } from "@/api/tasks";
import { getBatchResultSummary, getTaskLabelResults } from "@/api/results";
const state = vi.hoisted(() => ({ allowed: true, confirm: vi.fn(), success: vi.fn() }));
vi.mock("ant-design-vue", () => ({ message: { success: state.success }, Modal: { confirm: state.confirm } }));
vi.mock("@/composables/permission", () => ({ usePermission: () => ({ can: () => state.allowed }) }));
vi.mock("@/components/ConversationPicker.vue", () => ({ default: defineComponent({ emits: ["update:modelValue"], setup(_, { emit }) {
  return () => h("button", { onClick: () => emit("update:modelValue", ["c1"]) }, "选择试跑会话");
} }) }));
vi.mock("@/api/schemes", () => ({ listSchemes: vi.fn(), listSchemeVersions: vi.fn(), changeSchemeAvailability: vi.fn(), createScheme: vi.fn(), reviseScheme: vi.fn(), previewScheme: vi.fn(), trialScheme: vi.fn(), listSchemeTrials: vi.fn(), publishScheme: vi.fn() }));
vi.mock("@/api/config", () => ({ listRules: vi.fn(), listRuleVersions: vi.fn(), listAgents: vi.fn(), listAgentVersions: vi.fn() }));
vi.mock("@/api/labels", () => ({ getLabelTree: vi.fn() }));
vi.mock("@/api/tasks", () => ({ getTask: vi.fn(), runTask: vi.fn() }));
vi.mock("@/api/results", () => ({ getBatchResultSummary: vi.fn(), getTaskLabelResults: vi.fn() }));
let app: App, host: HTMLDivElement, scheme: InspectionScheme;
const pass = defineComponent({ setup(_, { slots, attrs }) { return () => h("div", [attrs.message as string, slots.default?.()]); } });
async function settle() { for (let i = 0; i < 12; i++) { await Promise.resolve(); await nextTick(); } }
function button(text: string) { return [...host.querySelectorAll("button")].find(item => item.textContent === text)!; }
function mount(editor = false, trialModal = false) {
  host = document.createElement("div"); document.body.append(host); app = createApp(Schemes);
  for (const name of ["AAlert", "ASpace", "ATag", "AForm", "AFormItem", "ARow", "ACol", "AInput", "ATextarea", "ACard", "ASelect", "ARadioGroup", "ARadio", "ACheckbox", "AInputNumber"]) {
    if (editor && ["AInput", "AInputNumber", "ASelect", "ACheckbox", "ACard"].includes(name)) continue;
    if (trialModal && name === "ASelect") continue;
    app.component(name, pass);
  }
  app.component("RouterLink", defineComponent({ setup(_, { slots, attrs }) {
    return () => h("a", attrs, slots.default?.());
  } }));
  if (trialModal && !editor) app.component("ACheckbox", defineComponent({ props: ["checked", "disabled"], emits: ["update:checked"], setup(props, { emit, slots }) {
    return () => h("label", [h("input", { type: "checkbox", checked: props.checked, disabled: props.disabled,
      onChange: (event: Event) => emit("update:checked", (event.target as HTMLInputElement).checked) }), slots.default?.()]);
  } }));
  for (const name of ["ADrawer", "AModal"]) {
    if (editor && name === "ADrawer") continue;
    if (trialModal && name === "AModal") continue;
    app.component(name, defineComponent({ setup() { return () => h("div"); } }));
  }
  if (editor) {
    app.component("AInput", defineComponent({ props: ["value", "maxlength", "placeholder", "disabled"], emits: ["update:value"], setup(props, { emit }) {
      return () => h("input", { value: props.value ?? "", maxlength: props.maxlength, placeholder: props.placeholder,
        disabled: props.disabled, onInput: (event: Event) => emit("update:value", (event.target as HTMLInputElement).value) });
    } }));
    app.component("ACheckbox", defineComponent({ props: ["checked"], emits: ["change", "update:checked"], setup(props, { emit, slots }) {
      return () => h("label", [h("input", { type: "checkbox", checked: props.checked, onChange: (event: Event) => {
        emit("change", event); emit("update:checked", (event.target as HTMLInputElement).checked);
      } }), slots.default?.()]);
    } }));
    app.component("ASelect", defineComponent({ props: ["options", "value", "placeholder"], emits: ["change", "update:value"], setup(props, { emit }) {
      return () => h("select", { value: props.value, onChange: (event: Event) => {
        const option = props.options?.find((item: { value: string | number }) => String(item.value) === (event.target as HTMLSelectElement).value);
        emit("change", option?.value); emit("update:value", option?.value);
      } }, [h("option", { value: "" }, props.placeholder || "请选择"), ...(props.options || []).map((option: { label: string; value: string | number }) => h("option", { value: option.value }, option.label))]);
    } }));
    app.component("ADrawer", defineComponent({ props: ["open"], setup(props, { slots }) { return () => props.open ? h("section", [slots.default?.(), slots.footer?.()]) : null; } }));
    app.component("AInputNumber", defineComponent({ props: ["value"], emits: ["update:value"], setup(props, { emit }) {
      return () => h("input", { type: "number", value: props.value, onInput: (event: Event) => emit("update:value", Number((event.target as HTMLInputElement).value)) });
    } }));
    app.component("ACard", defineComponent({ setup(_, { slots }) {
      return () => h("div", [slots.extra?.(), slots.default?.()]);
    } }));
  }
  if (trialModal) {
    app.component("AModal", defineComponent({ props: ["open"], setup(props, { slots }) { return () => props.open ? h("section", slots.default?.()) : null; } }));
    app.component("ASelect", defineComponent({ props: ["options", "disabled"], emits: ["change"], setup(props, { emit }) {
      return () => h("div", (props.options as Array<{ label: string; value: string }> || []).map(option =>
        h("button", { disabled: props.disabled, onClick: () => emit("change", option.value) }, option.label)));
    } }));
  }
  app.component("AButton", defineComponent({ setup(_, { slots, attrs }) { return () => h("button", attrs, slots.default?.()); } }));
  app.component("ATable", defineComponent({ props: ["dataSource", "columns"], setup(props, { slots }) {
    return () => h("div", props.dataSource.map((record: InspectionScheme) => props.columns.map((column: unknown) => slots.bodyCell?.({ column, record }))));
  } }));
  app.mount(host);
}
describe("scheme availability", () => {
  beforeEach(() => {
    vi.clearAllMocks(); state.allowed = true;
    scheme = { id: "s", name: "销售质检", code: "sales", businessScene: "销售", draftRevision: 2, activePublishedVersion: 1, draftConfigJson: "{}", status: "ACTIVE" };
    vi.mocked(listSchemes).mockResolvedValue([scheme]); vi.mocked(changeSchemeAvailability).mockResolvedValue(scheme);
    vi.mocked(listSchemeTrials).mockResolvedValue([]);
    vi.mocked(getLabelTree).mockResolvedValue({ categories: [], groups: [], labels: [] });
  });
  afterEach(() => { app?.unmount(); host?.remove(); });
  async function edit(limits?: { maxConversations: number; defaultConcurrency: number; maxConcurrency: number }) {
    scheme.draftConfigJson = JSON.stringify({ schemaVersion: "iqc-scheme-v2", agent: null,
      items: [{ itemCode: "a", name: "告知", rule: { id: "r", versionNo: 1 }, hitMeaning: "COMPLIANCE" }],
      scoring: { version: "iqc-score-v2", mode: "DEDUCTION", baseScore: 100, passingScore: 60, items: [] },
      ...(limits ? { runLimits: limits } : {}) });
    vi.mocked(listRules).mockResolvedValue([]); vi.mocked(listAgents).mockResolvedValue([]); vi.mocked(listRuleVersions).mockResolvedValue([]);
    mount(true); await settle(); button("编辑草稿").click(); await settle();
  }
  it("saves historical drafts without silently adding runtime limits", async () => {
    await edit(); button("保存草稿").click(); await settle();
    expect(reviseScheme).toHaveBeenCalled(); expect(vi.mocked(reviseScheme).mock.calls[0][2].definition).not.toHaveProperty("runLimits");
    expect(vi.mocked(reviseScheme).mock.calls[0][2].definition.items[0]).not.toHaveProperty("appliesWhen");
    expect(vi.mocked(reviseScheme).mock.calls[0][2].definition.items[0]).not.toHaveProperty("inputScope");
    expect(vi.mocked(reviseScheme).mock.calls[0][2].definition.items[0]).not.toHaveProperty("execution");
  });
  it("lets experts opt into a direct rule route without modifying scoring", async () => {
    await edit();
    const route = [...host.querySelectorAll("select")].find(select => [...select.options].some(option => option.value === "RULE_ONLY"))!;
    expect(route.value).toBe("LEGACY");
    route.value = "RULE_ONLY"; route.dispatchEvent(new Event("change")); await settle();
    expect(host.textContent).toContain("发布后按冻结路线执行");
    button("保存草稿").click(); await settle();
    const definition = vi.mocked(reviseScheme).mock.calls[0][2].definition;
    expect(definition.items[0].execution).toEqual({ route: "RULE_ONLY" });
    expect(definition.scoring.items).toEqual([]);
  });
  it("creates complete editable route maps for each allowed strategy and keeps routes in sync with item edits", async () => {
    await edit();
    const variantToggle = [...host.querySelectorAll("label")].find(label => label.textContent?.includes("为质检项配置多种经批准的执行路线"))
      ?.querySelector("input");
    expect(variantToggle).toBeDefined();
    variantToggle!.checked = true; variantToggle!.dispatchEvent(new Event("change", { bubbles: true })); await settle();
    button("添加允许策略变体").click(); await settle();
    expect(host.querySelectorAll("[data-variant-code]")).toHaveLength(2);
    expect(host.querySelectorAll("[data-route-item-code]")).toHaveLength(1);

    button("添加质检项").click(); await settle();
    expect(host.querySelectorAll("[data-scheme-item-code]")).toHaveLength(2);
    expect(host.querySelectorAll("[data-route-item-code]")).toHaveLength(2);
    [...host.querySelectorAll<HTMLButtonElement>("button")].filter(item => item.textContent === "移除").at(-1)!.click(); await settle();
    expect(host.querySelectorAll("[data-scheme-item-code]")).toHaveLength(1);
    expect(host.querySelectorAll("[data-route-item-code]")).toHaveLength(1);

    button("保存草稿").click(); await settle();
    expect(reviseScheme).toHaveBeenCalledTimes(1);
    const variants = vi.mocked(reviseScheme).mock.calls[0][2].definition.executionVariants!;
    expect(variants.variants).toHaveLength(2);
    expect(variants.variants.map(item => item.code)).toContain(variants.recommendedCode);
    for (const variant of variants.variants) expect(Object.keys(variant.routes)).toEqual(["a"]);
  });
  it("saves routed strategy variants together with frozen joint label references", async () => {
    await edit(); app.unmount(); host.remove();
    const definition = JSON.parse(scheme.draftConfigJson);
    definition.labels = [{ id: "house", versionNo: 2 }];
    definition.executionVariants = { recommendedCode: "standard", variants: [
      { code: "standard", name: "标准路线", coverage: "覆盖全部项目", cost: "本地规则", routes: { a: { route: "RULE_ONLY" } } }
    ] };
    scheme.draftConfigJson = JSON.stringify(definition);
    vi.mocked(listRules).mockResolvedValue([{ id: "r", name: "费用告知", code: "r", ruleType: "REGEX", status: "PUBLISHED" }]);
    vi.mocked(listRuleVersions).mockResolvedValue([{ id: "rv", ruleId: "r", name: "费用告知", code: "r", versionNo: 1, status: "PUBLISHED", ruleType: "REGEX" }]);
    mount(true); await settle(); button("编辑草稿").click(); await settle(); button("保存草稿").click(); await settle();
    const saved = vi.mocked(reviseScheme).mock.calls[0]![2].definition;
    expect(saved.labels).toEqual([{ id: "house", versionNo: 2 }]);
    expect(saved.executionVariants?.variants[0]).toMatchObject({ code: "standard", routes: { a: { route: "RULE_ONLY" } } });
  });
  it("saves a routed draft with a separately pinned applicability condition", async () => {
    await edit(); app.unmount(); host.remove();
    const definition = JSON.parse(scheme.draftConfigJson);
    definition.items[0].execution = { route: "RULE_ONLY" };
    definition.items[0].appliesWhen = { id: "gate", versionNo: 2 };
    scheme.draftConfigJson = JSON.stringify(definition);
    vi.mocked(listRuleVersions).mockImplementation(async id => [{ id: `${id}-v`, ruleId: id,
      name: id === "gate" ? "业务适用条件" : "费用告知", code: id, versionNo: id === "gate" ? 2 : 1,
      status: "PUBLISHED", ruleType: "REGEX" }]);
    mount(true); await settle(); button("编辑草稿").click(); await settle();
    button("保存草稿").click(); await settle();
    expect(reviseScheme).toHaveBeenCalled();
    expect(vi.mocked(reviseScheme).mock.calls[0][2].definition.items[0]).toMatchObject({
      execution: { route: "RULE_ONLY" }, appliesWhen: { id: "gate", versionNo: 2 }
    });
  });
  it("rejects an LLM-only route when the final rule is not LLM", async () => {
    await edit();
    const route = [...host.querySelectorAll("select")].find(select => [...select.options].some(option => option.value === "LLM_ONLY"))!;
    route.value = "LLM_ONLY"; route.dispatchEvent(new Event("change")); await settle();
    button("保存草稿").click(); await settle();
    expect(reviseScheme).not.toHaveBeenCalled();
    expect(host.textContent).toContain("最终裁决规则类型与所选路线不一致");
  });
  it("exposes candidate scope only for LLM extraction and allows explicit compatibility restoration", async () => {
    await edit();
    const route = [...host.querySelectorAll("select")].find(select => [...select.options].some(option => option.value === "LLM_THEN_RULE"))!;
    route.value = "LLM_THEN_RULE"; route.dispatchEvent(new Event("change")); await settle();
    const scope = [...host.querySelectorAll("select")].find(select => [...select.options].some(option => option.textContent === "保持候选规则原有范围"))!;
    expect(scope.value).toBe("LEGACY");
    scope.value = "CONVERSATION"; scope.dispatchEvent(new Event("change")); await settle();
    expect(scope.value).toBe("CONVERSATION");
    scope.value = "LEGACY"; scope.dispatchEvent(new Event("change")); await settle();
    expect(scope.value).toBe("LEGACY");
    route.value = "RULE_ONLY"; route.dispatchEvent(new Event("change")); await settle();
    expect(host.textContent).not.toContain("候选 LLM 输入范围");
    button("保存草稿").click(); await settle();
    expect(vi.mocked(reviseScheme).mock.calls[0][2].definition.items[0].execution).toEqual({ route: "RULE_ONLY" });
  });
  async function editScope(llm = true) {
    await edit(); app.unmount(); host.remove();
    const definition = JSON.parse(scheme.draftConfigJson);
    definition.items[0].inputScope = "CONVERSATION";
    definition.agent = { id: "ai", versionNo: 1 };
    scheme.draftConfigJson = JSON.stringify(definition);
    vi.mocked(listRuleVersions).mockResolvedValue([{ id: "rv", ruleId: "r", name: "告知", code: "r",
      versionNo: 1, status: "PUBLISHED", ruleType: llm ? "LLM" : "REGEX" }]);
    vi.mocked(listAgentVersions).mockResolvedValue([{ id: "av", agentId: "ai", name: "质检能力", code: "ai", versionNo: 1,
      status: "PUBLISHED", configJson: '{"schemaVersion":"3.0"}' }]);
    mount(true); await settle(); button("编辑草稿").click(); await settle();
  }
  it("loads and saves a candidate route's frozen stage version and scope without replacing scoring", async () => {
    await edit(); app.unmount(); host.remove();
    const definition = JSON.parse(scheme.draftConfigJson);
    definition.items[0].execution = { route: "LLM_THEN_RULE", candidate: { id: "extract", versionNo: 3 }, stageInputScope: "CONVERSATION" };
    definition.agent = { id: "ai", versionNo: 1 };
    scheme.draftConfigJson = JSON.stringify(definition);
    vi.mocked(listRuleVersions).mockImplementation(async id => [{ id: `${id}-version`, ruleId: id, name: id, code: id,
      versionNo: id === "extract" ? 3 : 1, status: "PUBLISHED", ruleType: id === "extract" ? "LLM" : "REGEX" }]);
    vi.mocked(listAgentVersions).mockResolvedValue([{ id: "av", agentId: "ai", name: "质检能力", code: "ai", versionNo: 1,
      status: "PUBLISHED", configJson: '{"schemaVersion":"3.0"}' }]);
    mount(true); await settle(); button("编辑草稿").click(); await settle();
    expect(listRuleVersions).toHaveBeenCalledWith("extract");
    const scope = [...host.querySelectorAll("select")].find(select => [...select.options].some(option => option.textContent === "保持候选规则原有范围"))!;
    expect(scope.value).toBe("CONVERSATION");
    scope.value = "MESSAGE"; scope.dispatchEvent(new Event("change")); await settle();
    button("保存草稿").click(); await settle();
    expect(vi.mocked(reviseScheme).mock.calls[0][2].definition.items[0].execution)
      .toEqual({ route: "LLM_THEN_RULE", candidate: { id: "extract", versionNo: 3 }, stageInputScope: "MESSAGE" });
    expect(vi.mocked(reviseScheme).mock.calls[0][2].definition.scoring).toEqual(definition.scoring);
  });
  it("requires inspected results and explicit review before publishing a successful routed trial", async () => {
    scheme.draftConfigJson = JSON.stringify({ items: [{ execution: { route: "RULE_ONLY" } }] });
    const trial = { id: "trial-route", status: "SUCCEEDED", ruleSnapshotJson: '{"schemeSnapshot":{"draftRevision":2}}' } as InspectionTask;
    vi.mocked(listSchemeTrials).mockResolvedValue([trial]); vi.mocked(getTask).mockResolvedValue(trial);
    vi.mocked(getBatchResultSummary).mockResolvedValue({ taskId: trial.id, status: "SUCCEEDED", conversationCount: 0,
      totalMessages: 0, processedMessages: 0, failedMessages: 0, averageScore: null,
      hitCount: 0, highRiskCount: 0, conversations: [] });
    mount(false, true); await settle(); button("试跑与发布").click(); await settle();
    button("修订 2 · SUCCEEDED · trial-route").click(); await settle();
    expect(host.textContent).toContain("联合标签单独执行并保留证据");
    expect(button("发布为业务模板").disabled).toBe(true);
    expect(publishScheme).not.toHaveBeenCalled();
    const resultsLink = [...host.querySelectorAll("a")].find(link => link.textContent?.includes("打开完整结果与证据"))!;
    resultsLink.click(); await settle();
    const review = [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
      .find(input => input.parentElement?.textContent?.includes("我已查看试跑结果"))!;
    review.click(); await settle();
    expect(button("发布为业务模板").disabled).toBe(false);
    button("发布为业务模板").click(); await settle();
    expect(publishScheme).toHaveBeenCalledWith("s", 2, "trial-route", true);
  });
  function approvedVariants(single = false) {
    return { recommendedCode: "standard", variants: [
      { code: "standard", name: "标准检查", coverage: "覆盖所有告知项", cost: "本地规则", routes: { a: { route: "RULE_ONLY" } } },
      ...(!single ? [{ code: "alternate", name: "候选核查", coverage: "覆盖所有告知项", cost: "额外模型调用", routes: { a: { route: "RULE_ONLY" } } }] : [])
    ] };
  }
  it("selects approved trial variants and freezes the selection on uncertain retries", async () => {
    scheme.draftConfigJson = JSON.stringify({ items: [], executionVariants: approvedVariants() });
    const created = { id: "variant-trial", status: "CREATED", ruleSnapshotJson: '{"schemeSnapshot":{"draftRevision":2}}' } as InspectionTask;
    vi.mocked(trialScheme).mockRejectedValueOnce(new Error("请求超时")).mockResolvedValueOnce(created);
    vi.mocked(runTask).mockResolvedValue({ ...created, status: "QUEUED" });
    mount(false, true); await settle(); button("试跑与发布").click(); await settle();
    expect(host.textContent).toContain("覆盖所有告知项");
    expect(host.textContent).toContain("标准检查 · 覆盖");
    button("候选核查").click(); await settle();
    expect(host.textContent).toContain("额外模型调用");
    button("选择试跑会话").click(); await settle();
    button("创建并执行当前草稿试跑").click(); await settle();
    const first = vi.mocked(trialScheme).mock.calls[0];
    expect(first[4]).toBe("alternate");
    expect(button("标准检查（推荐）").disabled).toBe(true);
    expect(host.textContent).toContain("相同请求标识、会话、1 轮及策略变体");
    button("标准检查（推荐）").click(); await settle();
    button("重试创建本次试跑").click(); await settle();
    expect(vi.mocked(trialScheme).mock.calls[1]).toEqual(first);
    expect(publishScheme).not.toHaveBeenCalled();
  });
  it("hides the selector for one approved trial variant and sends its recommendation", async () => {
    scheme.draftConfigJson = JSON.stringify({ items: [], executionVariants: approvedVariants(true) });
    const created = { id: "single-trial", status: "QUEUED" } as InspectionTask;
    vi.mocked(trialScheme).mockResolvedValue(created); vi.mocked(runTask).mockResolvedValue(created);
    mount(false, true); await settle(); button("试跑与发布").click(); await settle();
    expect(button("标准检查（推荐）")).toBeUndefined();
    expect(host.textContent).toContain("标准检查 · 覆盖");
    button("选择试跑会话").click(); await settle();
    button("创建并执行当前草稿试跑").click(); await settle();
    expect(vi.mocked(trialScheme).mock.calls[0][4]).toBe("standard");
    expect(host.textContent).toContain("每种方案均检查全部质检项");
    expect(button("发布为业务模板").disabled).toBe(true);
  });
  it("names an existing variant trial from its frozen release rather than the current draft", async () => {
    scheme.draftConfigJson = JSON.stringify({ items: [], executionVariants: approvedVariants() });
    const variants = approvedVariants(); variants.variants[0].name = "创建时标准";
    const existing = { id: "frozen-variant", status: "SUCCEEDED", ruleSnapshotJson: JSON.stringify({ schemeSnapshot: {
      draftRevision: 2, selectedVariantCode: "standard", release: { definition: { executionVariants: variants } }
    } }) } as InspectionTask;
    vi.mocked(listSchemeTrials).mockResolvedValue([existing]); vi.mocked(getTask).mockResolvedValue(existing);
    vi.mocked(getBatchResultSummary).mockResolvedValue({ taskId: existing.id, status: "SUCCEEDED", conversationCount: 0,
      totalMessages: 0, processedMessages: 0, failedMessages: 0, averageScore: null, hitCount: 0, highRiskCount: 0, conversations: [] });
    mount(false, true); await settle(); button("试跑与发布").click(); await settle();
    button("修订 2 · SUCCEEDED · frozen-variant").click(); await settle();
    expect(host.textContent).toContain("冻结试跑方案：创建时标准 · standard");
    expect(button("发布为业务模板").disabled).toBe(true);
  });
  it("preserves explicit conversation scope and lets experts choose message scope", async () => {
    await editScope();
    const scope = [...host.querySelectorAll("select")].find(select => [...select.options].some(option => option.value === "CONVERSATION"))!;
    expect(scope.value).toBe("CONVERSATION");
    scope.value = "MESSAGE"; scope.dispatchEvent(new Event("change")); await settle();
    button("保存草稿").click(); await settle();
    expect(vi.mocked(reviseScheme).mock.calls[0][2].definition.items[0].inputScope).toBe("MESSAGE");
  });
  it("does not silently discard unsupported scope and allows explicit compatibility restoration", async () => {
    await editScope(false); button("保存草稿").click(); await settle();
    expect(reviseScheme).not.toHaveBeenCalled(); expect(host.textContent).toContain("显式输入范围仅适用于已发布的 LLM");
    const scope = [...host.querySelectorAll("select")].find(select => [...select.options].some(option => option.value === "CONVERSATION"))!;
    scope.value = "LEGACY"; scope.dispatchEvent(new Event("change")); await settle();
    button("保存草稿").click(); await settle();
    expect(vi.mocked(reviseScheme).mock.calls[0][2].definition.items[0]).not.toHaveProperty("inputScope");
  });
  it("allows scoped drafts to enter publication review only after inspected results", async () => {
    await editScope(); app.unmount(); host.remove();
    const trial = { id: "scope-trial", status: "SUCCEEDED", ruleSnapshotJson: '{"schemeSnapshot":{"draftRevision":2}}' } as InspectionTask;
    vi.mocked(listSchemeTrials).mockResolvedValue([trial]); vi.mocked(getTask).mockResolvedValue(trial);
    vi.mocked(getBatchResultSummary).mockResolvedValue({ taskId: trial.id, status: "SUCCEEDED", conversationCount: 0,
      totalMessages: 0, processedMessages: 0, failedMessages: 0, averageScore: null,
      hitCount: 0, highRiskCount: 0, conversations: [] });
    mount(false, true); await settle();
    button("试跑与发布").click(); await settle();
    button("修订 2 · SUCCEEDED · scope-trial").click(); await settle();
    expect(host.textContent).toContain("请核对完整会话和单消息判断的差异");
    expect(button("发布为业务模板").disabled).toBe(true);
  });
  async function editCondition(condition: { id: string; versionNo: number }, llm = false) {
    await edit(); app.unmount(); host.remove();
    const definition = JSON.parse(scheme.draftConfigJson);
    definition.items[0].appliesWhen = condition;
    scheme.draftConfigJson = JSON.stringify(definition);
    vi.mocked(listRuleVersions).mockImplementation(async id => [{ id: `${id}-v`, ruleId: id, versionNo: condition.versionNo,
      name: id === condition.id ? "进入贷款环节" : "费用告知", code: id,
      ruleType: llm && id === condition.id ? "LLM" : "REGEX", status: "PUBLISHED" }]);
    vi.mocked(listRules).mockResolvedValue([{ id: "r", name: "费用告知", code: "r", ruleType: "REGEX", status: "PUBLISHED" },
      { id: "condition", name: "进入贷款环节", code: "condition", ruleType: llm ? "LLM" : "REGEX", status: "PUBLISHED" }]);
    mount(true); await settle(); button("编辑草稿").click(); await settle();
  }
  it("reloads and retains the condition's pinned published version", async () => {
    await editCondition({ id: "condition", versionNo: 3 });
    expect(listRuleVersions).toHaveBeenCalledWith("condition");
    expect(host.textContent).toContain("所有评分项不适用时无分数，不是满分");
    button("保存草稿").click(); await settle();
    expect(vi.mocked(reviseScheme).mock.calls[0][2].definition.items[0].appliesWhen).toEqual({ id: "condition", versionNo: 3 });
  });
  it("lets experts explicitly remove an applicability condition", async () => {
    await editCondition({ id: "condition", versionNo: 3 });
    const checkbox = [...host.querySelectorAll("label")].find(label => label.textContent?.includes("仅在业务条件明确命中"))!.querySelector("input")!;
    checkbox.click(); await settle(); button("保存草稿").click(); await settle();
    expect(vi.mocked(reviseScheme).mock.calls[0][2].definition.items[0]).not.toHaveProperty("appliesWhen");
  });
  it("selects a different condition rule and automatically pins its published version", async () => {
    await editCondition({ id: "condition", versionNo: 3 });
    const checkbox = [...host.querySelectorAll("label")].find(label => label.textContent?.includes("仅在业务条件明确命中"))!.querySelector("input")!;
    checkbox.click(); await settle(); checkbox.click(); await settle();
    const select = host.querySelectorAll("select")[3]!;
    expect([...select.options].some(option => option.value === "r")).toBe(false);
    select.value = "condition"; select.dispatchEvent(new Event("change")); await settle();
    button("保存草稿").click(); await settle();
    expect(vi.mocked(reviseScheme).mock.calls[0][2].definition.items[0].appliesWhen).toEqual({ id: "condition", versionNo: 3 });
  });
  it("rejects conflicting versions when another check reuses the condition detector", async () => {
    await editCondition({ id: "condition", versionNo: 3 }); app.unmount(); host.remove();
    const definition = JSON.parse(scheme.draftConfigJson);
    definition.items.push({ itemCode: "b", name: "贷款核查", rule: { id: "condition", versionNo: 2 }, hitMeaning: "VIOLATION" });
    scheme.draftConfigJson = JSON.stringify(definition);
    mount(true); await settle(); button("编辑草稿").click(); await settle(); button("保存草稿").click(); await settle();
    expect(reviseScheme).not.toHaveBeenCalled(); expect(host.textContent).toContain("同一检测或条件规则在方案中须使用相同版本");
  });
  it("enables condition selection but rejects saving before a published version is selected", async () => {
    await edit();
    const checkbox = [...host.querySelectorAll("label")].find(label => label.textContent?.includes("仅在业务条件明确命中"))!.querySelector("input")!;
    checkbox.click(); await settle();
    expect(host.querySelectorAll("select")[4]!.options[0]!.textContent).toBe("请选择已发布版本");
    button("保存草稿").click(); await settle();
    expect(reviseScheme).not.toHaveBeenCalled(); expect(host.textContent).toContain("适用条件须引用另一条规则的已发布版本");
  });
  it("rejects a self-referencing condition rather than silently removing it", async () => {
    await editCondition({ id: "r", versionNo: 1 }); button("保存草稿").click(); await settle();
    expect(reviseScheme).not.toHaveBeenCalled(); expect(host.textContent).toContain("不能使用本项检测规则");
  });
  it("requires an Agent when only the applicability detector is LLM", async () => {
    await editCondition({ id: "condition", versionNo: 3 }, true);
    expect(host.textContent).toContain("检测规则或适用条件包含 LLM");
    button("保存草稿").click(); await settle(); expect(reviseScheme).not.toHaveBeenCalled();
    expect(host.textContent).toContain("请选择已发布的 LLM 智能体版本");
  });
  it("opens condition trials with a visible gate and no publication confirmation", async () => {
    scheme.draftConfigJson = JSON.stringify({ items: [{ appliesWhen: { id: "condition", versionNo: 3 } }] });
    const trial = { id: "trial-condition", status: "SUCCEEDED", ruleSnapshotJson: '{"schemeSnapshot":{"draftRevision":2}}' } as InspectionTask;
    vi.mocked(listSchemeTrials).mockResolvedValue([trial]); vi.mocked(getTask).mockResolvedValue(trial);
    vi.mocked(getBatchResultSummary).mockResolvedValue({ taskId: trial.id, status: "SUCCEEDED", conversationCount: 0,
      totalMessages: 0, processedMessages: 0, failedMessages: 0, averageScore: null,
      hitCount: 0, highRiskCount: 0, conversations: [] });
    mount(false, true); await settle();
    expect(host.textContent).toContain("条件适用"); button("条件试跑").click(); await settle();
    button("修订 2 · SUCCEEDED · trial-condition").click(); await settle();
    expect(host.textContent).toContain("条件异常不能当成通过或不适用"); expect(button("发布为业务模板").disabled).toBe(true);
  });
  it("keeps a label-only draft without a dummy check or score", async () => {
    scheme.draftConfigJson = JSON.stringify({ schemaVersion: "iqc-scheme-v2", agent: null, items: [], labels: [{ id: "house", versionNo: 2 }],
      scoring: { version: "iqc-score-v2", mode: "DEDUCTION", baseScore: 100, passingScore: 60, items: [] } });
    vi.mocked(listRules).mockResolvedValue([]); vi.mocked(listAgents).mockResolvedValue([]);
    mount(true); await settle(); button("编辑草稿").click(); await settle();
    expect(host.textContent).toContain("仅识别标签：没有质检项与最终分数");
    button("保存草稿").click(); await settle();
    expect(vi.mocked(reviseScheme).mock.calls[0][2].definition.items).toEqual([]);
    expect(vi.mocked(reviseScheme).mock.calls[0][2].definition.labels).toEqual([{ id: "house", versionNo: 2 }]);
    expect(vi.mocked(reviseScheme).mock.calls[0][2].definition.scoring.items).toEqual([]);
  });
  it("starts new schemes with explicit serial defaults", async () => {
    vi.mocked(listRules).mockResolvedValue([]); vi.mocked(listAgents).mockResolvedValue([]);
    mount(true); await settle(); button("新建业务方案").click(); await settle();
    const values = [...host.querySelectorAll<HTMLInputElement>('input[type="number"]')].slice(0, 3).map(input => input.value);
    expect(values).toEqual(["1000", "1", "1"]);
  });
  it("retains explicit limits and rejects a default exceeding maximum", async () => {
    await edit({ maxConversations: 10, defaultConcurrency: 2, maxConcurrency: 3 });
    const inputs = host.querySelectorAll<HTMLInputElement>('input[type="number"]');
    expect(inputs[0].value).toBe("10"); expect(inputs[1].value).toBe("2");
    inputs[1].value = "4"; inputs[1].dispatchEvent(new Event("input")); await settle();
    button("保存草稿").click(); await settle(); expect(reviseScheme).not.toHaveBeenCalled();
    expect(host.textContent).toContain("默认并发不得超过最大并发");
    inputs[1].value = "3"; inputs[1].dispatchEvent(new Event("input")); await settle();
    button("保存草稿").click(); await settle();
    expect(vi.mocked(reviseScheme).mock.calls[0][2].definition.runLimits).toEqual({ maxConversations: 10, defaultConcurrency: 3, maxConcurrency: 3 });
  });
  it("preserves pinned label references and opens joint trial", async () => {
    await edit();
    const joint = [{ id: "house", versionNo: 2 }];
    scheme.draftConfigJson = JSON.stringify({ ...JSON.parse(scheme.draftConfigJson), labels: joint });
    button("保存草稿").click(); await settle();
    expect(vi.mocked(reviseScheme).mock.calls[0][2].definition.labels).toEqual(undefined);
    app.unmount(); host.remove();
    mount(true); await settle();
    expect(button("联合试跑").disabled).toBe(false);
    expect(host.textContent).toContain("联合输出");
    button("联合试跑").click(); await settle();
    expect(listSchemeTrials).toHaveBeenCalledWith("s");
    button("编辑草稿").click(); await settle(); button("保存草稿").click(); await settle();
    expect(vi.mocked(reviseScheme).mock.calls.at(-1)?.[2].definition.labels).toEqual(joint);
  });
  it("shows frozen joint trial label coverage beside quality scores", async () => {
    scheme.draftConfigJson = JSON.stringify({ labels: [{ id: "house", versionNo: 2 }] });
    const trial = { id: "trial-1", status: "SUCCEEDED", conversationIdsJson: '["c1","c2"]',
      labelScopeSnapshotJson: JSON.stringify({ schemaVersion: "2.0", labels: [
        { id: "house", versionNo: 2, values: [{ valueCode: "owns" }] },
      ] }), ruleSnapshotJson: '{"schemeSnapshot":{"draftRevision":2,"release":{"definition":{"labels":[{"id":"house","versionNo":2}]}}}}' } as InspectionTask;
    vi.mocked(listSchemeTrials).mockResolvedValue([trial]);
    vi.mocked(getTask).mockResolvedValue(trial);
    vi.mocked(getBatchResultSummary).mockResolvedValue({ taskId: trial.id, status: "SUCCEEDED", conversationCount: 2,
      totalMessages: 2, processedMessages: 2, failedMessages: 0, averageScore: 90, hitCount: 0, highRiskCount: 0, conversations: [] });
    vi.mocked(getTaskLabelResults).mockResolvedValue(["c1", "c2"].map((conversationId, index) => ({
      id: `label-${index}`, conversationId, labelId: "house", labelName: "有房", labelVersionNo: 2,
      valueCode: "owns", generationSource: "RULE", status: index ? "ERROR" : "UNKNOWN",
      valueJson: JSON.stringify({ schemaVersion: "iqc-label-result-v2", status: index ? "ERROR" : "UNKNOWN", candidates: [], reasons: [] }),
    })));
    mount(false, true); await settle(); button("联合试跑").click(); await settle();
    button("修订 2 · SUCCEEDED · trial-1").click(); await settle();
    expect(getTaskLabelResults).toHaveBeenCalledWith("trial-1");
    expect(host.textContent).toContain("已生成 2 / 预期 2 个标签值结果");
    expect(host.textContent).toContain("未知 1"); expect(host.textContent).toContain("错误 1");
    expect(host.textContent).toContain("查看洞察标签与状态");
    expect(button("发布为业务模板").disabled).toBe(true);
    vi.mocked(getTask).mockResolvedValue({ ...trial, labelScopeSnapshotJson: undefined });
    button("刷新进度与结果").click(); await settle();
    expect(host.textContent).toContain("标签结果格式或冻结试跑范围异常");
  });
  it("shows a label-only trial as unscored rather than a default score", async () => {
    scheme.draftConfigJson = JSON.stringify({ labels: [{ id: "house", versionNo: 2 }] });
    const trial = { id: "trial-label-only", status: "SUCCEEDED", conversationIdsJson: '["c1"]',
      labelScopeSnapshotJson: '{"schemaVersion":"2.0","labels":[{"id":"house","versionNo":2,"values":[{"valueCode":"owns"}]}]}',
      ruleSnapshotJson: '{"schemeSnapshot":{"draftRevision":2,"release":{"definition":{"items":[],"labels":[{"id":"house","versionNo":2}]}}}}' } as InspectionTask;
    vi.mocked(listSchemeTrials).mockResolvedValue([trial]); vi.mocked(getTask).mockResolvedValue(trial);
    vi.mocked(getBatchResultSummary).mockResolvedValue({ taskId: trial.id, status: "SUCCEEDED", conversationCount: 1,
      totalMessages: 1, processedMessages: 1, failedMessages: 0, averageScore: null, hitCount: 0, highRiskCount: 0,
      conversations: [{ conversationId: "c1", messageCount: 1, resultCount: 1, averageScore: null, scoreStatus: "NOT_APPLICABLE",
        hitCount: 0, highRiskCount: 0, errorCount: 0 }] });
    vi.mocked(getTaskLabelResults).mockResolvedValue([]);
    mount(false, true); await settle(); button("联合试跑").click(); await settle();
    button("修订 2 · SUCCEEDED · trial-label-only").click(); await settle();
    expect(host.textContent).toContain("仅识别标签");
    expect(host.textContent).not.toContain("100");
    expect(button("发布为业务模板").disabled).toBe(true);
  });
  it("retries an uncertain trial creation with the same frozen request", async () => {
    const created = { id: "trial-created", status: "CREATED" } as InspectionTask;
    vi.mocked(trialScheme).mockRejectedValueOnce(new Error("请求超时")).mockResolvedValueOnce(created);
    vi.mocked(runTask).mockResolvedValue({ ...created, status: "QUEUED" });
    mount(false, true); await settle(); button("试跑与发布").click(); await settle();
    button("选择试跑会话").click(); await settle();
    button("创建并执行当前草稿试跑").click(); await settle();
    expect(host.textContent).toContain("重试会固定相同请求标识、会话、1 轮及策略变体");
    const first = vi.mocked(trialScheme).mock.calls[0];
    expect(first.slice(0, 3)).toEqual(["s", 2, ["c1"]]);
    expect(first[3]).toMatch(/^[a-f0-9-]{36}$/);
    button("重试创建本次试跑").click(); await settle();
    expect(vi.mocked(trialScheme).mock.calls[1]).toEqual(first);
    expect(runTask).toHaveBeenCalledWith("trial-created");
    expect(host.textContent).not.toContain("重试会固定相同请求标识、会话、1 轮及策略变体");
  });
  it("keeps checks-only editing available when the label directory cannot load", async () => {
    vi.mocked(getLabelTree).mockRejectedValueOnce(new Error("标签目录不可用"));
    await edit();
    expect(host.textContent).toContain("仍可维护原有质检项");
    button("保存草稿").click(); await settle();
    expect(reviseScheme).toHaveBeenCalled();
  });
  it("requires confirmation and freezes the selected revision", async () => {
    mount(); await settle(); button("停用模板").click();
    expect(changeSchemeAvailability).not.toHaveBeenCalled();
    const confirmation = state.confirm.mock.calls[0][0];
    expect(confirmation.content).toContain("不会被强制中断"); expect(confirmation.content).toContain("历史结果");
    scheme.draftRevision = 9;
    await confirmation.onOk();
    expect(changeSchemeAvailability).toHaveBeenCalledWith("s", 2, false);
    expect(listSchemes).toHaveBeenCalledTimes(2);
  });
  it("shows restore without permitting trial or publication while disabled", async () => {
    scheme.status = "DISABLED"; mount(); await settle();
    expect(button("试跑与发布").disabled).toBe(true); expect(button("检查依赖").disabled).toBe(true);
    expect(button("编辑草稿").disabled).toBe(false);
    button("恢复模板").click(); const confirmation = state.confirm.mock.calls[0][0];
    expect(confirmation.content).toContain("不发布当前草稿"); await confirmation.onOk();
    expect(changeSchemeAvailability).toHaveBeenCalledWith("s", 2, true);
  });
  it("hides availability actions without publication permission", async () => {
    state.allowed = false; mount(); await settle(); expect(button("停用模板")).toBeUndefined();
    expect(changeSchemeAvailability).not.toHaveBeenCalled();
  });
  it("keeps failed transitions visible and retries the original command", async () => {
    mount(); await settle(); button("停用模板").click(); const confirmation = state.confirm.mock.calls[0][0];
    vi.mocked(changeSchemeAvailability).mockRejectedValueOnce(new Error("方案已被修改，请刷新"));
    await expect(confirmation.onOk()).rejects.toThrow("刷新"); await settle();
    expect(host.textContent).toContain("方案已被修改"); expect(state.success).not.toHaveBeenCalled();
    await confirmation.onOk(); expect(changeSchemeAvailability).toHaveBeenLastCalledWith("s", 2, false);
  });
});
