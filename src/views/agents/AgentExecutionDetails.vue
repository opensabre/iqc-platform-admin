<script setup lang="ts">
import type { AgentExecution } from "@/api/agent-sessions";

defineProps<{ execution: AgentExecution }>();

function statusLabel(status: string) {
  return ({ SUCCEEDED: "成功", FAILED: "失败", RUNNING: "执行中" } as Record<string, string>)[status] ?? status;
}
</script>

<template>
  <a-descriptions size="small" :column="2" bordered>
    <a-descriptions-item label="请求 ID" :span="2">{{ execution.requestId }}</a-descriptions-item>
    <a-descriptions-item label="调用方">{{ execution.caller }}</a-descriptions-item>
    <a-descriptions-item label="来源">{{ execution.source === "INTERNAL" ? "内部服务" : execution.source === "API" ? "外部应用" : "测试聊天" }}</a-descriptions-item>
    <a-descriptions-item v-if="execution.businessReference" label="任务标识" :span="2">{{ execution.businessReference }}</a-descriptions-item>
    <a-descriptions-item label="开始时间">{{ execution.startedTime.replace("T", " ") }}</a-descriptions-item>
    <a-descriptions-item label="结果">{{ statusLabel(execution.status) }}</a-descriptions-item>
    <a-descriptions-item label="版本">{{ execution.versionNo ?? "—" }}</a-descriptions-item>
    <a-descriptions-item label="模型">{{ execution.modelName || "—" }}</a-descriptions-item>
    <a-descriptions-item label="耗时">{{ execution.durationMs == null ? "—" : `${execution.durationMs} ms` }}</a-descriptions-item>
    <a-descriptions-item label="Token（输入 / 输出）">{{ execution.inputTokens ?? "—" }} / {{ execution.outputTokens ?? "—" }}</a-descriptions-item>
    <a-descriptions-item v-if="execution.errorCode" label="错误码" :span="2">{{ execution.errorCode }}</a-descriptions-item>
  </a-descriptions>
  <a-list v-if="execution.steps.length" size="small" :data-source="execution.steps">
    <template #renderItem="{ item }">
      <a-list-item>
        <span>{{ item.type === "TOOL" ? "工具" : item.type === "MCP" ? "MCP" : "模型" }} · {{ item.name }}</span>
        <span>{{ statusLabel(item.status) }} · {{ item.durationMs }} ms<span v-if="item.errorCode"> · {{ item.errorCode }}</span></span>
      </a-list-item>
    </template>
  </a-list>
</template>
