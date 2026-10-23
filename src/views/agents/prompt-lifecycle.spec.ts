import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createApp,defineComponent,h,nextTick,reactive,type App} from 'vue';
import Agents from './index.vue';
const mocks=vi.hoisted(()=>({versions:vi.fn()}));
vi.mock('vue-router',()=>({useRouter:()=>({push:vi.fn()})}));
vi.mock('ant-design-vue',()=>({message:{warning:vi.fn(),error:vi.fn(),success:vi.fn()}}));
const access=reactive({allowed:true});
vi.mock('@/composables/permission',()=>({usePermission:()=>({can:()=>access.allowed})}));
vi.mock('@/components/DictTag.vue',()=>({default:{render:()=>null}}));
vi.mock('@/api/config',async original=>({...await original<any>(),listAgents:vi.fn().mockResolvedValue([]),
 listModelProfiles:vi.fn().mockResolvedValue([]),listMcpServers:vi.fn().mockResolvedValue([]),
 listRuleSets:vi.fn().mockResolvedValue([]),listSkills:vi.fn().mockResolvedValue([
 {id:'old',name:'Old',status:'ENABLED'},{id:'new',name:'New',status:'ENABLED'}]),listInstructionVersions:mocks.versions}));
let app:App,host:HTMLDivElement;
async function settle(){for(let i=0;i<12;i++){await Promise.resolve();await nextTick();}}
function deferred(){let resolve!:(v:any)=>void;const promise=new Promise<any>(r=>resolve=r);return {promise,resolve};}
const row=(id:string,text:string)=>({skillId:id,versionNo:2,name:text,status:'ENABLED',instructions:text});
const pass=defineComponent({setup:(_,{slots})=>()=>h('div',slots.default?.())});
async function mount(){
 host=document.createElement('div');document.body.append(host);app=createApp(Agents);
 for(const name of ['ACard','ATable','ATableColumn','ASpace','AForm','ARow','ACol','AInput','AAlert','ASteps','AStep','ASelectOption','ATag'])app.component(name,pass);
 app.component('ATableColumn',defineComponent({render:()=>null}));
 app.component('AButton',defineComponent({setup:(_,{slots,attrs})=>()=>h('button',attrs,slots.default?.())}));
 app.component('AModal',defineComponent({props:['open'],setup:(p,{slots})=>()=>p.open?h('article',slots.default?.()):null}));
 app.component('AFormItem',defineComponent({props:['label'],setup:(p,{slots})=>()=>h('section',{'data-label':p.label},slots.default?.())}));
 app.component('ASwitch',defineComponent({emits:['change'],setup:(_,{emit})=>()=>h('button',{'data-switch':'',onClick:()=>emit('change',true)},'bind')}));
 app.component('ASelect',defineComponent({props:['value','options','disabled'],emits:['change'],setup:(p,{emit})=>()=>h('select',{disabled:p.disabled,value:p.value,onChange:(e:Event)=>{const v=(e.target as HTMLSelectElement).value;emit('change',p.options?.some((x:any)=>typeof x.value==='number')?Number(v):v);}},(p.options||[]).map((x:any)=>h('option',{value:x.value},x.label)))}));
 app.component('ATextarea',defineComponent({props:['value','disabled'],setup:p=>()=>h('textarea',{value:p.value,disabled:p.disabled})}));
 app.mount(host);await settle();
 const create=[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('创建 Agent'))!;expect(create).toBeTruthy();create.click();await settle();
 host.querySelector<HTMLButtonElement>('[data-switch]')!.click();await settle();
}
async function select(label:string,value:string){const el=host.querySelector<HTMLSelectElement>(`[data-label="${label}"] select`)!;el.value=value;el.dispatchEvent(new Event('change'));await settle();}
beforeEach(()=>{access.allowed=true;vi.clearAllMocks();});
afterEach(()=>{app?.unmount();host?.remove();});
it('discards a previous source response and binds only the selected exact version',async()=>{
 const old=deferred();mocks.versions.mockReturnValueOnce(old.promise).mockResolvedValueOnce([row('new','new instructions')]);
 await mount();await select('指令来源','old');await select('指令来源','new');old.resolve([row('old','stale instructions')]);await settle();
 expect(host.textContent).not.toContain('stale instructions');await select('精确版本','2');
 expect(host.querySelector<HTMLTextAreaElement>('[data-label="默认提示词"] textarea')!.value).toBe('new instructions');expect(host.querySelector<HTMLTextAreaElement>('[data-label="默认提示词"] textarea')!.disabled).toBe(true);
 expect(host.textContent).toContain('new · v2');
});
it('closes and clears the editor on permission revocation and ignores the late response',async()=>{
 const pending=deferred();mocks.versions.mockReturnValue(pending.promise);await mount();await select('指令来源','old');
 access.allowed=false;await settle();expect(host.querySelector('article')).toBeNull();
 pending.resolve([row('old','private late instructions')]);await settle();expect(host.textContent).not.toContain('private late instructions');expect(host.querySelector('textarea')).toBeNull();
});
