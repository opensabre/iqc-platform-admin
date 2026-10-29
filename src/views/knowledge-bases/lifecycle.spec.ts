import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createApp,defineComponent,h,nextTick,reactive,type App} from 'vue';
import Knowledge from './index.vue';
const mocks=vi.hoisted(()=>({list:vi.fn(),get:vi.fn(),versions:vi.fn(),update:vi.fn()}));
const access=reactive({allowed:true});
vi.mock('@/composables/permission',()=>({usePermission:()=>({can:()=>access.allowed})}));
vi.mock('ant-design-vue',()=>({message:{success:vi.fn(),warning:vi.fn(),error:vi.fn()}}));
vi.mock('@/api/knowledge',async original=>({...await original<any>(),listKnowledge:mocks.list,getKnowledge:mocks.get,listKnowledgeVersions:mocks.versions,updateKnowledge:mocks.update}));
let app:App,host:HTMLDivElement;
const corpus=JSON.stringify({schemaVersion:'iqc-knowledge-corpus-v1',documents:[{documentId:'doc',title:'Title',text:'private reference',sourceReference:'source:manual'}]});
const row={id:'kb',code:'KB',name:'Corpus',draftRevision:1,status:'DISABLED',draftConfigJson:corpus,privacy:{policyVersion:'iqc-knowledge-read-v1',canonicalPayloadVisible:true,canReadFull:true,canReadPii:true,canReadPrompt:true}};
async function settle(){for(let i=0;i<12;i++){await Promise.resolve();await nextTick();}}
async function click(label:string){const button=[...host.querySelectorAll('button')].find(b=>b.textContent===label);expect(button).toBeTruthy();button!.click();await settle();}
const pass=defineComponent({setup:(_,{slots})=>()=>h('div',slots.default?.())});
async function mount(){
 host=document.createElement('div');document.body.append(host);app=createApp(Knowledge);
 for(const name of ['ASpace','AForm','AFormItem','ACard','APagination'])app.component(name,pass);
 app.component('AButton',defineComponent({setup:(_,{slots,attrs})=>()=>h('button',attrs,slots.default?.())}));
 app.component('AAlert',defineComponent({props:['message'],setup:p=>()=>h('p',p.message)}));
 app.component('ADrawer',defineComponent({props:['open'],setup:(p,{slots})=>()=>p.open?h('article',slots.default?.()):null}));
 app.component('ATable',defineComponent({props:['dataSource','columns'],setup:(p,{slots})=>()=>h('div',p.dataSource.flatMap((record:any)=>p.columns.map((column:any)=>slots.bodyCell?.({column,record}))))}));
 for(const name of ['AInput','ATextarea'])app.component(name,defineComponent({props:['value'],setup:p=>()=>h('textarea',{value:p.value})}));
 app.mount(host);await settle();await click('详情');
}
beforeEach(()=>{access.allowed=true;vi.resetAllMocks();mocks.list.mockResolvedValue({records:[row],total:1});mocks.get.mockResolvedValue(row);mocks.versions.mockResolvedValue([]);});
afterEach(()=>{app?.unmount();host?.remove();});
it('retains identity and blocks repeat writes after a confirmed save reread fails',async()=>{
 await mount();mocks.update.mockResolvedValue({...row,draftRevision:2,draftConfigJson:null});mocks.get.mockRejectedValue(Error('read failed'));
 await click('保存草稿');expect(mocks.update).toHaveBeenCalledTimes(1);expect(host.textContent).toContain('操作已完成，但重新读取失败');
 expect(host.textContent).toContain('KB · 修订 2');expect(host.querySelectorAll('textarea')).toHaveLength(0);
 expect([...host.querySelectorAll('button')].some(b=>b.textContent==='保存草稿')).toBe(false);
});
it('discards a pending detail body after permission revocation',async()=>{
 let resolve!:(value:any)=>void;mocks.get.mockReturnValue(new Promise(r=>resolve=r));await mount();
 access.allowed=false;await settle();expect(host.querySelector('article')).toBeNull();resolve(row);await settle();
 expect(host.querySelector('article')).toBeNull();expect(host.textContent).not.toContain('private reference');
});
