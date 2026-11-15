<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { getTaskExecutionSnapshot, listTaskExecutions, type TaskExecutionSnapshot, type TaskExecutionSummary } from "@/api/tasks";
const props = defineProps<{ taskId: string }>();
const opened = ref(false), loading = ref(false), error = ref("");
const executions = ref<TaskExecutionSummary[]>([]), selected = ref<string>(), snapshot = ref<TaskExecutionSnapshot>();
let generation = 0;
function pretty(value: string) { try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; } }
async function loadSnapshot() {
  const request = ++generation;
  snapshot.value = undefined; error.value = "";
  if (!selected.value) { loading.value = false; return; }
  loading.value = true;
  try {
    const result = await getTaskExecutionSnapshot(props.taskId, selected.value);
    if (request === generation) snapshot.value = result;
  } catch { if (request === generation) error.value = "执行快照加载失败，请重试"; }
  finally { if (request === generation) loading.value = false; }
}
async function open() {
  opened.value = true; const request = ++generation; loading.value = true; error.value = ""; snapshot.value = undefined; selected.value = undefined;
  try {
    const rows = await listTaskExecutions(props.taskId);
    if (request !== generation) return;
    executions.value = rows;
    selected.value = rows.find(run => run.current)?.id || rows.at(-1)?.id;
    await loadSnapshot();
  } catch { if (request === generation) { error.value = "执行记录加载失败，请重试"; loading.value = false; } }
}
watch(() => props.taskId, () => { generation++; opened.value = false; loading.value = false; error.value = ""; executions.value = []; selected.value = undefined; snapshot.value = undefined; });
onBeforeUnmount(() => { generation++; });
</script>
<template>
  <section aria-label="执行冻结快照" class="execution-snapshot">
    <a-divider orientation="left">执行冻结快照</a-divider>
    <a-button v-if="!opened" @click="open">查看各次执行快照</a-button>
    <template v-else>
      <p>以下内容来自所选执行实例，不随当前规则、标签或动作修改。</p>
      <label for="snapshot-execution">选择执行实例</label>
      <a-select id="snapshot-execution" v-model:value="selected" style="width:100%" :disabled="loading" :options="executions.map(run => ({ value: run.id, label: `轮次 ${run.runId} · 第 ${run.attemptNo} 次 · ${run.status}` }))" @change="loadSnapshot" />
      <a-alert v-if="error" type="error" show-icon :message="error"><template #action><a-button size="small" @click="selected ? loadSnapshot() : open()">重试</a-button></template></a-alert>
      <a-spin :spinning="loading">
        <a-empty v-if="!loading && !error && !executions.length" description="尚未生成执行实例" />
        <template v-if="snapshot">
          <p>执行 {{ snapshot.executionId }} · 轮次 {{ snapshot.runId }} · 第 {{ snapshot.attemptNo }} 次 · {{ snapshot.status }}</p>
          <details><summary>规则、标签、动作与 Agent 冻结配置</summary><pre>{{ pretty(snapshot.configurationSnapshotJson) }}</pre></details>
          <details><summary>选数定义与本轮会话名单</summary><pre>{{ pretty(snapshot.selectionSnapshotJson) }}</pre></details>
        </template>
      </a-spin>
    </template>
  </section>
</template>
<style scoped>
.execution-snapshot label{display:block;margin-bottom:8px}.execution-snapshot p{overflow-wrap:anywhere}.execution-snapshot pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:400px;overflow:auto}summary{cursor:pointer;color:#1677ff}details{margin-top:12px}
</style>
