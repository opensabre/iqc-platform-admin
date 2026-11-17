<script setup lang="ts">
import AgentSessions from "@/views/agents/AgentSessions.vue";
</script>

<template>
  <section class="page-intro"><div><span class="section-kicker">AGENT CONVERSATIONS</span><h2>会话查询</h2><p>按智能体、发起人和时间查询历史对话，查看消息及模型调用信息。</p></div></section>
  <a-card :bordered="false"><AgentSessions :open="true" embedded /></a-card>
</template>
