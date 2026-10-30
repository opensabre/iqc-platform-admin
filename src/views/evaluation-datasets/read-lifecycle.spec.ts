import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createApp,defineComponent,h,nextTick,reactive,type App} from 'vue';
import {Modal,message} from 'ant-design-vue';
import {freezeDataset,getDataset,listDatasets,listGoldVersions,listDatasetVersions,getDatasetVersion,type Dataset} from '@/api/evaluation';
import {listSamples} from '@/api/quality';
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
beforeEach(()=>{vi.resetAllMocks();state.permissions=reactive({[freeze]:true,[detail]:true,[full]:true,[pii]:true,'iqc:dataset:view':true,'iqc:sample:view':true,'iqc:gold:versions:view':true,'iqc:dataset:versions:view':true,'iqc:dataset:version:view':true});vi.mocked(listDatasets).mockResolvedValue({records:[],total:0} as never);vi.mocked(getDataset).mockResolvedValue(row());vi.mocked(freezeDataset).mockResolvedValue({id:'v1'} as never);});
afterEach(()=>{app?.unmount();app=undefined;host?.remove();});
const reads=[
 {label:'catalog',permission:'iqc:dataset:view',api:listDatasets,start:()=>vm.refresh(2),reply:{records:[row()],total:1},value:()=>vm.rows,empty:[],total:()=>vm.total},
 {label:'candidates',permission:'iqc:sample:view',api:listSamples,start:()=>vm.loadCandidates(),reply:[{id:'sample-a',name:'candidate'}],value:()=>vm.candidates,empty:[]},
 {label:'approved Gold versions',permission:'iqc:gold:versions:view',api:listGoldVersions,start:()=>vm.candidateVersions('sample-a',2),reply:{records:[{id:'gold-v',sampleId:'sample-a',versionNo:3,decision:'APPROVED'}],total:1},value:()=>vm.approved,empty:[],total:()=>vm.candidateTotal},
 {label:'dataset history',permission:'iqc:dataset:versions:view',api:listDatasetVersions,start:()=>vm.loadHistory(2),reply:{records:[{id:'dataset-v',datasetId:'dataset-a',versionNo:2}],total:1},value:()=>vm.history,empty:[],total:()=>vm.historyTotal},
 {label:'dataset snapshot',permission:'iqc:dataset:version:view',api:getDatasetVersion,start:()=>vm.viewVersion({versionNo:2}),reply:{id:'dataset-v',datasetId:'dataset-a',versionNo:2,snapshotJson:'private canonical snapshot'},value:()=>vm.snapshot,empty:''},
];
function answer(api:typeof reads[number]['api'],value:unknown){vi.mocked(api).mockResolvedValueOnce(value as never);}
describe('dataset exact read resources and response ownership',()=>{
 for(const read of reads){
  it(`${read.label}: refuses to borrow another resource permission`,async()=>{
   await mount();state.permissions![read.permission]=false;await read.start();expect(read.api).not.toHaveBeenCalled();
  });
  it(`${read.label}: rejects revoke/restore late data and permits a fresh explicit read`,async()=>{
   await mount();const old=deferred();vi.mocked(read.api).mockReturnValueOnce(old.promise);const pending=read.start();state.permissions![read.permission]=false;state.permissions![read.permission]=true;
   old.resolve(read.reply as never);await pending;expect(read.value()).toEqual(read.empty);expect(read.api).toHaveBeenCalledTimes(1);
   answer(read.api,read.reply);await read.start();expect(read.value()).not.toEqual(read.empty);expect(read.api).toHaveBeenCalledTimes(2);
  });
  it(`${read.label}: clears loaded copies while preserving frozen member references on own read revoke`,async()=>{
   await mount();answer(read.api,read.reply);await read.start();expect(read.value()).not.toEqual(read.empty);const members=JSON.stringify(vm.draft.members);
   state.permissions![read.permission]=false;expect(read.value()).toEqual(read.empty);if(read.total)expect(read.total()).toBe(0);expect(JSON.stringify(vm.draft.members)).toBe(members);expect(read.api).toHaveBeenCalledTimes(1);
  });
  for(const permission of [full,pii])it(`${read.label}: rejects an old response after ${permission} changes`,async()=>{
   await mount();const old=deferred();vi.mocked(read.api).mockReturnValueOnce(old.promise);const pending=read.start();state.permissions![permission]=false;state.permissions![permission]=true;old.resolve(read.reply as never);await pending;expect(read.value()).toEqual(read.empty);expect(read.api).toHaveBeenCalledTimes(1);
  });
  it(`${read.label}: does not adopt or reissue reads after unmount`,async()=>{
   await mount();const old=deferred();vi.mocked(read.api).mockReturnValueOnce(old.promise);const pending=read.start();app!.unmount();app=undefined;old.resolve(read.reply as never);await pending;expect(read.value()).toEqual(read.empty);await read.start();expect(read.api).toHaveBeenCalledTimes(1);
  });
 }
 it('keeps all loaded reads and the unsaved editor across unrelated permission changes',async()=>{
  await mount();for(const read of reads){answer(read.api,read.reply);await read.start();}vm.name='unsaved dataset name';vm.draft.description='unsaved description';const before=reads.map(read=>JSON.stringify(read.value()));
  state.permissions!['unrelated:write']=true;await flush();expect(reads.map(read=>JSON.stringify(read.value()))).toEqual(before);expect(vm.name).toBe('unsaved dataset name');expect(vm.draft.description).toBe('unsaved description');for(const read of reads)expect(read.api).toHaveBeenCalledTimes(1);
 });
 it('reads only APPROVED versions and retains exact page and sample identity',async()=>{
  await mount();vi.mocked(listGoldVersions).mockResolvedValueOnce({records:[{id:'a',decision:'APPROVED',versionNo:3},{id:'b',decision:'REJECTED',versionNo:4}],total:2} as never);await vm.candidateVersions('sample-a',3);
  expect(listGoldVersions).toHaveBeenCalledExactlyOnceWith('sample-a',3);expect(vm.approved.map((r:any)=>r.versionNo)).toEqual([3]);expect(vm.candidateTotal).toBe(2);
 });
 it('ignores approved versions returned for a previous candidate',async()=>{
  await mount();const old=deferred();vi.mocked(listGoldVersions).mockReturnValueOnce(old.promise);const pending=vm.candidateVersions('sample-a');vm.candidateId='sample-b';old.resolve({records:[{id:'old',decision:'APPROVED'}],total:1} as never);await pending;expect(vm.approved).toEqual([]);expect(vm.candidateTotal).toBe(0);
 });
 it.each(['history','snapshot'])('ignores %s returned for a different dataset identity',async(kind)=>{
  await mount();const old=deferred();if(kind==='history')vi.mocked(listDatasetVersions).mockReturnValueOnce(old.promise);else vi.mocked(getDatasetVersion).mockReturnValueOnce(old.promise);
  const pending=kind==='history'?vm.loadHistory():vm.viewVersion({versionNo:2});vm.populate(row('dataset-b'));old.resolve((kind==='history'?{records:[{id:'old'}],total:1}:{snapshotJson:'old private dataset'}) as never);await pending;expect(vm.history).toEqual([]);expect(vm.snapshot).toBe('');
 });
 it('shows the server projection without treating it as the original snapshot',async()=>{
  await mount();vi.mocked(getDatasetVersion).mockResolvedValueOnce({snapshotJson:'must not disclose',privacy:{policyVersion:'iqc-dataset-read-v1',canonicalPayloadVisible:false,canReadFull:false,canReadPii:false,members:[{sampleId:'sample-a',versionNo:3}],previewState:'RESTRICTED'}} as never);
  await vm.viewVersion({versionNo:2});expect(vm.snapshot).not.toContain('must not disclose');expect(vm.snapshot).toContain('sample-a');expect(vm.snapshotNotice).toContain('受限展示');expect(getDatasetVersion).toHaveBeenCalledExactlyOnceWith('dataset-a',2);
 });
});
