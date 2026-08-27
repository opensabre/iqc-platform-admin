<script setup lang="ts">
import { onMounted, ref } from "vue";
import { message } from "ant-design-vue";
import { getSettings, type IqcSettings } from "@/api/settings";

const loading = ref(false);
const settings = ref<IqcSettings>();

async function refresh() {
  loading.value = true;
  try {
    settings.value = await getSettings();
  } catch {
    message.error("系统设置加载失败");
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
</script>

<template>
  <section class="page-intro"><div><span class="section-kicker">SYSTEM SETTINGS</span><h2>系统设置</h2><p>查看模型调用与 OpenSabre 治理能力状态。模型 API Key 由管理员在模型配置中维护并加密保存。</p></div><a-button @click="refresh">刷新</a-button></section>
  <a-spin :spinning="loading"><template v-if="settings"><a-row :gutter="16"><a-col :span="12"><a-card title="模型配置" :bordered="false"><a-descriptions bordered :column="1"><a-descriptions-item label="调用状态"><a-tag :color="settings.model.enabled ? 'green' : 'default'">{{ settings.model.enabled ? '已启用' : '未启用' }}</a-tag></a-descriptions-item><a-descriptions-item label="端点配置">{{ settings.model.endpointConfigured ? '已配置（地址已隐藏）' : '未配置' }}</a-descriptions-item><a-descriptions-item label="模型">{{ settings.model.model }}</a-descriptions-item><a-descriptions-item label="连接/读取超时">{{ settings.model.connectTimeoutMillis }}ms / {{ settings.model.readTimeoutMillis }}ms</a-descriptions-item><a-descriptions-item label="最大尝试次数">{{ settings.model.maxAttempts }}</a-descriptions-item><a-descriptions-item label="调用限次">{{ settings.model.rateLimitMaxCount }} 次 / {{ settings.model.rateLimitPeriod }} 秒</a-descriptions-item></a-descriptions></a-card></a-col><a-col :span="12"><a-card title="平台治理能力" :bordered="false"><a-descriptions bordered :column="1"><a-descriptions-item v-for="(value, key) in settings.governance" :key="key" :label="key">{{ value }}</a-descriptions-item></a-descriptions><a-alert type="info" show-icon message="操作日志由 OpenSabre base-sysadmin 统一记录" description="IQC 业务接口已声明审计注解；如需查询明细，请使用平台审计日志菜单。" style="margin-top: 16px" /></a-card></a-col></a-row></template><a-empty v-else description="暂无设置数据" /></a-spin>
</template>
