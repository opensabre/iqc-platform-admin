<script setup lang="ts">
import { onMounted, ref } from "vue";
import { message } from "ant-design-vue";
import { searchAuditLogs, type AuditLogItem } from "@/api/audit";

const loading = ref(false);
const records = ref<AuditLogItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const filters = ref({ module: "", operatorUsername: "", operationType: undefined as string | undefined });
const operationTypes = ["QUERY", "CREATE", "UPDATE", "IMPORT", "SCAN", "EXPORT"];

async function refresh() {
  loading.value = true;
  try {
    const result = await searchAuditLogs({ current: page.value, size: pageSize.value, module: filters.value.module || undefined, operatorUsername: filters.value.operatorUsername || undefined, operationType: filters.value.operationType });
    records.value = result.records;
    total.value = result.total;
  } catch {
    message.error("审计日志加载失败，请确认已获得平台审计日志权限");
  } finally {
    loading.value = false;
  }
}

function reset() {
  filters.value = { module: "", operatorUsername: "", operationType: undefined };
  page.value = 1;
  void refresh();
}

function changePage(next: number, size: number) {
  page.value = next;
  pageSize.value = size;
  void refresh();
}

onMounted(refresh);
</script>

<template>
  <section class="page-intro"><div><span class="section-kicker">AUDIT TRAIL</span><h2>操作日志</h2><p>查询 OpenSabre base-sysadmin 统一记录的 IQC 操作审计，不在 IQC 内重复存储。</p></div></section>
  <a-card :bordered="false" style="margin-bottom: 16px"><a-form layout="inline"><a-form-item label="模块"><a-input v-model:value="filters.module" placeholder="例如 IQC_TASK" allow-clear /></a-form-item><a-form-item label="操作人"><a-input v-model:value="filters.operatorUsername" placeholder="用户名" allow-clear /></a-form-item><a-form-item label="类型"><a-select v-model:value="filters.operationType" placeholder="全部" allow-clear style="width: 120px"><a-select-option v-for="type in operationTypes" :key="type" :value="type">{{ type }}</a-select-option></a-select></a-form-item><a-form-item><a-button type="primary" @click="page = 1; refresh()">查询</a-button><a-button style="margin-left: 8px" @click="reset">重置</a-button></a-form-item></a-form></a-card>
  <a-card :bordered="false"><a-table :data-source="records" :loading="loading" :pagination="false" row-key="id" size="small"><a-table-column title="时间" data-index="operationTime" :width="180" /><a-table-column title="操作人" data-index="operatorUsername" :width="130" /><a-table-column title="类型" data-index="operationType" :width="90" /><a-table-column title="模块" data-index="module" :width="150" /><a-table-column title="描述" data-index="description" /><a-table-column title="请求" data-index="requestUrl" /><a-table-column title="耗时(ms)" data-index="executionTime" :width="100" /></a-table><a-pagination v-if="total" v-model:current="page" v-model:page-size="pageSize" :total="total" show-size-changer style="margin-top: 16px; text-align: right" @change="changePage" /></a-card>
</template>
