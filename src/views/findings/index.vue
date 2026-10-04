<script setup lang="ts">
import {computed,onMounted,reactive,ref,watch} from 'vue';
import {message,Modal} from 'ant-design-vue';
import {usePermission} from '@/composables/permission';
import {listFindings,getFinding,createFinding,updateFinding,publishFinding,setFindingAvailability,listFindingVersions,type FindingCatalog,type FindingDefinition,type FindingVersion,type EvidenceType} from '@/api/findings';
const {can}=usePermission();
const records=ref<FindingCatalog[]>([]),total=ref(0),current=ref(1),loading=ref(false),busy=ref(false),error=ref('');
const open=ref(false),selected=ref<FindingCatalog>(),editorError=ref(''),historyError=ref(''),history=ref<FindingVersion[]>([]),historyLoading=ref(false),historyLoaded=ref(false);
const empty=():FindingDefinition=>({schemaVersion:'iqc-finding-definition-v1',code:'',name:'',category:'',description:'',valueType:'BOOLEAN',allowedValues:[],defaultSeverity:'NONE',evidenceRequired:false,evidenceTypes:[]});
const form=reactive<FindingDefinition>(empty());
const types=['BOOLEAN','STRING','NUMBER','ENUM','OBJECT'].map(value=>({value,label:{BOOLEAN:'布尔',STRING:'文本',NUMBER:'数值',ENUM:'枚举',OBJECT:'对象'}[value]}));
const severities=['NONE','LOW','MEDIUM','HIGH','CRITICAL'].map(value=>({value,label:{NONE:'无',LOW:'低',MEDIUM:'中',HIGH:'高',CRITICAL:'严重'}[value]}));
const evidenceOptions:Array<{value:EvidenceType;label:string}>=[{value:'CONVERSATION',label:'会话引文'},{value:'RULE_MATCH',label:'规则匹配依据'},{value:'METRIC',label:'指标'},{value:'KNOWLEDGE',label:'知识引用'},{value:'BUSINESS_FIELD',label:'业务字段'},{value:'EXTERNAL_RESULT',label:'外部结果'}];
const high=computed(()=>['HIGH','CRITICAL'].includes(form.defaultSeverity));
const editable=computed(()=>!busy.value&&!editorError.value&&(selected.value?can('iqc:finding:update'):can('iqc:finding:manage')));
function normalized(d:FindingDefinition) {return [d.code,d.name,d.category,d.description ?? '',d.valueType,d.allowedValues,d.defaultSeverity,d.evidenceRequired,[...d.evidenceTypes].sort()];}
const dirty=computed(()=>{
 if(!selected.value)return true;
 try {return JSON.stringify(normalized({...form,allowedValues:form.valueType==='ENUM'?[...form.allowedValues]:[]}))!==JSON.stringify(normalized(decode(selected.value)));}
 catch {return true;}
});
let listGeneration=0,detailGeneration=0,historyGeneration=0;
watch(high,value=>{if(value)form.evidenceRequired=true;});
function decode(row:FindingCatalog):FindingDefinition {
 const d=JSON.parse(row.draftConfigJson) as FindingDefinition;
 if(d.schemaVersion!=='iqc-finding-definition-v1'||d.code!==row.code||!types.some(t=>t.value===d.valueType)||!severities.some(t=>t.value===d.defaultSeverity)||typeof d.name!=='string'||typeof d.category!=='string'||!(d.description==null||typeof d.description==='string')||typeof d.evidenceRequired!=='boolean'||!Array.isArray(d.allowedValues)||!d.allowedValues.every(v=>typeof v==='string')||!Array.isArray(d.evidenceTypes)||!d.evidenceTypes.every(v=>evidenceOptions.some(o=>o.value===v)))throw Error();
 return d;
}
async function refresh(page=current.value) {
 if(!can('iqc:finding:view'))return;
 current.value=page;const ticket=++listGeneration;loading.value=true;error.value='';
 try {const data=await listFindings(page);if(ticket===listGeneration){records.value=data.records;total.value=data.total;}}
 catch {if(ticket===listGeneration){records.value=[];error.value='事实目录加载失败，请重试。';}}
 finally {if(ticket===listGeneration)loading.value=false;}
}
function create() {if(busy.value)return;++detailGeneration;++historyGeneration;selected.value=undefined;Object.assign(form,empty());history.value=[];historyLoaded.value=false;historyLoading.value=false;historyError.value='';editorError.value='';open.value=true;}
async function edit(row:FindingCatalog) {
 if(busy.value||!can('iqc:finding:detail:view'))return;
 const ticket=++detailGeneration;busy.value=true;editorError.value='';historyError.value='';history.value=[];historyLoaded.value=false;historyLoading.value=false;++historyGeneration;
 try {const data=await getFinding(row.id);if(ticket!==detailGeneration)return;selected.value=data;Object.assign(form,empty(),decode(data));open.value=true;}
 catch {message.error('事实定义加载失败或草稿格式无效，请刷新目录。');}
 finally {if(ticket===detailGeneration)busy.value=false;}
}
async function save() {
 if(!editable.value)return;
 const values=form.valueType==='ENUM'?[...form.allowedValues]:[];
 if(!/^[A-Z][A-Z0-9_]{1,63}$/.test(form.code)||!form.name.trim()||!form.category.trim()||values.length>100||values.some(v=>!v.trim()||v.length>256)||new Set(values).size!==values.length||form.valueType==='ENUM'&&!values.length||(form.evidenceRequired||high.value)&&!form.evidenceTypes.length){message.error('请检查稳定编码、名称、分类、枚举值和证据要求。');return;}
 const definition={...form,allowedValues:values,evidenceTypes:[...form.evidenceTypes],evidenceRequired:high.value||form.evidenceRequired};
 busy.value=true;
 try {selected.value=selected.value?await updateFinding(selected.value.id,selected.value.draftRevision,definition):await createFinding(definition);message.success('草稿已保存');await refresh();}
 catch {message.error('保存未成功。请保留编辑内容，并刷新核对草稿修订后再提交。');}
 finally {busy.value=false;}
}
function publish() {
 const row=selected.value;if(!row||busy.value||dirty.value||!can('iqc:finding:publish'))return;
 Modal.confirm({title:`发布 ${row.name} 的草稿修订 ${row.draftRevision}？`,content:'发布已保存的草稿，生成不可覆盖版本。',async onOk(){
  if(busy.value)return;busy.value=true;
  try {await publishFinding(row.id,row.draftRevision);selected.value=await getFinding(row.id);message.success('事实版本已发布');await refresh();if(historyLoaded.value)await loadHistory();}
  catch {message.error('发布未成功，请刷新核对修订、可用性和历史版本。');}
  finally {busy.value=false;}
 }});
}
function availability(row:FindingCatalog) {
 if(busy.value||!can('iqc:finding:availability'))return;
 const enabled=row.status!=='ACTIVE';Modal.confirm({title:`${enabled?'启用':'停用'} ${row.name}？`,content:enabled?'允许发布及执行引用此事实的任务。':'引用此事实的任务将在执行可用性检查时被阻止。',async onOk(){if(busy.value)return;busy.value=true;try{await setFindingAvailability(row.id,enabled);await refresh();if(selected.value?.id===row.id)selected.value=await getFinding(row.id);}catch{message.error('设置可用性失败，请刷新核对。');}finally{busy.value=false;}}});
}
async function loadHistory() {
 if(!selected.value||!can('iqc:finding:versions:view'))return;
 const id=selected.value.id,ticket=++historyGeneration;historyLoading.value=true;historyError.value='';
 try {const rows=await listFindingVersions(id);if(ticket===historyGeneration){history.value=rows;historyLoaded.value=true;}}
 catch {if(ticket===historyGeneration)historyError.value='版本历史加载失败，请重试。';}
 finally {if(ticket===historyGeneration)historyLoading.value=false;}
}
function reload() {
 const row=selected.value;if(!row||busy.value)return;
 if(dirty.value)Modal.confirm({title:'重新加载草稿？',content:'未保存的编辑内容将被替换。',onOk:()=>edit(row)});
 else void edit(row);
}
function pretty(raw:string) {try{return JSON.stringify(JSON.parse(raw),null,2);}catch{return '版本快照格式无效';}}
onMounted(()=>void refresh());
</script>
<template>
<section class="page-intro"><div><h2>事实语义目录</h2><p>定义跨引擎共用的事实编码、值类型和证据约束，发布后供流水线引用。</p></div><a-button v-if="can('iqc:finding:manage')" type="primary" :disabled="busy" @click="create">新建事实定义</a-button></section>
<a-alert v-if="error" type="error" :message="error" show-icon/><a-button :loading="loading" @click="refresh()">刷新目录</a-button>
<a-table :data-source="records" :loading="loading" row-key="id" :pagination="false" :scroll="{x:900}"><a-table-column title="稳定编码" data-index="code"/><a-table-column title="名称" data-index="name"/><a-table-column title="分类" data-index="category"/><a-table-column title="草稿修订" data-index="draftRevision"/><a-table-column title="发布版本"><template #default="{record}">{{record.activePublishedVersion==null?'未发布':`v${record.activePublishedVersion}`}}</template></a-table-column><a-table-column title="可用性" data-index="status"/><a-table-column title="操作"><template #default="{record}"><a-space><a-button v-if="can('iqc:finding:detail:view')" type="link" :disabled="busy" @click="edit(record)">查看 / 编辑</a-button><a-button v-if="can('iqc:finding:availability')" type="link" :disabled="busy" @click="availability(record)">{{record.status==='ACTIVE'?'停用':'启用'}}</a-button></a-space></template></a-table-column></a-table>
<a-pagination :current="current" :total="total" :page-size="20" :show-size-changer="false" @change="refresh"/>
<a-drawer v-model:open="open" :width="640" title="事实定义" :closable="!busy" :mask-closable="!busy" :keyboard="!busy">
<a-alert v-if="editorError" type="error" :message="editorError"/>
<p v-if="selected">稳定编码：{{selected.code}} · 草稿修订 {{selected.draftRevision}} · {{selected.activePublishedVersion==null?'未发布':`当前发布 v${selected.activePublishedVersion}`}}</p>
<a-form layout="vertical" @finish="save">
<a-form-item label="稳定编码"><a-input v-model:value="form.code" :maxlength="64" :disabled="!editable || !!selected" placeholder="如 CUSTOMER_COMPLAINT"/></a-form-item>
<a-form-item label="名称"><a-input v-model:value="form.name" :maxlength="100" :disabled="!editable"/></a-form-item>
<a-form-item label="分类"><a-input v-model:value="form.category" :maxlength="100" :disabled="!editable"/></a-form-item>
<a-form-item label="值类型"><a-select v-model:value="form.valueType" :options="types" :disabled="!editable || selected?.activePublishedVersion!=null"/></a-form-item>
<a-form-item v-if="form.valueType==='ENUM'" label="枚举值（输入后按回车，最多100个）"><a-select v-model:value="form.allowedValues" mode="tags" :disabled="!editable" :max-tag-count="'responsive'"/></a-form-item>
<a-form-item label="默认严重度"><a-select v-model:value="form.defaultSeverity" :options="severities" :disabled="!editable"/></a-form-item>
<a-form-item label="证据要求"><a-switch v-model:checked="form.evidenceRequired" :disabled="!editable || high"/> <span>高 / 严重风险必须提供证据</span></a-form-item>
<a-form-item label="允许的证据类型"><a-select v-model:value="form.evidenceTypes" mode="multiple" :options="evidenceOptions" :disabled="!editable"/></a-form-item>
<a-form-item label="说明"><a-textarea v-model:value="form.description" :maxlength="2000" :rows="3" :disabled="!editable"/></a-form-item>
<a-space><a-button v-if="selected?can('iqc:finding:update'):can('iqc:finding:manage')" type="primary" html-type="submit" :loading="busy" :disabled="!editable">保存草稿</a-button><a-button v-if="selected && can('iqc:finding:publish')" :disabled="busy || dirty || selected.status!=='ACTIVE'" @click="publish">发布已保存草稿</a-button><a-button v-if="selected && can('iqc:finding:detail:view')" :disabled="busy" @click="reload">重新加载草稿</a-button></a-space>
<p v-if="selected && dirty">有未保存的编辑内容，请先保存后发布。</p>
</a-form>
<template v-if="selected && can('iqc:finding:versions:view')"><h3>不可变版本（最近100条）</h3><a-button :loading="historyLoading" @click="loadHistory">加载 / 刷新历史</a-button><a-alert v-if="historyError" type="error" :message="historyError"/><a-empty v-if="historyLoaded && !history.length" description="尚无发布版本"/><a-collapse><a-collapse-panel v-for="version in history" :key="version.id" :header="`v${version.versionNo} · 草稿修订 ${version.sourceDraftRevision}`"><p>{{version.createdTime}} · {{version.contentHash}}</p><pre>{{pretty(version.snapshotJson)}}</pre></a-collapse-panel></a-collapse></template>
</a-drawer>
</template>
<style scoped>.ant-pagination{margin-top:16px}.ant-alert{margin:12px 0}pre{max-height:300px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}</style>
