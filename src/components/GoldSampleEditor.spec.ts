import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createApp,defineComponent,h,nextTick,type App} from 'vue';
import GoldSampleEditor from './GoldSampleEditor.vue';
import {getGoldSample,type GoldSample} from '@/api/evaluation';
vi.mock('@/composables/permission',()=>({usePermission:()=>({can:()=>true})}));
vi.mock('@/api/evaluation',()=>({getGoldSample:vi.fn(),annotateGold:vi.fn(),reviewGold:vi.fn(),listGoldVersions:vi.fn(),getGoldVersion:vi.fn()}));
vi.mock('ant-design-vue',()=>({message:{success:vi.fn(),warning:vi.fn(),error:vi.fn()}}));
const pass=defineComponent({setup(_,{slots,attrs}){return()=>h('div',[attrs.message as string,slots.default?.()]);}});
let app:App,host:HTMLDivElement;
async function settle(){for(let i=0;i<12;i++){await Promise.resolve();await nextTick();}}
function sample(schemaVersion:string,value='true'):GoldSample {
 return {id:'sample',name:'待标注候选',sampleType:'UNCLASSIFIED',status:'CANDIDATE',contentSnapshot:null,goldDraftRevision:1,goldStatus:'PENDING_REVIEW',
  goldDraftJson:`{"schemaVersion":"${schemaVersion}","sourceSampleId":"sample","conversationId":"conversation","messages":[{"id":"message","role":"agent","content":"frozen text","sequence":1}],"findings":[{"code":"FACT","valueType":"${value==='true'?'BOOLEAN':'NUMBER'}","state":"KNOWN","value":${value},"evidenceMessageIds":["message"]}],"annotatorId":"annotator","source":"RESULT:result","tags":[],"difficulty":"BASIC"}`};
}
function mount(){
 host=document.createElement('div');document.body.append(host);app=createApp(GoldSampleEditor,{sampleId:'sample'});
 for(const name of ['ASpin','AAlert','ATag','ACollapse','ACollapsePanel','AForm','AFormItem','ASpace','ACard','AList','AListItem','APagination','ASelect','ASwitch'])app.component(name,pass);
 app.component('AButton',defineComponent({setup(_,{attrs,slots}){return()=>h('button',attrs,slots.default?.());}}));
 app.component('AInput',defineComponent({props:['value','disabled'],setup(props){return()=>h('input',{value:props.value,disabled:props.disabled});}}));
 app.component('ATextarea',defineComponent({props:['value'],emits:['update:value'],setup(props,{emit,attrs}){return()=>h('textarea',{...attrs,value:props.value,onInput:(e:Event)=>emit('update:value',(e.target as HTMLTextAreaElement).value)});}}));
 app.mount(host);
}
function saveButton(){return [...host.querySelectorAll('button')].find(b=>b.textContent==='保存标注');}
beforeEach(()=>vi.clearAllMocks());afterEach(()=>{app?.unmount();host?.remove();});
describe('Gold draft protocol compatibility',()=>{
 it.each(['iqc-gold-draft-v1','iqc-gold-draft-v2'])('loads %s frozen draft for annotation',async schema=>{
  vi.mocked(getGoldSample).mockResolvedValue(sample(schema));mount();await settle();
  expect(host.textContent).toContain('frozen text');expect(host.textContent).not.toContain('加载失败');
  expect(host.querySelector('input')?.value).toBe('FACT');expect(saveButton()?.disabled).toBe(false);
 });
 it('keeps unsafe exact numbers read only and displays the original JSON',async()=>{
  const row=sample('iqc-gold-draft-v2','9007199254740993');vi.mocked(getGoldSample).mockResolvedValue(row);mount();await settle();
  expect(host.textContent).toContain('本表单无法精确保留');expect(host.querySelector('.exact-snapshot')?.textContent).toBe(row.goldDraftJson);
  expect(saveButton()).toBeUndefined();expect(host.textContent).toContain('独立审核');
 });
 it('rejects unknown protocols rather than interpreting them as legacy drafts',async()=>{
  vi.mocked(getGoldSample).mockResolvedValue(sample('iqc-gold-draft-v99'));mount();await settle();
  expect(host.textContent).toContain('加载失败或协议无效');expect(host.textContent).not.toContain('frozen text');expect(saveButton()?.disabled).toBe(true);
 });
});
