<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Modal, message } from "ant-design-vue";
import { createSkill, disableSkill, enableSkill, listSkills, updateSkill, type IqcSkill, type IqcSkillRequest } from "@/api/config";
import { usePermission } from "@/composables/permission";

const emptyForm = (): IqcSkillRequest => ({ name: "", code: "", description: "", instructions: "", inputSchemaJson: "", outputSchemaJson: "" });
const skills = ref<IqcSkill[]>([]);
const loading = ref(false);
const saving = ref(false);
const modalOpen = ref(false);
const selected = ref<IqcSkill>();
const form = ref<IqcSkillRequest>(emptyForm());
const { can } = usePermission();

async function refresh() {
  loading.value = true;
  try { skills.value = await listSkills(); } catch { message.error("Skill 加载失败"); }
  finally { loading.value = false; }
}
function createNew() { selected.value = undefined; form.value = emptyForm(); modalOpen.value = true; }
function edit(skill: IqcSkill) {
  selected.value = skill;
  form.value = { name: skill.name, code: skill.code, description: skill.description || "", instructions: skill.instructions, inputSchemaJson: skill.inputSchemaJson || "", outputSchemaJson: skill.outputSchemaJson || "" };
  modalOpen.value = true;
}
function validJsonObject(value?: string) {
  if (!value?.trim()) return true;
  try { const parsed = JSON.parse(value); return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed); } catch { return false; }
}
async function save() {
  if (!form.value.name.trim() || !form.value.code.trim() || !form.value.instructions.trim()) { message.warning("请填写名称、编码和执行指令"); return; }
  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(form.value.code)) { message.warning("编码必须为大写字母、数字或下划线"); return; }
  if (!validJsonObject(form.value.inputSchemaJson) || !validJsonObject(form.value.outputSchemaJson)) { message.warning("输入、输出 Schema 必须是 JSON 对象"); return; }
  saving.value = true;
  try {
    if (selected.value) await updateSkill(selected.value.id, form.value); else await createSkill(form.value);
    message.success(selected.value ? "Skill 已更新" : "Skill 已创建"); modalOpen.value = false; await refresh();
  } catch { message.error("保存失败，请检查编码是否重复或 Schema 是否有效"); }
  finally { saving.value = false; }
}
function changeStatus(skill: IqcSkill) {
  const enabling = skill.status === "DISABLED";
  Modal.confirm({ title: `${enabling ? "启用" : "停用"} Skill`, content: `${enabling ? "启用后可被 Agent 选择。" : "停用后将不能被新 Agent 版本选择，历史版本不受影响。"}`,
    async onOk() { if (enabling) await enableSkill(skill.id); else await disableSkill(skill.id); message.success("状态已更新"); await refresh(); } });
}
onMounted(() => { void refresh(); });
</script>

<template>
  <section class="page-intro"><div><span class="section-kicker">AGENT ASSETS</span><h2>Skill 管理</h2><p>集中维护可复用的专家指令和输入输出约束，Agent 创建时只选择已启用 Skill。</p></div><a-button v-if="can('iqc:skill:manage')" type="primary" @click="createNew">创建 Skill</a-button></section>
  <a-card :bordered="false"><a-table :data-source="skills" :loading="loading" row-key="id" :pagination="{ pageSize: 10 }" :scroll="{ x: 900 }">
    <a-table-column title="名称" data-index="name" :width="180" />
    <a-table-column title="编码" data-index="code" :width="180" />
    <a-table-column title="说明" data-index="description" />
    <a-table-column title="版本" data-index="versionNo" :width="80" />
    <a-table-column title="状态" :width="90"><template #default="{ record }"><a-tag :color="record.status === 'ENABLED' ? 'green' : 'default'">{{ record.status === 'ENABLED' ? '启用' : '停用' }}</a-tag></template></a-table-column>
    <a-table-column title="操作" :width="150" fixed="right"><template #default="{ record }"><a-button type="link" @click="edit(record)">查看<span v-if="can('iqc:skill:manage')">/编辑</span></a-button><a-button v-if="can('iqc:skill:manage')" type="link" :danger="record.status === 'ENABLED'" @click="changeStatus(record)">{{ record.status === "ENABLED" ? "停用" : "启用" }}</a-button></template></a-table-column>
  </a-table></a-card>
  <a-modal v-model:open="modalOpen" :title="selected ? `编辑 Skill：${selected.name}` : '创建 Skill'" width="min(720px, calc(100vw - 32px))" :styles="{ body: { maxHeight: 'calc(100vh - 190px)', overflowY: 'auto' } }" :confirm-loading="saving" :ok-button-props="{ disabled: !can('iqc:skill:manage') }" @ok="save">
    <a-form layout="vertical"><a-row :gutter="16"><a-col :span="12"><a-form-item label="名称" required><a-input v-model:value="form.name" :disabled="!can('iqc:skill:manage')" /></a-form-item></a-col><a-col :span="12"><a-form-item label="编码" required><a-input v-model:value="form.code" :disabled="Boolean(selected) || !can('iqc:skill:manage')" placeholder="例如 COMPLIANCE_REVIEW" /></a-form-item></a-col></a-row>
      <a-form-item label="说明"><a-input v-model:value="form.description" :disabled="!can('iqc:skill:manage')" /></a-form-item>
      <a-form-item label="执行指令" required><a-textarea v-model:value="form.instructions" :disabled="!can('iqc:skill:manage')" :rows="8" :maxlength="16000" show-count /></a-form-item>
      <a-form-item label="输入 Schema（JSON 对象）"><a-textarea v-model:value="form.inputSchemaJson" :disabled="!can('iqc:skill:manage')" :rows="4" placeholder='{"type":"object"}' /></a-form-item>
      <a-form-item label="输出 Schema（JSON 对象）"><a-textarea v-model:value="form.outputSchemaJson" :disabled="!can('iqc:skill:manage')" :rows="4" placeholder='{"type":"object"}' /></a-form-item>
    </a-form>
  </a-modal>
</template>
