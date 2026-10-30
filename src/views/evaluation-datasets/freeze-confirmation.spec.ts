import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createApp,defineComponent,h,nextTick,reactive,type App} from 'vue';
import {Modal,message} from 'ant-design-vue';
import {freezeDataset,getDataset,listDatasets,type Dataset} from '@/api/evaluation';
import Datasets from './index.vue';
const state=vi.hoisted(()=>({permissions:null as null|Record<string,boolean>}));
vi.mock('@/composables/permission',()=>({usePermission:()=>({can:(code:string)=>state.permissions?.[code]??false})}));
vi.mock('ant-design-vue',()=>({message:{error:vi.fn(),success:vi.fn(),warning:vi.fn()},Modal:{confirm:vi.fn()}}));
vi.mock('@/api/quality',()=>({listSamples:vi.fn()}));
vi.mock('@/api/evaluation',()=>({listDatasets:vi.fn(),getDataset:vi.fn(),createDataset:vi.fn(),updateDataset:vi.fn(),freezeDataset:vi.fn(),setDatasetAvailability:vi.fn(),listDatasetVersions:vi.fn(),getDatasetVersion:vi.fn(),listGoldVersions:vi.fn()}));
const freeze='iqc:dataset:freeze',detail='iqc:dataset:detail:view',full='iqc:sensitive:conversation:read',pii='iqc:sensitive:pii:read';
let app:App|undefined,host:HTMLDivElement,vm:any;
function row(id='dataset-a',revision=7):Dataset{return {id,name:`private ${id}`,datasetType:'REGRESSION',status:'ACTIVE',draftRevision:revision,draftConfigJson:JSON.stringify({schemaVersion:'iqc-dataset-draft-v1',type:'REGRESSION',description:'frozen candidate history',members:[{sampleId:'sample-a',versionNo:3}]})};}
async function flush(){for(let i=0;i<8;i++){await Promise.resolve();await nextTick();}}
async function mount(){
 host=document.createElement('div');document.body.append(host);app=createApp(Datasets);
 const empty=defineComponent({setup:()=>()=>h('div')});
 for(const name of ['AButton','AAlert','ATable','ATableColumn','APagination','ADrawer','ATag','AForm','AFormItem','AInput','ASelect','ATextarea','AList','AListItem','ASpace'])app.component(name,empty);
 app.mount(host);await flush();vm=(app as any)._instance.setupState;vm.populate(row());vm.open=true;vi.mocked(listDatasets).mockClear();
}
function confirm(){vm.freeze();expect(Modal.confirm).toHaveBeenCalledTimes(1);return vi.mocked(Modal.confirm).mock.calls[0][0].onOk! as ()=>Promise<void>;}
function deferred(){let resolve!:(value:never)=>void,reject!:(error:Error)=>void;const promise=new Promise<never>((done,fail)=>{resolve=done;reject=fail;});return {promise,resolve,reject};}
beforeEach(()=>{vi.resetAllMocks();state.permissions=reactive({[freeze]:true,[detail]:true,[full]:true,[pii]:true,'iqc:dataset:view':true});vi.mocked(listDatasets).mockResolvedValue({records:[],total:0} as never);vi.mocked(getDataset).mockResolvedValue(row());vi.mocked(freezeDataset).mockResolvedValue({id:'v1'} as never);});
afterEach(()=>{app?.unmount();app=undefined;host?.remove();});
describe('dataset freezing exact authorization and confirmation ownership',()=>{
 it('does not borrow update or manage permission to freeze',async()=>{state.permissions![freeze]=false;state.permissions!['iqc:dataset:update']=true;state.permissions!['iqc:dataset:manage']=true;await mount();vm.freeze();expect(Modal.confirm).not.toHaveBeenCalled();expect(freezeDataset).not.toHaveBeenCalled();});
 it.each(['inactive','projected','dirty'])('refuses a %s draft before confirmation',async(kind)=>{
  await mount();if(kind==='inactive')vm.selected.status='DISABLED';if(kind==='projected')vm.populate({...row(),privacy:{policyVersion:'iqc-dataset-draft-read-v1',canonicalPayloadVisible:false,canReadFull:false,canReadPii:false,withheldFields:[],previewState:'RESTRICTED'}});if(kind==='dirty')vm.name='unsaved';
  vm.freeze();expect(Modal.confirm).not.toHaveBeenCalled();
 });
 it.each([freeze,detail,full,pii])('invalidates a pending confirmation after %s revoke and restore',async(permission)=>{
  await mount();const accept=confirm();state.permissions![permission]=false;state.permissions![permission]=true;await accept();expect(freezeDataset).not.toHaveBeenCalled();expect(getDataset).not.toHaveBeenCalled();
 });
 it.each(['different asset','new revision','new detail generation','dirty edit'])('rejects an old confirmation after %s',async(change)=>{
  await mount();const accept=confirm();if(change==='different asset')vm.populate(row('dataset-b'));if(change==='new revision')vm.populate(row('dataset-a',8));if(change==='new detail generation'){vm.reset();vm.populate(row());}if(change==='dirty edit')vm.draft.description='later unsaved edit';
  await accept();expect(freezeDataset).not.toHaveBeenCalled();
 });
 it('freezes the original saved revision and rereads its exact asset',async()=>{
  await mount();await confirm()();expect(freezeDataset).toHaveBeenCalledExactlyOnceWith('dataset-a',7);expect(getDataset).toHaveBeenCalledExactlyOnceWith('dataset-a');expect(listDatasets).toHaveBeenCalledExactlyOnceWith(1);expect(message.success).toHaveBeenCalledWith('数据集版本已冻结');expect(vm.busy).toBe(false);
 });
 it('does not reread details for an independently authorized freeze without detail:view',async()=>{
  state.permissions![detail]=false;await mount();await confirm()();expect(freezeDataset).toHaveBeenCalledExactlyOnceWith('dataset-a',7);expect(getDataset).not.toHaveBeenCalled();expect(message.success).toHaveBeenCalledTimes(1);expect(vm.busy).toBe(false);
 });
 it('preserves a valid confirmation across unrelated permission changes',async()=>{await mount();const accept=confirm();state.permissions!['unrelated:write']=true;await accept();expect(freezeDataset).toHaveBeenCalledTimes(1);});
 it('distinguishes a confirmed freeze whose detail reread failed',async()=>{
  await mount();vi.mocked(getDataset).mockRejectedValueOnce(new Error('read failed'));await confirm()();expect(freezeDataset).toHaveBeenCalledTimes(1);expect(message.warning).toHaveBeenCalledWith('数据集版本已冻结，但重新读取失败；请刷新核对，勿重复提交。');expect(message.success).not.toHaveBeenCalled();expect(vm.busy).toBe(false);
 });
 it('keeps an unconfirmed write failure distinct from confirmed reread failure',async()=>{
  await mount();vi.mocked(freezeDataset).mockRejectedValueOnce(new Error('write failed'));await confirm()();expect(message.warning).toHaveBeenCalledWith('冻结未确认，请核对修订、成员当前可用性及重复会话。');expect(getDataset).not.toHaveBeenCalled();expect(vm.busy).toBe(false);
 });
 for(const permission of [freeze,detail,full,pii])for(const outcome of ['success','failure']){
  it(`${permission}: old ${outcome} does not release or overwrite a newer freeze`,async()=>{
   await mount();const old=deferred(),fresh=deferred();vi.mocked(freezeDataset).mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);const first=confirm()();
   state.permissions![permission]=false;state.permissions![permission]=true;vm.populate(row('dataset-b',9));vi.mocked(Modal.confirm).mockClear();const second=confirm()();expect(freezeDataset).toHaveBeenCalledTimes(2);
   if(outcome==='success')old.resolve({id:'old-version'} as never);else old.reject(new Error('old failed'));await first;expect(vm.busy).toBe(true);expect(vm.selected.id).toBe('dataset-b');expect(getDataset).not.toHaveBeenCalled();expect(message.success).not.toHaveBeenCalled();expect(message.warning).not.toHaveBeenCalled();expect(message.error).not.toHaveBeenCalled();
   vi.mocked(getDataset).mockResolvedValueOnce(row('dataset-b',9));fresh.resolve({id:'fresh-version'} as never);await second;expect(vm.busy).toBe(false);expect(getDataset).toHaveBeenCalledExactlyOnceWith('dataset-b');
  });
 }
 it('does not adopt a detail reread after its permission changes',async()=>{
  await mount();const pending=deferred();vi.mocked(getDataset).mockReturnValueOnce(pending.promise);const save=confirm()();await flush();expect(getDataset).toHaveBeenCalledTimes(1);state.permissions![detail]=false;state.permissions![detail]=true;pending.resolve(row('obsolete-detail') as never);await save;expect(vm.selected.id).toBe('dataset-a');expect(message.success).not.toHaveBeenCalled();
 });
 it('does not execute a pending confirmation after unmount',async()=>{await mount();const accept=confirm();app!.unmount();app=undefined;await accept();expect(freezeDataset).not.toHaveBeenCalled();});
 it.each(['success','failure'])('ignores a late %s after unmount',async(outcome)=>{
  await mount();const pending=deferred();vi.mocked(freezeDataset).mockReturnValueOnce(pending.promise);const save=confirm()();app!.unmount();app=undefined;if(outcome==='success')pending.resolve({id:'version'} as never);else pending.reject(new Error('late failure'));await save;expect(getDataset).not.toHaveBeenCalled();expect(message.success).not.toHaveBeenCalled();expect(message.warning).not.toHaveBeenCalled();expect(message.error).not.toHaveBeenCalled();
 });
});
