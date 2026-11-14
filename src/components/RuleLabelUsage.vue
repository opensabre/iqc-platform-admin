<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { listLabelsUsingRule, type InsightLabel } from "@/api/labels";
const props = defineProps<{ruleId:string}>();
const labels = ref<InsightLabel[]>([]), current = ref(1), total = ref(0), loading = ref(false), error = ref("");
const size = 20;
let generation = 0;
async function load(page=1) {
  const request = ++generation; current.value = page; loading.value = true; error.value = ""; labels.value = []; total.value = 0;
  try {
    const result = await listLabelsUsingRule(props.ruleId,page,size);
    if (request === generation) {labels.value = result.records; current.value = result.current; total.value = result.total;}
  } catch { if (request === generation) error.value = "引用标签加载失败，请重试"; }
  finally { if (request === generation) loading.value = false; }
}
watch(() => props.ruleId, () => {current.value = 1; void load();}, {immediate:true});
onBeforeUnmount(() => {generation++;});
</script>
<template>
  <section aria-label="规则引用标签">
    <p>显示当前绑定且你有权查看的标签；历史执行使用各自冻结快照。</p>
    <a-alert v-if="error" type="error" show-icon :message="error"><template #action><a-button @click="load(current)">重试</a-button></template></a-alert>
    <a-spin :spinning="loading">
      <a-empty v-if="!loading && !error && !labels.length" description="暂无可见的引用标签" />
      <ul><li v-for="label in labels" :key="label.id">{{ label.name }} · {{ label.code }} · V{{ label.versionNo }} · {{ label.status }}</li></ul>
      <a-space v-if="!error && !loading && total">
        <a-button :disabled="current <= 1" @click="load(current-1)">上一页</a-button>
        <span>第 {{ current }} 页 · 共 {{ total }} 个可见标签</span>
        <a-button :disabled="current*size >= total" @click="load(current+1)">下一页</a-button>
      </a-space>
    </a-spin>
  </section>
</template>
<style scoped>li{padding:8px 0;overflow-wrap:anywhere}ul{padding-left:20px}</style>
