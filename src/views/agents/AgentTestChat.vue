<script setup lang="ts">
import { ref, watch } from "vue";
import http from "@/api/http";
const props = defineProps<{ open: boolean; configJson: string; title: string; agentId?:string; versionNo?:number }>();
const emit = defineEmits<{ 'update:open': [boolean] }>();
type Turn = { role: "user" | "assistant"; content: string };
const turns = ref<Turn[]>([]), input = ref(""), busy = ref(false), error = ref(""), info = ref("");
let generation = 0;
function reset() { generation++; turns.value=[]; input.value=""; error.value=""; info.value=""; busy.value=false; }
watch(() => [props.open, props.configJson], reset);
async function send() {
  if (!input.value.trim() || busy.value) return;
  const content=input.value.trim(), token=generation;
  const history: Turn[]=[...turns.value, { role: "user", content }];
  busy.value=true; error.value="";
  try {
    const response=await http.post<{content:string; latencyMillis:number; model:string;calledTools:string[]}>("/iqc/config/agents/test-chat", {configJson:props.configJson, messages:history,agentId:props.agentId,versionNo:props.versionNo}, {timeout:300000});
    if (token !== generation) return;
    turns.value=[...history, {role:"assistant",content:response.data.content}]; input.value="";
    info.value=`${response.data.model || "当前模型"} · ${response.data.latencyMillis} ms${response.data.calledTools?.length ? " · 工具："+response.data.calledTools.join("、") : ""}`;
  } catch (failure) { if (token === generation) error.value=failure instanceof Error ? `测试失败：${failure.message}` : "测试失败，请检查模型与 MCP 连接、配置及权限后重试。"; }
  finally { if (token === generation) busy.value=false; }
}
</script>
<template>
  <a-modal :open="open" :title="`测试聊天 · ${title}`" width="min(800px, calc(100vw - 32px))" :footer="null" @cancel="emit('update:open', false)">
    <a-alert type="info" show-icon message="使用当前配置进行真实模型与工具调用；不会保存配置或创建质检任务。"/>
    <div class="chat-log" aria-live="polite">
      <a-empty v-if="!turns.length" description="发送消息，验证智能体的回答是否符合预期"/>
      <div v-for="(turn,index) in turns" :key="index" class="chat-turn"><strong>{{turn.role==='user'?'你':'智能体'}}</strong><p>{{turn.content}}</p></div>
      <p v-if="busy">智能体正在回复…</p>
    </div>
    <a-alert v-if="error" type="error" :message="error"/>
    <p v-if="info">{{info}}</p>
    <a-textarea v-model:value="input" :rows="3" :maxlength="8000" :disabled="busy" placeholder="输入测试消息"/>
    <div class="chat-actions"><a-button :disabled="busy" @click="reset">重新开始</a-button><a-button type="primary" :loading="busy" :disabled="!input.trim()" @click="send">发送</a-button></div>
  </a-modal>
</template>
<style scoped>
.chat-log{max-height:45vh;min-height:180px;overflow:auto;padding:16px 0}.chat-turn p{white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0 18px}.chat-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
</style>
