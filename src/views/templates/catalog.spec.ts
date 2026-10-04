import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import Catalog from "./index.vue";
import { listPublishedTemplates, type PublishedTemplate } from "@/api/schemes";
import { listTemplates } from "@/api/templates";
const state = vi.hoisted(() => ({ permissions: ["iqc:scheme:view", "iqc:scheme:use", "iqc:conversation:view", "iqc:task:execute"] }));
vi.mock("@/composables/permission", () => ({ usePermission: () => ({ can: (code: string) => state.permissions.includes(code) }) }));
vi.mock("ant-design-vue", () => ({ message: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/api/schemes", () => ({ listPublishedTemplates: vi.fn() }));
vi.mock("@/api/templates", () => ({ listTemplates: vi.fn(), materializeTemplateRules: vi.fn() }));
vi.mock("./SchemeTaskWizard.vue", () => ({ default: defineComponent({ props: { template: Object, readOnly: Boolean }, setup(props) {
  return () => h("div", `preview:${props.template?.schemeId}:${props.readOnly}`);
} }) }));
const template = (id: string, name: string, scene: string): PublishedTemplate => ({ schemeId: id, versionNo: 1, contentHash: id,
  snapshot: { name, code: id, businessScene: scene, dependencies: { executionMode: "RULE_ONLY" }, definition: {
    schemaVersion: "iqc-scheme-v2", items: [], agent: null, scoring: { version: "iqc-score-v2", mode: "DEDUCTION", baseScore: 100, passingScore: 60, items: [] }
  } } });
const templates = [template("a", "费用告知", "电话销售"), template("b", "服务规范", "客服")];
let app: App, host: HTMLDivElement;
const pass = defineComponent({ setup(_, { slots, attrs }) { return () => h("div", [attrs.message as string, attrs.description as string, slots.default?.()]); } });
async function settle() { for (let i = 0; i < 12; i++) { await Promise.resolve(); await nextTick(); } }
function button(text: string) { return [...host.querySelectorAll("button")].find(b => b.textContent === text)!; }
function mount() {
  host = document.createElement("div"); document.body.append(host); app = createApp(Catalog);
  for (const name of ["ASpace", "AAlert", "ASpin", "ARow", "ACol", "ACard", "ATag", "AEmpty", "ATabs", "ATabPane", "AList", "AListItem", "AListItemMeta", "RouterLink"]) app.component(name, pass);
  app.component("ADrawer", defineComponent({ setup() { return () => h("div"); } }));
  app.component("AButton", defineComponent({ setup(_, { slots, attrs }) { return () => h("button", attrs, slots.default?.()); } }));
  app.component("AInput", defineComponent({ props: ["value"], emits: ["update:value"], setup(props, { emit }) { return () => h("input", {
    value: props.value, onInput: (e: Event) => emit("update:value", (e.target as HTMLInputElement).value)
  }); } }));
  app.component("ASelect", defineComponent({ props: ["value", "options"], emits: ["update:value"], setup(props, { emit }) { return () => h("select", {
    value: props.value, onChange: (e: Event) => emit("update:value", (e.target as HTMLSelectElement).value)
  }, props.options.map((option: { value: string; label: string }) => h("option", { value: option.value }, option.label))); } }));
  app.mount(host);
}
describe("business template catalog", () => {
  beforeEach(() => { vi.clearAllMocks(); state.permissions = ["iqc:scheme:view", "iqc:scheme:use", "iqc:conversation:view", "iqc:task:execute"];
    vi.mocked(listPublishedTemplates).mockResolvedValue(templates); });
  afterEach(() => { app?.unmount(); host?.remove(); });
  it("filters names and scenes and distinguishes no matches from no releases", async () => {
    mount(); await settle(); const input = host.querySelector("input")!;
    input.value = "费用"; input.dispatchEvent(new Event("input")); await settle(); expect(host.textContent).not.toContain("服务规范");
    const select = host.querySelector("select")!; select.value = "客服"; select.dispatchEvent(new Event("change")); await settle();
    expect(host.textContent).toContain("没有匹配的业务模板");
    button("清除筛选").click(); await settle(); expect(host.textContent).toContain("费用告知"); expect(host.textContent).toContain("服务规范");
    expect(listPublishedTemplates).toHaveBeenCalledOnce(); expect(listTemplates).not.toHaveBeenCalled();
  });
  it("offers read-only standards without use permissions", async () => {
    state.permissions = ["iqc:scheme:view"]; mount(); await settle();
    expect(button("使用模板")).toBeUndefined(); button("查看标准").click(); await settle(); expect(host.textContent).toContain("preview:a:true");
  });
  it("opens the task wizard only through the execution action", async () => {
    mount(); await settle(); button("使用模板").click(); await settle(); expect(host.textContent).toContain("preview:a:false");
  });
  it("clears old cards after failed refresh without resetting an open wizard", async () => {
    mount(); await settle(); button("使用模板").click(); await settle();
    vi.mocked(listPublishedTemplates).mockRejectedValueOnce(new Error("offline")); button("刷新").click(); await settle();
    expect(button("使用模板")).toBeUndefined(); expect(host.textContent).toContain("加载失败"); expect(host.textContent).toContain("preview:a:false");
  });
  it("ignores late responses from earlier refreshes", async () => {
    let resolve!: (value: PublishedTemplate[]) => void;
    vi.mocked(listPublishedTemplates).mockReturnValueOnce(new Promise(done => { resolve = done; })).mockResolvedValueOnce([]);
    mount(); button("刷新").click(); await settle(); resolve(templates); await settle();
    expect(host.textContent).toContain("暂无已发布业务模板"); expect(button("使用模板")).toBeUndefined();
  });
  it("does not fetch the catalog without viewing permission", async () => {
    state.permissions = []; mount(); await settle(); expect(listPublishedTemplates).not.toHaveBeenCalled(); expect(host.textContent).toContain("暂无业务模板查看权限");
  });
});
