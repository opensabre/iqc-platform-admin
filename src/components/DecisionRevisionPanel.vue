<script setup lang="ts">
import {computed,ref,watch} from 'vue';
import {message} from 'ant-design-vue';
import {usePermission} from '@/composables/permission';
import {listPipelines,listPipelineVersions,listDecisionRevisions,recalculatePolicy,type PublishedPipeline,type PipelineVersion,type DecisionRevision,type RecalculatePolicy} from '@/api/pipeline-policies';
import {traceJson} from './route-execution-trace';
const props=defineProps<{resultId:string;taskStatus:string}>();
const {can}=usePermission();
const history=ref<DecisionRevision[]>([]),assets=ref<PublishedPipeline[]>([]),versions=ref<PipelineVersion[]>([]);
const loading=ref(false),assetLoading=ref(false),versionLoading=ref(false),busy=ref(false);
const error=ref(''),assetError=ref(''),commandError=ref('');
const current=ref(1),total=ref(0),pipelineId=ref<string>(),version=ref<number>(),reason=ref('');
const command=ref<{id:string;body:RecalculatePolicy}>();
let generation=0,assetGeneration=0,versionGeneration=0;
const terminal=computed(()=>['SUCCEEDED','PARTIAL_FAILED','FAILED','CANCELLED'].includes(props.taskStatus));
const canCreate=computed(()=>can('iqc:decision:recalculate')&&can('iqc:pipeline:view')&&can('iqc:pipeline:versions:view'));
const assetOptions=computed(()=>assets.value.filter(a=>a.activePublishedVersion!=null).map(a=>({value:a.id,label:`${a.name} (${a.code})`,disabled:a.status!=='ACTIVE'})));
const versionOptions=computed(()=>versions.value.map(v=>({value:v.versionNo,label:`发布版本 v${v.versionNo}`})));
function pretty(raw:string) {try{return traceJson(JSON.parse(raw));}catch{return '记录格式无效，无法展示';}}
async function refresh() {
 if(!can('iqc:decision:history:view'))return;
 const ticket=++generation,id=props.resultId;loading.value=true;error.value='';
 try {const rows=await listDecisionRevisions(id);if(ticket===generation)history.value=rows;}
 catch {if(ticket===generation)error.value='重算历史加载失败，请刷新重试。';}
 finally {if(ticket===generation)loading.value=false;}
}
async function loadAssets(page=1) {
 if(!canCreate.value||busy.value||command.value)return;
 if(page!==current.value)pipelineId.value=undefined;
 const ticket=++assetGeneration;assetLoading.value=true;assetError.value='';current.value=page;
 try {const data=await listPipelines(page,20);if(ticket===assetGeneration){assets.value=data.records;total.value=data.total;}}
 catch {if(ticket===assetGeneration){assets.value=[];assetError.value='已发布流水线加载失败，请重试。';}}
 finally {if(ticket===assetGeneration)assetLoading.value=false;}
}
watch(pipelineId,async id=>{
 const ticket=++versionGeneration;versions.value=[];version.value=undefined;assetError.value='';
 if(!id){versionLoading.value=false;return;}
 versionLoading.value=true;
 try {const rows=await listPipelineVersions(id);if(ticket===versionGeneration)versions.value=rows;}
 catch {if(ticket===versionGeneration)assetError.value='发布版本加载失败，请重新选择流水线。';}
 finally {if(ticket===versionGeneration)versionLoading.value=false;}
});
async function execute() {
 if(!command.value||busy.value||!canCreate.value||!terminal.value)return;
 const pending=command.value,id=pending.id;busy.value=true;commandError.value='';
 try {
  await recalculatePolicy(id,pending.body);
  if(props.resultId!==id||command.value!==pending)return;
  command.value=undefined;reason.value='';message.success('已保存独立重算记录');await refresh();
 }catch {if(props.resultId===id&&command.value===pending)commandError.value='请求未确认成功，请用原请求重试。';}
 finally {if(props.resultId===id)busy.value=false;}
}
function submit() {
 if(!pipelineId.value||!version.value||!reason.value.trim()||reason.value.trim().length>1000||command.value||busy.value||!terminal.value)return;
 command.value={id:props.resultId,body:{targetPipelineId:pipelineId.value,targetVersion:version.value,requestId:crypto.randomUUID(),reason:reason.value.trim()}};
 void execute();
}
watch(()=>[props.resultId,can('iqc:decision:history:view'),canCreate.value] as const,()=>{
 ++generation;++assetGeneration;++versionGeneration;
 history.value=[];assets.value=[];versions.value=[];command.value=undefined;pipelineId.value=undefined;version.value=undefined;reason.value='';
 error.value='';assetError.value='';commandError.value='';loading.value=false;assetLoading.value=false;versionLoading.value=false;busy.value=false;current.value=1;total.value=0;
 void refresh();void loadAssets();
},{immediate:true});
</script>
<template>
<section v-if="can('iqc:decision:history:view') || can('iqc:decision:recalculate')" class="decision-revisions"><h3>政策重算</h3>
<p>基于本次保存的检测事实重新融合和评分。原始机器结果、人工复核和报表结论保持独立；缺少的事实会保留为待定。</p>
<a-alert v-if="!terminal" type="info" message="任务结束后可发起政策重算"/>
<a-form v-if="canCreate" layout="vertical" @finish="submit">
<a-form-item label="目标已发布流水线"><a-select v-model:value="pipelineId" :options="assetOptions" :loading="assetLoading" :disabled="busy || !!command || !terminal" placeholder="选择流水线" show-search option-filter-prop="label" allow-clear/></a-form-item>
<a-pagination v-if="total>20" :current="current" :total="total" :page-size="20" :show-size-changer="false" size="small" @change="loadAssets"/>
<a-button size="small" :disabled="assetLoading || busy || !!command" @click="loadAssets(current)">刷新流水线</a-button>
<a-form-item label="发布版本"><a-select v-model:value="version" :options="versionOptions" :loading="versionLoading" :disabled="!pipelineId || busy || !!command || !terminal" placeholder="选择发布版本"/></a-form-item>
<a-form-item label="重算原因"><a-textarea v-model:value="reason" :maxlength="1000" :rows="2" :disabled="busy || !!command || !terminal" show-count/></a-form-item>
<a-alert v-if="assetError" type="error" :message="assetError" show-icon/>
<a-button type="primary" html-type="submit" :loading="busy" :disabled="!pipelineId || !version || !reason.trim() || !!command || !terminal">创建重算记录</a-button>
<a-alert v-if="commandError" type="warning" :message="commandError" show-icon/>
<a-button v-if="command" :loading="busy" :disabled="busy || !terminal" @click="execute">使用原请求重试</a-button>
</a-form>
<a-alert v-else-if="can('iqc:decision:recalculate')" type="info" message="选择政策版本需要流水线目录及版本查看权限"/>
<template v-if="can('iqc:decision:history:view')"><h4>重算历史（最近100条）</h4><a-button size="small" :loading="loading" @click="refresh">刷新历史</a-button><a-alert v-if="error" type="error" :message="error" show-icon/>
<a-empty v-if="!loading && !error && !history.length" description="暂无政策重算记录"/>
<a-collapse><a-collapse-panel v-for="revision in history" :key="revision.id" :header="`${revision.createdTime || '时间未记录'} · ${revision.createdBy || '操作人未记录'}`">
<p>{{revision.reason}}</p><p>原始结果：{{revision.sourceResultId}} · 源摘要：{{revision.sourceHash}}</p>
<details><summary>原始评分、重算评分和事实融合</summary><pre>{{pretty(revision.projectionJson)}}</pre></details><details><summary>冻结政策版本</summary><pre>{{pretty(revision.targetPolicyJson)}}</pre></details>
</a-collapse-panel></a-collapse></template>
</section>
</template>
<style scoped>.decision-revisions{margin:20px 0}.decision-revisions p{overflow-wrap:anywhere}.decision-revisions pre{max-height:300px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}.decision-revisions .ant-alert{margin:8px 0}.decision-revisions .ant-form{max-width:640px;margin:12px 0}</style>
