import {afterEach,it,expect,vi} from 'vitest';
import {createApp,defineComponent,h,nextTick,reactive,type App} from 'vue';
const api=vi.hoisted(()=>({task:vi.fn(),global:vi.fn()}));
vi.mock('@/api/model-gateway',async original=>({...await original<typeof import('@/api/model-gateway')>(),listTaskModelCalls:api.task,listModelCalls:api.global}));
vi.mock('ant-design-vue',()=>({message:{error:vi.fn(),warning:vi.fn(),success:vi.fn()}}));
const grants=reactive({allowed:true});
vi.mock('@/composables/permission',()=>({usePermission:()=>({can:()=>grants.allowed})}));
import Panel from './ModelGatewayCalls.vue';
import type {ModelCallPage} from '@/api/model-gateway';
let app:App,host:HTMLDivElement;
afterEach(()=>{app?.unmount();host?.remove();vi.resetAllMocks();grants.allowed=true;});
async function settle(){for(let i=0;i<4;i++){await Promise.resolve();await nextTick();}}
function result(amount='1.234567890123456789'):ModelCallPage{return {records:[],current:1,size:20,total:3,costSummary:{callCount:'3',knownCount:'2',unknownCount:'1',currencies:[{currency:'USD',callCount:'3',knownCount:'2',unknownCount:'1',knownSubtotal:amount}]}};}
function mount(props=reactive<{taskId?:string;executionId?:string}>({taskId:'task',executionId:'run'})){
 host=document.createElement('div');document.body.append(host);app=createApp(defineComponent({setup:()=>()=>h(Panel,{...props})}));
 for(const name of ['ASpace','AForm','AFormItem','ADivider','ASpin'])app.component(name,defineComponent({setup:(_,{slots})=>()=>h('div',slots.default?.())}));
 app.component('AAlert',defineComponent({props:['message'],setup:p=>()=>h('p',p.message)}));
 app.component('AButton',defineComponent({props:['disabled'],setup:(p,{slots,attrs})=>()=>h('button',{...attrs,disabled:p.disabled},slots.default?.())}));
 app.component('AInput',defineComponent({props:['value'],emits:['update:value'],setup:(p,{emit})=>()=>h('input',{value:p.value,onInput:(e:Event)=>emit('update:value',(e.target as HTMLInputElement).value)})}));
 for(const name of ['ASelect','ATable','APagination','ATag','AInputNumber','ACheckbox'])app.component(name,defineComponent({setup:()=>()=>h('div')}));
 app.component('AModal',defineComponent({setup:()=>()=>null}));
 app.mount(host);return props;
}
async function apply(value:string){const input=host.querySelector('input')!;input.value=value;input.dispatchEvent(new Event('input'));await settle();button('按会话查询').click();await settle();}
function button(label:string){return [...host.querySelectorAll('button')].find(node=>node.textContent===label)!;}
it('applies explicit conversation and preserves exact summary strings, then clears the filter',async()=>{
 api.task.mockResolvedValue(result());mount();await settle();await apply('  conversation  ');
 expect(api.task).toHaveBeenLastCalledWith('task','run',undefined,1,20,'conversation');
 expect(host.textContent).toContain('当前会话范围：conversation');expect(host.textContent).toContain('1.234567890123456789');
 expect(host.textContent).toContain('未知费用调用：1');button('清除筛选').click();await settle();
 expect(api.task).toHaveBeenLastCalledWith('task','run',undefined,1,20,undefined);
});
it('ignores a late result from the previous conversation',async()=>{
 let resolve!:(value:ModelCallPage)=>void;api.task.mockResolvedValue(result());mount();await settle();
 api.task.mockReturnValueOnce(new Promise(r=>{resolve=r;}));await apply('old');
 api.task.mockResolvedValue(result('9.99'));await apply('new');resolve(result('777.77'));await settle();
 expect(host.textContent).toContain('当前会话范围：new');expect(host.textContent).toContain('9.99');expect(host.textContent).not.toContain('777.77');
});
it('clears the conversation on task switch and rejects the old task response',async()=>{
 let resolve!:(value:ModelCallPage)=>void;api.task.mockResolvedValue(result());const props=mount();await settle();
 api.task.mockReturnValueOnce(new Promise(r=>{resolve=r;}));await apply('old-conversation');
 api.task.mockResolvedValue(result('8.88'));props.taskId='new-task';props.executionId=undefined;await settle();
 resolve(result('777.77'));await settle();
 expect(api.task).toHaveBeenLastCalledWith('new-task',undefined,undefined,1,20,undefined);
 expect(host.querySelector('input')?.value).toBe('');expect(host.textContent).toContain('全部执行轮次（包含重试）');expect(host.textContent).not.toContain('777.77');
});
it('rejects invalid conversation input and hides a late result after permission revocation',async()=>{
 let resolve!:(value:ModelCallPage)=>void;api.task.mockResolvedValue(result());mount();await settle();const count=api.task.mock.calls.length;
 await apply('bad/id');expect(api.task).toHaveBeenCalledTimes(count);
 api.task.mockReturnValueOnce(new Promise(r=>{resolve=r;}));await apply('conversation');
 grants.allowed=false;await settle();resolve(result('777.77'));await settle();
 expect(host.textContent).not.toContain('777.77');expect(host.querySelector('input')).toBeNull();
});
