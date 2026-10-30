import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, reactive, type App } from 'vue';
import { message } from 'ant-design-vue';
import { decideReview, listReviews } from '@/api/quality';
import QualityOperations from './index.vue';

const state=vi.hoisted(()=>({permissions:null as null|Record<string,boolean>}));
vi.mock('@/composables/permission',()=>({usePermission:()=>({can:(code:string)=>state.permissions?.[code]??false})}));
vi.mock('ant-design-vue',()=>({message:{error:vi.fn(),success:vi.fn()},Modal:{confirm:vi.fn()}}));
vi.mock('@/api/quality',()=>({decideReview:vi.fn(),getQualityReport:vi.fn(),listFeedbacks:vi.fn(),listReviews:vi.fn(),listSamples:vi.fn()}));
vi.mock('@/components/BusinessReviewQueue.vue',()=>({default:defineComponent({setup:()=>()=>h('div')})}));
vi.mock('@/components/LabelReviewQueue.vue',()=>({default:defineComponent({setup:()=>()=>h('div')})}));
vi.mock('@/components/BusinessQualityReport.vue',()=>({default:defineComponent({setup:()=>()=>h('div')})}));
vi.mock('@/components/GoldSampleEditor.vue',()=>({default:defineComponent({setup:()=>()=>h('div')})}));
const decide='iqc:review:decide', view='iqc:review:view', full='iqc:sensitive:conversation:read', pii='iqc:sensitive:pii:read';
let app:App|undefined,host:HTMLDivElement,vm:any;
const row=(id='review-a')=>({id,originalStatus:'HIT',originalScore:37,originalRiskLevel:'HIGH',status:'PENDING'});
function mount(){
 host=document.createElement('div');document.body.append(host);app=createApp(QualityOperations);
 const pass=defineComponent({setup(_, {slots}){return()=>h('div',slots.default?.());}});
 for(const name of ['AAlert','ACard','AForm','AFormItem','ASelect','ASelectOption','AInputNumber','ATextarea','AStatistic','ACol','ARow','ATag','AButton','ATabs','ATabPane'])app.component(name,pass);
 // Table slots require row scope; child dialogs are outside this component lifecycle test.
 for(const name of ['ATable','ATableColumn','AModal','ADrawer'])app.component(name,defineComponent({setup:()=>()=>h('div')}));
 app.mount(host);vm=(app as any)._instance.setupState;vm.active='reviews';vm.openDecision(row());vm.form.comment='private reviewer draft';
}
async function flush(){for(let i=0;i<6;i++){await Promise.resolve();await nextTick();}}
function deferred(){let resolve!:(value:never)=>void,reject!:(error:Error)=>void;const promise=new Promise<never>((done,fail)=>{resolve=done;reject=fail;});return {promise,resolve,reject};}
function finish(pending:ReturnType<typeof deferred>,outcome:string){if(outcome==='success')pending.resolve(undefined as never);else pending.reject(new Error('old request failed'));}
beforeEach(()=>{vi.resetAllMocks();state.permissions=reactive({[decide]:true,[view]:true,[full]:true,[pii]:true});vi.mocked(listReviews).mockResolvedValue([]);});
afterEach(()=>{app?.unmount();app=undefined;host?.remove();});

describe('legacy message review decision ownership',()=>{
 it.each([decide,view,full,pii])('clears private form and selection immediately on %s revoke',async(permission)=>{
  mount();expect(vm.decisionOpen).toBe(true);state.permissions![permission]=false;
  expect(vm.decisionOpen).toBe(false);expect(vm.selected).toBeUndefined();expect(vm.form.comment).toBe('');expect(vm.deciding).toBe(false);
  state.permissions![permission]=true;await flush();expect(vm.decisionOpen).toBe(false);await vm.saveDecision();expect(decideReview).not.toHaveBeenCalled();
 });
 for(const permission of [decide,view,full,pii])for(const outcome of ['success','failure']){
  it(`${permission}: ignores old ${outcome} after revoke, restore and a new pending decision`,async()=>{
   mount();const old=deferred(),fresh=deferred();vi.mocked(decideReview).mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
   const oldSave=vm.saveDecision();state.permissions![permission]=false;state.permissions![permission]=true;vm.openDecision(row('review-b'));vm.form.comment='new private draft';
   const freshSave=vm.saveDecision();expect(decideReview).toHaveBeenCalledTimes(2);finish(old,outcome);await oldSave;await flush();
   expect(vm.decisionOpen).toBe(true);expect(vm.selected.id).toBe('review-b');expect(vm.form.comment).toBe('new private draft');expect(vm.deciding).toBe(true);
   expect(message.success).not.toHaveBeenCalled();expect(message.error).not.toHaveBeenCalled();expect(listReviews).not.toHaveBeenCalled();
   fresh.resolve(undefined as never);await freshSave;expect(message.success).toHaveBeenCalledTimes(1);expect(listReviews).toHaveBeenCalledTimes(1);expect(vm.deciding).toBe(false);
  });
 }
 it.each(['success','failure'])('closing and reopening the same review invalidates old %s',async(outcome)=>{
  mount();const old=deferred();vi.mocked(decideReview).mockReturnValueOnce(old.promise);const save=vm.saveDecision();vm.decisionOpen=false;vm.openDecision(row());vm.form.comment='later draft';
  finish(old,outcome);await save;await flush();expect(vm.decisionOpen).toBe(true);expect(vm.form.comment).toBe('later draft');expect(message.success).not.toHaveBeenCalled();expect(message.error).not.toHaveBeenCalled();expect(listReviews).not.toHaveBeenCalled();
 });
 it('preserves a normal correction payload and refreshes only after success',async()=>{
  mount();vm.form={decision:'CORRECTED',finalStatus:'NOT_HIT',finalScore:84,finalRiskLevel:'LOW',comment:'corrected with evidence'};
  vi.mocked(decideReview).mockResolvedValueOnce(undefined as never);await vm.saveDecision();
  expect(decideReview).toHaveBeenCalledExactlyOnceWith('review-a',{decision:'CORRECTED',finalStatus:'NOT_HIT',finalScore:84,finalRiskLevel:'LOW',comment:'corrected with evidence'});
  expect(message.success).toHaveBeenCalledWith('复核结论已保存');expect(vm.decisionOpen).toBe(false);expect(vm.form.comment).toBe('');expect(vm.deciding).toBe(false);expect(listReviews).toHaveBeenCalledTimes(1);
 });
 it('keeps the current draft on an ordinary failure and allows deliberate retry',async()=>{
  mount();vi.mocked(decideReview).mockRejectedValueOnce(new Error('failed')).mockResolvedValueOnce(undefined as never);await vm.saveDecision();
  expect(vm.decisionOpen).toBe(true);expect(vm.form.comment).toBe('private reviewer draft');expect(vm.deciding).toBe(false);expect(message.error).toHaveBeenCalledTimes(1);expect(listReviews).not.toHaveBeenCalled();
  await vm.saveDecision();expect(decideReview).toHaveBeenCalledTimes(2);expect(vm.decisionOpen).toBe(false);
 });
 it('does not open or submit with read permission alone',async()=>{
  state.permissions![decide]=false;mount();expect(vm.decisionOpen).toBe(false);await vm.saveDecision();expect(decideReview).not.toHaveBeenCalled();
 });
 it('ignores unrelated grant changes and blocks duplicate saves while pending',async()=>{
  mount();const pending=deferred();vi.mocked(decideReview).mockReturnValueOnce(pending.promise);const save=vm.saveDecision();state.permissions!['iqc:sample:view']=true;await flush();
  expect(vm.decisionOpen).toBe(true);expect(vm.form.comment).toBe('private reviewer draft');expect(vm.deciding).toBe(true);await vm.saveDecision();expect(decideReview).toHaveBeenCalledTimes(1);
  pending.resolve(undefined as never);await save;expect(message.success).toHaveBeenCalledTimes(1);
 });
 it.each(['success','failure'])('ignores a late %s after unmount',async(outcome)=>{
  mount();const pending=deferred();vi.mocked(decideReview).mockReturnValueOnce(pending.promise);const save=vm.saveDecision();app!.unmount();app=undefined;
  finish(pending,outcome);await save;expect(vm.form.comment).toBe('');expect(vm.selected).toBeUndefined();expect(message.success).not.toHaveBeenCalled();expect(message.error).not.toHaveBeenCalled();expect(listReviews).not.toHaveBeenCalled();
 });
});
