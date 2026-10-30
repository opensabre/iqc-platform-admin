import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createApp,defineComponent,h,nextTick,reactive,type App} from 'vue';
import {Modal,message} from 'ant-design-vue';
import {freezeDataset,getDataset,listDatasets,createDataset,updateDataset,setDatasetAvailability,type Dataset} from '@/api/evaluation';
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
function deferred(){let resolve!:(value:never)=>void,reject!:(error:Error)=>void;const promise=new Promise<never>((done,fail)=>{resolve=done;reject=fail;});return {promise,resolve,reject};}
beforeEach(()=>{vi.resetAllMocks();state.permissions=reactive({[freeze]:true,[detail]:true,[full]:true,[pii]:true,'iqc:dataset:view':true,'iqc:dataset:manage':true,'iqc:dataset:update':true,'iqc:dataset:availability':true,'iqc:sample:view':true,'iqc:gold:versions:view':true});vi.mocked(listDatasets).mockResolvedValue({records:[],total:0} as never);vi.mocked(getDataset).mockResolvedValue(row());vi.mocked(freezeDataset).mockResolvedValue({id:'v1'} as never);});
afterEach(()=>{app?.unmount();app=undefined;host?.remove();});
function privateCopiesGone(){expect(vm.name).toBe('');expect(vm.draft.members).toEqual([]);expect(vm.draft.description??'').toBe('');expect(vm.selected?.name??'').toBe('');expect(vm.selected?.draftConfigJson??null).toBeNull();}
function fillNew(){vm.create();vm.name='new private dataset';vm.draft.members=[{sampleId:'sample-new',versionNo:4}];}
describe('dataset private drafts and command response ownership',()=>{
 it.each([detail,full,pii])('clears private draft, form and options immediately after %s changes',async(permission)=>{
  await mount();vm.name='unsaved private name';vm.draft.description='unsaved secret';vm.candidates=[{id:'candidate'}];vm.approved=[{versionNo:3}];state.permissions![permission]=false;
  privateCopiesGone();expect(vm.open).toBe(false);expect(vm.candidates).toEqual([]);expect(vm.approved).toEqual([]);state.permissions![permission]=true;privateCopiesGone();expect(vm.reloadRequired).toBe(true);
 });
 it('requires exact detail permission for the edit handler',async()=>{state.permissions![detail]=false;await mount();await vm.edit(row('other'));expect(getDataset).not.toHaveBeenCalled();});
 it('requires exact manage permission for create',async()=>{state.permissions!['iqc:dataset:manage']=false;await mount();vm.create();expect(vm.selected.id).toBe('dataset-a');});
 it.each(['iqc:dataset:update','iqc:sample:view','iqc:gold:versions:view'])('does not add an approved member without %s',async(permission)=>{
  await mount();state.permissions![permission]=false;vm.candidateId='new-sample';vm.versionNo=8;vm.approved=[{versionNo:8,decision:'APPROVED'}];vm.add();expect(vm.draft.members).toEqual([{sampleId:'sample-a',versionNo:3}]);
 });
 it('requires exact availability permission',async()=>{state.permissions!['iqc:dataset:availability']=false;await mount();await vm.availability(row());expect(setDatasetAvailability).not.toHaveBeenCalled();});
 it('keeps an ordinary failed save draft available for deliberate retry',async()=>{
  await mount();vm.name='corrected name';vi.mocked(updateDataset).mockRejectedValueOnce(new Error('write failed'));await vm.save();expect(vm.name).toBe('corrected name');expect(vm.draft.members).toHaveLength(1);expect(vm.busy).toBe(false);expect(message.error).toHaveBeenCalledTimes(1);
 });
 it('sends the original revision and a frozen copy of the intended members',async()=>{
  await mount();const pending=deferred();vi.mocked(updateDataset).mockReturnValueOnce(pending.promise);vi.mocked(getDataset).mockResolvedValueOnce(row('dataset-a',8));vm.name='intended name';const save=vm.save();vm.name='later name';vm.draft.members.push({sampleId:'later-member',versionNo:9});
  expect(updateDataset).toHaveBeenCalledExactlyOnceWith('dataset-a',7,'intended name',{schemaVersion:'iqc-dataset-draft-v1',type:'REGRESSION',description:'frozen candidate history',members:[{sampleId:'sample-a',versionNo:3}]});pending.resolve(row('dataset-a',8) as never);await save;expect(vm.selected.draftRevision).toBe(8);expect(getDataset).toHaveBeenCalledExactlyOnceWith('dataset-a');expect(vm.busy).toBe(false);
 });
 it('allows authorized create without detail permission and keeps only receipt metadata',async()=>{
  state.permissions![detail]=false;await mount();vm.open=false;fillNew();vi.mocked(createDataset).mockResolvedValueOnce(row('created',1));await vm.save();expect(createDataset).toHaveBeenCalledExactlyOnceWith('new private dataset',{schemaVersion:'iqc-dataset-draft-v1',type:'BASIC',description:'',members:[{sampleId:'sample-new',versionNo:4}]});
  expect(getDataset).not.toHaveBeenCalled();expect(vm.selected.id).toBe('created');privateCopiesGone();expect(vm.reloadRequired).toBe(true);expect(vm.editable).toBe(false);expect(vm.busy).toBe(false);
 });
 it('retains only receipt metadata after confirmed save whose reread fails',async()=>{
  await mount();vi.mocked(updateDataset).mockResolvedValueOnce(row('dataset-a',8));vi.mocked(getDataset).mockRejectedValueOnce(new Error('read failed'));await vm.save();privateCopiesGone();expect(vm.selected.draftRevision).toBe(8);expect(vm.reloadRequired).toBe(true);expect(vm.editable).toBe(false);expect(message.warning).toHaveBeenCalledWith('草稿已保存，但重新读取失败。请重新加载，勿重复提交。');
 });
 it('discards a late detail and its finally after authorization changes and a fresh read starts',async()=>{
  await mount();const old=deferred(),fresh=deferred();vi.mocked(getDataset).mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);const first=vm.edit(row());state.permissions![detail]=false;state.permissions![detail]=true;const second=vm.edit(row('dataset-b'));old.resolve(row() as never);await first;expect(vm.busy).toBe(true);expect(vm.selected.id).toBe('dataset-b');privateCopiesGone();fresh.resolve(row('dataset-b') as never);await second;expect(vm.busy).toBe(false);expect(vm.name).toBe('private dataset-b');
 });
 for(const operation of ['update','create','availability'])for(const outcome of ['success','failure']){
  const permission=`iqc:dataset:${operation==='create'?'manage':operation}`;
  it(`${operation}: old ${outcome} cannot overwrite or unlock a newer read`,async()=>{
   await mount();const pending=deferred(),fresh=deferred();const api=operation==='update'?updateDataset:operation==='create'?createDataset:setDatasetAvailability;
   if(operation==='create'){vm.open=false;fillNew();}vi.mocked(api).mockReturnValueOnce(pending.promise);const save=operation==='availability'?vm.availability(row()):vm.save();expect(api).toHaveBeenCalledTimes(1);
   state.permissions![permission]=false;state.permissions![permission]=true;vi.mocked(getDataset).mockReturnValueOnce(fresh.promise);const read=vm.edit(row('dataset-b'));if(outcome==='success')pending.resolve(row('old-receipt',9) as never);else pending.reject(new Error('old failed'));await save;
   expect(vm.busy).toBe(true);expect(vm.selected.id).toBe('dataset-b');expect(message.success).not.toHaveBeenCalled();expect(message.error).not.toHaveBeenCalled();expect(message.warning).not.toHaveBeenCalled();expect(listDatasets).not.toHaveBeenCalled();expect(getDataset).toHaveBeenCalledTimes(1);
   fresh.resolve(row('dataset-b') as never);await read;expect(vm.busy).toBe(false);expect(vm.name).toBe('private dataset-b');
  });
 }
 it('preserves the private editor across unrelated grant changes',async()=>{await mount();vm.name='unsaved name';vm.draft.description='unsaved description';state.permissions!['unrelated:grant']=true;await flush();expect(vm.name).toBe('unsaved name');expect(vm.draft.description).toBe('unsaved description');expect(vm.open).toBe(true);expect(getDataset).not.toHaveBeenCalled();});
 it.each(['success','failure'])('clears private copies and ignores pending %s save after unmount',async(outcome)=>{
  await mount();const pending=deferred();vi.mocked(updateDataset).mockReturnValueOnce(pending.promise);const save=vm.save();app!.unmount();app=undefined;if(outcome==='success')pending.resolve(row('old') as never);else pending.reject(new Error('late'));await save;privateCopiesGone();expect(message.success).not.toHaveBeenCalled();expect(message.error).not.toHaveBeenCalled();expect(getDataset).not.toHaveBeenCalled();expect(listDatasets).not.toHaveBeenCalled();
 });
});
