import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref, type App } from "vue";
import ConversationPicker from "./ConversationPicker.vue";
import { listConversations } from "@/api/conversations";
import { previewTaskSelection, type TaskDataSelection } from "@/api/tasks";
vi.mock("@/api/conversations", () => ({ listConversations: vi.fn() }));
vi.mock("@/api/tasks", () => ({ previewTaskSelection: vi.fn() }));
let app: App, host: HTMLDivElement;
let table: Record<string, any>;
const definition = ref<TaskDataSelection>({ mode: "BATCH", conversationIds: [] });
const ids = ref<string[]>([]);
const row = (id: string) => ({ id, sourceFileName: id, status: "IMPORTED", messageCount: 2 });
async function settle() { for (let i = 0; i < 10; i++) { await Promise.resolve(); await nextTick(); } }
function mount() {
  host = document.createElement("div"); document.body.append(host);
  app = createApp({ setup: () => () => h(ConversationPicker, { modelValue: ids.value, dataSelection: definition.value,
    "onUpdate:modelValue": (value: string[]) => { ids.value = value; definition.value = { mode: "BATCH", conversationIds: value }; } }) });
  const pass = defineComponent({ setup(_, { slots, attrs }) { return () => h("div", [attrs.message as string, attrs.description as string, slots.default?.(), slots.action?.()]); } });
  for (const name of ["ASpace", "AAlert", "AEmpty", "AInputSearch"]) app.component(name, pass);
  app.component("AButton", defineComponent({ setup(_, { slots, attrs }) { return () => h("button", attrs, slots.default?.()); } }));
  app.component("ATable", defineComponent({ props: ["dataSource", "pagination", "rowSelection"], emits: ["change"], setup(props, { emit }) {
    table = props; return () => h("div", [JSON.stringify(props.dataSource), h("button", { onClick: () => emit("change", { current: 2 }) }, "page2")]);
  } }));
  app.mount(host);
}
function click(text: string) { [...host.querySelectorAll("button")].find(b => b.textContent === text)!.click(); }
beforeEach(() => { vi.resetAllMocks(); definition.value = { mode: "BATCH", conversationIds: [] }; ids.value = [];
  vi.mocked(listConversations).mockResolvedValue({ records: [row("batch")] as any, total: 30, current: 1, size: 10 }); });
afterEach(() => { app?.unmount(); host?.remove(); });
describe("task data selection preview", () => {
  it("preserves the batch page when cross-page selected IDs change", async () => {
    mount(); await settle(); click("page2"); await settle();
    table.rowSelection.onChange(["batch"]); await settle();
    expect(listConversations).toHaveBeenCalledTimes(2);
    expect(table.pagination.current).toBe(2); expect(ids.value).toEqual(["batch"]);
  });
  it("paginates the same random sample locally and uses FILTER only for all matches", async () => {
    definition.value = { mode: "RANDOM", filter: { channel: "WEB" }, sampleSize: 12 };
    vi.mocked(previewTaskSelection).mockResolvedValueOnce({ mode: "RANDOM", matchedTotal: 30, selectedTotal: 12,
      conversations: { records: Array.from({ length: 12 }, (_, i) => row(`sample${i}`)), total: 12, current: 1, size: 12 } } as any)
      .mockResolvedValueOnce({ mode: "FILTER", matchedTotal: 30, selectedTotal: 30,
        conversations: { records: [row("all")], total: 30, current: 1, size: 10 } } as any);
    mount(); await settle(); expect(previewTaskSelection).not.toHaveBeenCalled();
    click("模拟执行"); await settle(); click("page2"); await settle();
    expect(previewTaskSelection).toHaveBeenCalledTimes(1); expect(table.dataSource[0].id).toBe("sample10");
    click("全部匹配数据"); await settle();
    expect(previewTaskSelection).toHaveBeenLastCalledWith({ mode: "FILTER", filter: { channel: "WEB" } }, 1, 10);
    click("本次抽样结果"); await settle();
    expect(table.dataSource[0].id).toBe("sample0"); expect(previewTaskSelection).toHaveBeenCalledTimes(2);
  });
  it("discards an old response after conditions change", async () => {
    definition.value = { mode: "FILTER", filter: { channel: "WEB" } };
    let resolve!: (value: any) => void;
    vi.mocked(previewTaskSelection).mockReturnValue(new Promise(r => { resolve = r; }));
    mount(); await settle(); click("模拟执行"); await settle();
    definition.value = { mode: "FILTER", filter: { channel: "PHONE" } }; await settle();
    resolve({ mode: "FILTER", matchedTotal: 1, selectedTotal: 1, conversations: { records: [row("stale")], total: 1 } });
    await settle(); expect(host.textContent).not.toContain("stale");
    expect(host.textContent).toContain("点击模拟执行");
  });
  it("keeps shortfall explicit and clears stale preview rows on retry failure", async () => {
    definition.value = { mode: "RANDOM", sampleSize: 20 };
    vi.mocked(previewTaskSelection).mockResolvedValueOnce({ mode: "RANDOM", matchedTotal: 1, selectedTotal: 1,
      conversations: { records: [row("shortfall-row")], total: 1 } } as any).mockRejectedValueOnce(new Error("offline"));
    mount(); await settle(); click("模拟执行"); await settle();
    expect(host.textContent).toContain("有多少就处理多少");
    click("模拟执行"); await settle();
    expect(host.textContent).not.toContain("shortfall-row"); expect(host.textContent).toContain("会话加载失败");
  });
});
