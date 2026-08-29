<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { message } from "ant-design-vue";
import { CheckOutlined, CopyOutlined } from "@ant-design/icons-vue";
import { listConversations, type ConversationSummary } from "@/api/conversations";
import { dictionaryLabel, getCachedDictionaries, type DictionaryItem } from "@/api/dictionaries";
import ConversationDetailDrawer from "@/components/ConversationDetailDrawer.vue";
import { copyToClipboard } from "@/utils/clipboard";

const conversations = ref<ConversationSummary[]>([]);
const loading = ref(false);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const detailOpen = ref(false);
const detailConversationId = ref<string>();
const filters = ref({ employeeId: "", customerExternalId: "", channel: "", businessNo: "", fileName: "" });
const channelOptions = ref<DictionaryItem[]>([
  { value: "WEB", label: "网页" }, { value: "PHONE", label: "电话" },
  { value: "WECHAT", label: "微信" }, { value: "APP", label: "App" }, { value: "OTHER", label: "其他" },
]);
const route = useRoute();
const copiedValue = ref<string>(); let copyResetTimer: number | undefined;
const conversationStatuses: DictionaryItem[] = [
  { value: "IMPORTED", label: "已导入" },
  { value: "IMPORTED_WITH_ERRORS", label: "导入有错误", tagType: "warning" },
];

function channelLabel(value?: string) { return dictionaryLabel(channelOptions.value, value); }
function statusLabel(value?: string) { return dictionaryLabel(conversationStatuses, value); }

async function copyText(value?: string) {
  if (!value) return;
  try {
    await copyToClipboard(value);
    copiedValue.value = value;
    if (copyResetTimer) window.clearTimeout(copyResetTimer);
    copyResetTimer = window.setTimeout(() => { copiedValue.value = undefined; }, 1600);
  } catch { message.error("复制失败，请手动选择内容复制"); }
}

async function refreshConversations() {
  loading.value = true;
  try {
    const result = await listConversations({ current: page.value, size: pageSize.value, ...filters.value });
    conversations.value = result.records;
    total.value = result.total;
  } catch {
    message.error("会话列表加载失败");
  } finally {
    loading.value = false;
  }
}
async function resetFilters() {
  filters.value = { employeeId: "", customerExternalId: "", channel: "", businessNo: "", fileName: "" };
  page.value = 1;
  await refreshConversations();
}
async function changePage(current: number, size: number) {
  page.value = current;
  pageSize.value = size;
  await refreshConversations();
}
async function showDetail(id: string) {
  detailConversationId.value = id;
  detailOpen.value = true;
}
async function loadDictionaries() {
  try {
    const data = await getCachedDictionaries(["iqc_conversation_channel"]);
    if (data.iqc_conversation_channel?.length) channelOptions.value = data.iqc_conversation_channel;
  } catch { /* 字典服务暂不可用时使用本地渠道选项。 */ }
}
onMounted(() => {
  void refreshConversations();
  void loadDictionaries();
  const conversationId = typeof route.query.conversationId === "string" ? route.query.conversationId : "";
  if (conversationId) void showDetail(conversationId);
});
</script>

<template>
  <div class="conversation-page">
    <section class="page-intro">
      <div><span class="section-kicker">CONVERSATION ARCHIVE</span><h2>会话列表</h2><p>查询已接入的客服会话，按归属、渠道和业务信息筛选，并查看完整对话上下文。</p></div>
      <a-tag color="blue">共 {{ total }} 条</a-tag>
    </section>
    <a-card :bordered="false" class="list-card">
      <a-form layout="inline" class="archive-filter" @submit.prevent="refreshConversations">
        <a-form-item label="员工"><a-input v-model:value="filters.employeeId" allow-clear placeholder="员工 ID" /></a-form-item>
        <a-form-item label="客户"><a-input v-model:value="filters.customerExternalId" allow-clear placeholder="客户 ID" /></a-form-item>
        <a-form-item label="渠道"><a-select v-model:value="filters.channel" allow-clear placeholder="全部" style="width:120px"><a-select-option v-for="item in channelOptions" :key="item.value" :value="item.value">{{ item.label }}</a-select-option></a-select></a-form-item>
        <a-form-item label="业务编号"><a-input v-model:value="filters.businessNo" allow-clear placeholder="订单或工单编号" /></a-form-item>
        <a-form-item label="文件"><a-input v-model:value="filters.fileName" allow-clear placeholder="文件名" /></a-form-item>
        <a-form-item><a-space><a-button type="primary" @click="refreshConversations">查询</a-button><a-button @click="resetFilters">重置</a-button></a-space></a-form-item>
      </a-form>
      <a-table :loading="loading" :data-source="conversations" :pagination="false" row-key="id" size="middle" :scroll="{ x: 1320 }">
        <a-table-column title="会话 ID" data-index="id" :width="230"><template #default="{ text }"><a-space><a-typography-text :ellipsis="{ tooltip: text }">{{ text }}</a-typography-text><a-tooltip :title="copiedValue === text ? '已复制' : '复制会话 ID'"><a-button type="link" size="small" class="copy-button" :aria-label="copiedValue === text ? '已复制会话 ID' : '复制会话 ID'" @click.stop="copyText(text)"><CheckOutlined v-if="copiedValue === text" class="copy-success"/><CopyOutlined v-else /></a-button></a-tooltip></a-space></template></a-table-column>
        <a-table-column title="会话名称" data-index="sourceFileName" :width="220" />
        <a-table-column title="员工" :width="140"><template #default="{ record }">{{ record.employeeName || record.employeeId || "-" }}</template></a-table-column>
        <a-table-column title="客户" :width="140"><template #default="{ record }">{{ record.customerName || record.customerExternalId || "-" }}</template></a-table-column>
        <a-table-column title="渠道" data-index="channel" :width="90"><template #default="{ text }">{{ channelLabel(text) }}</template></a-table-column>
        <a-table-column title="业务编号" data-index="businessNo" :width="150" />
        <a-table-column title="批次号" data-index="batchNo" :width="210"><template #default="{ text }">{{ text || "单条接入" }}</template></a-table-column>
        <a-table-column title="来源" data-index="sourceType" :width="90"><template #default="{ text }"><a-tag :color="text === 'API' ? 'purple' : 'blue'">{{ text || "FILE" }}</a-tag></template></a-table-column>
        <a-table-column title="消息" data-index="messageCount" :width="80" />
        <a-table-column title="状态" data-index="status" :width="150"><template #default="{ text }"><a-tag :color="text === 'IMPORTED_WITH_ERRORS' ? 'warning' : 'success'">{{ statusLabel(text) }}</a-tag></template></a-table-column>
        <a-table-column title="创建时间" data-index="createdTime" :width="180" />
        <a-table-column title="操作" :width="100" fixed="right"><template #default="{ record }"><a-button type="link" @click="showDetail(record.id)">查看对话</a-button></template></a-table-column>
      </a-table>
      <a-pagination v-if="total" v-model:current="page" v-model:page-size="pageSize" :total="total" show-size-changer class="pager" @change="changePage" />
      <a-empty v-if="!loading && !conversations.length" description="暂无符合条件的会话" />
    </a-card>
    <ConversationDetailDrawer v-model:open="detailOpen" :conversation-id="detailConversationId" />
  </div>
</template>

<style scoped>
.conversation-page{display:flex;flex-direction:column;gap:18px}.page-intro{display:flex;justify-content:space-between;align-items:flex-start}.page-intro h2{margin:4px 0}.page-intro p{margin:0;color:#64748b}.section-kicker{font-size:12px;letter-spacing:.15em;color:#1677ff}.archive-filter{margin-bottom:16px;gap:8px}.pager{margin-top:16px;text-align:right}.copy-button{padding:0 4px}.copy-success{color:#52c41a}
</style>
