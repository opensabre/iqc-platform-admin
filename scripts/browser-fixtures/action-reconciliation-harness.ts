/** Manual browser fixture only: local API responses and permissions never establish real authorization. */
import {createApp,h,ref,reactive} from 'vue';
import {createPinia} from 'pinia';
import AntDesign from 'ant-design-vue';
import 'ant-design-vue/dist/reset.css';
import ActionHistoryPanel from '../../src/components/ActionHistoryPanel.vue';
import {useAuthStore} from '../../src/stores/auth';
import http from '../../src/api/http';
const pinia=createPinia(),auth=useAuthStore(pinia);
auth.permissionsReady=true;auth.permissions=['iqc:action:history:view','iqc:action:reconcile'];
const result=ref('fixture-result-1'),mode=ref('UNCONFIRMED');
const historyFixture=new URLSearchParams(location.search).has('history');
const journalDelay=ref(false);
const ledger=reactive({posts:0,body:null as unknown,completed:false,journalGets:0,journalCursor:null as string|null});
let releaseJournal:(()=>void)|undefined;
let release:(()=>void)|undefined;
http.defaults.adapter=async config=>{
 let data:unknown;
 if(config.method==='post'){
  ledger.posts++;ledger.body=JSON.parse(String(config.data));
  const actionId=config.url!.split('/').at(-2)!;
  const response=mode.value;
  await new Promise<void>(resolve=>{release=resolve;});
  if(response==='CONFIRMED')ledger.completed=true;
  data={id:actionId,state:response};
 }else{
  const row:import('../../src/api/action-history').ActionHistory={id:`action-${result.value}`,version:ledger.completed?4:3,actionId:'fixture-review',type:'CREATE_REVIEW',status:ledger.completed?'COMPLETE':'REQUIRES_RECONCILIATION',outcome:ledger.completed?'CONFIRMED_SUCCESS':'UNKNOWN',attemptCount:1,nextAttemptAtUtc:null,claimedAtUtc:'2026-10-11T00:00:00',settledAtUtc:null,evidenceReference:null,resultReference:null,errorCode:ledger.completed?null:'WORKER_CONFIRMATION_LOST'};
  if(historyFixture){row.version=Number(9223372036854775806n);row.status='COMPLETE';row.outcome='CONFIRMED_SUCCESS';row.attemptCount=2;row.errorCode=null;row.resultReference='browser-artifact';row.evidenceReference=`browser-proof-${result.value}-9223372036854775806`;}
  if(config.params?.includeHistory){
   ledger.journalGets++;ledger.journalCursor=config.params.beforeVersion??null;
   const start=config.params.beforeVersion?BigInt(config.params.beforeVersion)-1n:9223372036854775806n;
   const count=config.params.beforeVersion?3:50;
   const state={status:'COMPLETE',attemptCount:2,claimedAtUtc:null,settledAtUtc:null,nextAttemptAtUtc:null,outcome:'CONFIRMED_SUCCESS',evidenceReference:null as string|null,resultReference:'browser-artifact',errorCode:null};
   const events=Array.from({length:count},(_,i)=>{const version=(start-BigInt(i)).toString();return {version,previousVersion:(start-BigInt(i)-1n).toString(),state:{...state,evidenceReference:`browser-proof-${result.value}-${version}`},previousState:{...state,status:'WAITING_RETRY',outcome:'CONFIRMED_RETRYABLE_FAILURE',evidenceReference:'original failed proof'},actor:'fixture-owner',recordedAtUtc:'2026-10-11T01:00:00'};});
   const page={events,nextBeforeVersion:config.params.beforeVersion?null:events.at(-1)!.version,earlierHistoryUnavailable:!!config.params.beforeVersion};
   data=[{...row,history:page}];
   if(journalDelay.value)await new Promise<void>(resolve=>{releaseJournal=resolve;});
  }else data=[row];
 }
 return {config,data,status:200,statusText:'OK',headers:{'content-type':'application/json'}};
};
createApp({setup:()=>()=>h('main',{style:'padding:24px'},[
 h('h1','本地浏览器夹具：真实 Vue / Ant 组件'),h('p','接口为本地夹具，不代表登录、组织授权或生产动作链。'),
 h('button',{onClick:()=>auth.permissions=auth.permissions.includes('iqc:action:reconcile')?['iqc:action:history:view']:['iqc:action:history:view','iqc:action:reconcile']},'切换核对权限'),
 h('button',{onClick:()=>result.value='fixture-result-2'},'切换结果'),
 h('button',{onClick:()=>release?.()},'释放接口夹具'),
 h('select',{value:mode.value,onChange:(e:Event)=>mode.value=(e.target as HTMLSelectElement).value},[h('option','UNCONFIRMED'),h('option','CONFIRMED'),h('option','STALE_OBSERVATION')]),
 h('button',{onClick:()=>journalDelay.value=!journalDelay.value},'切换历史延迟'),
 h('button',{onClick:()=>releaseJournal?.()},'释放历史夹具'),
 h('button',{onClick:()=>auth.permissions=auth.permissions.includes('iqc:action:history:view')?[]:['iqc:action:history:view','iqc:action:reconcile']},'切换历史权限'),
 h('pre',{id:'fixture-ledger'},JSON.stringify(ledger)),
 h(ActionHistoryPanel,{resultId:result.value})
])}).use(pinia).use(AntDesign).mount('#app');
