<script setup lang="ts">
import { ref } from "vue";
import { message, Modal } from "ant-design-vue";
import http from "@/api/http";
import { usePermission } from "@/composables/permission";
const props=defineProps<{assetId:string;kind:'agent'|'skill'}>();
const emit=defineEmits<{changed:[]}>();const {can}=usePermission();
const open=ref(false),loading=ref(false),versions=ref<any[]>([]),detail=ref(''),compareFrom=ref<number>(),compareTo=ref<number>();
const base=()=>props.kind==='agent'?`/iqc/config/agents/${props.assetId}`:`/iqc/agent-assets/skills/${props.assetId}`;
async function load(){open.value=true;loading.value=true;detail.value='';try{versions.value=(await http.get(`${base()}/versions`)).data;}catch{message.error('版本加载失败');}finally{loading.value=false;}}
function rollback(version:number){Modal.confirm({title:'从历史配置创建新版本',content:'保留历史版本；旧版规则配置无法用于新智能体版本。',async onOk(){try{await http.post(`${base()}/versions/${version}/rollback`);message.success('已创建新版本');await load();emit('changed');}catch{message.error('操作失败，请检查当前草稿状态及历史配置是否为纯大模型能力');}}});}
async function compare(){if(compareFrom.value===undefined||compareTo.value===undefined)return;try{detail.value=JSON.stringify((await http.get(`${base()}/versions/compare`,{params:{fromVersion:compareFrom.value,toVersion:compareTo.value}})).data,null,2);}catch{message.error('版本对比失败');}}
</script>
<template><a-button type="link" @click="load">版本历史</a-button><a-modal v-model:open="open" title="版本历史" :footer="null" width="min(900px, calc(100vw - 32px))"><a-space v-if="kind==='agent'"><a-select v-model:value="compareFrom" placeholder="原版本" style="width:120px" :options="versions.map(v=>({value:v.versionNo,label:`V${v.versionNo}`}))"/><a-select v-model:value="compareTo" placeholder="目标版本" style="width:120px" :options="versions.map(v=>({value:v.versionNo,label:`V${v.versionNo}`}))"/><a-button @click="compare">对比</a-button></a-space><a-table :data-source="versions" :loading="loading" row-key="versionNo"><a-table-column title="版本" data-index="versionNo"/><a-table-column title="名称" data-index="name"/><a-table-column title="状态" data-index="status"/><a-table-column title="操作"><template #default="{record}"><a-button type="link" @click="detail=JSON.stringify(record,null,2)">查看配置</a-button><a-button v-if="can(`iqc:${kind}:manage`)" type="link" @click="rollback(record.versionNo)">恢复为新版本</a-button></template></a-table-column></a-table><pre v-if="detail" style="max-height:40vh;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere">{{detail}}</pre></a-modal></template>
