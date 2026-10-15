import {afterEach,it,expect,vi} from 'vitest';
import {createApp,defineComponent,h,nextTick,reactive,type App} from 'vue';
import type {HumanFindingDecision} from '@/api/quality';
const api=vi.hoisted(()=>({context:vi.fn()}));
vi.mock('@/api/quality',()=>({getHumanFindingContext:api.context}));
import Editor from './HumanFindingReviewEditor.vue';
let app:App,host:HTMLDivElement;
afterEach(()=>{app?.unmount();host?.remove();vi.resetAllMocks();});
const context=(id:string,code='AMOUNT')=>({sourceResultId:id,sourceHash:'source',available:true,findings:[{code,valueType:'OBJECT',state:'KNOWN',
 valueJson:'{"amount":99.999999999999999999}',severity:'LOW',expectedFindingHash:'exact-finding',allowedValues:[],allowedEvidenceTypes:['CONVERSATION'],
 evidenceRequired:false,evidence:[],retainedEvidenceIds:[],addedMessageIds:[]}],messages:[]});
async function settle(){await Promise.resolve();await nextTick();await Promise.resolve();await nextTick();}
function mount(props:{resultId:string;disabled:boolean},save:(d:HumanFindingDecision)=>void){
 host=document.createElement('div');document.body.append(host);app=createApp(defineComponent({setup:()=>()=>h(Editor,{...props,onSave:save})}));
 for(const name of ['ACard','AForm','AFormItem'])app.component(name,defineComponent({props:['label'],setup:(p,{slots})=>()=>h('section',{'data-label':p.label},slots.default?.())}));
 app.component('AButton',defineComponent({props:['disabled'],setup:(p,{slots,attrs})=>()=>h('button',{...attrs,disabled:p.disabled},slots.default?.())}));
 app.component('AAlert',defineComponent({props:['message'],setup:p=>()=>h('p',p.message)}));
 app.component('ASelect',defineComponent({props:['value','options'],emits:['update:value'],setup:(p,{emit})=>()=>h('select',{value:p.value,onChange:(e:Event)=>emit('update:value',(e.target as HTMLSelectElement).value)},(p.options||[]).map((o:{value:string;label:string})=>h('option',{value:o.value},o.label)))}));
 app.component('ATextarea',defineComponent({props:['value'],emits:['update:value'],setup:(p,{emit})=>()=>h('textarea',{value:p.value,onInput:(e:Event)=>emit('update:value',(e.target as HTMLTextAreaElement).value)})}));
 app.mount(host);
}
it('submits exact JSON text and server finding hash without rounding decimals',async()=>{
 api.context.mockResolvedValue(context('result'));const save=vi.fn();mount({resultId:'result',disabled:false},save);await settle();
 const select=host.querySelector('select')!;select.value='AMOUNT';select.dispatchEvent(new Event('change'));await settle();
 const inputs=host.querySelectorAll('textarea');expect(inputs[0].value).toBe('{"amount":99.999999999999999999}');
 inputs[1].value=' verified ';inputs[1].dispatchEvent(new Event('input'));await settle();
 const button=[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('保存'))!;button.click();await settle();
 expect(save).toHaveBeenCalledWith(expect.objectContaining({sourceResultId:'result',expectedFindingHash:'exact-finding',
 valueJson:'{"amount":99.999999999999999999}',reason:'verified'}));expect(save.mock.calls[0][0]).not.toHaveProperty('value');
});
it('ignores late context responses after switching result identity',async()=>{
 let resolve!:(value:ReturnType<typeof context>)=>void;
 api.context.mockReturnValueOnce(new Promise(r=>{resolve=r;})).mockResolvedValueOnce(context('new','NEW'));
 const props=reactive({resultId:'old',disabled:false});mount(props,vi.fn());props.resultId='new';await settle();resolve(context('old','OLD'));await settle();
 expect(host.querySelector('select')?.textContent).toContain('NEW');expect(host.querySelector('select')?.textContent).not.toContain('OLD');
});
it('does not offer saving when the context belongs to another result',async()=>{
 api.context.mockResolvedValue(context('foreign'));const save=vi.fn();mount({resultId:'result',disabled:false},save);await settle();
 expect(host.textContent).toContain('上下文加载失败');expect(host.querySelector('select')).toBeNull();expect(save).not.toHaveBeenCalled();
});
