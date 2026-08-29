<script setup lang="ts">
import { ref, watch } from "vue";
import { message } from "ant-design-vue";
import { getConversation, type ConversationDetail } from "@/api/conversations";
import { CheckOutlined, CopyOutlined } from "@ant-design/icons-vue";
import { copyToClipboard } from "@/utils/clipboard";

const props = defineProps<{ open: boolean; conversationId?: string }>();
const emit = defineEmits<{ "update:open": [value: boolean] }>();
const loading = ref(false);
const detail = ref<ConversationDetail>();
const copiedId = ref(false);

function isAgent(role?: string) { return ["agent", "assistant", "客服"].includes((role || "").toLowerCase()); }
function roleLabel(role?: string) { return isAgent(role) ? "客服" : "客户"; }
async function copyConversationId() {
  if (!detail.value?.conversation.id) return;
  try { await copyToClipboard(detail.value.conversation.id); copiedId.value = true; window.setTimeout(() => { copiedId.value = false; }, 1600); }
  catch { message.error("复制失败，请手动选择内容复制"); }
}

async function loadDetail(id?: string) {
  if (!id) { detail.value = undefined; return; }
  loading.value = true;
  try { detail.value = await getConversation(id); }
  catch { message.error("会话详情加载失败"); emit("update:open", false); }
  finally { loading.value = false; }
}

watch(() => [props.open, props.conversationId] as const, ([open, id]) => { if (open) void loadDetail(id); }, { immediate: true });
</script>

<template>
  <a-drawer :open="open" title="会话明细" width="min(760px, 100vw)" destroy-on-close @update:open="emit('update:open', $event)">
    <a-spin :spinning="loading">
      <template v-if="detail">
        <a-descriptions size="small" :column="2" bordered class="detail-meta">
          <a-descriptions-item label="会话 ID" :span="2"><a-space><a-typography-text>{{ detail.conversation.id }}</a-typography-text><a-tooltip :title="copiedId ? '已复制' : '复制会话 ID'"><a-button type="link" size="small" class="copy-button" :aria-label="copiedId ? '已复制会话 ID' : '复制会话 ID'" @click="copyConversationId"><CheckOutlined v-if="copiedId" class="copy-success"/><CopyOutlined v-else /></a-button></a-tooltip></a-space></a-descriptions-item>
          <a-descriptions-item label="会话">{{ detail.conversation.sourceFileName || "—" }}</a-descriptions-item><a-descriptions-item label="批次">{{ detail.conversation.batchNo || "单条接入" }}</a-descriptions-item>
          <a-descriptions-item label="来源">{{ detail.conversation.sourceType || "FILE" }}</a-descriptions-item><a-descriptions-item label="消息数">{{ detail.conversation.messageCount }}</a-descriptions-item>
          <a-descriptions-item label="沟通员工">{{ detail.conversation.employeeName || "-" }}（{{ detail.conversation.employeeId || "无 ID" }}）</a-descriptions-item><a-descriptions-item label="员工部门">{{ detail.conversation.employeeGroupId || "-" }}</a-descriptions-item>
          <a-descriptions-item label="客户">{{ detail.conversation.customerName || "-" }}（{{ detail.conversation.customerExternalId || "无 ID" }}）</a-descriptions-item><a-descriptions-item label="脱敏联系方式">{{ detail.conversation.customerContactMasked || "-" }}</a-descriptions-item>
          <a-descriptions-item label="渠道/时间">{{ detail.conversation.channel || "-" }} · {{ detail.conversation.startedTime || "-" }}</a-descriptions-item><a-descriptions-item label="业务对象">{{ detail.conversation.businessType || "-" }} / {{ detail.conversation.businessNo || "-" }}</a-descriptions-item>
        </a-descriptions>
        <div class="chat-panel">
          <div v-for="item in detail.messages" :key="item.id" class="chat-row" :class="{ agent: isAgent(item.speakerRole) }">
            <a-avatar :class="isAgent(item.speakerRole) ? 'agent-avatar' : 'user-avatar'">{{ roleLabel(item.speakerRole).slice(0, 1) }}</a-avatar>
            <div class="chat-body"><div class="chat-info"><span>{{ roleLabel(item.speakerRole) }}</span><time>{{ item.relativeTime }}</time></div><div class="bubble">{{ item.content }}</div></div>
          </div>
          <a-empty v-if="!detail.messages.length" description="暂无会话消息" />
        </div>
      </template>
    </a-spin>
  </a-drawer>
</template>

<style scoped>
.detail-meta{margin-bottom:20px}.copy-button{padding:0 4px}.copy-success{color:#52c41a}.chat-panel{padding:20px 8px;background:#f6f8fb;border-radius:12px;min-height:300px}.chat-row{display:flex;gap:10px;margin-bottom:18px;align-items:flex-start}.chat-row.agent{flex-direction:row-reverse}.agent-avatar{background:#1677ff}.user-avatar{background:#64748b}.chat-body{max-width:75%}.chat-info{display:flex;gap:10px;margin-bottom:5px;color:#64748b;font-size:12px}.agent .chat-info{justify-content:flex-end}.bubble{padding:11px 14px;background:#fff;border-radius:4px 14px 14px 14px;box-shadow:0 2px 8px rgba(15,23,42,.06);white-space:pre-wrap;word-break:break-word}.agent .bubble{background:#1677ff;color:#fff;border-radius:14px 4px 14px 14px}
</style>
