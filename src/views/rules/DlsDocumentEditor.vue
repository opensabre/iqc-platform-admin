<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { message } from "ant-design-vue";

type Definition = { name: string; kind: "SLOT" | "RULE"; expression: string; targetRole: string };
const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const definitions = ref<Definition[]>([]);
const source = ref<{ fileName: string; sheetName: string } | null>(null);
const entryName = ref("");
const entryExpression = ref("");
const parseError = ref("");
let loading = false;

const documentJson = computed(() => JSON.stringify({
  languageVersion: "1.0", source: source.value, definitions: definitions.value,
  entryName: entryName.value, entryExpression: entryExpression.value,
}, null, 2));

function load(value: string) {
  loading = true;
  try {
    const document = value ? JSON.parse(value) : {};
    definitions.value = Array.isArray(document.definitions) ? document.definitions.map((item: Partial<Definition>) => ({
      name: item.name || "", kind: item.kind === "RULE" ? "RULE" : "SLOT",
      expression: item.expression || "", targetRole: item.targetRole || "all",
    })) : [];
    source.value = document.source || null;
    entryName.value = document.entryName || "";
    entryExpression.value = document.entryExpression || "";
    parseError.value = "";
  } catch { parseError.value = "DLS JSON 无法解析，请在高级模式中修复"; }
  loading = false;
}
watch(() => props.modelValue, (value) => { if (value !== documentJson.value) load(value); }, { immediate: true });
watch([definitions, source, entryName, entryExpression], () => { if (!loading) emit("update:modelValue", documentJson.value); }, { deep: true });

const slots = computed(() => definitions.value.filter((item) => item.kind === "SLOT"));
const rules = computed(() => definitions.value.filter((item) => item.kind === "RULE"));
function references(expression: string, prefix: "slot_" | "rule_") {
  const pattern = new RegExp(`\\[?(${prefix}[\\p{L}\\p{N}_/\\-]+)\\]?`, "gu");
  return [...expression.matchAll(pattern)].map((match) => match[1]);
}
function usedBy(name: string) {
  const owners = definitions.value.filter((item) => references(item.expression, name.startsWith("slot_") ? "slot_" : "rule_").includes(name)).map((item) => item.name);
  if (name.startsWith("rule_") && references(entryExpression.value, "rule_").includes(name)) owners.push("最终入口");
  return owners;
}
function nextName(kind: "SLOT" | "RULE") {
  const prefix = kind === "SLOT" ? "slot_" : "rule_";
  let index = definitions.value.filter((item) => item.kind === kind).length + 1;
  while (definitions.value.some((item) => item.name === `${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
}
function add(kind: "SLOT" | "RULE") { definitions.value.push({ name: nextName(kind), kind, expression: "", targetRole: "all" }); }
function remove(target: Definition) {
  const owners = usedBy(target.name);
  if (owners.length) {
    message.warning(`${target.name} 正被 ${owners.join("、")} 引用，请先解除引用`);
    return;
  }
  definitions.value = definitions.value.filter((item) => item !== target);
}
</script>

<template>
  <a-alert v-if="parseError" type="error" show-icon :message="parseError" style="margin-bottom:12px" />
  <a-tabs>
    <a-tab-pane key="slots" :tab="`SLOT 词槽 (${slots.length})`">
      <a-alert type="info" show-icon message="SLOT 是当前 DLS 私有的可复用正则片段，可以被多个 RULE 引用。" style="margin-bottom:12px" />
      <a-table :data-source="slots" :pagination="false" row-key="name" size="small">
        <a-table-column title="名称" :width="180"><template #default="{ record }"><a-input v-model:value="record.name" /></template></a-table-column>
        <a-table-column title="正则片段"><template #default="{ record }"><a-textarea v-model:value="record.expression" :auto-size="{ minRows:1, maxRows:4 }" /></template></a-table-column>
        <a-table-column title="被引用" :width="180"><template #default="{ record }">{{ usedBy(record.name).join('、') || '未使用' }}</template></a-table-column>
        <a-table-column title="操作" :width="70"><template #default="{ record }"><a-button danger type="link" @click="remove(record)">删除</a-button></template></a-table-column>
      </a-table>
      <a-button style="margin-top:12px" @click="add('SLOT')">新增 SLOT</a-button>
    </a-tab-pane>
    <a-tab-pane key="rules" :tab="`RULE 子规则 (${rules.length})`">
      <a-alert type="info" show-icon message="RULE 引用当前 DLS 的 SLOT，形成针对消息的可执行匹配规则。" style="margin-bottom:12px" />
      <a-table :data-source="rules" :pagination="false" row-key="name" size="small">
        <a-table-column title="名称" :width="180"><template #default="{ record }"><a-input v-model:value="record.name" /></template></a-table-column>
        <a-table-column title="角色" :width="125"><template #default="{ record }"><a-select v-model:value="record.targetRole" style="width:100%"><a-select-option value="all">双方</a-select-option><a-select-option value="agent">客服/销售</a-select-option><a-select-option value="user">客户</a-select-option></a-select></template></a-table-column>
        <a-table-column title="表达式"><template #default="{ record }"><a-textarea v-model:value="record.expression" :auto-size="{ minRows:1, maxRows:4 }" placeholder="[slot_称呼].{0,5}[slot_辱骂词]" /></template></a-table-column>
        <a-table-column title="引用 SLOT" :width="170"><template #default="{ record }">{{ references(record.expression, 'slot_').join('、') || '无' }}</template></a-table-column>
        <a-table-column title="操作" :width="70"><template #default="{ record }"><a-button danger type="link" @click="remove(record)">删除</a-button></template></a-table-column>
      </a-table>
      <a-button style="margin-top:12px" @click="add('RULE')">新增 RULE</a-button>
    </a-tab-pane>
    <a-tab-pane key="entry" tab="ENTRY 最终规则">
      <a-alert type="info" show-icon message="ENTRY 组合 RULE 的命中事件，形成当前 DLS 的会话级最终结论。" style="margin-bottom:12px" />
      <a-form layout="vertical">
        <a-form-item label="最终规则名称" required><a-input v-model:value="entryName" /></a-form-item>
        <a-form-item label="最终入口表达式" required><a-textarea v-model:value="entryExpression" :rows="5" placeholder="[rule_辱骂]&![rule_否定辱骂]" /></a-form-item>
        <a-form-item label="引用的 RULE"><a-space wrap><a-tag v-for="name in references(entryExpression, 'rule_')" :key="name">{{ name }}</a-tag><span v-if="!references(entryExpression, 'rule_').length">尚未引用 RULE</span></a-space></a-form-item>
      </a-form>
    </a-tab-pane>
  </a-tabs>
</template>
