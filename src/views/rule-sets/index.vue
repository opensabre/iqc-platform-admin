<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { message } from "ant-design-vue";
import {
  approveRuleSet,
  createRuleSet,
  listRules,
  listRuleSets,
  rejectRuleSet,
  submitRuleSet,
  type QualityRule,
  type QualityRuleSet,
} from "@/api/config";
import { usePermission } from "@/composables/permission";

const { can } = usePermission();
const sets = ref<QualityRuleSet[]>([]);
const rules = ref<QualityRule[]>([]);
const open = ref(false);
const saving = ref(false);
const form = ref({
  name: "",
  code: "",
  description: "",
  ruleIds: [] as string[],
  aggregationMode: "ALL" as "ALL" | "ANY",
});
const publishedRules = computed(() =>
  rules.value.filter((rule) => rule.status === "PUBLISHED")
);
function memberNames(set: QualityRuleSet) {
  try {
    const ids = JSON.parse(set.ruleIdsJson) as string[];
    return ids
      .map((id) => rules.value.find((rule) => rule.id === id)?.name || id)
      .join("、");
  } catch {
    return "成员数据异常";
  }
}
let disposed = false;
let generation = 0;
async function refresh() {
  const current = ++generation;
  try {
    const [nextSets, nextRules] = await Promise.all([
      can("iqc:rule-set:view") ? listRuleSets() : Promise.resolve([]),
      can("iqc:rule:view") ? listRules() : Promise.resolve([]),
    ]);
    if (disposed || current !== generation) return;
    sets.value = nextSets.map(({ description: _description, ...metadata }) => metadata);
    rules.value = nextRules.map(({ expression: _expression, description: _description, ...metadata }) => metadata);
  } catch {
    if (!disposed && current === generation) message.error("规则集加载失败");
  }
}
function createNew() {
  if (disposed || !can("iqc:rule-set:manage") || !can("iqc:rule:view")) return;
  form.value = {
    name: "",
    code: "",
    description: "",
    ruleIds: [],
    aggregationMode: "ALL",
  };
  open.value = true;
}
async function save() {
  if (disposed || saving.value || !can("iqc:rule-set:manage") || !can("iqc:rule:view")) return;
  if (!form.value.name || !form.value.code || !form.value.ruleIds.length)
    return void message.warning("请填写名称、编码并选择规则");
  saving.value = true;
  try {
    await createRuleSet({ ...form.value, ruleIds: [...form.value.ruleIds] });
    if (disposed || !can("iqc:rule-set:manage") || !can("iqc:rule:view")) return;
    message.success("规则集已创建");
    open.value = false;
    await refresh();
  } catch {
    if (!disposed) message.error("规则集创建失败，请核对已有草稿后再重试");
  } finally {
    saving.value = false;
  }
}
async function submit(id: string) {
  if (disposed || !can("iqc:rule-set:submit")) return;
  try {
    await submitRuleSet(id);
    if (disposed || !can("iqc:rule-set:submit")) return;
    message.success("已提交审批");
    await refresh();
  } catch {
    message.error("提交失败，请确认成员规则均已发布");
  }
}
async function approve(id: string) {
  if (disposed || !can("iqc:rule-set:approve")) return;
  try {
    await approveRuleSet(id);
    if (disposed || !can("iqc:rule-set:approve")) return;
    message.success("规则集已发布");
    await refresh();
  } catch {
    message.error("审批失败");
  }
}
async function reject(id: string) {
  if (disposed || !can("iqc:rule-set:reject")) return;
  try {
    await rejectRuleSet(id);
    if (disposed || !can("iqc:rule-set:reject")) return;
    message.success("规则集已驳回");
    await refresh();
  } catch {
    message.error("驳回失败");
  }
}
watch(() => [can("iqc:rule-set:view"), can("iqc:rule:view"), can("iqc:rule-set:manage")], () => {
  if (!can("iqc:rule-set:manage") || !can("iqc:rule:view")) open.value = false;
  sets.value = []; rules.value = [];
  void refresh();
});
watch(open, (visible) => {
  if (!visible) form.value = { name: "", code: "", description: "", ruleIds: [], aggregationMode: "ALL" };
});
onBeforeUnmount(() => {
  disposed = true; generation++; sets.value = []; rules.value = [];
  form.value = { name: "", code: "", description: "", ruleIds: [], aggregationMode: "ALL" };
});
onMounted(refresh);
</script>
<template>
  <section class="page-intro">
    <div>
      <span class="section-kicker">RULE SET ORCHESTRATION</span>
      <h2>规则集</h2>
      <p>
        将已发布的单消息规则和 DLS 会话规则按顺序编排，作为智能体与质检任务的稳定输入。
      </p>
    </div>
    <a-button v-if="can('iqc:rule-set:manage')" :disabled="!can('iqc:rule:view')" :title="can('iqc:rule:view') ? undefined : '需要读取已发布规则以选择成员'" type="primary" @click="createNew"
      >创建规则集</a-button
    >
  </section>
  <a-card :bordered="false"
    ><a-alert v-if="!can('iqc:rule-set:view')" type="info" show-icon message="当前未授权查看规则集" /><a-table v-else :data-source="sets" row-key="id"
      ><a-table-column title="名称" data-index="name" /><a-table-column
        title="编码"
        data-index="code"
      /><a-table-column
        title="聚合"
        data-index="aggregationMode"
        :width="90"
      /><a-table-column title="规则成员"
        ><template #default="{ record }">{{
          memberNames(record)
        }}</template></a-table-column
      ><a-table-column
        title="版本"
        data-index="versionNo"
        :width="70"
      /><a-table-column title="状态" data-index="status" /><a-table-column
        title="操作"
        :width="240"
        ><template #default="{ record }"
          ><a-button
            v-if="record.status === 'DRAFT' && can('iqc:rule-set:submit')"
            type="link"
            @click="submit(record.id)"
            >提交审批</a-button
          ><a-button
            v-if="
              record.status === 'PENDING_APPROVAL' && can('iqc:rule-set:approve')
            "
            type="link"
            @click="approve(record.id)"
            >发布</a-button
          ><a-button
            v-if="
              record.status === 'PENDING_APPROVAL' && can('iqc:rule-set:reject')
            "
            danger
            type="link"
            @click="reject(record.id)"
            >驳回</a-button
          ></template
        ></a-table-column
      ></a-table
    ></a-card
  >
  <a-modal
    v-model:open="open"
    wrap-class-name="iqc-rule-modal"
    title="创建规则集"
    width="900"
    :confirm-loading="saving"
    :closable="!saving" :mask-closable="!saving" :keyboard="!saving"
    :cancel-button-props="{ disabled: saving }"
    @ok="save"
    ><a-form layout="vertical"
      ><a-row :gutter="16"
        ><a-col :span="12"
          ><a-form-item label="名称" required
            ><a-input v-model:value="form.name" /></a-form-item></a-col
        ><a-col :span="12"
          ><a-form-item label="稳定编码" required
            ><a-input v-model:value="form.code" /></a-form-item></a-col></a-row
      ><a-form-item label="聚合模式"
        ><a-radio-group v-model:value="form.aggregationMode"
          ><a-radio-button value="ALL">全部执行</a-radio-button
          ><a-radio-button value="ANY">任一命中</a-radio-button></a-radio-group
        ></a-form-item
      ><a-form-item label="规则成员" required
        ><a-select
          v-model:value="form.ruleIds"
          mode="multiple"
          option-filter-prop="label"
          placeholder="按选择顺序组成规则集"
          ><a-select-option
            v-for="rule in publishedRules"
            :key="rule.id"
            :value="rule.id"
            :label="rule.name"
            >{{ rule.name }} · {{ rule.ruleType }}</a-select-option
          ></a-select
        ></a-form-item
      ><a-form-item label="说明"
        ><a-textarea
          v-model:value="form.description"
          :rows="3" /></a-form-item></a-form
  ></a-modal>
</template>
