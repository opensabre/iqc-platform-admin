<script setup lang="ts">
import {computed,onBeforeUnmount,onMounted,ref,nextTick,watch} from 'vue';
import {message,Modal} from 'ant-design-vue';
import {usePermission} from '@/composables/permission';
import {selectorAssetRestricted,selectorPreviewSupported,selectorPreviewRestricted,selectorJsonNeedsExactEditor,previewSelectorJson,listSelectorAssets,getSelectorAsset,createSelectorAsset,updateSelectorAsset,setSelectorAssetAvailability,listSelectorAssetVersions,publishSelectorAsset,getPublishedSelector,previewPublishedSelector,type SelectorAsset,type SelectorAssetVersion,type SelectorDefinition,type SelectorAssetReference,type SelectorPreview} from '@/api/selectors';
import SelectorEditor from './SelectorEditor.vue';
const props=defineProps<{disabled?:boolean}>();
const emit=defineEmits<{(e:'select',reference:SelectorAssetReference,label:string):void}>();
const {can}=usePermission();
const rows=ref<SelectorAsset[]>([]),total=ref(0),current=ref(1),loading=ref(false),busy=ref(false),error=ref(''),open=ref(false),selected=ref<SelectorAsset>(),code=ref(''),name=ref(''),initial=ref<SelectorDefinition>(),editor=ref<InstanceType<typeof SelectorEditor>>(),editorKey=ref(0),dirty=ref(false),history=ref<SelectorAssetVersion[]>([]),historyError=ref(''),historyLoading=ref(false),version=ref<number>(),preview=ref<SelectorPreview>();
const exactEditor=ref(false),definitionJson=ref(''),draftPreview=ref<SelectorPreview>();
let generation=0,historyGeneration=0,previewGeneration=0,detailGeneration=0,versionReadGeneration=0;
const reloadRequired=ref(false),versionBody=ref(''),versionNotice=ref('');
const restricted=computed(()=>reloadRequired.value||!!selected.value&&selectorAssetRestricted(selected.value));
function clearDraft(){initial.value=undefined;definitionJson.value='';exactEditor.value=false;draftPreview.value=undefined;++editorKey.value;dirty.value=false;}
watch(version,()=>{++versionReadGeneration;versionBody.value='';versionNotice.value='';});
watch(open,visible=>{if(!visible){++detailGeneration;clearHistory();clearDraft();selected.value=undefined;code.value='';name.value='';reloadRequired.value=false;}});
function close(){if(blocked.value)return;if(dirty.value)Modal.confirm({title:'放弃未保存的草稿？',onOk:()=>{open.value=false;}});else open.value=false;}

const blocked=computed(()=>!!props.disabled||busy.value||loading.value);
const writable=computed(()=>!restricted.value&&(selected.value?can('iqc:selector:asset:update'):can('iqc:selector:asset:create')));
async function refresh(page=current.value){if(!can('iqc:selector:asset:view')||props.disabled||busy.value)return;const ticket=++generation;loading.value=true;error.value='';try{const data=await listSelectorAssets(page);if(ticket!==generation)return;rows.value=data.records;total.value=data.total;current.value=page;}catch{if(ticket===generation)error.value='选择器目录加载失败，请核对权限。';}finally{if(ticket===generation)loading.value=false;}}
function clearHistory(){++historyGeneration;++previewGeneration;++versionReadGeneration;versionBody.value='';versionNotice.value='';history.value=[];version.value=undefined;preview.value=undefined;historyError.value='';historyLoading.value=false;}
function setDraft(row:SelectorAsset){
 if(selectorAssetRestricted(row)){clearDraft();selected.value=row;code.value=row.code;name.value=row.name;reloadRequired.value=false;return;}
 if(!row.draftConfigJson)throw Error('未提供草稿正文');
 const definition=JSON.parse(row.draftConfigJson) as SelectorDefinition;if(definition.schemaVersion!=='iqc-selector-v1')throw Error('选择器协议无效');
 exactEditor.value=selectorJsonNeedsExactEditor(row.draftConfigJson);definitionJson.value=row.draftConfigJson;draftPreview.value=undefined;
 selected.value=row;code.value=row.code;name.value=row.name;initial.value=definition;++editorKey.value;dirty.value=false;reloadRequired.value=false;
}

async function load(row:SelectorAsset){
 if(blocked.value||!can('iqc:selector:asset:detail:view'))return;
 busy.value=true;const ticket=++detailGeneration;clearHistory();clearDraft();selected.value={...row,name:'',draftConfigJson:null};name.value='';reloadRequired.value=true;
 try{const data=await getSelectorAsset(row.id);if(ticket!==detailGeneration)return;setDraft(data);open.value=true;await nextTick();dirty.value=false;await versions();}
 catch{if(ticket===detailGeneration)message.error('选择器详情读取失败，旧配置已清除，请重新加载。');}finally{busy.value=false;}
}

function create(){if(blocked.value||!can('iqc:selector:asset:create'))return;++detailGeneration;reloadRequired.value=false;clearHistory();selected.value=undefined;exactEditor.value=false;definitionJson.value='';draftPreview.value=undefined;code.value='';name.value='';initial.value=undefined;++editorKey.value;dirty.value=true;open.value=true;}
async function versions(){const asset=selected.value;if(!asset||!can('iqc:selector:asset:versions:view'))return;const ticket=++historyGeneration;history.value=[];versionBody.value='';versionNotice.value='';historyLoading.value=true;historyError.value='';try{const values=await listSelectorAssetVersions(asset.id);if(ticket!==historyGeneration||selected.value?.id!==asset.id)return;history.value=values;version.value=values[0]?.versionNo;}catch{if(ticket===historyGeneration)historyError.value='发布历史未加载，请核对权限。';}finally{if(ticket===historyGeneration)historyLoading.value=false;}}
async function save(){if(blocked.value||!writable.value)return;let definition:SelectorDefinition|undefined;try{if(!name.value.trim()||name.value.length>100)throw Error('名称必须为1–100字');if(!selected.value&&!/^[A-Z][A-Z0-9_]{1,63}$/.test(code.value))throw Error('编码需以大写字母开头，长度2–64');if(exactEditor.value){if(new TextEncoder().encode(definitionJson.value).length>128*1024)throw Error('配置超过128KiB');const raw=JSON.parse(definitionJson.value);if(raw.schemaVersion!=='iqc-selector-v1')throw Error('选择器协议无效');}else{if(!editor.value)throw Error('编辑器尚未就绪');definition=editor.value.definition();}}catch(e){message.warning(e instanceof Error?e.message:'配置无效');return;}busy.value=true;
 try{
  let row:SelectorAsset;
  try{row=selected.value?await updateSelectorAsset(selected.value.id,selected.value.draftRevision,name.value.trim(),definition,exactEditor.value?definitionJson.value:undefined):await createSelectorAsset(code.value,name.value.trim(),definition,exactEditor.value?definitionJson.value:undefined);}
  catch{message.error('保存未确认，请保留编辑并核对修订或编码。');return;}
  clearHistory();setDraft(row);message.success('草稿已保存');
  try{setDraft(await getSelectorAsset(row.id));await nextTick();dirty.value=false;await versions();}catch{message.warning('草稿已保存，但重新读取失败。请重新加载，勿重复提交。');}
 }finally{busy.value=false;}await refresh();
}

function publish(){const asset=selected.value;if(!asset||restricted.value||blocked.value||dirty.value||asset.status!=='ACTIVE'||!can('iqc:selector:asset:publish'))return;
 Modal.confirm({title:'发布当前选择器修订？',content:'已发布版本不可修改。任务按所选版本重新选数并冻结实际选集。',async onOk(){
  if(restricted.value||blocked.value||dirty.value||selected.value?.id!==asset.id||selected.value.draftRevision!==asset.draftRevision)return;
  busy.value=true;try{
   try{await publishSelectorAsset(asset.id,asset.draftRevision);}catch{message.error('发布未确认，请重新加载核对。');return;}
   clearHistory();clearDraft();selected.value={...asset,draftConfigJson:null};reloadRequired.value=true;message.success('选择器版本已发布');
   try{setDraft(await getSelectorAsset(asset.id));await nextTick();dirty.value=false;await versions();}catch{message.warning('版本已发布，但重新读取失败。请重新加载，勿重复发布。');}
  }finally{busy.value=false;}await refresh();
 }});
}

async function availability(row:SelectorAsset){
 if(blocked.value||!can('iqc:selector:asset:availability'))return;
 if(selected.value?.id===row.id&&dirty.value){message.warning('请先保存或重新加载未保存草稿。');return;}
 busy.value=true;try{
  let receipt:SelectorAsset;try{receipt=await setSelectorAssetAvailability(row.id,row.status!=='ACTIVE');}catch{message.error('可用性更新未确认，请重新加载。');return;}
  message.success('可用性已更新');if(selected.value?.id===row.id){clearHistory();setDraft(receipt);try{setDraft(await getSelectorAsset(row.id));await nextTick();dirty.value=false;await versions();}catch{message.warning('可用性已更新，但重新读取失败。请重新加载。');}}
 }finally{busy.value=false;}await refresh();
}
async function readVersion(entry:SelectorAssetVersion){
 const asset=selected.value;if(!asset||blocked.value||!can('iqc:selector:asset:version:view'))return;
 const ticket=++versionReadGeneration;versionBody.value='';versionNotice.value='';busy.value=true;
 try{const data=await getPublishedSelector(asset.id,entry.versionNo);
  if(ticket!==versionReadGeneration||selected.value?.id!==asset.id||!open.value)return;
  if(data.selectorId!==asset.id||data.versionNo!==entry.versionNo||data.contentHash!==entry.contentHash){versionNotice.value='版本来源不匹配，未展示正文。';return;}
  if(selectorAssetRestricted(data)){clearDraft();selected.value={...asset,draftConfigJson:null,privacy:data.privacy};versionNotice.value=`v${entry.versionNo} 定义受权限限制，精确引用仍可用于创建任务。`;return;}
  versionNotice.value=`v${entry.versionNo} · 原摘要 ${data.contentHash}`;
  if(typeof data.definitionJson==='string')versionBody.value=data.definitionJson;else versionNotice.value+=' · 此响应未提供精确定义文本';
 }catch{if(ticket===versionReadGeneration)versionNotice.value='版本读取失败，请重试。';}finally{busy.value=false;}
}

async function choose(){
 if(dirty.value){message.warning('请先保存或重新加载草稿，再选用已发布版本。');return;}
 const asset=selected.value,number=version.value;
 if(!asset||!number||asset.status!=='ACTIVE'||blocked.value||!can('iqc:selector:asset:version:view'))return;
 busy.value=true;const ticket=++detailGeneration;
 try{const data=await getPublishedSelector(asset.id,number);
  if(ticket!==detailGeneration||!open.value||selected.value?.id!==asset.id||version.value!==number)return;
  if(data.selectorId!==asset.id||data.versionNo!==number||data.availableForNewTasks===false)throw Error();
  emit('select',{selectorId:asset.id,versionNo:number},`${asset.name} · v${number}`);open.value=false;message.success('已选定任务使用的选择器版本');
 }catch{if(ticket===detailGeneration)message.error('版本不可用于新任务，请核对可用性与权限。');}finally{busy.value=false;}
}

async function previewVersion(){const asset=selected.value,number=version.value;if(!asset||!number||blocked.value||!can('iqc:selector:asset:version:preview'))return;const ticket=++previewGeneration;busy.value=true;preview.value=undefined;try{const value=await previewPublishedSelector(asset.id,number);if(ticket===previewGeneration&&selected.value?.id===asset.id&&version.value===number)preview.value=value;}catch{if(ticket===previewGeneration)message.error('版本预览未获得，请核对授权数据范围。');}finally{if(ticket===previewGeneration)busy.value=false;}}
async function previewExactDraft(){if(restricted.value||blocked.value||!can('iqc:selector:preview'))return;busy.value=true;draftPreview.value=undefined;try{draftPreview.value=await previewSelectorJson(definitionJson.value);}catch{message.error('精确配置预览未获得，请核对JSON、条件与数据范围。');}finally{busy.value=false;}}
function pretty(raw:string|null){return raw??'版本正文未包含在摘要中';}
onMounted(()=>void refresh());onBeforeUnmount(()=>{++generation;++detailGeneration;clearHistory();clearDraft();selected.value=undefined;code.value='';name.value='';});
</script>
<template>
<a-collapse v-if="can('iqc:selector:asset:view')"><a-collapse-panel key="library" header="已保存的会话选择器">
<a-space><a-button :loading="loading" :disabled="disabled||busy" @click="refresh()">刷新目录</a-button><a-button v-if="can('iqc:selector:asset:create')" :disabled="blocked" @click="create">新建选择器</a-button></a-space>
<a-alert v-if="error" type="error" :message="error"/>
<a-table :data-source="rows" row-key="id" :loading="loading" :pagination="false"><a-table-column title="编码" data-index="code"/><a-table-column title="名称" data-index="name"/><a-table-column title="可用性" data-index="status"/><a-table-column title="当前发布"><template #default="{record}">{{record.activePublishedVersion?`v${record.activePublishedVersion}`:'未发布'}}</template></a-table-column><a-table-column title="操作"><template #default="{record}"><a-button v-if="can('iqc:selector:asset:detail:view')" type="link" :disabled="blocked" @click="load(record)">配置 / 选择版本</a-button><a-button v-if="can('iqc:selector:asset:availability')" type="link" :disabled="blocked" @click="availability(record)">{{record.status==='ACTIVE'?'停用':'启用'}}</a-button></template></a-table-column></a-table>
<a-pagination :current="current" :total="total" :page-size="20" :show-size-changer="false" :disabled="blocked" @change="refresh"/>
</a-collapse-panel></a-collapse>
<a-drawer :open="open" @close="close" title="会话选择器资产" :width="860" :closable="!blocked" :mask-closable="!blocked" :keyboard="!blocked">
<a-alert v-if="restricted" type="info" message="仅展示受限元数据，原条件与抽样配置未展示；不能用此副本编辑或发布。可用的已发布版本引用仍可选择使用。"/><a-form v-if="!restricted" layout="vertical"><a-form-item label="稳定编码"><a-input v-model:value="code" :maxlength="64" :disabled="blocked||!!selected||!writable"/></a-form-item><a-form-item label="名称"><a-input v-model:value="name" :maxlength="100" :disabled="blocked||!writable" @change="dirty=true"/></a-form-item></a-form>
<p v-if="selected">草稿修订 {{selected.draftRevision}} · {{selected.status}}</p>
<template v-if="!restricted"><template v-if="exactEditor"><a-alert type="info" message="配置含高精度数字，使用原始JSON编辑以保留抽样比例和条件值。"/><a-textarea v-model:value="definitionJson" :rows="16" :disabled="blocked||!writable" @change="dirty=true;draftPreview=undefined"/><a-button v-if="can('iqc:selector:preview')" :disabled="blocked" @click="previewExactDraft">预览精确配置</a-button><p v-if="draftPreview">命中 {{draftPreview.matchedCount}} · 抽样 {{draftPreview.sampledCount}} · 最终 {{draftPreview.selectedCount}}</p></template><SelectorEditor v-else :key="editorKey" ref="editor" :initial="initial" :disabled="blocked||!writable" @change="dirty=true"/></template>
<a-space><a-button v-if="writable" type="primary" :loading="busy" :disabled="blocked" @click="save">保存草稿</a-button><a-button v-if="selected" :disabled="blocked" @click="load(selected)">重新加载</a-button><a-button v-if="selected&&can('iqc:selector:asset:publish')" :disabled="restricted||blocked||dirty||selected.status!=='ACTIVE'" @click="publish">发布当前修订</a-button></a-space>
<a-alert v-if="selected&&dirty" type="info" message="有未保存修改，请保存后发布。"/>
<template v-if="selected"><h3>发布历史（最近100条）</h3><a-button v-if="can('iqc:selector:asset:versions:view')" :loading="historyLoading" :disabled="blocked" @click="versions">刷新历史</a-button><a-alert v-if="historyError" type="warning" :message="historyError"/>
<a-select v-model:value="version" :disabled="blocked" :options="history.map(v=>({value:v.versionNo,label:`v${v.versionNo} · 修订 ${v.sourceDraftRevision}`}))" placeholder="选择发布版本" style="width:100%" @change="preview=undefined"/>
<a-space><a-button v-if="can('iqc:selector:asset:version:view')" :disabled="blocked||!version||selected.status!=='ACTIVE'" @click="choose">用于创建任务</a-button><a-button v-if="can('iqc:selector:asset:version:preview')" :disabled="blocked||!version||selected.status!=='ACTIVE'" @click="previewVersion">预览所选版本</a-button></a-space>
<a-card v-if="preview" size="small"><p>候选 {{preview.candidateCount}} · 命中 {{preview.matchedCount}} · 抽样 {{preview.sampledCount}} · 最终 {{preview.selectedCount}} {{preview.limited?'（达到数量上限）':''}}</p><p>选数时间 {{preview.anchor}}</p><a-alert v-if="selectorPreviewRestricted(preview)" type="info" message="员工标识及员工维度分布受权限限制；文件名与渠道按规则保护。数量和组织分布保持，未展示不等于没有员工。"/><template v-if="selectorPreviewSupported(preview)"><h4>员工、团队与部门分布</h4><pre>{{JSON.stringify(preview.selectedDistribution,null,2)}}</pre><a-table :data-source="preview.preview" row-key="conversationId" :pagination="false"><a-table-column title="会话" data-index="conversationId"/><a-table-column title="员工" data-index="employeeId"/><a-table-column title="部门" data-index="employeeDepartmentId"/><a-table-column title="风险" data-index="riskLevel"/></a-table></template></a-card>
<a-collapse><a-collapse-panel v-for="entry in history" :key="entry.id" :header="`v${entry.versionNo} · 修订 ${entry.sourceDraftRevision}`"><p>{{entry.createdTime}} · {{entry.contentHash}}</p><pre v-if="!entry.privacy">{{pretty(entry.snapshotJson)}}</pre><a-button v-if="can('iqc:selector:asset:version:view')" :disabled="blocked" @click="readVersion(entry)">读取精确版本定义</a-button></a-collapse-panel></a-collapse><a-alert v-if="versionNotice" type="info" :message="versionNotice"/><pre v-if="versionBody">{{versionBody}}</pre>
</template>
</a-drawer>
</template>
<style scoped>.ant-alert,.ant-space,.ant-pagination{margin:10px 0}pre{max-height:280px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}</style>
