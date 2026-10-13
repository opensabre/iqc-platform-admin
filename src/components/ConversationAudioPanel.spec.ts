import { afterEach, expect, it, vi } from "vitest";
import { createApp, h, nextTick, reactive, type App } from "vue";
import Panel from "./ConversationAudioPanel.vue";
import { getAudioMetadata } from "@/api/conversationAudio";
const grants=vi.hoisted(()=>({view:true,read:true,upload:false}));
vi.mock("@/composables/permission",()=>({usePermission:()=>({can:(code:string)=>grants[code.split(":").pop() as keyof typeof grants]})}));
vi.mock("@/api/conversationAudio",()=>({getAudioMetadata:vi.fn(),uploadConversationAudio:vi.fn(),audioContentUrl:(id:string)=>`/api/iqc/conversations/${id}/audio/content`}));
let app:App,host:HTMLDivElement;
async function settle(){for(let i=0;i<8;i++){await Promise.resolve();await nextTick();}}
function metadata(id:string){return {conversationId:id,mediaType:"audio/wav",sizeBytes:16044,durationMs:1000};}
function mount(){const props=reactive({conversationId:"first",messages:[]});host=document.createElement("div");document.body.append(host);app=createApp({render:()=>h(Panel,props)});app.mount(host);return props;}
afterEach(()=>{app?.unmount();host?.remove();vi.clearAllMocks();grants.view=true;grants.read=true;grants.upload=false;});
it("does not fetch metadata or expose playback without permission",async()=>{grants.view=false;grants.read=false;mount();await settle();expect(getAudioMetadata).not.toHaveBeenCalled();expect(host.querySelector("audio")).toBeNull();});
it("requires the separate byte permission for playback",async()=>{grants.read=false;vi.mocked(getAudioMetadata).mockResolvedValueOnce(metadata("first"));mount();await settle();expect(host.textContent).toContain("1.000");expect(host.querySelector("audio")).toBeNull();});
it("uses the authorized content route without preloading bytes",async()=>{vi.mocked(getAudioMetadata).mockResolvedValueOnce(metadata("first"));mount();await settle();const audio=host.querySelector("audio")!;expect(audio.getAttribute("src")).toBe("/api/iqc/conversations/first/audio/content");expect(audio.preload).toBe("none");});
it("ignores metadata returned for a previous conversation",async()=>{let resolve!:(value:ReturnType<typeof metadata>)=>void;vi.mocked(getAudioMetadata).mockImplementationOnce(()=>new Promise(done=>{resolve=done;})).mockResolvedValueOnce(metadata("second"));const props=mount();props.conversationId="second";await settle();resolve(metadata("first"));await settle();expect(host.querySelector("audio")?.getAttribute("src")).toContain("/second/");});

it("rejects malformed metadata before exposing a content URL",async()=>{vi.mocked(getAudioMetadata).mockResolvedValueOnce({...metadata("first"),sizeBytes:0});mount();await settle();expect(host.querySelector("audio")).toBeNull();expect(host.querySelector('[role="alert"]')?.textContent).toContain("加载失败");});
