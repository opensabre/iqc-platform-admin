<script setup lang="ts">
import AgentSessions from "@/views/agents/AgentSessions.vue";
</script>

<template>
  <section class="page-intro"><div><h2>智能体会话</h2></div></section>
  <a-card :bordered="false"><AgentSessions :open="true" embedded /></a-card>
</template>
