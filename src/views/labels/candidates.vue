<script setup lang="ts">
import { onMounted, ref } from "vue";
import { message } from "ant-design-vue";
import {
  approveLabelCandidate,
  getLabelTree,
  listLabelCandidates,
  listCandidateSimilarities,
  mergeLabelCandidate,
  rejectLabelCandidate,
  type LabelCandidate,
  type LabelTree,
  type LabelSimilarity,
} from "@/api/labels";
import { usePermission } from "@/composables/permission";

const { can } = usePermission();
const candidates = ref<LabelCandidate[]>([]);
const taxonomy = ref<LabelTree>({ categories: [], groups: [], labels: [] });
const loading = ref(false),
  reviewOpen = ref(false),
  mergeOpen = ref(false),
  saving = ref(false);
const selected = ref<LabelCandidate>();
const form = ref({ groupId: "", targetRole: "all", weight: 1, comment: "" });
const mergeTargetId = ref("");
const similarities = ref<LabelSimilarity[]>([]);

async function refresh() {
  loading.value = true;
  try {
    [candidates.value, taxonomy.value] = await Promise.all([
      listLabelCandidates(),
      getLabelTree(),
    ]);
  } catch {
    message.error("候选标签加载失败");
  } finally {
    loading.value = false;
  }
}
function approve(item: LabelCandidate) {
  selected.value = item;
  form.value = {
    groupId: item.groupId || "",
    targetRole: "all",
    weight: 1,
    comment: "",
  };
  reviewOpen.value = true;
}
async function submit() {
  if (!selected.value || !form.value.groupId)
    return void message.warning("请选择标签组");
  saving.value = true;
  try {
    await approveLabelCandidate(selected.value.id, form.value);
    message.success("候选已转为标签草稿，仍需绑定规则并发布");
    reviewOpen.value = false;
    await refresh();
  } catch {
    message.error("批准失败");
  } finally {
    saving.value = false;
  }
}
async function reject(item: LabelCandidate) {
  try {
    await rejectLabelCandidate(item.id, "人工审核拒绝");
    message.success("候选已拒绝");
    await refresh();
  } catch {
    message.error("拒绝失败");
  }
}
async function openMerge(item:LabelCandidate){ selected.value=item; mergeTargetId.value=""; similarities.value=[]; mergeOpen.value=true; try { similarities.value=await listCandidateSimilarities(item.id); } catch { message.warning("相似标签建议加载失败，可手动选择"); } }
async function merge(){ if(!selected.value||!mergeTargetId.value)return void message.warning("请选择合并目标标签"); saving.value=true; try{await mergeLabelCandidate(selected.value.id,mergeTargetId.value,"人工确认相似标签");message.success("候选已合并到现有标签");mergeOpen.value=false;await refresh();}catch{message.error("合并失败");}finally{saving.value=false;} }
onMounted(refresh);
</script>

<template>
  <section class="page-intro">
    <div>
      <span class="section-kicker">AI LABEL CANDIDATES</span>
      <h2>候选标签</h2>
      <p>
        AI 建议先进入隔离候选池；人工批准后只生成草稿，不能绕过规则绑定与发布。
      </p>
    </div>
  </section>
  <a-card :bordered="false"
    ><a-table :loading="loading" :data-source="candidates" row-key="id"
      ><a-table-column title="建议标签" :width="220"
        ><template #default="{ record }"
          ><strong>{{ record.suggestedName }}</strong
          ><br /><a-typography-text type="secondary">{{
            record.suggestedCode
          }}</a-typography-text></template
        ></a-table-column
      ><a-table-column title="任务/会话"
        ><template #default="{ record }"
          >{{ record.taskId }}<br />{{ record.conversationId }}</template
        ></a-table-column
      ><a-table-column
        title="置信度"
        data-index="confidence"
        :width="100"
      /><a-table-column
        title="状态"
        data-index="status"
        :width="110"
      /><a-table-column title="操作" :width="160"
        ><template #default="{ record }"
          ><template
            v-if="
              record.status === 'PENDING' && can('iqc:label-candidate:review')
            "
            ><a-button type="link" @click="approve(record)">批准为草稿</a-button
            ><a-button type="link" @click="openMerge(record)">合并</a-button
            ><a-button type="link" danger @click="reject(record)"
              >拒绝</a-button
            ></template
          ></template
        ></a-table-column
      ></a-table
    ></a-card
  >
  <a-modal
    v-model:open="reviewOpen"
    title="批准候选标签"
    :confirm-loading="saving"
    @ok="submit"
    ><a-alert
      type="warning"
      show-icon
      message="批准仅创建 DRAFT 标签；请随后配置标签值、绑定已发布规则并单独发布。"
      style="margin-bottom: 16px" /><a-form layout="vertical"
      ><a-form-item label="目标标签组" required
        ><a-select v-model:value="form.groupId"
          ><a-select-option
            v-for="item in taxonomy.groups"
            :key="item.id"
            :value="item.id"
            >{{ item.name }}</a-select-option
          ></a-select
        ></a-form-item
      ><a-row :gutter="12"
        ><a-col :span="12"
          ><a-form-item label="适用角色"
            ><a-select v-model:value="form.targetRole"
              ><a-select-option value="all">全部</a-select-option
              ><a-select-option value="agent">员工</a-select-option
              ><a-select-option value="user">客户</a-select-option
              ><a-select-option value="both">双方</a-select-option></a-select
            ></a-form-item
          ></a-col
        ><a-col :span="12"
          ><a-form-item label="权重"
            ><a-input-number
              v-model:value="form.weight"
              :min="0"
              style="width: 100%" /></a-form-item></a-col></a-row
      ><a-form-item label="审核说明"
        ><a-textarea v-model:value="form.comment" /></a-form-item></a-form
  ></a-modal>
  <a-modal v-model:open="mergeOpen" title="合并到现有标签" :confirm-loading="saving" @ok="merge"><a-form layout="vertical"><a-form-item v-if="similarities.length" label="相似标签建议"><a-space wrap><a-tag v-for="item in similarities" :key="item.labelId" color="blue" style="cursor:pointer" @click="mergeTargetId=item.labelId">{{item.name}} · {{(Number(item.score)*100).toFixed(0)}}%</a-tag></a-space></a-form-item><a-form-item label="目标标签" required><a-select v-model:value="mergeTargetId" show-search option-filter-prop="label"><a-select-option v-for="item in taxonomy.labels.filter(label=>label.status==='PUBLISHED')" :key="item.id" :value="item.id" :label="item.name">{{item.name}} · {{item.code}}</a-select-option></a-select></a-form-item></a-form></a-modal>
</template>
