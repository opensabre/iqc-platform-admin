import { afterEach, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, reactive, type App } from "vue";
import ConversationDetailDrawer from "./ConversationDetailDrawer.vue";
import { getConversation, type ConversationDetail } from "@/api/conversations";
vi.mock("@/api/conversations", () => ({ getConversation: vi.fn() }));
vi.mock("ant-design-vue", () => ({ message: { error: vi.fn() } }));
let app: App, host: HTMLDivElement;
const pass = defineComponent({ setup(_, { slots }) { return () => h("div", slots.default?.()); } });
async function settle() { for (let i=0;i<8;i++) { await Promise.resolve(); await nextTick(); } }
function value(id:string):ConversationDetail { return { conversation: { id, sourceFileName:id, messageCount:1,errorCount:0,status:"IMPORTED" }, messages:[{id:`m-${id}`,sequenceNo:1,speakerRole:"user",relativeTime:"00:00:00",content:`text-${id}`,startMs:86400001,endMs:86400500,confidence:0}] }; }
function mount() {
  const props=reactive({open:true,conversationId:"first"});host=document.createElement("div");document.body.append(host);
  app=createApp({render:()=>h(ConversationDetailDrawer,props)});
  for (const name of ["ADrawer","ASpin","ADescriptions","ADescriptionsItem","ASpace","ATypographyText","ATooltip","AButton","AAvatar","AEmpty"])app.component(name,pass);
  app.mount(host);return props;
}
afterEach(()=>{app?.unmount();host?.remove();vi.clearAllMocks();});
it("discards the old response after switching conversations",async()=>{
  let resolveFirst!:(value:ConversationDetail)=>void;
  vi.mocked(getConversation).mockImplementationOnce(()=>new Promise(resolve=>{resolveFirst=resolve;})).mockResolvedValueOnce(value("second"));
  const props=mount();props.conversationId="second";await settle();expect(host.textContent).toContain("text-second");
  resolveFirst(value("first"));await settle();expect(host.textContent).not.toContain("text-first");expect(host.textContent).toContain("text-second");
});
it("clears a closed conversation and ignores its late response",async()=>{
  let resolve!:(value:ConversationDetail)=>void;vi.mocked(getConversation).mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
  const props=mount();props.open=false;await settle();resolve(value("first"));await settle();expect(host.textContent).not.toContain("text-first");
});
it("shows exact over-24-hour intervals and zero confidence",async()=>{
  vi.mocked(getConversation).mockResolvedValueOnce(value("first"));mount();await settle();
  expect(host.textContent).toContain("24:00:00.001 – 24:00:00.500");expect(host.textContent).toContain("置信度 0.00%");
});
