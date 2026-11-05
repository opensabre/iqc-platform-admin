<script setup lang="ts">
import { ref } from "vue";
import { listAgents, listAgentVersions } from "@/api/config";
import { message } from "ant-design-vue";
const props=defineProps<{assetId:string; kind:'model'|'skill'|'mcp'}>();
const open=ref(false),loading=ref(false),rows=ref<{id:string;name:string;version:number;status:string;reference:string}[]>([]);
async function load(){open.value=true;loading.value=true;rows.value=[];
try{const agents=await listAgents();const histories=await Promise.all(agents.map(async agent=>({agent,versions:await listAgentVersions(agent.id)})));
for(const {agent,versions} of histories)for(const version of versions){const c=JSON.parse(version.configJson||'{}');
const refs=props.kind==='model'?[c.primaryModelProfileId,...(c.fallbackModelProfileIds||[])]:props.kind==='skill'?c.skillIds||[]:c.mcpServerIds||[];
const frozen=c.assetSnapshots;const snaps=props.kind==='model'?[frozen?.primaryModel,...(frozen?.fallbackModels||[])]:props.kind==='skill'?frozen?.skills||[]:frozen?.mcpServers||[];
if(refs.includes(props.assetId)||snaps.some((x:{id?:string}|undefined)=>x?.id===props.assetId))rows.value.push({id:agent.id,name:agent.name,version:version.versionNo,status:version.status,reference:frozen?'冻结配置':'当前资产引用'});
}}catch{message.error('关联查询失败，请检查智能体查看权限后重试');}finally{loading.value=false;}}
</script>
<template><a-button type="link" @click="load">关联智能体</a-button><a-modal v-model:open="open" title="关联智能体及版本" :footer="null" width="min(760px, calc(100vw - 32px))"><a-alert message="停用后不能用于新的配置；历史冻结版本仍保留其配置。" type="info"/><a-table :data-source="rows" :loading="loading" :row-key="(row:any)=>`${row.id}-${row.version}`"><a-table-column title="智能体" data-index="name"/><a-table-column title="版本" data-index="version"/><a-table-column title="状态" data-index="status"/><a-table-column title="引用方式" data-index="reference"/></a-table></a-modal></template>
