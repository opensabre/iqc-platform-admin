<script setup lang="ts">
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import {listAgentVersions} from '@/api/config';
import type {PipelineNode} from '@/api/pipelines';
const props=defineProps<{config:PipelineNode['config'];disabled?:boolean}>();
type Capability={id:string;code:string;name:string;versionNo:number;allowedToolsJson?:string};
const skills=ref<Capability[]>([]),servers=ref<Capability[]>([]),error=ref(''),loading=ref(false);
let generation=0;
watch(()=>[props.config.agentReference?.id,props.config.agentReference?.versionNo],async(current,previous)=>{
 const ticket=++generation;skills.value=[];servers.value=[];error.value='';loading.value=false;
 if(previous && (current[0]!==previous[0]||current[1]!==previous[1]) && !props.disabled){delete props.config.skillReference;delete props.config.mcpReference;delete props.config.toolName;}
 const reference=props.config.agentReference;if(!reference?.id||!reference.versionNo)return;
 loading.value=true;
 try{
  const versions=await listAgentVersions(reference.id);if(ticket!==generation)return;
  const selected=versions.find(v=>v.versionNo===reference.versionNo&&v.status==='PUBLISHED');
  if(!selected?.configJson)throw Error('missing');
  const snapshot=JSON.parse(selected.configJson);
  if(snapshot.schemaVersion!=='3.0'||!Array.isArray(snapshot.assetSnapshots?.skills)||!Array.isArray(snapshot.assetSnapshots?.mcpServers))throw Error('missing');
  skills.value=snapshot.assetSnapshots.skills;servers.value=snapshot.assetSnapshots.mcpServers;
 }catch{if(ticket===generation)error.value='无法加载该发布版本的Skill/MCP能力，请检查版本和权限后重试。';}
 finally{if(ticket===generation)loading.value=false;}
},{immediate:true});
onBeforeUnmount(()=>{generation++;});
const options=(rows:Capability[])=>rows.map(row=>({value:row.id,label:`${row.name||row.code} · v${row.versionNo}`}));
const toolOptions=computed(()=>{
 const server=servers.value.find(row=>row.id===props.config.mcpReference?.id&&row.versionNo===props.config.mcpReference?.versionNo);
 try{const tools=JSON.parse(server?.allowedToolsJson||'[]');return Array.isArray(tools)?tools.filter((v:unknown)=>typeof v==='string').map((v:string)=>({value:v,label:v})):[];}catch{return [];}
});
function select(kind:'skillReference'|'mcpReference',id:string|undefined){
 if(props.disabled)return;
 const asset=(kind==='skillReference'?skills.value:servers.value).find(row=>row.id===id);
 props.config[kind]=asset?{id:asset.id,versionNo:asset.versionNo}:undefined;
 if(kind==='mcpReference')delete props.config.toolName;
}
function schemaText(field:string){const value=props.config[field];return typeof value==='string'?value:JSON.stringify(value??{type:'object'},null,2);}
function updateSchema(field:string,value:string){if(props.disabled)return;try{props.config[field]=JSON.parse(value);}catch{props.config[field]=value;}}
</script>
<template>
 <a-form-item label="冻结Skill"><a-select :value="config.skillReference?.id" :options="options(skills)" :loading="loading" :disabled="disabled" allow-clear @change="select('skillReference',$event)"/></a-form-item>
 <a-form-item label="冻结MCP服务器"><a-select :value="config.mcpReference?.id" :options="options(servers)" :loading="loading" :disabled="disabled" allow-clear @change="select('mcpReference',$event)"/></a-form-item>
 <a-form-item label="只读检测工具"><a-select v-model:value="config.toolName" :options="toolOptions" :disabled="disabled||!config.mcpReference" allow-clear/></a-form-item>
 <a-form-item label="工具请求Schema（JSON）"><a-textarea :value="schemaText('toolInputSchema')" :rows="5" :disabled="disabled" @update:value="updateSchema('toolInputSchema',$event)"/></a-form-item>
 <a-form-item label="工具结构化回执Schema（JSON）"><a-textarea :value="schemaText('toolOutputSchema')" :rows="5" :disabled="disabled" @update:value="updateSchema('toolOutputSchema',$event)"/></a-form-item>
 <p>Skill和MCP来自所选智能体的发布快照。工具须获精确版本的只读调用批准；回执须对应Skill版本及输入哈希。工单、辅导和通知使用动作配置。</p>
 <a-alert v-if="error" type="error" :message="error"/>
</template>
