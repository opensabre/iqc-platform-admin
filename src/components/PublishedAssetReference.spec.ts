import {afterEach,expect,it,vi} from 'vitest';
import {createApp,defineComponent,h,nextTick,ref,type App} from 'vue';
import PublishedAssetReference from './PublishedAssetReference.vue';
const api=vi.hoisted(()=>({list:vi.fn(),versions:vi.fn()}));
vi.mock('@/api/knowledge',()=>({listKnowledge:api.list,listKnowledgeVersions:api.versions}));
let app:App,host:HTMLDivElement;
async function settle(){for(let i=0;i<10;i++){await Promise.resolve();await nextTick();}}
function deferred(){let resolve!:(v:any)=>void;const promise=new Promise<any>(r=>resolve=r);return {resolve,promise};}
afterEach(()=>{app?.unmount();host?.remove();vi.clearAllMocks();});
it('ignores previous knowledge version responses after the selected asset changes',async()=>{
 const old=deferred();api.list.mockResolvedValue({records:[],total:0});
 api.versions.mockImplementation((id:string)=>id==='old'?old.promise:Promise.resolve([{versionNo:7}]));
 const selected=ref({id:'old',versionNo:2});host=document.createElement('div');document.body.append(host);
 app=createApp(defineComponent({setup:()=>()=>h(PublishedAssetReference,{kind:'KNOWLEDGE',modelValue:selected.value})}));
 app.component('ASpace',defineComponent({setup:(_,{slots})=>()=>h('div',slots.default?.())}));
 app.component('ASelect',defineComponent({props:['options'],setup:p=>()=>h('select',(p.options??[]).map((x:any)=>h('option',{value:x.value},x.label)))}));
 app.component('AButton',defineComponent({setup:(_,{slots})=>()=>h('button',slots.default?.())}));
 app.component('AAlert',defineComponent({render:()=>null}));
 app.mount(host);await settle();selected.value={id:'new',versionNo:7};await settle();
 old.resolve([{versionNo:99}]);await settle();
 const version=host.querySelectorAll('select')[1]!;
 expect(version.textContent).toContain('v7');expect(version.textContent).not.toContain('v99');
 expect(api.versions.mock.calls.map(c=>c[0])).toEqual(['old','new']);
});
it('does not emit a late version response after the selector unmounts',async()=>{
 const pending=deferred();api.list.mockResolvedValue({records:[],total:0});api.versions.mockReturnValue(pending.promise);
 const emitted=vi.fn();host=document.createElement('div');document.body.append(host);
 app=createApp(PublishedAssetReference,{kind:'KNOWLEDGE',modelValue:{id:'kb',versionNo:2},onCode:emitted});
 for(const name of ['ASpace','ASelect','AButton','AAlert'])app.component(name,defineComponent({render:()=>null}));
 app.mount(host);await settle();app.unmount();emitted.mockClear();
 pending.resolve([{versionNo:2}]);await settle();expect(emitted).not.toHaveBeenCalled();
});
