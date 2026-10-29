import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createApp,defineComponent,h,nextTick,reactive,type App} from 'vue';
import RuleSets from './index.vue';
const api=vi.hoisted(()=>({sets:vi.fn(),rules:vi.fn(),create:vi.fn(),submit:vi.fn(),approve:vi.fn(),reject:vi.fn(),success:vi.fn(),error:vi.fn(),warning:vi.fn()}));
vi.mock('@/api/config',()=>({listRuleSets:api.sets,listRules:api.rules,createRuleSet:api.create,submitRuleSet:api.submit,approveRuleSet:api.approve,rejectRuleSet:api.reject}));
vi.mock('ant-design-vue',()=>({message:{success:api.success,error:api.error,warning:api.warning}}));
const access=reactive({codes:[] as string[]});
vi.mock('@/composables/permission',()=>({usePermission:()=>({can:(code:string)=>access.codes.includes(code)})}));
const row={id:'set',name:'Set',code:'SET',ruleIdsJson:'["published"]',status:'DRAFT',description:'private set body'};
const published={id:'published',name:'Published',status:'PUBLISHED',expression:'private expression',description:'private rule body'};
let app:App,host:HTMLDivElement,vm:any;
async function settle(){for(let i=0;i<12;i++){await Promise.resolve();await nextTick();}}
const pass=defineComponent({setup:(_,{slots})=>()=>h('div',slots.default?.())});
async function mount(){
 host=document.createElement('div');document.body.append(host);app=createApp(RuleSets);
 for(const name of ['ACard','ATable','AForm','AFormItem','ARow','ACol','AInput','ASelect','ASelectOption','ATextarea','AAlert','ARadioGroup','ARadioButton'])app.component(name,pass);
 app.component('ATableColumn',defineComponent({render:()=>null}));
 app.component('AButton',defineComponent({setup:(_,{slots,attrs})=>()=>h('button',attrs,slots.default?.())}));
 app.component('AModal',defineComponent({props:['open'],setup:(p,{slots})=>()=>p.open?h('article',slots.default?.()):null}));
 app.mount(host);vm=(app as any)._instance.setupState;await settle();
}
function fill(){Object.assign(vm.form,{name:'New set',code:'NEW',ruleIds:['published'],aggregationMode:'ALL'});}
beforeEach(()=>{vi.clearAllMocks();access.codes=['iqc:rule-set:view'];api.sets.mockResolvedValue([row]);api.rules.mockResolvedValue([published,{...published,id:'draft',status:'DRAFT'}]);api.create.mockResolvedValue(row);api.submit.mockResolvedValue(row);api.approve.mockResolvedValue(row);api.reject.mockResolvedValue(row);});
afterEach(()=>{app?.unmount();host?.remove();});
describe('rule set exact operation permissions',()=>{
 it('old rule view/manage/approve cannot authorize rule set reads or writes',async()=>{
  access.codes=['iqc:rule:view','iqc:rule:manage','iqc:rule:approve'];await mount();
  expect(api.sets).not.toHaveBeenCalled();expect(api.rules).toHaveBeenCalledOnce();expect(vm.sets).toEqual([]);
  vm.createNew();expect(vm.open).toBe(false);fill();await vm.save();await vm.submit('set');await vm.approve('set');await vm.reject('set');
  for(const action of [api.create,api.submit,api.approve,api.reject])expect(action).not.toHaveBeenCalled();
 });
 it('set view reads sets without requesting rule bodies or opening creation',async()=>{
  access.codes.push('iqc:rule-set:manage');await mount();expect(api.sets).toHaveBeenCalledOnce();expect(api.rules).not.toHaveBeenCalled();
  expect(vm.sets[0]).not.toHaveProperty('description');vm.createNew();expect(vm.open).toBe(false);fill();await vm.save();expect(api.create).not.toHaveBeenCalled();
 });
 it('creation requires exact manage plus rule view and preserves member validation',async()=>{
  access.codes.push('iqc:rule-set:manage','iqc:rule:view');await mount();vm.createNew();await settle();expect(host.querySelector('article')).not.toBeNull();
  await vm.save();expect(api.create).not.toHaveBeenCalled();expect(api.warning).toHaveBeenCalledOnce();
  expect(vm.publishedRules.map((r:any)=>r.id)).toEqual(['published']);expect(vm.rules[0]).not.toHaveProperty('expression');expect(vm.rules[0]).not.toHaveProperty('description');
  fill();await vm.save();expect(api.create).toHaveBeenCalledWith(expect.objectContaining({name:'New set',code:'NEW',ruleIds:['published'],aggregationMode:'ALL'}));
 });
 for(const operation of ['submit','approve','reject'] as const){
  it(`${operation} authorizes only its own endpoint`,async()=>{
   access.codes.push(`iqc:rule-set:${operation}`);await mount();await vm.submit('set');await vm.approve('set');await vm.reject('set');
   for(const name of ['submit','approve','reject'] as const){if(name===operation)expect(api[name]).toHaveBeenCalledExactlyOnceWith('set');else expect(api[name]).not.toHaveBeenCalled();}
   vm.createNew();expect(vm.open).toBe(false);
  });
 }
 it('revoking member reads closes creation, clears the form and rejects a later save',async()=>{
  access.codes.push('iqc:rule-set:manage','iqc:rule:view');await mount();vm.createNew();fill();await settle();
  access.codes=['iqc:rule-set:view','iqc:rule-set:manage'];await settle();expect(host.querySelector('article')).toBeNull();expect(vm.form.ruleIds).toEqual([]);expect(vm.rules).toEqual([]);
  fill();await vm.save();expect(api.create).not.toHaveBeenCalled();
 });
 it('revoked reads discard in-flight sets and rules',async()=>{
  let resolveSets!:(rows:any[])=>void,resolveRules!:(rows:any[])=>void;
  api.sets.mockReturnValueOnce(new Promise(done=>resolveSets=done));api.rules.mockReturnValueOnce(new Promise(done=>resolveRules=done));
  access.codes.push('iqc:rule:view');await mount();access.codes=[];await settle();resolveSets([row]);resolveRules([published]);await settle();
  expect(vm.sets).toEqual([]);expect(vm.rules).toEqual([]);
 });
 it('revoking approve while it is in flight suppresses success and refresh',async()=>{
  let resolve!:()=>void;api.approve.mockReturnValueOnce(new Promise<void>(done=>resolve=done));access.codes.push('iqc:rule-set:approve');await mount();
  const request=vm.approve('set');access.codes=['iqc:rule-set:view'];await settle();const readsAfterRevocation=api.sets.mock.calls.length;resolve();await request;expect(api.success).not.toHaveBeenCalled();expect(api.sets).toHaveBeenCalledTimes(readsAfterRevocation);
 });
 it('preserves uncertain submit failure feedback',async()=>{
  access.codes.push('iqc:rule-set:submit');api.submit.mockRejectedValueOnce(new Error('offline'));await mount();await vm.submit('set');
  expect(api.error).toHaveBeenCalledWith('提交失败，请确认成员规则均已发布');expect(api.success).not.toHaveBeenCalled();
 });
});
