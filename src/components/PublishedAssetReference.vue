<script setup lang="ts">
import {computed,onMounted,onBeforeUnmount,ref,watch} from 'vue';
import {listRules,listRuleVersions,listAgents,listAgentVersions} from '@/api/config';
import {listKnowledge,listKnowledgeVersions} from '@/api/knowledge';
import {listFindings,listFindingVersions} from '@/api/findings';
import type {AssetReference} from '@/api/pipelines';
const props=defineProps<{modelValue?:AssetReference;kind:'RULE'|'AGENT'|'FINDING'|'KNOWLEDGE';disabled?:boolean}>();
const emit=defineEmits<{'update:modelValue':[value:AssetReference|undefined];code:[code:string];valueType:[value:string|undefined]}>();
const assets=ref<Array<{id:string;name:string;code:string;status:string}>>([]),versions=ref<Array<{versionNo:number;code:string;valueType?:string}>>([]);
const loading=ref(false),versionLoading=ref(false),error=ref(''),current=ref(1),total=ref(0);let generation=0,versionGeneration=0;
const options=computed(()=>{const rows=assets.value.map(a=>({value:a.id,label:`${a.name} (${a.code})`,disabled:a.status==='DISABLED'}));if(props.modelValue?.id&&!rows.some(r=>r.value===props.modelValue?.id))rows.unshift({value:props.modelValue.id,label:`已选择资产 · ${props.modelValue.id}`,disabled:false});return rows;});
const versionOptions=computed(()=>{const rows=versions.value.map(v=>({value:v.versionNo,label:`发布版本 v${v.versionNo}`}));if(props.modelValue?.versionNo&&!rows.some(r=>r.value===props.modelValue?.versionNo))rows.unshift({value:props.modelValue.versionNo,label:`所选版本 v${props.modelValue.versionNo}（未加载）`});return rows;});
async function load(page=1) {
 const ticket=++generation;loading.value=true;error.value='';current.value=page;
 try {if(props.kind==='KNOWLEDGE'){const data=await listKnowledge(page);if(ticket===generation){assets.value=data.records.map(row=>({...row,name:row.name??row.code}));total.value=data.total;}}
 else if(props.kind==='FINDING'){const data=await listFindings(page);if(ticket===generation){assets.value=data.records;total.value=data.total;}}
 else {const rows=props.kind==='RULE'?await listRules():await listAgents();if(ticket===generation){assets.value=rows;total.value=rows.length;}}}
 catch {if(ticket===generation)error.value='资产加载失败，请检查权限后重试。';}
 finally {if(ticket===generation)loading.value=false;}
}
function selectAsset(value:string|undefined) {if(props.disabled)return;emit('update:modelValue',value?{id:value,versionNo:0}:undefined);emit('code','');emit('valueType',undefined);}
function selectVersion(value:number|undefined) {if(props.disabled)return;if(props.modelValue?.id)emit('update:modelValue',{id:props.modelValue.id,versionNo:value||0});}
async function loadVersions(){
 const ticket=++versionGeneration;versions.value=[];versionLoading.value=false;
 const id=props.modelValue?.id;if(!id)return;versionLoading.value=true;
 try {if(props.kind==='KNOWLEDGE'){const rows=await listKnowledgeVersions(id);if(ticket===versionGeneration){versions.value=rows.map(row=>({versionNo:row.versionNo,code:''}));}return;}
 const rows=props.kind==='RULE'?(await listRuleVersions(id)).filter(v=>v.status==='PUBLISHED'):props.kind==='AGENT'?(await listAgentVersions(id)).filter(v=>v.status==='PUBLISHED'):await listFindingVersions(id);
 if(ticket===versionGeneration){versions.value=rows.map(v=>({versionNo:v.versionNo,code:'code' in v?v.code:JSON.parse(v.snapshotJson).code,valueType:props.kind==='FINDING'&&'snapshotJson' in v?JSON.parse(v.snapshotJson).valueType:undefined}));emit('code',versions.value.find(v=>v.versionNo===props.modelValue?.versionNo)?.code||'');emit('valueType',versions.value.find(v=>v.versionNo===props.modelValue?.versionNo)?.valueType);}}
 catch {if(ticket===versionGeneration)error.value='发布版本加载失败，请检查资产状态或权限后重试。';}
 finally {if(ticket===versionGeneration)versionLoading.value=false;}
}
watch(()=>[props.kind,props.modelValue?.id] as const,()=>void loadVersions(),{immediate:true});
watch(()=>props.modelValue?.versionNo,value=>{const selected=versions.value.find(v=>v.versionNo===value);emit('code',selected?.code||'');emit('valueType',selected?.valueType);});
onMounted(()=>void load());onBeforeUnmount(()=>{++generation;++versionGeneration;});
</script>
<template><div><a-space wrap><a-select :value="modelValue?.id" :options="options" :loading="loading" :disabled="disabled" style="min-width:260px" show-search option-filter-prop="label" allow-clear placeholder="选择资产" @change="selectAsset"/><a-select :value="modelValue?.versionNo || undefined" :options="versionOptions" :loading="versionLoading" :disabled="disabled || !modelValue?.id" style="min-width:170px" placeholder="选择发布版本" @change="selectVersion"/><a-button size="small" :disabled="disabled" @click="load(current)">刷新资产</a-button><a-button size="small" :disabled="disabled || !modelValue?.id" @click="loadVersions">刷新版本</a-button></a-space><a-pagination v-if="(kind==='FINDING'||kind==='KNOWLEDGE') && total>20" :current="current" :total="total" :page-size="20" :show-size-changer="false" size="small" @change="load"/><a-alert v-if="error" type="error" :message="error" show-icon/></div></template>
