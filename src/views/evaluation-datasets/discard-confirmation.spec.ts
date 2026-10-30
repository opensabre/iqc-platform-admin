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
function ask(action:string){vm.name='unsaved initial name';vm[action]();expect(Modal.confirm).toHaveBeenCalledTimes(1);return vi.mocked(Modal.confirm).mock.calls[0][0].onOk! as ()=>unknown;}
function preserved(action:string){expect(vm.open).toBe(true);expect(getDataset).not.toHaveBeenCalled();if(action==='close')expect(vm.selected).toBeDefined();}
describe('dataset discard confirmation belongs to original edits',()=>{
 for(const action of ['close','reload']){
  it(`${action}: accepts a valid unchanged confirmation`,async()=>{
   await mount();await ask(action)();expect(vm.busy).toBe(false);
   if(action==='close'){expect(vm.open).toBe(false);expect(vm.selected).toBeUndefined();expect(vm.name).toBe('');expect(vm.draft.members).toEqual([]);expect(getDataset).not.toHaveBeenCalled();}
   else{expect(getDataset).toHaveBeenCalledExactlyOnceWith('dataset-a');expect(vm.open).toBe(true);expect(vm.name).toBe('private dataset-a');expect(vm.draft.members).toEqual([{sampleId:'sample-a',versionNo:3}]);}
  });
  for(const edit of ['name','description','member','name restored','member restored'])it(`${action}: rejects confirmation after ${edit} changes`,async()=>{
   await mount();const accept=ask(action);
   if(edit==='name')vm.name='later draft';if(edit==='description')vm.draft.description='later description';if(edit==='member')vm.draft.members.push({sampleId:'later-sample',versionNo:5});
   if(edit==='name restored'){vm.name='changed then reverted';vm.name='unsaved initial name';}
   if(edit==='member restored'){vm.draft.members.push({sampleId:'temporary',versionNo:2});vm.draft.members.pop();}
   const snapshot=JSON.stringify([vm.name,vm.draft]);await accept();preserved(action);expect(JSON.stringify([vm.name,vm.draft])).toBe(snapshot);
  });
  it(`${action}: does not act on a later editor for another asset`,async()=>{
   await mount();const accept=ask(action);vi.mocked(getDataset).mockResolvedValueOnce(row('dataset-b',9));await vm.edit(row('dataset-b',9));vi.mocked(getDataset).mockClear();vm.name='later unsaved name';await accept();preserved(action);expect(vm.selected.id).toBe('dataset-b');expect(vm.name).toBe('later unsaved name');
  });
  it(`${action}: rejects the original detail generation even when the identity matches`,async()=>{
   await mount();const accept=ask(action);vm.reset();vm.populate(row());vm.open=true;vm.name='new instance unsaved';await accept();preserved(action);expect(vm.name).toBe('new instance unsaved');
  });
  for(const permission of [detail,full,pii])it(`${action}: rejects old confirmation after ${permission} revoke and restore`,async()=>{
   await mount();const accept=ask(action);state.permissions![permission]=false;state.permissions![permission]=true;vi.mocked(getDataset).mockResolvedValueOnce(row());await vm.edit(row());vi.mocked(getDataset).mockClear();vm.name='new authorization draft';await accept();preserved(action);expect(vm.name).toBe('new authorization draft');
  });
  it(`${action}: rejects a confirmation after a write permission generation changes`,async()=>{
   await mount();const accept=ask(action);state.permissions!['iqc:dataset:update']=false;state.permissions!['iqc:dataset:update']=true;await accept();preserved(action);expect(vm.name).toBe('unsaved initial name');
  });
  it(`${action}: preserves valid confirmation on unrelated grant change`,async()=>{
   await mount();const accept=ask(action);state.permissions!['unrelated:grant']=true;await flush();await accept();if(action==='close')expect(vm.open).toBe(false);else expect(getDataset).toHaveBeenCalledExactlyOnceWith('dataset-a');
  });
  it(`${action}: rechecks busy at acceptance and leaves the editor intact`,async()=>{await mount();const accept=ask(action);vm.busy=true;await accept();preserved(action);expect(vm.busy).toBe(true);});
  it(`${action}: ignores the pending confirmation after unmount`,async()=>{
   await mount();const accept=ask(action);app!.unmount();app=undefined;await accept();expect(getDataset).not.toHaveBeenCalled();expect(vm.selected).toBeUndefined();expect(vm.name).toBe('');
  });
 }
 it('closes a clean editor directly without a confirmation',async()=>{await mount();vm.close();expect(Modal.confirm).not.toHaveBeenCalled();expect(vm.open).toBe(false);expect(vm.selected).toBeUndefined();});
});
