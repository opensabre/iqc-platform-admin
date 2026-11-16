<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { message } from "ant-design-vue";
import { listAgents, type QualityAgent } from "@/api/config";
import { getLabelTree, type LabelTree } from "@/api/labels";
import TaskCreateWizard from "@/components/TaskCreateWizard.vue";

const router = useRouter();
const loading = ref(false), saving = ref(false);
const agents = ref<QualityAgent[]>([]);
const labelTree = ref<LabelTree>({ categories: [], groups: [], labels: [] });
const referenceErrors = ref<string[]>([]);
const labelingTargets = computed(() => labelTree.value.labels
  .filter(label => label.status === "PUBLISHED").map(label => ({ value: label.id, label: label.name })));

/** Load each creation catalog independently so one failure does not discard the other. */
async function loadReferences() {
  loading.value = true;
  try {
    const [agentList, taxonomy] = await Promise.allSettled([listAgents(), getLabelTree()]);
    agents.value = agentList.status === "fulfilled" ? agentList.value.filter(agent => agent.status === "PUBLISHED") : [];
    labelTree.value = taxonomy.status === "fulfilled" ? taxonomy.value : { categories: [], groups: [], labels: [] };
    referenceErrors.value = [
      { result: agentList, name: "智能体" }, { result: taxonomy, name: "标签" },
    ].filter(item => item.result.status === "rejected").map(item => item.name);
  } finally { loading.value = false; }
}
function returnToList() { void router.push("/tasks"); }
function createdTask() {
  message.success("任务已创建");
  returnToList();
}
onMounted(loadReferences);
</script>

<template>
  <section class="page-intro">
    <div>
      <span class="section-kicker">CREATE TASK</span>
      <h2>创建任务</h2>
      <p>选择会话数据、规则与标签，并设置任务触发计划。</p>
    </div>
    <a-button :disabled="saving" @click="returnToList">返回任务列表</a-button>
  </section>
  <a-alert v-if="referenceErrors.length" type="warning" show-icon
    :message="`${referenceErrors.join('、')}配置加载失败；可重试加载。`" class="reference-error">
    <template #action><a-button size="small" :loading="loading" :disabled="saving" @click="loadReferences">重试加载</a-button></template>
  </a-alert>
  <a-spin :spinning="loading">
    <TaskCreateWizard :agents="agents" :labeling-targets="labelingTargets"
      @busy-change="saving = $event" @cancel="returnToList" @created="createdTask" />
  </a-spin>
</template>

<style scoped>
.reference-error { margin-bottom: 16px; }
</style>
