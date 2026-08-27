<script setup lang="ts">
import { onMounted, ref } from "vue";
import { message } from "ant-design-vue";
import { listTemplates, materializeTemplateRules, type QualityTemplate } from "@/api/templates";
import { usePermission } from "@/composables/permission";

const templates = ref<QualityTemplate[]>([]);
const loading = ref(false);
const detailOpen = ref(false);
const selected = ref<QualityTemplate>();
const creatingId = ref("");
const { can } = usePermission();

async function refresh() {
  loading.value = true;
  try {
    templates.value = await listTemplates();
  } catch {
    message.error("模板加载失败");
  } finally {
    loading.value = false;
  }
}

function showDetail(template: QualityTemplate) {
  selected.value = template;
  detailOpen.value = true;
}

async function createRules(template: QualityTemplate) {
  creatingId.value = template.id;
  try {
    const result = await materializeTemplateRules(template.id);
    message.success(result.created
      ? `已创建 ${result.created} 条规则草稿，${result.existing} 条已存在`
      : `模板中的 ${result.existing} 条规则均已存在`);
  } catch {
    message.error("模板规则创建失败");
  } finally {
    creatingId.value = "";
  }
}

onMounted(refresh);
</script>
<template>
  <section class="page-intro"><div><span class="section-kicker">TEMPLATES</span><h2>模板中心</h2><p>查看内置业务场景模板，了解规则构成后在 Agent 和规则中心落地配置。</p></div></section>
  <a-spin :spinning="loading"><a-row :gutter="16"><a-col v-for="template in templates" :key="template.id" :span="8"><a-card :bordered="false" hoverable><a-tag color="blue">{{ template.type }}</a-tag><h3>{{ template.name }}</h3><p>{{ template.description }}</p><a-space><span>{{ template.rules.length }} 条内置规则</span><a-button type="link" @click="showDetail(template)">查看模板</a-button><a-button v-if="can('iqc:rule:manage')" type="primary" size="small" :loading="creatingId === template.id" @click="createRules(template)">创建规则</a-button></a-space></a-card></a-col></a-row></a-spin>
  <a-empty v-if="!loading && !templates.length" description="暂无可用模板" />
  <a-drawer v-model:open="detailOpen" :title="selected?.name" width="680"><template v-if="selected"><a-alert :message="selected.description" type="info" show-icon style="margin-bottom: 16px" /><a-list :data-source="selected.rules" bordered><template #renderItem="{ item }"><a-list-item><a-list-item-meta :title="item.name" :description="item.description" /><template #extra><a-tag :color="item.riskLevel === 'HIGH' ? 'error' : item.riskLevel === 'MEDIUM' ? 'warning' : 'default'">{{ item.riskLevel }}</a-tag></template></a-list-item></template></a-list></template></a-drawer>
</template>
