import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref, type App } from "vue";
import AgentTestChat from "./AgentTestChat.vue";
import http from "@/api/http";
vi.mock("@/api/http",()=>({default:{post:vi.fn()}}));
let app:App,host:HTMLDivElement;
const config=ref('config-a');
const pass=defineComponent({setup(_, {slots,attrs}){return()=>h('div',[attrs.message as string,slots.default?.()]);}});
async function settle(){for(let i=0;i<10;i++){await Promise.resolve();await nextTick();}}
function button(text:string){return [...host.querySelectorAll('button')].find(b=>b.textContent===text)!;}
function mount(){host=document.createElement('div');document.body.append(host);app=createApp({setup:()=>()=>h(AgentTestChat,{open:true,configJson:config.value,title:'draft'})});
for(const name of ['AModal','AAlert','AEmpty'])app.component(name,pass);
app.component('AButton',defineComponent({setup(_, {slots,attrs}){return()=>h('button',attrs,slots.default?.());}}));
app.component('ATextarea',defineComponent({props:['value'],emits:['update:value'],setup(props,{emit}){return()=>h('textarea',{value:props.value,onInput:(event:Event)=>emit('update:value',(event.target as HTMLTextAreaElement).value)});}}));app.mount(host);}
async function send(text:string){const input=host.querySelector('textarea')!;input.value=text;input.dispatchEvent(new Event('input'));await settle();button('发送').click();await settle();}
afterEach(()=>{app?.unmount();host?.remove();vi.clearAllMocks();config.value='config-a';});
describe('agent test chat',()=>{
it('passes previous messages and resets on configuration changes',async()=>{
vi.mocked(http.post).mockResolvedValue({data:{content:'hello',model:'model-1',latencyMillis:10,calledTools:['lookup']}});
mount();await send('first');await send('second');
expect(vi.mocked(http.post).mock.calls[1][1]).toMatchObject({configJson:'config-a',messages:[{role:'user',content:'first'},{role:'assistant',content:'hello'},{role:'user',content:'second'}]});
expect(host.textContent).toContain('lookup');config.value='config-b';await settle();expect(host.textContent).not.toContain('hello');await send('fresh');expect(vi.mocked(http.post).mock.calls[2][1]).toMatchObject({messages:[{role:'user',content:'fresh'}]});
});
it('keeps failed input available without injecting a fake assistant response',async()=>{
vi.mocked(http.post).mockRejectedValue(new Error('offline'));mount();await send('retry me');expect(host.querySelector('textarea')!.value).toBe('retry me');expect(host.textContent).toContain('测试失败');button('重新开始').click();await settle();expect(host.querySelector('textarea')!.value).toBe('');
});
});
