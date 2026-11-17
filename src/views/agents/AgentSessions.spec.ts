import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref, computed, provide, inject, type Ref, type App } from "vue";
import AgentSessions from "./AgentSessions.vue";
import { listAgentSessions, getAgentSession, queryAgentSessions } from "@/api/agent-sessions";
vi.mock("@/api/agent-sessions", () => ({ listAgentSessions: vi.fn(), getAgentSession: vi.fn(), queryAgentSessions: vi.fn() }));
vi.mock("@/api/config", () => ({ listAgents: vi.fn().mockResolvedValue([{id:"agent-1", name:"客服助手"}, {id:"agent-2", name:"审核助手"}]) }));
vi.mock("ant-design-vue", () => ({ message: { error: vi.fn(), warning: vi.fn() } }));
let app: App, host: HTMLDivElement;
const embedded = ref(false);
const open = ref(false), agentId = ref("agent-1");
const pass = defineComponent({ setup(_, { slots, attrs }) { return () => h("div", attrs, slots.default?.()); } });
async function settle() { for (let i = 0; i < 10; i++) { await Promise.resolve(); await nextTick(); } }
function mount() {
  host = document.createElement("div"); document.body.append(host);
  app = createApp({ setup: () => () => h(AgentSessions, { open: open.value, agentId: agentId.value, agentName: "助手", embedded: embedded.value }) });
  for (const name of ["ADrawer", "ASpace", "ATag", "AModal", "ASpin"]) app.component(name, pass);
  app.component("AButton", defineComponent({ setup(_, { slots, attrs }) { return () => h("button", attrs, slots.default?.()); } }));
  app.component("AInput", defineComponent({ props: ["value"], emits: ["update:value"], setup(props, { attrs, emit }) { return () => h("input", { ...attrs, value: props.value, onInput: (e: Event) => emit("update:value", (e.target as HTMLInputElement).value) }); } }));
  app.component("ATable", defineComponent({ props: ["dataSource"], setup(props, { slots }) {
    provide("rows", computed(() => props.dataSource || []));
    return () => h("div", [JSON.stringify(props.dataSource), slots.default?.()]);
  } }));
  app.component("ATableColumn", defineComponent({ setup(_, { slots }) {
    const rows = inject<Ref<any[]>>("rows", ref([]));
    return () => h("div", rows.value.map(record => slots.default?.({ record })));
  } }));
  app.component("ASelect", defineComponent({ props: ["value", "options"], emits: ["update:value", "change"], setup(props, { attrs, emit }) {
    return () => h("select", { ...attrs, value: props.value, onChange: (event: Event) => {
      const value = (event.target as HTMLSelectElement).value || undefined; emit("update:value", value); emit("change", value);
    } }, [h("option", { value: "" }, "全部智能体"), ...props.options.map((option: any) => h("option", { value: option.value }, option.label))]);
  } }));
  app.mount(host);
}
afterEach(() => { app?.unmount(); host?.remove(); open.value = false; embedded.value = false; agentId.value = "agent-1"; vi.clearAllMocks(); });
describe("agent session history", () => {
  it("loads the selected agent, submits filters, and exposes no delete control", async () => {
    vi.mocked(listAgentSessions).mockResolvedValue({ records: [], current: 1, size: 10, total: 0 });
    mount(); open.value = true; await settle();
    expect(listAgentSessions).toHaveBeenLastCalledWith("agent-1", expect.objectContaining({ current: 1, size: 10 }));
    const input = host.querySelector('input[placeholder="会话标题"]') as HTMLInputElement;
    input.value = "售后"; input.dispatchEvent(new Event("input")); await settle();
    [...host.querySelectorAll("button")].find(b => b.textContent === "查询")!.click(); await settle();
    expect(listAgentSessions).toHaveBeenLastCalledWith("agent-1", expect.objectContaining({ title: "售后", current: 1 }));
    expect(host.textContent).not.toContain("删除"); expect(getAgentSession).not.toHaveBeenCalled();
  });
  it("ignores an older agent's delayed response", async () => {
    let finish!: (value: any) => void;
    vi.mocked(listAgentSessions).mockImplementationOnce(() => new Promise(r => { finish = r; }));
    mount(); open.value = true; await settle();
    vi.mocked(listAgentSessions).mockResolvedValue({ records: [{ id: "new", title: "current-agent" } as any], current: 1, size: 10, total: 1 });
    agentId.value = "agent-2"; await settle();
    finish({ records: [{ id: "old", title: "wrong-agent" }], total: 1 }); await settle();
    expect(host.textContent).toContain("current-agent"); expect(host.textContent).not.toContain("wrong-agent");
  });
  it("opens stored messages and renders model/tool metadata as escaped text", async () => {
    const session = { id: "session-1", agentId: "agent-1", versionNo: 2, title: "Stored chat", source: "TEST", owner: "alice", messageCount: 2, createdTime: "2026-11-17T10:00:00", lastMessageTime: "2026-11-17T10:01:00" };
    vi.mocked(listAgentSessions).mockResolvedValue({ records: [session], current: 1, size: 10, total: 1 });
    vi.mocked(getAgentSession).mockResolvedValue({ session, messages: [
      { role: "user", content: "<script>unsafe</script>", time: session.createdTime },
      { role: "assistant", content: "Stored reply", time: session.lastMessageTime, model: "model-a", latencyMillis: 25, calledTools: ["lookup"] },
    ] });
    mount(); open.value = true; await settle();
    [...host.querySelectorAll("button")].find(b => b.textContent === "查看消息")!.click(); await settle();
    expect(getAgentSession).toHaveBeenCalledWith("agent-1", "session-1");
    expect(host.textContent).toContain("Stored reply"); expect(host.textContent).toContain("model-a");
    expect(host.textContent).toContain("lookup"); expect(host.textContent).toContain("25 ms");
    expect(host.textContent).toContain("<script>unsafe</script>"); expect(host.querySelector("script")).toBeNull();
  });

  it("queries all permitted agents from the dedicated page and filters by agent", async () => {
    embedded.value = true;
    vi.mocked(queryAgentSessions).mockResolvedValue({ records: [], current: 1, size: 10, total: 0 });
    mount(); open.value = true; await settle();
    expect(queryAgentSessions).toHaveBeenLastCalledWith(expect.objectContaining({ current: 1, agentId: undefined }));
    const select = host.querySelector("select")!; select.value = "agent-2"; select.dispatchEvent(new Event("change")); await settle();
    expect(queryAgentSessions).toHaveBeenLastCalledWith(expect.objectContaining({ agentId: "agent-2", current: 1 }));
    expect(listAgentSessions).not.toHaveBeenCalled();
    [...host.querySelectorAll("button")].find(b => b.textContent === "重置")!.click(); await settle();
    expect(queryAgentSessions).toHaveBeenLastCalledWith(expect.objectContaining({ agentId: undefined }));
  });
  it("opens the selected row's actual agent when querying across agents", async () => {
    embedded.value = true;
    const session = { id: "session-2", agentId: "agent-2", versionNo: 1, title: "Review", source: "TEST", owner: "alice", messageCount: 2, createdTime: "2026-11-17T10:00:00", lastMessageTime: "2026-11-17T10:01:00" };
    vi.mocked(queryAgentSessions).mockResolvedValue({ records: [session], current: 1, size: 10, total: 1 });
    vi.mocked(getAgentSession).mockResolvedValue({ session, messages: [] });
    mount(); open.value = true; await settle();
    expect(host.textContent).toContain("审核助手");
    [...host.querySelectorAll("button")].find(b => b.textContent === "查看消息")!.click(); await settle();
    expect(getAgentSession).toHaveBeenCalledWith("agent-2", "session-2");
  });

});
