import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import SchemeTaskWizard from "./SchemeTaskWizard.vue";
import { createSchemeTask, type PublishedTemplate } from "@/api/schemes";
import { getTask, runTask, type InspectionTask } from "@/api/tasks";

const state = vi.hoisted(() => ({ allowed: true, push: vi.fn(), ids: ["c1"], userId: "quality-user-1" }));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock("@/composables/permission", () => ({ usePermission: () => ({ can: () => state.allowed }) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: state.userId } }) }));
vi.mock("@/api/schemes", () => ({ createSchemeTask: vi.fn() }));
vi.mock("@/api/tasks", () => ({ getTask: vi.fn(), runTask: vi.fn() }));
vi.mock("@/components/ConversationPicker.vue", () => ({ default: defineComponent({
  props: ["max"], emits: ["update:modelValue"], setup(props, { emit }) { return () => h("button", { "data-picker-max": props.max, onClick: () => emit("update:modelValue", state.ids) }, "选一个会话"); },
}) }));

const template: PublishedTemplate = { schemeId: "s1", versionNo: 2, contentHash: "hash", snapshot: {
  name: "客服质检", code: "service", businessScene: "客服", dependencies: { executionMode: "RULE_ONLY" },
  definition: { schemaVersion: "iqc-scheme-v2", agent: null, items: [{ itemCode: "greeting", name: "开场白", rule: { id: "r1", versionNo: 1 }, hitMeaning: "COMPLIANCE" }],
    scoring: { version: "iqc-score-v2", mode: "DEDUCTION", baseScore: 100, passingScore: 60, items: [{ itemCode: "greeting", points: 10, veto: false }] } },
} };
const task = (status: string) => ({ id: "t1", status }) as InspectionTask;
const pass = defineComponent({ setup(_, { slots }) { return () => h("div", [slots.default?.(), slots.extra?.()]); } });
let app: App, host: HTMLDivElement;
async function settle() { for (let i = 0; i < 10; i++) { await Promise.resolve(); await nextTick(); } }
function button(text: string) { const found = [...host.querySelectorAll("button")].find(b => b.textContent === text); expect(found, text).toBeDefined(); return found!; }
async function click(text: string) { button(text).click(); await settle(); }
function mount(readOnly = false, selectedTemplate = template) {
  host = document.createElement("div"); document.body.append(host);
  app = createApp(SchemeTaskWizard, { template: selectedTemplate, readOnly });
  for (const name of ["AModal", "ASteps", "ATag", "ADescriptions", "ADescriptionsItem", "AListItem", "AForm", "AFormItem", "ASpace"]) app.component(name, pass);
  app.component("AResult", defineComponent({ props: ["title", "subTitle"], setup(props, { slots }) {
    return () => h("section", [h("h2", String(props.title || "")), h("p", String(props.subTitle || "")), slots.extra?.()]);
  } }));
  app.component("AAlert", defineComponent({ props: ["message"], setup(props) { return () => h("div", String(props.message || "")); } }));
  app.component("AInput", defineComponent({ props: ["value", "maxlength", "placeholder"], emits: ["update:value"], setup(props, { emit }) {
    return () => h("input", { value: props.value, maxlength: props.maxlength, placeholder: props.placeholder,
      onInput: (event: Event) => emit("update:value", (event.target as HTMLInputElement).value) });
  } }));
  app.component("ASelect", defineComponent({ props: ["value", "options"], emits: ["update:value"], setup(props, { emit }) {
    return () => h("select", { value: props.value, onChange: (event: Event) => emit("update:value", (event.target as HTMLSelectElement).value) },
      (props.options as Array<{ label: string; value: string }> || []).map(option => h("option", { value: option.value }, option.label)));
  } }));
  for (const name of ["ACollapse", "ACollapsePanel"]) app.component(name, pass);
  app.component("AInputNumber", defineComponent({ props: ["value"], emits: ["update:value"], setup(props, { emit }) {
    return () => h("input", { type: "number", value: props.value, onInput: (event: Event) => emit("update:value", Number((event.target as HTMLInputElement).value)) });
  } }));
  app.component("AButton", defineComponent({ setup(_, { slots, attrs }) { return () => h("button", attrs, slots.default?.()); } }));
  app.component("AList", defineComponent({ props: ["dataSource"], setup(props, { slots }) { return () => h("div", props.dataSource.map((item: unknown) => slots.renderItem?.({ item }))); } }));
  app.mount(host);
}
async function confirm() { await click("下一步"); await click("选一个会话"); await click("下一步"); }

describe("published-template task wizard", () => {
  it("explains frozen independent detection without claiming universal AI review", async () => {
    const selected = structuredClone(template);
    selected.snapshot.dependencies.executionMode = "INDEPENDENT";
    mount(false, selected); await settle();
    expect(host.textContent).toContain("各项独立检测");
    expect(host.textContent).toContain("不代表每项都经过 AI 复核");
    await confirm(); expect(host.textContent).toContain("各项独立检测（模板固定策略）");
    await click("开始质检");
    expect(vi.mocked(createSchemeTask).mock.calls[0][2]).not.toHaveProperty("executionMode");
  });
  it("blocks an unsupported execution mode without a misleading permission warning", async () => {
    const selected = structuredClone(template);
    selected.snapshot.dependencies.executionMode = "RULE_THEN_LLM";
    sessionStorage.setItem(`iqc-template-submit:${state.userId}:s1:2`, JSON.stringify({ contentHash: "hash",
      request: { requestId: "pending_submit_01", name: "已有请求", conversationIds: ["c1"], concurrency: 1 } }));
    mount(false, selected); await settle();
    expect(button("下一步").disabled).toBe(true);
    expect(host.textContent).not.toContain("需要模板使用、会话查看和任务执行权限");
    expect(host.textContent).toContain("此模板的执行路线尚未支持");
    expect(host.textContent).not.toContain("已恢复上次未确认的提交");
    expect(createSchemeTask).not.toHaveBeenCalled(); expect(getTask).not.toHaveBeenCalled();
  });
  it("preserves zero configured points and displays veto conditions in previews", async () => {
    const selected = structuredClone(template);
    selected.snapshot.definition.scoring.items[0] = { itemCode: "greeting", points: 0, veto: true };
    mount(true, selected); await settle();
    expect(host.textContent).toContain("不满足时扣分：0"); expect(host.textContent).toContain("不满足时一票否决");
  });
  it("previews scoring without execution permissions or conversation loading", async () => {
    state.allowed = false; mount(true); await settle();
    expect(host.textContent).toContain("开场白"); expect(host.textContent).toContain("不满足时扣分：10");
    expect([...host.querySelectorAll("button")].some(b => ["下一步", "开始质检", "选一个会话"].includes(b.textContent || ""))).toBe(false);
    expect(createSchemeTask).not.toHaveBeenCalled(); expect(getTask).not.toHaveBeenCalled(); expect(runTask).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks(); sessionStorage.clear(); state.allowed = true; state.ids = ["c1"]; state.userId = "quality-user-1";
    vi.mocked(createSchemeTask).mockResolvedValue(task("CREATED"));
    vi.mocked(getTask).mockResolvedValue(task("CREATED"));
    vi.mocked(runTask).mockResolvedValue(task("QUEUED"));
  });
  afterEach(() => { app?.unmount(); host?.remove(); vi.restoreAllMocks(); });

  it("explains conditions using frozen names without exposing technical identifiers", async () => {
    const selected = structuredClone(template);
    selected.snapshot.definition.items[0]!.appliesWhen = { id: "private-condition-id", versionNo: 3 };
    selected.snapshot.dependencies.rules = [{ id: "private-condition-id", versionNo: 3, name: "进入贷款环节" },
      { id: "private-condition-id", versionNo: 4, name: "不应显示的其他版本" }];
    mount(true, selected); await settle();
    expect(host.textContent).toContain("仅在“进入贷款环节”明确命中时检查");
    expect(host.textContent).toContain("所有评分项不适用时无分数，不是满分");
    expect(host.textContent).not.toContain("private-condition-id"); expect(host.textContent).not.toContain("不应显示的其他版本");
    expect(createSchemeTask).not.toHaveBeenCalled(); expect(getTask).not.toHaveBeenCalled();
  });
  it("does not invent a business condition when frozen names are unavailable", async () => {
    const selected = structuredClone(template);
    selected.snapshot.definition.items[0]!.appliesWhen = { id: "condition", versionNo: 3 };
    selected.snapshot.dependencies.rules = [{ id: "condition", versionNo: 4, name: "错误版本名称" }];
    mount(true, selected); await settle();
    expect(host.textContent).toContain("模板指定的业务条件"); expect(host.textContent).not.toContain("错误版本名称");
  });
  it("allows ordinary execution of a conditional template and keeps the condition frozen", async () => {
    const selected = structuredClone(template);
    selected.snapshot.definition.items[0]!.appliesWhen = { id: "condition", versionNo: 3 };
    mount(false, selected); await settle(); expect(button("下一步").disabled).toBe(false);
    await confirm(); await click("开始质检");
    expect(createSchemeTask).toHaveBeenCalledOnce(); expect(runTask).toHaveBeenCalledWith("t1");
  });

  it("uses the frozen default and preserves selected concurrency on uncertain retries", async () => {
    const selected = structuredClone(template);
    selected.snapshot.definition.runLimits = { maxConversations: 2, defaultConcurrency: 2, maxConcurrency: 3 };
    vi.mocked(createSchemeTask).mockRejectedValueOnce(new Error("超时"));
    mount(false, selected); await click("下一步");
    expect(host.querySelector("[data-picker-max]")?.getAttribute("data-picker-max")).toBe("2");
    const input = host.querySelector<HTMLInputElement>('input[type="number"]')!;
    expect(input.value).toBe("2"); input.value = "3"; input.dispatchEvent(new Event("input")); await settle();
    await click("选一个会话"); await click("下一步"); await click("开始质检"); await click("重试提交");
    expect(vi.mocked(createSchemeTask).mock.calls[0][2].concurrency).toBe(3);
    expect(vi.mocked(createSchemeTask).mock.calls[0]).toEqual(vi.mocked(createSchemeTask).mock.calls[1]);
  });

  it("blocks excess conversations and out-of-range or fractional concurrency", async () => {
    const selected = structuredClone(template);
    selected.snapshot.definition.runLimits = { maxConversations: 1, defaultConcurrency: 1, maxConcurrency: 2 };
    mount(false, selected); await click("下一步"); state.ids = ["c1", "c2"]; await click("选一个会话");
    expect(button("下一步").disabled).toBe(true);
    state.ids = ["c1"]; await click("选一个会话");
    const input = host.querySelector<HTMLInputElement>('input[type="number"]')!;
    for (const value of ["0", "3", "1.5"]) {
      input.value = value; input.dispatchEvent(new Event("input")); await settle(); expect(button("下一步").disabled).toBe(true);
    }
    expect(createSchemeTask).not.toHaveBeenCalled();
  });

  it("does not expose advanced concurrency for historical or serial templates", async () => {
    mount(); await click("下一步"); expect(host.querySelector('input[type="number"]')).toBeNull();
    expect(template.snapshot.definition).not.toHaveProperty("runLimits");
  });

  it("creates a rule-only task in three steps without Agent or scoring overrides", async () => {
    mount(); await confirm(); await click("开始质检");
    const [id, version, request] = vi.mocked(createSchemeTask).mock.calls[0]!;
    expect([id, version]).toEqual(["s1", 2]);
    expect(request).toEqual({ requestId: expect.any(String), name: "客服质检", conversationIds: ["c1"], concurrency: 1 });
    expect(request).not.toHaveProperty("agentId");
    expect(request).not.toHaveProperty("definition");
    expect(runTask).toHaveBeenCalledWith("t1");
    await click("查看任务");
    expect(state.push).toHaveBeenCalledWith({ path: "/tasks", query: { taskId: "t1" } });
  });

  it("creates a joint routed task with the user's frozen variant selection", async () => {
    const selected = structuredClone(template);
    selected.snapshot.definition.items[0]!.appliesWhen = { id: "condition", versionNo: 3 };
    selected.snapshot.definition.items[0]!.inputScope = "CONVERSATION";
    selected.snapshot.definition.items[0]!.execution = { route: "RULE_ONLY" };
    selected.snapshot.definition.labels = [{ id: "house", versionNo: 2 }];
    selected.snapshot.definition.executionVariants = { recommendedCode: "standard", variants: [
      { code: "standard", name: "标准", coverage: "完整检查", cost: "本地规则", routes: { greeting: { route: "RULE_ONLY" } } },
      { code: "alternate", name: "候选复核", coverage: "候选后核验", cost: "一次模型调用", routes: { greeting: { route: "RULE_ONLY" } } }
    ] };
    mount(false, selected); await settle();
    expect(button("下一步").disabled).toBe(false);
    await click("下一步");
    const variant = host.querySelector<HTMLSelectElement>("select")!;
    variant.value = "alternate"; variant.dispatchEvent(new Event("change", { bubbles: true })); await settle();
    await click("选一个会话"); await click("下一步"); await click("开始质检");
    expect(vi.mocked(createSchemeTask).mock.calls[0]![2].variantCode).toBe("alternate");
    expect(runTask).toHaveBeenCalledWith("t1");
  });

  it("creates a scheduled task with a frozen filter and leaves execution to the dispatcher", async () => {
    vi.mocked(createSchemeTask).mockRejectedValueOnce(new Error("响应超时")).mockResolvedValue(task("SCHEDULED"));
    mount(); await click("下一步");
    const mode = host.querySelector<HTMLInputElement>('input[name="scheme-task-type"][value="SCHEDULED"]')!;
    mode.checked = true; mode.dispatchEvent(new Event("change", { bubbles: true })); await settle();
    const due = host.querySelector<HTMLInputElement>('input[type="datetime-local"]')!;
    due.value = "2099-01-02T12:30"; due.dispatchEvent(new Event("input", { bubbles: true })); await settle();
    const limit = host.querySelector<HTMLInputElement>('input[type="number"]')!;
    limit.value = "25"; limit.dispatchEvent(new Event("input", { bubbles: true })); await settle();
    const fileName = host.querySelector<HTMLInputElement>('input[placeholder]')!;
    fileName.value = "week-40"; fileName.dispatchEvent(new Event("input", { bubbles: true })); await settle();
    await click("下一步"); await click("创建定时任务");
    expect(button("重试提交")).toBeDefined(); await click("重试提交");
    const request = vi.mocked(createSchemeTask).mock.calls[0]![2];
    expect(request).toMatchObject({ requestId: expect.any(String), name: "客服质检", concurrency: 1,
      taskType: "SCHEDULED", scheduledTime: "2099-01-02T12:30",
      selectionFilter: { status: "IMPORTED", limit: 25, fileName: "week-40" } });
    expect(request).not.toHaveProperty("conversationIds");
    expect(vi.mocked(createSchemeTask).mock.calls[0]).toEqual(vi.mocked(createSchemeTask).mock.calls[1]);
    expect(runTask).not.toHaveBeenCalled();
    expect(host.textContent).toContain("定时任务已创建");
  });

  it("retries an uncertain create with exactly the same key and locked parameters", async () => {
    vi.mocked(createSchemeTask).mockRejectedValueOnce(new Error("响应超时"));
    mount(); await confirm(); await click("开始质检");
    expect(button("上一步").disabled).toBe(true);
    await click("重试提交");
    expect(vi.mocked(createSchemeTask).mock.calls[0]).toEqual(vi.mocked(createSchemeTask).mock.calls[1]);
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("restores an uncertain create after the wizard closes without changing the request key", async () => {
    vi.mocked(createSchemeTask).mockRejectedValueOnce(new Error("响应超时"));
    mount(); await confirm(); await click("开始质检");
    const original = vi.mocked(createSchemeTask).mock.calls[0];
    app.unmount(); host.remove();

    mount(); await settle();
    expect(button("重试提交")).toBeDefined();
    expect(host.textContent).toContain("1 个会话");
    await click("重试提交");
    expect(vi.mocked(createSchemeTask).mock.calls[1]).toEqual(original);
    expect(runTask).toHaveBeenCalledTimes(1);
    expect(sessionStorage.length).toBe(0);
  });

  it("does not offer another user's or changed release's pending submission", async () => {
    vi.mocked(createSchemeTask).mockRejectedValueOnce(new Error("响应超时"));
    mount(); await confirm(); await click("开始质检");
    app.unmount(); host.remove();

    state.userId = "quality-user-2";
    mount(); await settle(); expect(button("下一步")).toBeDefined();
    expect(host.textContent).not.toContain("已恢复上次未确认的提交");
    app.unmount(); host.remove();

    state.userId = "quality-user-1";
    const changed = structuredClone(template); changed.contentHash = "changed-hash";
    mount(false, changed); await settle(); expect(button("下一步")).toBeDefined();
    expect(host.textContent).not.toContain("已恢复上次未确认的提交");
  });

  it("does not promise recovery when browser session storage refuses writes", async () => {
    vi.spyOn(window.sessionStorage, "setItem").mockImplementation(() => { throw new Error("quota denied"); });
    vi.mocked(createSchemeTask).mockRejectedValueOnce(new Error("响应超时"));
    mount(); await confirm(); await click("开始质检");
    expect(host.textContent).toContain("浏览器未能保存本次请求");
  });

  it("restores a known task after a lost run response and reads it before another run", async () => {
    vi.mocked(runTask).mockRejectedValueOnce(new Error("响应丢失"));
    vi.mocked(getTask).mockResolvedValue(task("RUNNING"));
    mount(); await confirm(); await click("开始质检");
    app.unmount(); host.remove();

    mount(); await settle(); await click("重试提交");
    expect(createSchemeTask).toHaveBeenCalledTimes(1);
    expect(getTask).toHaveBeenCalledWith("t1");
    expect(runTask).toHaveBeenCalledTimes(1);
    expect(sessionStorage.length).toBe(0);
  });

  it("recovers a lost run response by reading the same task instead of running it twice", async () => {
    vi.mocked(runTask).mockRejectedValueOnce(new Error("响应丢失"));
    vi.mocked(getTask).mockResolvedValue(task("RUNNING"));
    mount(); await confirm(); await click("开始质检"); await click("重试提交");
    expect(createSchemeTask).toHaveBeenCalledTimes(1);
    expect(runTask).toHaveBeenCalledTimes(1);
    expect(getTask).toHaveBeenCalledWith("t1");
  });

  it("allows reading the template but blocks use without required permissions", async () => {
    state.allowed = false; mount();
    expect(button("下一步").disabled).toBe(true);
    await click("下一步");
    expect(createSchemeTask).not.toHaveBeenCalled();
  });
});
