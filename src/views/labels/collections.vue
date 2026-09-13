<script setup lang="ts">
import { onMounted, ref } from "vue";
import { message, Modal } from "ant-design-vue";
import {
  createLabelCollection,
  reviseLabelCollection,
  disableLabelCollection,
  getLabelCollection,
  getLabelTree,
  listLabelCollections,
  publishLabelCollection,
  type LabelCollection,
  type LabelMember,
  type LabelTree,
} from "@/api/labels";
import { usePermission } from "@/composables/permission";
import LabelTreeSelector from "@/components/LabelTreeSelector.vue";

const { can } = usePermission();
const collections = ref<LabelCollection[]>([]),
  taxonomy = ref<LabelTree>({ categories: [], groups: [], labels: [] });
const loading = ref(false),
  open = ref(false),
  saving = ref(false);
const checkedKeys = ref<string[]>([]);
const editId = ref("");
const form = ref({ name: "", code: "", description: "" });
async function refresh() {
  loading.value = true;
  try {
    [collections.value, taxonomy.value] = await Promise.all([
      listLabelCollections(),
      getLabelTree(),
    ]);
  } catch {
    message.error("标签集合加载失败");
  } finally {
    loading.value = false;
  }
}
function create() {
  editId.value = "";
  form.value = { name: "", code: "", description: "" };
  checkedKeys.value = [];
  open.value = true;
}
async function edit(item: LabelCollection) {
  try {
    const detail = await getLabelCollection(item.id);
    editId.value = item.id;
    form.value = { name: item.name, code: item.code, description: item.description || "" };
    checkedKeys.value = detail.members.map((member) => `${member.memberType}:${member.memberId}`);
    open.value = true;
  } catch { message.error("集合详情加载失败"); }
}
async function save() {
  if (!form.value.name || !form.value.code || !checkedKeys.value.length)
    return void message.warning("请填写名称、编码并选择成员");
  saving.value = true;
  try {
    const members: LabelMember[] = checkedKeys.value.map((key) => {
      const [memberType, memberId] = key.split(":");
      return { memberType: memberType as LabelMember["memberType"], memberId };
    });
    if (editId.value) await reviseLabelCollection(editId.value, { ...form.value, members });
    else await createLabelCollection({ ...form.value, members });
    message.success(editId.value ? "标签集合已修订为草稿" : "标签集合已创建");
    open.value = false;
    await refresh();
  } catch {
    message.error("创建失败");
  } finally {
    saving.value = false;
  }
}
function disable(item: LabelCollection) {
  Modal.confirm({ title: `确认停用“${item.name}”？`, async onOk() { try { await disableLabelCollection(item.id); message.success("集合已停用"); await refresh(); } catch { message.error("停用失败"); } } });
}
async function publish(id: string) {
  try {
    await publishLabelCollection(id);
    message.success("标签集合已发布");
    await refresh();
  } catch {
    message.error("发布失败");
  }
}
onMounted(refresh);
</script>
<template>
  <section class="page-intro">
    <div>
      <span class="section-kicker">LABEL COLLECTIONS</span>
      <h2>标签集合</h2>
      <p>集合只负责业务选择，任务创建时展开为固定标签与规则快照。</p>
    </div>
    <a-button
      v-if="can('iqc:label-collection:manage')"
      type="primary"
      @click="create"
      >新建集合</a-button
    >
  </section>
  <a-card :bordered="false"
    ><a-table :loading="loading" :data-source="collections" row-key="id"
      ><a-table-column title="名称" data-index="name" /><a-table-column
        title="编码"
        data-index="code"
      /><a-table-column title="说明" data-index="description" /><a-table-column
        title="版本"
        :width="80"
        ><template #default="{ record }"
          >V{{ record.versionNo }}</template
        ></a-table-column
      ><a-table-column
        title="状态"
        data-index="status"
        :width="120"
      /><a-table-column title="操作" :width="220"
        ><template #default="{ record }"
          ><a-button
            v-if="
              record.status === 'DRAFT' && can('iqc:label-collection:manage')
            "
            type="link"
            @click="publish(record.id)"
            >发布</a-button
          ><a-button v-if="can('iqc:label-collection:manage')" type="link" @click="edit(record)">编辑</a-button
          ><a-button v-if="record.status !== 'DISABLED' && can('iqc:label-collection:manage')" type="link" danger @click="disable(record)">停用</a-button
          ></template
        ></a-table-column
      ></a-table
    ></a-card
  >
  <a-modal
    v-model:open="open"
    :title="editId ? '编辑标签集合' : '新建标签集合'"
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
            ><a-input v-model:value="form.code" :disabled="Boolean(editId)" /></a-form-item></a-col></a-row
      ><a-form-item label="说明"
        ><a-textarea v-model:value="form.description" /></a-form-item
      ><a-form-item label="集合成员" required
        ><LabelTreeSelector
          v-model="checkedKeys"
          :taxonomy="taxonomy" /></a-form-item></a-form
  ></a-modal>
</template>
