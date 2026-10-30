import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, reactive, type App } from 'vue';
import { Modal } from 'ant-design-vue';
import { getGoldSample } from '@/api/evaluation';
import QualityOperations from './index.vue';
const state=vi.hoisted(()=>({permissions:null as null|Record<string,boolean>}));
vi.mock('@/composables/permission',()=>({usePermission:()=>({can:(code:string)=>state.permissions?.[code]??false})}));
vi.mock('ant-design-vue',()=>({message:{error:vi.fn(),success:vi.fn(),warning:vi.fn()},Modal:{confirm:vi.fn()}}));
vi.mock('@/api/quality',()=>({decideReview:vi.fn(),getQualityReport:vi.fn(),listFeedbacks:vi.fn(),listReviews:vi.fn(),listSamples:vi.fn()}));
vi.mock('@/api/evaluation',()=>({getGoldSample:vi.fn(),annotateGold:vi.fn(),reviewGold:vi.fn(),listGoldVersions:vi.fn(),getGoldVersion:vi.fn()}));
vi.mock('@/components/BusinessReviewQueue.vue',()=>({default:defineComponent({setup(_,{expose}){expose({refresh:vi.fn()});return()=>h('div');}})}));
vi.mock('@/components/LabelReviewQueue.vue',()=>({default:defineComponent({setup:()=>()=>h('div')})}));
vi.mock('@/components/BusinessQualityReport.vue',()=>({default:defineComponent({setup:()=>()=>h('div')})}));
vi.mock('@/components/GoldSampleEditor.vue',()=>({default:defineComponent({setup:()=>()=>h('div')})}));
const view='iqc:gold:view',full='iqc:sensitive:conversation:read',pii='iqc:sensitive:pii:read';
let app:App|undefined,host:HTMLDivElement,vm:any;
let dirty:boolean,busy:boolean,revision:number;
function mount(){
 host=document.createElement('div');document.body.append(host);app=createApp(QualityOperations);
 const pass=defineComponent({setup(_, {slots}){return()=>h('div',slots.default?.());}});
 for(const name of ['AAlert','ACard','AForm','AFormItem','ASelect','ASelectOption','AInputNumber','ATextarea','AStatistic','ACol','ARow','ATag','AButton','ATabs','ATabPane'])app.component(name,pass);
 for(const name of ['ATable','ATableColumn','AModal','ADrawer'])app.component(name,defineComponent({setup:()=>()=>h('div')}));
 app.mount(host);vm=(app as any)._instance.setupState;
 vm.goldEditor={hasUnsavedChanges:()=>dirty,isBusy:()=>busy,getEditRevision:()=>String(revision)};
 vm.openGold({id:'sample-a'});
}
function confirm(){vm.closeGold();expect(Modal.confirm).toHaveBeenCalledTimes(1);return vi.mocked(Modal.confirm).mock.calls[0][0].onOk! as ()=>void;}
async function flush(){for(let i=0;i<8;i++){await Promise.resolve();await nextTick();}}
beforeEach(()=>{vi.resetAllMocks();state.permissions=reactive({[view]:true,[full]:true,[pii]:true});dirty=true;busy=false;revision=1;});
afterEach(()=>{app?.unmount();app=undefined;host?.remove();});
describe('Gold drawer discard confirmation ownership',()=>{
 it('closes the unchanged original editor after an authorized confirmation',()=>{mount();confirm()();expect(vm.goldOpen).toBe(false);expect(vm.goldSampleId).toBeUndefined();});
 it('closes a clean editor without a confirmation',()=>{mount();dirty=false;vm.closeGold();expect(Modal.confirm).not.toHaveBeenCalled();expect(vm.goldOpen).toBe(false);});
 it.each(['continued editing','editing then restoring the original values'])('rejects an old confirmation after %s',(kind)=>{
  mount();const accept=confirm();revision++;if(kind.includes('restoring'))revision++;accept();expect(vm.goldOpen).toBe(true);expect(vm.goldSampleId).toBe('sample-a');
 });
 it('does not apply an old confirmation to a subsequently opened sample',()=>{
  mount();const accept=confirm();dirty=false;vm.openGold({id:'sample-b'});dirty=true;accept();expect(vm.goldOpen).toBe(true);expect(vm.goldSampleId).toBe('sample-b');
 });
 it('does not apply an old confirmation after reopening the same sample',()=>{
  mount();const accept=confirm();dirty=false;vm.closeGold();vm.openGold({id:'sample-a'});dirty=true;accept();expect(vm.goldOpen).toBe(true);
 });
 it('refuses to open without gold:view',()=>{state.permissions![view]=false;mount();expect(vm.goldOpen).toBe(false);expect(vm.goldSampleId).toBeUndefined();});
 it('refuses to replace an unsaved editor',()=>{mount();vm.openGold({id:'sample-b'});expect(vm.goldSampleId).toBe('sample-a');expect(vm.goldOpen).toBe(true);});
 it('refuses to open or close while the editor is busy',()=>{mount();busy=true;vm.openGold({id:'sample-b'});vm.closeGold();expect(vm.goldSampleId).toBe('sample-a');expect(vm.goldOpen).toBe(true);expect(Modal.confirm).not.toHaveBeenCalled();});
 it('checks busy again when the confirmation is accepted',()=>{mount();const accept=confirm();busy=true;accept();expect(vm.goldOpen).toBe(true);});
 it.each([view,full,pii])('clears the drawer on %s changes and cannot revive an old confirmation',async(permission)=>{
  mount();const accept=confirm();state.permissions![permission]=false;expect(vm.goldOpen).toBe(false);expect(vm.goldSampleId).toBeUndefined();
  state.permissions![permission]=true;vm.openGold({id:'sample-a'});await flush();accept();expect(vm.goldOpen).toBe(true);expect(vm.goldSampleId).toBe('sample-a');
 });
 it('preserves the current confirmation across unrelated permission changes',async()=>{mount();const accept=confirm();state.permissions!['unrelated:read']=true;await flush();accept();expect(vm.goldOpen).toBe(false);});
 it('invalidates a confirmation when the child emits changed',()=>{mount();const accept=confirm();vm.goldChanged();accept();expect(vm.goldOpen).toBe(true);});
 it('clears parent identity on unmount and ignores the pending confirmation',()=>{mount();const accept=confirm();app!.unmount();app=undefined;accept();expect(vm.goldSampleId).toBeUndefined();expect(vm.goldOpen).toBe(false);});
});

describe('actual Gold editor non-content edit revision',()=>{
 async function editor(){
  const {default:Gold}=await vi.importActual<typeof import('@/components/GoldSampleEditor.vue')>('@/components/GoldSampleEditor.vue');
  vi.mocked(getGoldSample).mockResolvedValue({id:'sample-a',name:'sample',goldDraftRevision:1,goldStatus:'PENDING_REVIEW'} as never);
  host=document.createElement('div');document.body.append(host);app=createApp(Gold,{sampleId:'sample-a'});
  // Isolate rendered Ant children; the actual component setup/watchers and expose run normally.
  for(const name of ['ASpin','AAlert','ATag','ACollapse','ACollapsePanel','AForm','AFormItem','ASpace','ACard','AList','AListItem','APagination','ASelect','ASwitch','AButton','AInput','ATextarea'])app.component(name,defineComponent({setup:()=>()=>h('div')}));
  app.mount(host);await flush();return {state:(app as any)._instance.setupState,exposed:(app as any)._instance.exposed};
 }
 it('changes the edit revision after a value changes back without copying its contents',async()=>{
  const {state:child,exposed}=await editor();expect(exposed.getEditRevision).toBeTypeOf('function');const before=exposed.getEditRevision();
  child.context='{"secret":"private retained context"}';child.context='{}';const after=exposed.getEditRevision();expect(after).not.toBe(before);expect(after).not.toContain('private retained context');
 });
 it('changes the revision for a reason edited then cleared',async()=>{
  const {state:child,exposed}=await editor();expect(exposed.getEditRevision).toBeTypeOf('function');const before=exposed.getEditRevision();child.reason='private reviewer reason';child.reason='';expect(exposed.getEditRevision()).not.toBe(before);expect(exposed.getEditRevision()).not.toContain('private reviewer reason');
 });
 it('changes the revision when a fresh load replaces the original draft',async()=>{
  const {state:child,exposed}=await editor();expect(exposed.getEditRevision).toBeTypeOf('function');const before=exposed.getEditRevision();await child.load();expect(exposed.getEditRevision()).not.toBe(before);
 });
});
