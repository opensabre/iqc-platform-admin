<script setup lang="ts">
import {computed,onBeforeUnmount,onMounted,ref,watch} from 'vue';
import {message} from 'ant-design-vue';
import {usePermission} from '@/composables/permission';
import {listKnowledge,getKnowledge,createKnowledge,updateKnowledge,setKnowledgeAvailability,listKnowledgeVersions,getKnowledgeVersion,publishKnowledge,restoreKnowledge,knowledgeRestricted,type Knowledge,type KnowledgeVersion,type KnowledgeDocument,type KnowledgeCorpus} from '@/api/knowledge';
const {can}=usePermission();
const rows=ref<Knowledge[]>([]),current=ref(1),total=ref(0),loading=ref(false),busy=ref(false),open=ref(false),error=ref('');
const selected=ref<Knowledge>(),code=ref(''),name=ref(''),documents=ref<KnowledgeDocument[]>([]),baseline=ref(''),restricted=ref(false),uncertain=ref(false);
const history=ref<KnowledgeVersion[]>([]),versionDocuments=ref<KnowledgeDocument[]>([]),versionLabel=ref(''),detailError=ref('');
let disposed=false,listGeneration=0,detailGeneration=0,versionGeneration=0;
const fullAccess=computed(()=>can('iqc:sensitive:conversation:read')&&can('iqc:sensitive:pii:read')&&can('iqc:sensitive:prompt:read'));
const writable=computed(()=>!restricted.value&&!uncertain.value&&can(selected.value?'iqc:knowledge:update':'iqc:knowledge:create'));
const dirty=computed(()=>baseline.value!==JSON.stringify([name.value,documents.value]));
const characterCount=computed(()=>documents.value.reduce((sum,item)=>sum+item.text.length,0));
function clearEditor(){++detailGeneration;++versionGeneration;selected.value=undefined;code.value='';name.value='';documents.value=[];history.value=[];versionDocuments.value=[];versionLabel.value='';baseline.value='';restricted.value=false;uncertain.value=false;detailError.value='';}
function close(){if(busy.value)return;open.value=false;clearEditor();}
function corpus(body:string):KnowledgeCorpus{const value=JSON.parse(body);if(!value||value.schemaVersion!=='iqc-knowledge-corpus-v1'||!Array.isArray(value.documents)||value.documents.length<1||value.documents.length>100||value.documents.some((d:KnowledgeDocument)=>!d||['documentId','title','text','sourceReference'].some(key=>typeof d[key as keyof KnowledgeDocument]!=='string')))throw Error('语料协议无效');return value;}
function apply(row:Knowledge){selected.value={...row,draftConfigJson:null};code.value=row.code;name.value=row.name??'';restricted.value=knowledgeRestricted(row)||!row.draftConfigJson;documents.value=[];
 if(!restricted.value)documents.value=structuredClone(corpus(row.draftConfigJson!).documents);
 baseline.value=JSON.stringify([name.value,documents.value]);uncertain.value=false;}
async function refresh(page=current.value){if(disposed||busy.value||!can('iqc:knowledge:view'))return;const ticket=++listGeneration;rows.value=[];loading.value=true;error.value='';
 try{const result=await listKnowledge(page);if(!disposed&&ticket===listGeneration&&can('iqc:knowledge:view')){rows.value=result.records;total.value=result.total;current.value=page;}}
 catch{if(ticket===listGeneration)error.value='目录读取失败，请重新读取。';}finally{if(ticket===listGeneration)loading.value=false;}}
async function historyFor(id:string,ticket:number){history.value=[];if(!can('iqc:knowledge:versions:view'))return;try{const result=await listKnowledgeVersions(id);if(!disposed&&ticket===detailGeneration&&selected.value?.id===id&&can('iqc:knowledge:versions:view'))history.value=result;}catch{if(ticket===detailGeneration)detailError.value='历史读取失败，可重新读取。';}}
async function load(row:Knowledge){if(disposed||busy.value||!can('iqc:knowledge:detail:view')||(open.value&&dirty.value&&selected.value?.id!==row.id))return;clearEditor();const ticket=detailGeneration;selected.value={...row,draftConfigJson:null};restricted.value=true;open.value=true;busy.value=true;
 try{const result=await getKnowledge(row.id);if(disposed||ticket!==detailGeneration||!can('iqc:knowledge:detail:view'))return;apply(result);await historyFor(row.id,ticket);}
 catch{if(ticket===detailGeneration){restricted.value=true;documents.value=[];detailError.value='详情读取失败，正文已清除。';}}
 finally{busy.value=false;}}
function create(){if(disposed||busy.value||(open.value&&dirty.value)||!can('iqc:knowledge:create'))return;clearEditor();documents.value=[{documentId:'document-1',title:'',text:'',sourceReference:''}];open.value=true;}
function addDocument(){if(!writable.value||busy.value||documents.value.length>=100)return;let index=1;while(documents.value.some(d=>d.documentId===`document-${index}`))index++;documents.value.push({documentId:`document-${index}`,title:'',text:'',sourceReference:''});}
function removeDocument(index:number){if(writable.value&&!busy.value&&documents.value.length>1)documents.value.splice(index,1);}
function validated():KnowledgeCorpus{if(!name.value.trim()||name.value.length>100||(!selected.value&&!/^[A-Z][A-Z0-9_]{1,63}$/.test(code.value)))throw Error('请填写有效名称与2–64位大写编码');
 if(documents.value.length<1||documents.value.length>100||characterCount.value>200000)throw Error('须为1–100份文档，正文总长度最多200000字');
 const ids=new Set<string>();for(const d of documents.value){if(!/^[A-Za-z0-9:_-]{1,64}$/.test(d.documentId)||ids.has(d.documentId)||!d.title.trim()||d.title.length>200||!d.text.trim()||d.text.length>16000||!d.sourceReference.trim()||d.sourceReference!==d.sourceReference.trim()||d.sourceReference.length>512||/[\x00-\x1f\x7f]/.test(d.sourceReference))throw Error('请核对唯一文档ID、标题、正文及来源引用');ids.add(d.documentId);}
 return {schemaVersion:'iqc-knowledge-corpus-v1',documents:structuredClone(JSON.parse(JSON.stringify(documents.value)))};}
async function command(permission:string,action:()=>Promise<unknown>,id?:string){if(disposed||busy.value||!can(permission))return;const prior=selected.value;let confirmed=false;const ticket=++detailGeneration;++versionGeneration;busy.value=true;detailError.value='';versionDocuments.value=[];versionLabel.value='';
 try{const receipt=await action() as Knowledge|KnowledgeVersion;confirmed=true;if(disposed||ticket!==detailGeneration||!can(permission))return;
  const target=id??('knowledgeBaseId' in receipt?receipt.knowledgeBaseId:receipt.id);documents.value=[];history.value=[];restricted.value=true;
  selected.value='knowledgeBaseId' in receipt?(prior?{...prior,draftConfigJson:null,activePublishedVersion:receipt.versionNo,privacy:receipt.privacy}:undefined):{...receipt,draftConfigJson:null};baseline.value='';uncertain.value=false;
  if(can('iqc:knowledge:detail:view')){const result=await getKnowledge(target);if(disposed||ticket!==detailGeneration||!can('iqc:knowledge:detail:view'))return;apply(result);open.value=true;await historyFor(target,ticket);}else{open.value=false;clearEditor();}
  if(ticket===detailGeneration)message.success('操作已确认');
 }catch{if(ticket===detailGeneration){documents.value=[];history.value=[];restricted.value=true;uncertain.value=true;detailError.value=confirmed?'操作已完成，但重新读取失败；请重读详情，勿重复提交。':'操作结果未确认，请重新读取后继续，勿直接重复提交。';}}
 finally{busy.value=false;if(!disposed)void refresh();}}
function save(){if(!writable.value||busy.value)return;let value:KnowledgeCorpus;try{value=validated();}catch(e){message.warning(e instanceof Error?e.message:'语料无效');return;}
 const row=selected.value;if(row)void command('iqc:knowledge:update',()=>updateKnowledge(row.id,row.draftRevision,name.value,value),row.id);else void command('iqc:knowledge:create',()=>createKnowledge(code.value,name.value,value));}
function publish(){const row=selected.value;if(!row||busy.value||dirty.value||restricted.value||uncertain.value)return;void command('iqc:knowledge:publish',()=>publishKnowledge(row.id,row.draftRevision),row.id);}
function availability(row:Knowledge){if(busy.value||(open.value&&dirty.value))return;void command('iqc:knowledge:availability',()=>setKnowledgeAvailability(row.id,row.status!=='ACTIVE'),row.id);}
function restore(version:KnowledgeVersion){const row=selected.value;if(!row||busy.value||dirty.value||uncertain.value)return;void command('iqc:knowledge:restore',()=>restoreKnowledge(row.id,version.versionNo,row.draftRevision),row.id);}
async function showVersion(version:KnowledgeVersion){if(disposed||busy.value||!can('iqc:knowledge:version:view'))return;const asset=selected.value?.id;if(!asset)return;const ticket=++versionGeneration;versionDocuments.value=[];versionLabel.value='';detailError.value='';if(!fullAccess.value){detailError.value='版本正文受限，仅保留原版本号和摘要。';return;}
 try{const result=await getKnowledgeVersion(asset,version.versionNo);if(disposed||ticket!==versionGeneration||asset!==selected.value?.id||!can('iqc:knowledge:version:view')||!fullAccess.value)return;
  if(knowledgeRestricted(result)||!result.snapshotJson){detailError.value='版本正文受限，仅保留原版本号和摘要。';return;}
  const snapshot=JSON.parse(result.snapshotJson);versionDocuments.value=corpus(JSON.stringify(snapshot.corpus)).documents;versionLabel.value=`v${result.versionNo} · ${result.contentHash}`;
 }catch{if(ticket===versionGeneration)detailError.value='版本正文读取失败，旧正文已清除。';}}
watch(()=>JSON.stringify([can('iqc:knowledge:view'),can('iqc:knowledge:detail:view'),can('iqc:knowledge:versions:view'),can('iqc:knowledge:version:view'),can('iqc:knowledge:create'),can('iqc:knowledge:update'),can('iqc:knowledge:publish'),can('iqc:knowledge:restore'),can('iqc:knowledge:availability'),fullAccess.value]),()=>{++listGeneration;rows.value=[];loading.value=false;open.value=false;clearEditor();},{flush:'sync'});
onMounted(()=>void refresh());onBeforeUnmount(()=>{disposed=true;++listGeneration;clearEditor();rows.value=[];});
</script>
<template>
 <section><h2>知识库</h2><p>管理独立参考语料版本；默认停用，发布后需显式启用。历史恢复写入新草稿，保留原发布版本。</p>
 <a-space><a-button :disabled="busy||loading" @click="refresh()">重新读取</a-button><a-button v-if="can('iqc:knowledge:create')" :disabled="busy||(open&&dirty)" @click="create">新建知识库</a-button></a-space><a-alert v-if="error" type="error" :message="error"/>
 <a-table :loading="loading" :data-source="rows" row-key="id" :pagination="false" :columns="[{title:'编码',dataIndex:'code'},{title:'名称',key:'name'},{title:'状态',dataIndex:'status'},{title:'草稿修订',dataIndex:'draftRevision'},{title:'最新发布',dataIndex:'activePublishedVersion'},{title:'操作',key:'actions'}]">
 <template #bodyCell="{column,record}"><span v-if="column.key==='name'">{{record.name??'名称受限'}}</span><a-space v-else-if="column.key==='actions'"><a-button v-if="can('iqc:knowledge:detail:view')" :disabled="busy||(open&&dirty&&selected?.id!==record.id)" @click="load(record)">详情</a-button><a-button v-if="can('iqc:knowledge:availability')" :disabled="busy||(open&&dirty)" @click="availability(record)">{{record.status==='ACTIVE'?'停用':'启用'}}</a-button></a-space></template></a-table>
 <a-pagination :current="current" :total="total" :page-size="20" :disabled="busy||loading" @change="refresh"/>
 <a-drawer :open="open" title="知识库草稿与历史" width="900" :closable="!busy" :mask-closable="false" @close="close">
 <p v-if="selected">{{selected.code}} · 修订 {{selected.draftRevision}} · {{selected.status}} · 发布版本 {{selected.activePublishedVersion??'无'}}</p>
 <a-alert v-if="detailError" type="warning" :message="detailError"/><a-button v-if="selected&&can('iqc:knowledge:detail:view')" :disabled="busy" @click="load(selected)">重新读取详情</a-button>
 <a-alert v-if="restricted" type="info" message="正文受限或需要重新读取；当前副本不能编辑、保存或确认发布。"/>
 <a-form v-else layout="vertical" :disabled="busy||!writable"><a-form-item label="编码"><a-input v-model:value="code" :disabled="!!selected" :maxlength="64"/></a-form-item><a-form-item label="名称"><a-input v-model:value="name" :maxlength="100"/></a-form-item>
 <p>文档 {{documents.length}} / 100 · 正文长度 {{characterCount}} / 200000</p><a-card v-for="(document,index) in documents" :key="index" :title="`文档 ${index+1}`" style="margin:12px 0">
 <a-form-item label="唯一文档 ID"><a-input v-model:value="document.documentId" :maxlength="64"/></a-form-item><a-form-item label="标题"><a-input v-model:value="document.title" :maxlength="200"/></a-form-item><a-form-item label="参考正文"><a-textarea v-model:value="document.text" :rows="5" :maxlength="16000" show-count/></a-form-item><a-form-item label="来源引用（文档编号、章节或地址）"><a-input v-model:value="document.sourceReference" :maxlength="512"/></a-form-item><a-button :disabled="documents.length<=1||!writable||busy" @click="removeDocument(index)">移除文档</a-button></a-card><a-button :disabled="documents.length>=100||!writable||busy" @click="addDocument">添加文档</a-button></a-form>
 <a-space style="margin:16px 0"><a-button v-if="writable" type="primary" :disabled="busy" @click="save">保存草稿</a-button><a-button v-if="selected&&can('iqc:knowledge:publish')" :disabled="busy||dirty||restricted||uncertain" @click="publish">发布当前修订</a-button></a-space>
 <h3 v-if="selected&&can('iqc:knowledge:versions:view')">不可变发布历史</h3><a-card v-for="version in history" :key="version.id" :title="`v${version.versionNo} · 草稿修订 ${version.sourceDraftRevision}`" style="margin:12px 0"><p>{{version.contentHash}}</p><a-space><a-button v-if="can('iqc:knowledge:version:view')" :disabled="busy" @click="showVersion(version)">读取版本正文</a-button><a-button v-if="can('iqc:knowledge:restore')" :disabled="busy||dirty||uncertain" @click="restore(version)">恢复为新草稿</a-button></a-space></a-card>
 <template v-if="versionDocuments.length&&fullAccess&&can('iqc:knowledge:version:view')"><h3>{{versionLabel}}</h3><a-card v-for="document in versionDocuments" :key="document.documentId" :title="document.title"><p>{{document.documentId}} · {{document.sourceReference}}</p><pre style="white-space:pre-wrap">{{document.text}}</pre></a-card></template>
 </a-drawer></section>
</template>
