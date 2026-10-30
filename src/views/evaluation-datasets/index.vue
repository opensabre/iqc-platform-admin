<script setup lang="ts">
import {computed,onMounted,onBeforeUnmount,ref,watch} from 'vue';
import {message,Modal} from 'ant-design-vue';
import {usePermission} from '@/composables/permission';
import {listSamples,type QualitySample} from '@/api/quality';
import {listDatasets,getDataset,createDataset,updateDataset,freezeDataset,setDatasetAvailability,listDatasetVersions,getDatasetVersion,listGoldVersions,type Dataset,type DatasetDraft,type DatasetVersion,type GoldVersion} from '@/api/evaluation';
const {can}=usePermission();const rows=ref<Dataset[]>([]),current=ref(1),total=ref(0),loading=ref(false),busy=ref(false),error=ref(''),open=ref(false),selected=ref<Dataset>(),name=ref(''),draft=ref<DatasetDraft>({schemaVersion:'iqc-dataset-draft-v1',type:'BASIC',description:'',members:[]}),baseline=ref('');
const candidates=ref<QualitySample[]>([]),candidateId=ref<string>(),approved=ref<GoldVersion[]>([]),versionNo=ref<number>(),candidatePage=ref(1),candidateTotal=ref(0),candidateListLoading=ref(false),candidateVersionLoading=ref(false),candidateError=ref(''),history=ref<DatasetVersion[]>([]),historyPage=ref(1),historyTotal=ref(0),snapshot=ref(''),snapshotNotice=ref('');let listGeneration=0,detailGeneration=0,candidateGeneration=0,candidateListGeneration=0,historyGeneration=0,snapshotGeneration=0;
const candidateLoading=computed(()=>candidateListLoading.value||candidateVersionLoading.value);
const projected=computed(()=>!!selected.value?.privacy&&(selected.value.privacy.policyVersion!=='iqc-dataset-draft-read-v1'||selected.value.privacy.canonicalPayloadVisible!==true||selected.value.privacy.canReadFull!==true||selected.value.privacy.canReadPii!==true));
const types=['BASIC','BOUNDARY','RISK','ADVERSARIAL','REGRESSION','CUSTOM'];const key=()=>JSON.stringify([name.value,draft.value]);const dirty=computed(()=>baseline.value!==key());const editable=computed(()=>!busy.value&&!projected.value&&(selected.value?can('iqc:dataset:update'):can('iqc:dataset:manage')));
async function refresh(page=1){if(!can('iqc:dataset:view'))return;const ticket=++listGeneration;loading.value=true;current.value=page;error.value='';try{const d=await listDatasets(page);if(ticket===listGeneration){rows.value=d.records;total.value=d.total;}}catch{if(ticket===listGeneration)error.value='数据集目录加载失败，请重试。';}finally{if(ticket===listGeneration)loading.value=false;}}
function populate(row:Dataset){
 const privacy=row.privacy;
 if(privacy&&(privacy.policyVersion!=='iqc-dataset-draft-read-v1'||privacy.canonicalPayloadVisible!==true||privacy.canReadFull!==true||privacy.canReadPii!==true)){
  selected.value=row;name.value=row.name;
  draft.value={schemaVersion:'iqc-dataset-draft-v1',type:types.includes(row.datasetType)?row.datasetType:'CUSTOM',members:privacy.policyVersion==='iqc-dataset-draft-read-v1'?(privacy.members??[]):[]};
  baseline.value=key();return;
 }
 const d=JSON.parse(row.draftConfigJson??'null') as DatasetDraft;
 if(!d||d.schemaVersion!=='iqc-dataset-draft-v1'||!types.includes(d.type)||!Array.isArray(d.members)||!d.members.every(m=>typeof m.sampleId==='string'&&Number.isInteger(m.versionNo)&&m.versionNo>0))throw Error();
 selected.value=row;name.value=row.name;draft.value=d;baseline.value=key();
}

function reset(){++detailGeneration;++candidateGeneration;++candidateListGeneration;++historyGeneration;++snapshotGeneration;history.value=[];historyPage.value=1;historyTotal.value=0;snapshot.value='';snapshotNotice.value='';candidateId.value=undefined;approved.value=[];versionNo.value=undefined;candidateError.value='';candidateListLoading.value=false;candidateVersionLoading.value=false;candidateTotal.value=0;candidatePage.value=1;candidates.value=[];}
function create(){reset();selected.value=undefined;name.value='';draft.value={schemaVersion:'iqc-dataset-draft-v1',type:'BASIC',description:'',members:[]};baseline.value=key();open.value=true;}
async function edit(row:Dataset){if(busy.value)return;reset();const ticket=detailGeneration;busy.value=true;try{const data=await getDataset(row.id);if(ticket===detailGeneration){populate(data);open.value=true;}}catch{message.error('草稿加载失败或协议无效');}finally{if(ticket===detailGeneration)busy.value=false;}}
function reload(){const row=selected.value;if(!row)return;if(dirty.value)Modal.confirm({title:'重新加载草稿？',content:'将替换未保存的编辑。',onOk:()=>edit(row)});else void edit(row);}
async function save(){
 if(!editable.value||!name.value.trim()||!draft.value.members.length||draft.value.members.length>1000)return;
 busy.value=true;
 try{
  let row:Dataset;
  try{row=selected.value?await updateDataset(selected.value.id,selected.value.draftRevision,name.value,draft.value):await createDataset(name.value,draft.value);}
  catch{message.error('保存未成功，请保留编辑，核对样本批准版本、权限和草稿修订。');return;}
  ++historyGeneration;++snapshotGeneration;history.value=[];historyTotal.value=0;snapshot.value='';snapshotNotice.value='';
  populate(row);message.success('草稿已保存');
  try{populate(await getDataset(row.id));}
  catch{message.warning('草稿已保存，但重新读取失败。请重新加载，勿重复提交。');}
  await refresh(current.value);
 }finally{busy.value=false;}
}

let disposed=false,freezeGeneration=0,activeFreeze:number|undefined;
watch(()=>JSON.stringify([can('iqc:dataset:freeze'),can('iqc:dataset:detail:view'),can('iqc:sensitive:conversation:read'),can('iqc:sensitive:pii:read')]),()=>{
 ++freezeGeneration;if(activeFreeze!==undefined){activeFreeze=undefined;busy.value=false;}
},{flush:'sync'});
function freeze(){
 const row=selected.value;
 if(disposed||!row||dirty.value||busy.value||projected.value||row.status!=='ACTIVE'||!can('iqc:dataset:freeze'))return;
 const permission=freezeGeneration,context=detailGeneration,id=row.id,revision=row.draftRevision;
 Modal.confirm({title:`冻结已保存修订 ${revision}？`,content:'保存成员的完整已批准会话及金标，不可覆盖。重复会话将被拒绝。',async onOk(){
  if(disposed||permission!==freezeGeneration||context!==detailGeneration||!can('iqc:dataset:freeze')||busy.value||dirty.value||projected.value||selected.value?.id!==id||selected.value.draftRevision!==revision||selected.value.status!=='ACTIVE')return;
  const command=++freezeGeneration;activeFreeze=command;busy.value=true;let confirmed=false;
  const ownsFreeze=()=>!disposed&&command===freezeGeneration&&activeFreeze===command&&context===detailGeneration&&selected.value?.id===id&&selected.value.draftRevision===revision&&can('iqc:dataset:freeze');
  try{
   await freezeDataset(id,revision);confirmed=true;if(!ownsFreeze())return;
   if(can('iqc:dataset:detail:view')){const data=await getDataset(id);if(!ownsFreeze()||!can('iqc:dataset:detail:view'))return;populate(data);}
   message.success('数据集版本已冻结');await refresh(current.value);
  }catch{if(ownsFreeze())message.warning(confirmed?'数据集版本已冻结，但重新读取失败；请刷新核对，勿重复提交。':'冻结未确认，请核对修订、成员当前可用性及重复会话。');}
  finally{if(!disposed&&activeFreeze===command){activeFreeze=undefined;busy.value=false;}}
 }});
}
onBeforeUnmount(()=>{disposed=true;++freezeGeneration;activeFreeze=undefined;});

async function availability(row:Dataset){if(busy.value)return;busy.value=true;try{await setDatasetAvailability(row.id,row.status!=='ACTIVE');await refresh(current.value);if(selected.value?.id===row.id&&!dirty.value)populate(await getDataset(row.id));}catch{message.error('可用性更新失败，请刷新核对');}finally{busy.value=false;}}
async function loadCandidates(){const ticket=++candidateListGeneration;candidateListLoading.value=true;candidateError.value='';try{const data=await listSamples();if(ticket===candidateListGeneration)candidates.value=data;}catch{if(ticket===candidateListGeneration)candidateError.value='候选样本加载失败，请重试。';}finally{if(ticket===candidateListGeneration)candidateListLoading.value=false;}}
async function candidateVersions(id:string,page=1){candidateId.value=id;versionNo.value=undefined;approved.value=[];candidatePage.value=page;const ticket=++candidateGeneration;candidateVersionLoading.value=true;candidateError.value='';candidateTotal.value=0;try{const d=await listGoldVersions(id,page);if(ticket===candidateGeneration){approved.value=d.records.filter(v=>v.decision==='APPROVED');candidateTotal.value=d.total;}}catch{if(ticket===candidateGeneration)candidateError.value='金标审核版本加载失败，请重试。';}finally{if(ticket===candidateGeneration)candidateVersionLoading.value=false;}}
function add(){if(!candidateId.value||!versionNo.value||!approved.value.some(v=>v.versionNo===versionNo.value))return;if(draft.value.members.some(m=>m.sampleId===candidateId.value)){message.error('同一样本只能加入一次，先删除旧引用再选择版本');return;}draft.value.members.push({sampleId:candidateId.value,versionNo:versionNo.value});}
async function loadHistory(page=1){if(!selected.value)return;const id=selected.value.id,ticket=detailGeneration,request=++historyGeneration;history.value=[];historyTotal.value=0;try{const d=await listDatasetVersions(id,page);if(ticket===detailGeneration&&request===historyGeneration){history.value=d.records;historyTotal.value=d.total;historyPage.value=page;}}catch{message.error('版本历史加载失败');}}
async function viewVersion(v:DatasetVersion){
 if(!selected.value)return;
 const id=selected.value.id,ticket=detailGeneration,request=++snapshotGeneration;
 snapshot.value='';snapshotNotice.value='';
 try{const d=await getDatasetVersion(id,v.versionNo);
  if(ticket!==detailGeneration||request!==snapshotGeneration)return;
  if(d.privacy){
   if(d.privacy.policyVersion!=='iqc-dataset-read-v1'){
    snapshotNotice.value='展示协议不受支持，未显示快照正文。';return;
   }
   if(d.privacy.canonicalPayloadVisible!==true||d.privacy.canReadFull!==true||d.privacy.canReadPii!==true){
    snapshotNotice.value='受限展示：仅冻结成员及脱敏会话预览，不包含原始金标值或业务上下文；原版本摘要不按预览重算。';
    snapshot.value=JSON.stringify({previewState:d.privacy.previewState,members:d.privacy.members??[]},null,2);return;
   }
  }
  if(!d.snapshotJson){snapshotNotice.value='此响应未包含冻结快照正文。';return;}
  snapshot.value=d.snapshotJson;
 }catch{if(ticket===detailGeneration&&request===snapshotGeneration){snapshot.value='';snapshotNotice.value='冻结快照加载失败，请重新读取。';}}
}

function close(){if(busy.value)return;if(dirty.value)Modal.confirm({title:'放弃未保存编辑？',onOk:()=>{reset();open.value=false;}});else{reset();open.value=false;}}
onMounted(()=>void refresh());
</script>
<template>
<section class="page-intro"><div><h2>评测数据集</h2><p>选择精确已批准金标版本，冻结完整会话与期望。当前页面管理数据集，不包含指标评测或发布门禁。</p></div><a-button v-if="can('iqc:dataset:manage')" type="primary" :disabled="busy" @click="create">新建数据集</a-button></section>
<a-alert v-if="error" type="error" :message="error"/><a-button :loading="loading" @click="refresh(current)">刷新目录</a-button><a-table :data-source="rows" row-key="id" :loading="loading" :pagination="false"><a-table-column title="名称" data-index="name"/><a-table-column title="类型" data-index="datasetType"/><a-table-column title="草稿修订" data-index="draftRevision"/><a-table-column title="当前冻结版本" data-index="activeVersion"/><a-table-column title="状态" data-index="status"/><a-table-column title="操作"><template #default="{record}"><a-button v-if="can('iqc:dataset:detail:view')" type="link" :disabled="busy" @click="edit(record)">查看 / 编辑</a-button><a-button v-if="can('iqc:dataset:availability')" type="link" :disabled="busy" @click="availability(record)">{{record.status==='ACTIVE'?'停用':'启用'}}</a-button></template></a-table-column></a-table><a-pagination :current="current" :total="total" :page-size="20" :show-size-changer="false" @change="refresh"/>
<a-drawer :open="open" :width="800" title="评测数据集草稿" :mask-closable="false" :keyboard="false" @close="close"><p v-if="selected">{{selected.id}} · 修订 {{selected.draftRevision}} · {{selected.status}} <a-tag v-if="dirty" color="orange">未保存</a-tag></p><a-alert v-if="projected" type="info" message="受限展示：原始名称或说明、完整草稿未展示，成员引用仅供查看，不能用此副本编辑保存。"/><a-form layout="vertical"><a-form-item label="名称"><a-input v-model:value="name" :disabled="!editable" :maxlength="128"/></a-form-item><a-form-item label="类型"><a-select v-model:value="draft.type" :disabled="!editable" :options="types.map(value=>({value,label:value}))"/></a-form-item><a-form-item label="说明"><a-textarea v-model:value="draft.description" :disabled="!editable" :rows="3"/></a-form-item></a-form>
<template v-if="editable&&can('iqc:sample:view')&&can('iqc:gold:versions:view')"><h3>选择金标成员</h3><a-button :loading="candidateLoading" @click="loadCandidates">加载 / 刷新现有候选样本</a-button><a-alert v-if="candidateError" type="error" :message="candidateError"/><a-select :value="candidateId" :options="candidates.map(s=>({value:s.id,label:`${s.name} · ${s.status} · ${s.id}`}))" show-search option-filter-prop="label" style="width:100%" :disabled="candidateLoading" @change="(id:string)=>candidateVersions(id)"/><a-select v-model:value="versionNo" :options="approved.map(v=>({value:v.versionNo,label:`批准 v${v.versionNo} · 修订 ${v.sourceDraftRevision}`}))" placeholder="选择精确批准版本" style="width:100%"/><a-pagination v-if="candidateId" :current="candidatePage" :total="candidateTotal" :page-size="20" :show-size-changer="false" @change="(p:number)=>candidateId&&candidateVersions(candidateId,p)"/><p>当前审核历史页仅列出 APPROVED；如没有可选版本，请翻页或完成独立审核。</p><a-button :disabled="!versionNo||draft.members.length>=1000" @click="add">加入成员</a-button></template>
<h3>成员（{{draft.members.length}} / 1000）</h3><a-list :data-source="draft.members"><template #renderItem="{item,index}"><a-list-item>{{index+1}} · {{item.sampleId}} · 精确 v{{item.versionNo}}<a-button v-if="editable" danger @click="draft.members.splice(index,1)">删除</a-button></a-list-item></template></a-list><a-space><a-button v-if="editable" type="primary" :loading="busy" :disabled="!name.trim()||!draft.members.length" @click="save">保存草稿</a-button><a-button v-if="selected&&can('iqc:dataset:freeze')" :disabled="busy||dirty||selected.status!=='ACTIVE'" @click="freeze">冻结已保存草稿</a-button><a-button v-if="selected" :disabled="busy" @click="reload">重新加载</a-button></a-space>
<template v-if="selected&&can('iqc:dataset:versions:view')"><h3>冻结版本</h3><a-button @click="loadHistory()">加载 / 刷新历史</a-button><a-list :data-source="history"><template #renderItem="{item}"><a-list-item>v{{item.versionNo}} · 修订 {{item.sourceDraftRevision}} · {{item.sampleCount}} 样本 · {{item.contentHash}}<a-button v-if="can('iqc:dataset:version:view')" @click="viewVersion(item)">查看快照</a-button></a-list-item></template></a-list><a-pagination :current="historyPage" :total="historyTotal" :page-size="20" :show-size-changer="false" @change="loadHistory"/><a-alert v-if="snapshotNotice" type="info" :message="snapshotNotice"/><pre v-if="snapshot">{{snapshot}}</pre></template>
</a-drawer>
</template>
<style scoped>.ant-pagination,.ant-alert,.ant-space{margin:12px 0}pre{max-height:500px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}</style>
