<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { message, Modal } from "ant-design-vue";
import {
  createInsightLabel,
  createLabelCategory,
  createLabelGroup,
  getLabelTree,
  getLabelDetail,
  publishLabel,
  replaceLabelBindings,
  replaceLabelValues,
  reviseLabelCategory,
  reviseLabelGroup,
  reviseInsightLabel,
  disableLabelCategory,
  disableLabelGroup,
  disableInsightLabel,
  type InsightLabel,
  type LabelTree,
  type LabelDetail,
  type LabelCategory,
  type LabelGroup,
} from "@/api/labels";
import { listRules, type QualityRule } from "@/api/config";
import { usePermission } from "@/composables/permission";
import LabelValueEditor from "@/components/LabelValueEditor.vue";
import type { LabelValueRequest } from "@/api/labels";

const { can } = usePermission();
const loading = ref(false),
  keyword = ref(""),
  open = ref(false),
  saving = ref(false);
const kind = ref<"CATEGORY" | "GROUP" | "LABEL">("CATEGORY");
const data = ref<LabelTree>({ categories: [], groups: [], labels: [] });
const rules = ref<QualityRule[]>([]);
const selected = ref<InsightLabel>();
const selectedNode = ref<LabelCategory | LabelGroup | InsightLabel>();
const selectedKind = ref<"CATEGORY" | "GROUP" | "LABEL">();
const editId = ref("");
const selectedDetail = ref<LabelDetail>();
const form = ref({
  name: "",
  code: "",
  parentId: "",
  description: "",
  prompt: "",
  maxChildCount: 0,
  allowAutoExpand: false,
  targetRole: "all",
  weight: 1,
  ruleIds: [] as string[],
  values: [] as LabelValueRequest[],
});
const publishedRules = computed(() =>
  rules.value.filter((v) => v.status === "PUBLISHED")
);
const treeData = computed(() =>
  data.value.categories.map((category) => ({
    key: `CATEGORY:${category.id}`,
    title: `${category.name} (${
      data.value.groups.filter((v) => v.categoryId === category.id).length
    })`,
    children: data.value.groups
      .filter((v) => v.categoryId === category.id)
      .map((group) => ({
        key: `GROUP:${group.id}`,
        title: `${group.name} (${
          data.value.labels.filter((v) => v.groupId === group.id).length
        })`,
        children: data.value.labels
          .filter((v) => v.groupId === group.id)
          .map((label) => ({ key: `LABEL:${label.id}`, title: label.name })),
      })),
  }))
);

async function refresh() {
  loading.value = true;
  try {
    [data.value, rules.value] = await Promise.all([
      getLabelTree(keyword.value),
      listRules(),
    ]);
  } catch {
    message.error("标签树加载失败");
  } finally {
    loading.value = false;
  }
}
function create(type: "CATEGORY" | "GROUP" | "LABEL") {
  editId.value = "";
  kind.value = type;
  form.value = {
    name: "",
    code: "",
    parentId: "",
    description: "",
    prompt: "",
    maxChildCount: 0,
    allowAutoExpand: false,
    targetRole: "all",
    weight: 1,
    ruleIds: [],
    values: [],
  };
  open.value = true;
}
async function selectNode(keys: (string | number)[]) {
  const [type, id] = String(keys[0] || "").split(":");
  selected.value =
    type === "LABEL" ? data.value.labels.find((v) => v.id === id) : undefined;
  selectedKind.value = type as "CATEGORY" | "GROUP" | "LABEL";
  selectedNode.value = type === "CATEGORY" ? data.value.categories.find(v=>v.id===id) : type === "GROUP" ? data.value.groups.find(v=>v.id===id) : selected.value;
  selectedDetail.value = selected.value
    ? await getLabelDetail(selected.value.id)
    : undefined;
}
function editSelected() {
  if (!selectedNode.value || !selectedKind.value) return;
  const value = selectedNode.value;
  kind.value = selectedKind.value; editId.value = value.id;
  form.value = { name:value.name, code:value.code, parentId:"", description:"description" in value ? value.description || "" : "", prompt:"prompt" in value ? value.prompt || "" : "", maxChildCount:"maxChildCount" in value ? value.maxChildCount : 0, allowAutoExpand:"allowAutoExpand" in value ? value.allowAutoExpand : false, targetRole:"targetRole" in value ? value.targetRole : "all", weight:"weight" in value ? value.weight : 1, ruleIds:selectedDetail.value?.bindings.map(v=>v.ruleId) || [], values:selectedDetail.value?.values.map(v=>({...v})) || [] };
  if (kind.value === "GROUP") form.value.parentId = (value as LabelGroup).categoryId;
  if (kind.value === "LABEL") form.value.parentId = (value as InsightLabel).groupId;
  open.value = true;
}
function disableSelected() {
  if (!selectedNode.value || !selectedKind.value) return;
  Modal.confirm({title:`确认停用“${selectedNode.value.name}”？`,content:"分类和群组必须先停用所有有效子项；历史任务仍按快照展示。",async onOk(){ try { if(selectedKind.value==="CATEGORY") await disableLabelCategory(selectedNode.value!.id); else if(selectedKind.value==="GROUP") await disableLabelGroup(selectedNode.value!.id); else await disableInsightLabel(selectedNode.value!.id); message.success("已停用"); selected.value=undefined; selectedNode.value=undefined; await refresh(); } catch { message.error("停用失败，请确认子项状态和权限"); } }});
}
async function save() {
  if (!form.value.name || !form.value.code)
    return void message.warning("请填写名称和编码");
  saving.value = true;
  try {
    if (kind.value === "CATEGORY") {
      const payload = {
        name: form.value.name,
        code: form.value.code,
        prompt: form.value.prompt,
        maxChildCount: form.value.maxChildCount,
        allowAutoExpand: form.value.allowAutoExpand,
      };
      if (editId.value) await reviseLabelCategory(editId.value, payload); else await createLabelCategory(payload);
    }
    else if (kind.value === "GROUP") {
      if (!form.value.parentId) throw new Error("请选择一级标签");
      const payload = {
        categoryId: form.value.parentId,
        name: form.value.name,
        code: form.value.code,
        description: form.value.description,
        maxChildCount: form.value.maxChildCount,
        allowAutoExpand: form.value.allowAutoExpand,
      };
      if (editId.value) await reviseLabelGroup(editId.value, payload); else await createLabelGroup(payload);
    } else {
      if (!form.value.parentId || !form.value.ruleIds.length)
        throw new Error("请选择标签群组和规则");
      const payload = {
        groupId: form.value.parentId,
        name: form.value.name,
        code: form.value.code,
        description: form.value.description,
        targetRole: form.value.targetRole,
        weight: form.value.weight,
      };
      const label = editId.value ? await reviseInsightLabel(editId.value, payload) : await createInsightLabel(payload);
      await replaceLabelBindings(label.id, form.value.ruleIds);
      if (form.value.values.some((value) => !value.valueCode))
        throw new Error("标签值编码不能为空");
      await replaceLabelValues(label.id, form.value.values);
    }
    message.success("标签配置已保存");
    open.value = false;
    await refresh();
  } catch (e) {
    message.error(e instanceof Error ? e.message : "保存失败");
  } finally {
    saving.value = false;
  }
}
async function publish(label: InsightLabel) {
  try {
    await publishLabel(label.id);
    message.success("标签已发布");
    await refresh();
  } catch {
    message.error("发布失败，请确认已绑定已发布规则");
  }
}
onMounted(refresh);
</script>

<template>
  <section class="page-intro">
    <div>
      <span class="section-kicker">INSIGHT TAXONOMY</span>
      <h2>标签树</h2>
      <p>标签定义业务含义，判定继续复用已发布规则、DLS 与 LLM。</p>
    </div>
    <a-space v-if="can('iqc:label:manage')"
      ><a-button @click="create('CATEGORY')">新建一级标签</a-button
      ><a-button @click="create('GROUP')">新建群组</a-button
      ><a-button type="primary" @click="create('LABEL')"
        >新建标签</a-button
      ></a-space
    >
  </section>
  <a-row :gutter="16"
    ><a-col :span="8"
      ><a-card :bordered="false"
        ><a-input-search
          v-model:value="keyword"
          allow-clear
          placeholder="搜索标签、群组或编码"
          @search="refresh" /><a-spin :spinning="loading"
          ><a-tree
            :tree-data="treeData"
            default-expand-all
            block-node
            style="margin-top: 16px"
            @select="selectNode" /></a-spin></a-card
    ></a-col>
    <a-col :span="16"
      ><a-card :bordered="false" title="标签详情"
        ><a-empty
          v-if="!selectedNode"
          description="请选择一个标签资产"
        /><a-descriptions v-else bordered :column="2"
          ><a-descriptions-item label="名称">{{
            selectedNode?.name
          }}</a-descriptions-item
          ><a-descriptions-item label="编码">{{
            selectedNode?.code
          }}</a-descriptions-item
          ><a-descriptions-item v-if="selected" label="生效角色">{{
            selected.targetRole
          }}</a-descriptions-item
          ><a-descriptions-item v-if="selected" label="权重">{{
            selected.weight
          }}</a-descriptions-item
          ><a-descriptions-item label="状态"
            ><a-tag>{{ selectedNode?.status }}</a-tag></a-descriptions-item
          ><a-descriptions-item label="版本"
            >V{{ selectedNode?.versionNo }}</a-descriptions-item
          ><a-descriptions-item v-if="selected" label="说明" :span="2">{{
            selected.description || "—"
          }}</a-descriptions-item
          ><a-descriptions-item v-if="selected" label="标签值" :span="2">{{
            selectedDetail?.values
              .map((value) => `${value.valueCode} (${value.valueType})`)
              .join("、") || "无"
          }}</a-descriptions-item
          ><a-descriptions-item v-if="selected" label="绑定规则" :span="2">{{
            selectedDetail?.bindings
              .map(
                (binding) =>
                  `${
                    rules.find((rule) => rule.id === binding.ruleId)?.name ||
                    binding.ruleId
                  } V${binding.ruleVersionNo}`
              )
              .join("、") || "无"
          }}</a-descriptions-item></a-descriptions
        ><a-button
          v-if="selected?.status === 'DRAFT' && can('iqc:label:approve')"
          type="primary"
          style="margin-top: 16px"
          @click="publish(selected)"
          >发布标签</a-button
        ><a-space v-if="selectedNode && can('iqc:label:manage')" style="margin-top:16px"><a-button @click="editSelected">编辑</a-button><a-button v-if="selectedNode.status !== 'DISABLED'" danger @click="disableSelected">停用</a-button></a-space></a-card
      ></a-col
    ></a-row
  >
  <a-modal
    v-model:open="open"
    :title="editId ? '编辑标签资产' :
      kind === 'CATEGORY'
        ? '新建一级标签'
        : kind === 'GROUP'
        ? '新建标签群组'
        : '新建标签'
    "
    width="760"
    :confirm-loading="saving"
    @ok="save"
    ><a-form layout="vertical"
      ><a-row :gutter="16"
        ><a-col :span="12"
          ><a-form-item label="名称" required
            ><a-input v-model:value="form.name" /></a-form-item></a-col
        ><a-col :span="12"
          ><a-form-item label="稳定编码" required
            ><a-input v-model:value="form.code" :disabled="Boolean(editId)" /></a-form-item></a-col
      ></a-row>
      <a-form-item v-if="kind === 'GROUP'" label="所属一级标签" required
        ><a-select v-model:value="form.parentId"
          ><a-select-option
            v-for="item in data.categories"
            :key="item.id"
            :value="item.id"
            >{{ item.name }}</a-select-option
          ></a-select
        ></a-form-item
      >
      <a-form-item v-if="kind === 'LABEL'" label="所属标签群组" required
        ><a-select v-model:value="form.parentId"
          ><a-select-option
            v-for="item in data.groups"
            :key="item.id"
            :value="item.id"
            >{{ item.name }}</a-select-option
          ></a-select
        ></a-form-item
      >
      <a-form-item v-if="kind === 'CATEGORY'" label="一级标签 Prompt"
        ><a-textarea
          v-model:value="form.prompt"
          :maxlength="500" /></a-form-item
      ><a-form-item v-else label="说明"
        ><a-textarea v-model:value="form.description"
      /></a-form-item>
      <a-row v-if="kind !== 'LABEL'" :gutter="16"
        ><a-col :span="12"
          ><a-form-item label="最大子项数量"
            ><a-input-number
              v-model:value="form.maxChildCount"
              :min="0"
              style="width: 100%" /></a-form-item></a-col
        ><a-col :span="12"
          ><a-form-item label="允许自动扩展"
            ><a-switch
              v-model:checked="form.allowAutoExpand" /></a-form-item></a-col
      ></a-row>
      <template v-else
        ><a-row :gutter="16"
          ><a-col :span="12"
            ><a-form-item label="生效角色"
              ><a-select v-model:value="form.targetRole"
                ><a-select-option value="agent">坐席</a-select-option
                ><a-select-option value="user">客户</a-select-option
                ><a-select-option value="both">坐席+客户</a-select-option
                ><a-select-option value="all">全文</a-select-option></a-select
              ></a-form-item
            ></a-col
          ><a-col :span="12"
            ><a-form-item label="权重"
              ><a-input-number
                v-model:value="form.weight"
                :min="0"
                :max="100"
                style="width: 100%" /></a-form-item></a-col></a-row
        ><a-form-item label="判定规则" required
          ><a-select
            v-model:value="form.ruleIds"
            mode="multiple"
            option-filter-prop="label"
            ><a-select-option
              v-for="rule in publishedRules"
              :key="rule.id"
              :value="rule.id"
              :label="rule.name"
              >{{ rule.name }} · {{ rule.ruleType }}</a-select-option
            ></a-select
          ></a-form-item
        ><a-form-item label="标签值"
          ><LabelValueEditor v-model="form.values" /></a-form-item
      ></template> </a-form
  ></a-modal>
</template>
