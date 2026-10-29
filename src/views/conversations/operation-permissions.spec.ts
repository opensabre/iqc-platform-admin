import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createApp,defineComponent,h,nextTick,reactive,type App,type Component} from 'vue';
import Upload from './index.vue';
import Archive from './list.vue';
import Statistics from './api.vue';
import Detail from '@/components/ConversationDetailDrawer.vue';
const api=vi.hoisted(()=>({batch:vi.fn(),zip:vi.fn(),list:vi.fn(),get:vi.fn(),stats:vi.fn(),success:vi.fn(),error:vi.fn(),warning:vi.fn()}));
vi.mock('@/api/conversations',async original=>({...await original<typeof import('@/api/conversations')>(),batchImportConversations:api.batch,importConversationZip:api.zip,listConversations:api.list,getConversation:api.get,getApiConversationStats:api.stats}));
vi.mock('ant-design-vue',()=>({message:{success:api.success,error:api.error,warning:api.warning}}));
vi.mock('@/api/dictionaries',()=>({getCachedDictionaries:vi.fn().mockResolvedValue({}),dictionaryLabel:(_items:any[],value:string)=>value}));
vi.mock('@/utils/clipboard',()=>({copyToClipboard:vi.fn()}));
vi.mock('@/components/ConversationAudioPanel.vue',()=>({default:{render:()=>null}}));
vi.mock('vue-router',()=>({useRoute:()=>({query:{}})}));
const access=reactive({codes:[] as string[]});
vi.mock('@/composables/permission',()=>({usePermission:()=>({can:(code:string)=>access.codes.includes(code)})}));
let app:App|undefined,host:HTMLDivElement,vm:any;
const receipt={batchNo:'batch',totalCount:1,successCount:1};
const preview={conversation:{id:'conversation',messageCount:1},messages:[],privacy:{canReadFull:true,canReadPii:true,contentLimited:true}};
async function settle(){for(let i=0;i<12;i++){await Promise.resolve();await nextTick();}}
function pending(){let resolve!:(value:any)=>void;const promise=new Promise<any>(done=>resolve=done);return {promise,resolve};}
async function mount(component:Component,props:Record<string,unknown>={}){
 host=document.createElement('div');document.body.append(host);app=createApp(component,props);app.config.warnHandler=()=>{};
 const pass=defineComponent({setup:(_,{slots})=>()=>h('div',slots.default?.())});
 for(const name of ['ARow','ACol','ACard','AAlert','AForm','AFormItem','AInput','ASelect','ASelectOption','ATextarea','ATabs','ATabPane','AUpload','AUploadDragger','ATag','ADivider','ASpace','ATooltip','ATypographyText','ATable','ASteps','ADatePicker','ARangePicker','ADescriptions','ADescriptionsItem','ADrawer','ASpin','AAvatar','AEmpty','APagination'])app.component(name,pass);
 app.component('ATableColumn',defineComponent({render:()=>null}));
 app.component('AButton',defineComponent({setup:(_,{slots,attrs})=>()=>h('button',attrs,slots.default?.())}));
 app.component('AStatistic',defineComponent({props:['value'],setup:p=>()=>h('output',String(p.value))}));
 app.mount(host);vm=(app as any)._instance.setupState;await settle();
}
beforeEach(()=>{vi.clearAllMocks();access.codes=[];api.batch.mockResolvedValue(receipt);api.zip.mockResolvedValue(receipt);api.list.mockResolvedValue({records:[{id:'conversation'}],total:1});api.get.mockResolvedValue(preview);api.stats.mockResolvedValue({conversationCount:3,messageCount:10,batchCount:1,externalIdCount:2});});
afterEach(()=>{app?.unmount();app=undefined;host?.remove();});
describe('processed conversation import operation permissions',()=>{
 it('old single upload cannot start batch TXT or ZIP import',async()=>{
  access.codes=['iqc:conversation:upload'];await mount(Upload);vm.pendingFiles=[new File(['processed'],'one.txt')];vm.zipFile=new File(['processed'],'one.zip');await vm.startBatchImport();await vm.startZipImport();expect(api.batch).not.toHaveBeenCalled();expect(api.zip).not.toHaveBeenCalled();
 });
 for(const kind of ['batch','zip'] as const){
  const code=kind==='batch'?'iqc:conversation:batch-upload':'iqc:conversation:zip-upload';
  it(`${kind} grants only its own import endpoint`,async()=>{
   access.codes=[code];await mount(Upload);vm.pendingFiles=[new File(['processed'],'one.txt')];vm.zipFile=new File(['processed'],'one.zip');await vm.startBatchImport();await vm.startZipImport();expect(api[kind]).toHaveBeenCalledOnce();expect(kind==='batch'?api.zip:api.batch).not.toHaveBeenCalled();
  });
  for(const ending of ['revoke','unmount'] as const){
   it(`${kind} discards its late receipt after ${ending}`,async()=>{
    access.codes=[code];await mount(Upload);vm.pendingFiles=[new File(['processed'],'one.txt')];vm.zipFile=new File(['processed'],'one.zip');const slow=pending();api[kind].mockReturnValueOnce(slow.promise);const request=kind==='batch'?vm.startBatchImport():vm.startZipImport();expect(api[kind]).toHaveBeenCalledOnce();
    if(ending==='revoke'){access.codes=[];await settle();}else{app!.unmount();app=undefined;}slow.resolve(receipt);await request;expect(vm.latestBatch).toBeUndefined();expect(api.success).not.toHaveBeenCalled();
   });
  }
 }
 it('captures the selected file array and business metadata at request time',async()=>{
  access.codes=['iqc:conversation:batch-upload'];await mount(Upload);const original=new File(['processed'],'one.txt');vm.pendingFiles=[original];vm.metadata={channel:'WEB',employeeDepartmentId:' department ',startedTime:'2026-10-05T10:00:00',endedTime:'2026-10-05T11:00:00'};vm.complaintChoice='NO';vm.businessFieldsText='{"amount":0,"confirmed":false}';
  const slow=pending();api.batch.mockReturnValueOnce(slow.promise);const request=vm.startBatchImport();vm.pendingFiles.push(new File(['other'],'two.txt'));vm.metadata.channel='PHONE';
  expect(api.batch).toHaveBeenCalledWith([original],expect.objectContaining({channel:'WEB',employeeDepartmentId:'department',complaint:false,businessFields:{amount:0,confirmed:false}}));slow.resolve(receipt);await request;
 });
 for(const bad of [
  {file:'one.wav'}, {start:'2026-02-30T10:00:00'}, {start:'2026-10-05T11:00:00',end:'2026-10-05T10:00:00'},
  {fields:'[]'}, {fields:'{"nested":{}}'}, {fields:'{"1invalid":true}'},
 ]){
  it(`retains metadata and file validation ${JSON.stringify(bad)}`,async()=>{
   access.codes=['iqc:conversation:batch-upload'];await mount(Upload);vm.pendingFiles=[new File(['processed'],bad.file||'one.txt')];vm.metadata={channel:'WEB',startedTime:bad.start,endedTime:bad.end};vm.businessFieldsText=bad.fields||'';await vm.startBatchImport();expect(api.batch).not.toHaveBeenCalled();expect(api.error).toHaveBeenCalledOnce();
  });
 }
});
describe('conversation archive and detail permissions',()=>{
 it('list view cannot open the separately authorized detail drawer',async()=>{
  access.codes=['iqc:conversation:view'];await mount(Archive);expect(api.list).toHaveBeenCalledOnce();await vm.showDetail('conversation');expect(vm.detailOpen).toBe(false);expect(api.get).not.toHaveBeenCalled();
 });
 it('detail alone does not request the archive list',async()=>{
  access.codes=['iqc:conversation:detail:view'];await mount(Archive);expect(api.list).not.toHaveBeenCalled();await vm.showDetail('conversation');await settle();expect(api.get).toHaveBeenCalledExactlyOnceWith('conversation');
 });
 it('revoked list reads discard a late page',async()=>{
  access.codes=['iqc:conversation:view'];const slow=pending();api.list.mockReturnValueOnce(slow.promise);await mount(Archive);access.codes=[];await settle();slow.resolve({records:[{id:'private'}],total:1});await settle();expect(vm.conversations).toEqual([]);expect(vm.total).toBe(0);
 });
 it('preview requires the new detail permission',async()=>{
  access.codes=['iqc:conversation:view'];await mount(Detail,{open:true,conversationId:'conversation'});expect(api.get).not.toHaveBeenCalled();expect(vm.detail).toBeUndefined();
 });
 it('FULL and PII each require original base view plus their precise sensitive permission',async()=>{
  access.codes=['iqc:conversation:detail:view','iqc:sensitive:conversation:read','iqc:sensitive:pii:read'];await mount(Detail,{open:true,conversationId:'conversation'});await vm.loadDetail('conversation','FULL');await vm.loadDetail('conversation','PII');expect(api.get).toHaveBeenCalledOnce();
  access.codes.push('iqc:conversation:view');await settle();api.get.mockClear();await vm.loadDetail('conversation','FULL');await vm.loadDetail('conversation','PII');expect(api.get.mock.calls).toEqual([['conversation','FULL'],['conversation','PII']]);
 });
 it('sensitive permission changes return only to safe preview and discard a late full response',async()=>{
  access.codes=['iqc:conversation:detail:view','iqc:conversation:view','iqc:sensitive:conversation:read'];await mount(Detail,{open:true,conversationId:'conversation'});const slow=pending();api.get.mockReturnValueOnce(slow.promise);const request=vm.loadDetail('conversation','FULL');access.codes=['iqc:conversation:detail:view','iqc:conversation:view'];await settle();expect(api.get).toHaveBeenLastCalledWith('conversation');slow.resolve({...preview,messages:[{id:'private',content:'full body'}]});await request;expect(vm.detail.messages).toEqual([]);
 });
 it('server privacy flags keep FULL/PII buttons hidden even with local permissions',async()=>{
  access.codes=['iqc:conversation:detail:view','iqc:conversation:view','iqc:sensitive:conversation:read','iqc:sensitive:pii:read'];api.get.mockResolvedValue({...preview,privacy:{...preview.privacy,canReadFull:false,canReadPii:false}});await mount(Detail,{open:true,conversationId:'conversation'});expect(host.textContent).not.toContain('查看完整脱敏会话');expect(host.textContent).not.toContain('按授权查看PII');
 });
});
describe('conversation API statistics permissions and unknown values',()=>{
 it('old conversation view neither fetches nor displays protected statistics',async()=>{
  access.codes=['iqc:conversation:view'];await mount(Statistics);expect(api.stats).not.toHaveBeenCalled();expect(host.querySelectorAll('output')).toHaveLength(0);expect(vm.stats).toBeUndefined();
 });
 it('authorized statistics remain unknown while the response is pending',async()=>{
  access.codes=['iqc:conversation:api-stats:view'];const slow=pending();api.stats.mockReturnValueOnce(slow.promise);await mount(Statistics);expect([...host.querySelectorAll('output')].map(x=>x.textContent)).toEqual(['—','—','—','—']);slow.resolve({conversationCount:0,messageCount:0,batchCount:0,externalIdCount:0});await settle();expect([...host.querySelectorAll('output')].map(x=>x.textContent)).toEqual(['0','0','0','0']);
 });
 it('the exact statistics grant renders known counts',async()=>{
  access.codes=['iqc:conversation:api-stats:view'];await mount(Statistics);expect(api.stats).toHaveBeenCalledOnce();expect([...host.querySelectorAll('output')].map(x=>x.textContent)).toEqual(['3','10','1','2']);
 });
 it('failed statistics retain unknown values',async()=>{
  access.codes=['iqc:conversation:api-stats:view'];api.stats.mockRejectedValueOnce(new Error('offline'));await mount(Statistics);expect(api.error).toHaveBeenCalledWith('接口入库统计加载失败');expect([...host.querySelectorAll('output')].map(x=>x.textContent)).toEqual(['—','—','—','—']);
 });
 it('revocation discards in-flight statistics',async()=>{
  access.codes=['iqc:conversation:api-stats:view'];const slow=pending();api.stats.mockReturnValueOnce(slow.promise);await mount(Statistics);access.codes=[];await settle();slow.resolve({conversationCount:99});await settle();expect(vm.stats).toBeUndefined();
 });
});
