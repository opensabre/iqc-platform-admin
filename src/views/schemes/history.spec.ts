import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import Schemes from "./index.vue";
import { listSchemes, listSchemeVersions, createScheme, reviseScheme, publishScheme, changeSchemeAvailability,
  changeSchemeVersionArchive, type InspectionScheme, type ReleasedSchemeVersion, type SchemeVersionHistory } from "@/api/schemes";
const state = vi.hoisted(() => ({ manage: true, publish: true, confirm: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("ant-design-vue", () => ({ message: { success: state.success, error: state.error }, Modal: { confirm: state.confirm } }));
vi.mock("@/composables/permission", () => ({ usePermission: () => ({ can: (code: string) =>
  (code === "iqc:scheme:manage" && state.manage) || (code === "iqc:scheme:publish" && state.publish) }) }));
vi.mock("@/api/schemes", () => ({ listSchemes: vi.fn(), listSchemeVersions: vi.fn(), createScheme: vi.fn(), reviseScheme: vi.fn(),
  publishScheme: vi.fn(), changeSchemeAvailability: vi.fn(), changeSchemeVersionArchive: vi.fn(), previewScheme: vi.fn(), trialScheme: vi.fn(), listSchemeTrials: vi.fn() }));
vi.mock("../templates/SchemeTaskWizard.vue", () => ({ default: defineComponent({ props: { template: Object, readOnly: Boolean }, setup(props) {
  return () => h("div", `frozen:${props.readOnly}:${props.template?.versionNo}:${props.template?.snapshot.name}:${props.template?.snapshot.definition.scoring.passingScore}`);
} }) }));
const scheme = (id = "s"): InspectionScheme => ({ id, name: `当前草稿${id}`, code: id, businessScene: "销售",
  draftRevision: 7, activePublishedVersion: 3, draftConfigJson: "{}", status: "ACTIVE" });
const version = (versionNo: number): ReleasedSchemeVersion => ({ versionNo, sourceDraftRevision: 2, sourceTrialTaskId: "trial-old", contentHash: "hash-old",
  snapshot: { name: `冻结标准${versionNo}`, code: "sales", businessScene: "销售", dependencies: { executionMode: "RULE_ONLY" },
    definition: { schemaVersion: "iqc-scheme-v2", agent: null, items: [],
      scoring: { version: "iqc-score-v2", mode: "DEDUCTION", baseScore: 100, passingScore: 75, items: [] } } } });
let app: App, host: HTMLDivElement;
const pass = defineComponent({ setup(_, { slots, attrs }) { return () => h("div", [attrs.message as string, attrs.description as string, slots.default?.(), slots.extra?.()]); } });
async function settle() { for (let i = 0; i < 12; i++) { await Promise.resolve(); await nextTick(); } }
function buttons(text: string) { return [...host.querySelectorAll("button")].filter(button => button.textContent === text); }
function mount() {
  host = document.createElement("div"); document.body.append(host); app = createApp(Schemes);
  for (const name of ["AAlert", "ASpace", "ATag", "ASpin", "AEmpty", "AListItem"]) app.component(name, pass);
  app.component("ADrawer", defineComponent({ setup() { return () => null; } }));
  app.component("AModal", defineComponent({ props: ["open"], setup(props, { slots }) { return () => props.open ? h("section", slots.default?.()) : null; } }));
  app.component("AButton", defineComponent({ setup(_, { slots, attrs }) { return () => h("button", attrs, slots.default?.()); } }));
  app.component("ATable", defineComponent({ props: ["dataSource", "columns"], setup(props, { slots }) {
    return () => h("div", props.dataSource.map((record: InspectionScheme) => props.columns.map((column: unknown) => slots.bodyCell?.({ column, record }))));
  } }));
  app.component("AList", defineComponent({ props: ["dataSource"], setup(props, { slots }) {
    return () => h("div", { "data-testid": "history-version-list" }, props.dataSource.map((item: ReleasedSchemeVersion) => slots.renderItem?.({ item })));
  } }));
  app.component("AListItemMeta", defineComponent({ props: ["title"], setup(props, { slots }) { return () => h("div", [props.title, slots.description?.()]); } }));
  app.mount(host);
}
describe("expert immutable publication history", () => {
  beforeEach(() => { vi.clearAllMocks(); state.manage = true; state.publish = true; vi.mocked(listSchemes).mockResolvedValue([scheme()]);
    vi.mocked(listSchemeVersions).mockResolvedValue({ versions: [version(3)], nextBeforeVersion: null }); });
  afterEach(() => { app?.unmount(); host?.remove(); });
  it("shows frozen names and origins then opens only a read-only standard", async () => {
    mount(); await settle(); buttons("发布历史")[0].click(); await settle();
    expect(listSchemeVersions).toHaveBeenCalledWith("s", undefined);
    expect(host.textContent).toContain("V3 · 冻结标准3"); expect(host.textContent).toContain("trial-old");
    expect(host.textContent).toContain("当前发布版本"); expect(host.textContent).toContain("hash-old");
    const region = host.querySelector('[role="region"][aria-label="已发布版本列表"]');
    expect(region?.getAttribute("tabindex")).toBe("0");
    expect(region?.classList.contains("scheme-history-list")).toBe(true);
    buttons("查看冻结标准")[0].click(); await settle();
    expect(host.textContent).toContain("frozen:true:3:冻结标准3:75");
    expect(createScheme).not.toHaveBeenCalled(); expect(reviseScheme).not.toHaveBeenCalled();
    expect(publishScheme).not.toHaveBeenCalled(); expect(changeSchemeAvailability).not.toHaveBeenCalled();
  });
  it("reads disabled history without claiming its published pointer is available", async () => {
    vi.mocked(listSchemes).mockResolvedValue([{ ...scheme(), status: "DISABLED" }]);
    mount(); await settle(); buttons("发布历史")[0].click(); await settle();
    expect(host.textContent).toContain("冻结标准3"); expect(host.textContent).not.toContain("当前发布版本");
  });
  it("archives and restores only superseded versions while preserving the current release", async () => {
    vi.mocked(listSchemeVersions).mockResolvedValue({ versions: [version(3), version(2)], nextBeforeVersion: null });
    vi.mocked(changeSchemeVersionArchive).mockImplementation(async (_id, _revision, versionNo, archived) => ({ ...version(versionNo), archived }));
    mount(); await settle(); buttons("发布历史")[0].click(); await settle();
    expect(buttons("归档版本")).toHaveLength(1);
    buttons("归档版本")[0].click();
    let confirm = vi.mocked(state.confirm).mock.calls[0][0] as { onOk: () => Promise<void> };
    await confirm.onOk(); await settle();
    expect(changeSchemeVersionArchive).toHaveBeenNthCalledWith(1, "s", 7, 2, true);
    expect(host.textContent).toContain("V2 · 冻结标准2 · 已归档");
    expect(buttons("恢复为可选历史版本")).toHaveLength(1);
    buttons("恢复为可选历史版本")[0].click();
    confirm = vi.mocked(state.confirm).mock.calls[1][0] as { onOk: () => Promise<void> };
    await confirm.onOk(); await settle();
    expect(changeSchemeVersionArchive).toHaveBeenNthCalledWith(2, "s", 7, 2, false);
    expect(host.textContent).toContain("V2 · 冻结标准2"); expect(host.textContent).not.toContain("V2 · 冻结标准2 · 已归档");
    expect(host.textContent).toContain("V3 · 冻结标准3"); expect(buttons("归档版本")).toHaveLength(1);
    expect(publishScheme).not.toHaveBeenCalled(); expect(changeSchemeAvailability).not.toHaveBeenCalled();
  });
  it("hides archive and restore actions without publication permission", async () => {
    state.publish = false;
    vi.mocked(listSchemeVersions).mockResolvedValue({ versions: [{ ...version(2), archived: true }], nextBeforeVersion: null });
    mount(); await settle(); buttons("发布历史")[0].click(); await settle();
    expect(buttons("归档版本")).toHaveLength(0); expect(buttons("恢复为可选历史版本")).toHaveLength(0);
    expect(changeSchemeVersionArchive).not.toHaveBeenCalled();
  });
  it("compares two frozen versions without publishing or creating a task", async () => {
    vi.mocked(listSchemeVersions).mockResolvedValue({ versions: [version(3), version(2)], nextBeforeVersion: null });
    mount(); await settle(); buttons("发布历史")[0].click(); await settle();
    buttons("设为对比基准")[0].click(); await settle();
    expect(host.textContent).toContain("对比基准");
    buttons("与基准对比")[0].click(); await settle();
    expect(host.textContent).toContain("仅比较两个已发布版本的冻结业务标准");
    expect(buttons("关闭对比")).toHaveLength(1);
    expect(createScheme).not.toHaveBeenCalled(); expect(reviseScheme).not.toHaveBeenCalled();
    expect(publishScheme).not.toHaveBeenCalled(); expect(changeSchemeAvailability).not.toHaveBeenCalled();
  });
  it("loads older versions with the returned cursor and preserves the first page on failure", async () => {
    vi.mocked(listSchemeVersions).mockResolvedValueOnce({ versions: [version(3)], nextBeforeVersion: 3 })
      .mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ versions: [version(2)], nextBeforeVersion: null });
    mount(); await settle(); buttons("发布历史")[0].click(); await settle();
    buttons("加载更早版本")[0].click(); await settle();
    expect(host.textContent).toContain("加载失败"); expect(host.textContent).toContain("冻结标准3");
    buttons("重试加载")[0].click(); await settle();
    expect(listSchemeVersions).toHaveBeenNthCalledWith(3, "s", 3);
    expect(host.textContent).toContain("冻结标准2"); expect(host.textContent).toContain("冻结标准3");
    expect(buttons("加载更早版本")).toHaveLength(0);
  });
  it("distinguishes unpublished history from load failure and retries the first page", async () => {
    vi.mocked(listSchemeVersions).mockRejectedValueOnce(new Error("bad snapshot")).mockResolvedValueOnce({ versions: [], nextBeforeVersion: null });
    mount(); await settle(); buttons("发布历史")[0].click(); await settle();
    expect(host.textContent).toContain("加载失败"); expect(host.textContent).not.toContain("尚无发布版本");
    expect(host.querySelector('[data-testid="history-version-list"]')).toBeNull();
    buttons("重试加载")[0].click(); await settle(); expect(host.textContent).toContain("尚无发布版本");
    expect(host.querySelector('[data-testid="history-version-list"]')).toBeNull();
  });
  it("ignores late responses after opening another scheme or closing history", async () => {
    let resolve!: (value: SchemeVersionHistory) => void;
    vi.mocked(listSchemes).mockResolvedValue([scheme(), scheme("other")]);
    vi.mocked(listSchemeVersions).mockReturnValueOnce(new Promise(done => { resolve = done; }))
      .mockResolvedValueOnce({ versions: [version(2)], nextBeforeVersion: null });
    mount(); await settle(); buttons("发布历史")[0].click(); await settle();
    buttons("发布历史")[1].click(); await settle(); resolve({ versions: [version(9)], nextBeforeVersion: null }); await settle();
    expect(host.textContent).toContain("冻结标准2"); expect(host.textContent).not.toContain("冻结标准9");
    buttons("关闭历史")[0].click(); await settle(); expect(host.textContent).not.toContain("冻结标准2");
  });
  it("does not offer history without expert maintenance permission", async () => {
    state.manage = false; mount(); await settle(); expect(buttons("发布历史")).toHaveLength(0);
    expect(listSchemeVersions).not.toHaveBeenCalled();
  });
  it("does not restore a closed panel from an in-flight response", async () => {
    let resolve!: (value: SchemeVersionHistory) => void;
    vi.mocked(listSchemeVersions).mockReturnValueOnce(new Promise(done => { resolve = done; }))
      .mockResolvedValueOnce({ versions: [version(2)], nextBeforeVersion: null });
    mount(); await settle(); buttons("发布历史")[0].click(); await settle();
    buttons("关闭历史")[0].click(); await settle(); resolve({ versions: [version(9)], nextBeforeVersion: null }); await settle();
    expect(host.textContent).not.toContain("冻结标准9");
    buttons("发布历史")[0].click(); await settle();
    expect(host.textContent).toContain("冻结标准2"); expect(host.textContent).not.toContain("冻结标准9");
  });
});
