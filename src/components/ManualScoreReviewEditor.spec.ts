import {afterEach,it,expect,vi} from 'vitest';
import {createApp,defineComponent,h,nextTick,reactive,type App} from 'vue';
const api=vi.hoisted(()=>({context:vi.fn()}));
vi.mock('@/api/quality',()=>({getScoreReviewContext:api.context}));
import Editor from './ManualScoreReviewEditor.vue';
let app:App,host:HTMLDivElement;
afterEach(()=>{app?.unmount();host?.remove();vi.resetAllMocks();});
const context=(id:string)=>({sourceResultId:id,sourceHash:'source',computedScoringHash:'a'.repeat(64),computedScoreStatus:'FINAL',computedScore:'80',manualScore:null});
async function settle(){await Promise.resolve();await nextTick();await Promise.resolve();await nextTick();}
function mount(props:{resultId:string;disabled:boolean},save:ReturnType<typeof vi.fn>){
 host=document.createElement('div');document.body.append(host);app=createApp(defineComponent({setup:()=>()=>h(Editor,{...props,onSave:save})}));
 for(const name of ['ACard','AForm','AFormItem'])app.component(name,defineComponent({setup:(_,{slots})=>()=>h('section',slots.default?.())}));
 app.component('AButton',defineComponent({props:['disabled'],setup:(p,{slots,attrs})=>()=>h('button',{...attrs,disabled:p.disabled},slots.default?.())}));
 app.component('AAlert',defineComponent({props:['message'],setup:p=>()=>h('p',p.message)}));
 for(const [name,tag] of [['AInput','input'],['ATextarea','textarea']])app.component(name,defineComponent({props:['value'],emits:['update:value'],setup:(p,{emit})=>()=>h(tag,{value:p.value,onInput:(e:Event)=>emit('update:value',(e.target as HTMLInputElement).value)})}));
 app.mount(host);
}
it('submits an exact score string tied to the server calculation hash',async()=>{
 api.context.mockResolvedValue(context('result'));const save=vi.fn();mount({resultId:'result',disabled:false},save);await settle();
 const input=host.querySelector('input')!;input.value='90.25';input.dispatchEvent(new Event('input'));
 const reason=host.querySelector('textarea')!;reason.value=' checked ';reason.dispatchEvent(new Event('input'));await settle();
 [...host.querySelectorAll('button')].find(b=>b.textContent?.includes('保存'))!.click();await settle();
 expect(save).toHaveBeenCalledWith({sourceResultId:'result',expectedScoringHash:'a'.repeat(64),finalScore:'90.25',reason:'checked'});
});
it('rejects invalid score precision and range before emitting',async()=>{
 api.context.mockResolvedValue(context('result'));const save=vi.fn();mount({resultId:'result',disabled:false},save);await settle();
 const reason=host.querySelector('textarea')!;reason.value='checked';reason.dispatchEvent(new Event('input'));await settle();
 const input=host.querySelector('input')!;
 for(const value of ['100.01','-1','1.001','1e2']){input.value=value;input.dispatchEvent(new Event('input'));await settle();[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('保存'))!.click();await settle();}
 expect(save).not.toHaveBeenCalled();expect(host.textContent).toContain('最多两位小数');
});
it('ignores an old result response after switching the result',async()=>{
 let resolve!:(value:ReturnType<typeof context>)=>void;api.context.mockReturnValueOnce(new Promise(r=>{resolve=r;})).mockResolvedValueOnce({...context('new'),computedScore:'65'});
 const props=reactive({resultId:'old',disabled:false});mount(props,vi.fn());props.resultId='new';await settle();resolve(context('old'));await settle();
 expect(host.querySelector('input')?.value).toBe('65');
});
