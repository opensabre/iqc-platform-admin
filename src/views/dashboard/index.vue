<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { message } from "ant-design-vue";
import { getDashboardStats, type DashboardStats } from "@/api/dashboard";
import { listTasks, type InspectionTask } from "@/api/tasks";
const stats = ref<DashboardStats>({ conversationCount: 0, taskCount: 0, runningTaskCount: 0, resultCount: 0, hitCount: 0, highRiskCount: 0, unqualifiedCount: 0, unqualifiedRate: 0, averageScore: 0, trend: [], topAgents: [], topOwners: [] });
const recentTasks = ref<InspectionTask[]>([]);
const fromDate = ref("");
const toDate = ref("");
const metrics = computed(() => [
  { label: "已导入会话", value: String(stats.value.conversationCount), trend: `${stats.value.resultCount} 条结果`, tone: "teal" },
  { label: "平均质检分", value: stats.value.averageScore.toFixed(1), trend: "基于已执行结果", tone: "blue" },
  { label: "高风险会话", value: String(stats.value.highRiskCount || 0), trend: `不合格率 ${Number(stats.value.unqualifiedRate || 0).toFixed(1)}%`, tone: "orange" },
  { label: "质检任务", value: String(stats.value.taskCount), trend: `进行中 ${stats.value.runningTaskCount}`, tone: "purple" },
]);
const trendBars = computed(() => {
  const points = stats.value.trend.slice(-7);
  const max = Math.max(...points.map((point) => point.resultCount), 1);
  return points.map((point) => ({ ...point, height: Math.max(10, Math.round(point.resultCount / max * 100)) }));
});
async function refreshDashboard() { try { stats.value = await getDashboardStats({ from: fromDate.value || undefined, to: toDate.value || undefined }); } catch { message.error("总览指标加载失败"); } }
onMounted(async () => { try { const [dashboard, taskPage] = await Promise.all([getDashboardStats(), listTasks({ current: 1, size: 3 })]); stats.value = dashboard; recentTasks.value = taskPage.records; } catch { message.error("总览指标加载失败"); } });
</script>

<template>
  <div class="dashboard-page">
    <section class="welcome-banner">
      <div><p class="eyebrow">TODAY'S QUALITY PULSE</p><h2>早上好，质检管理员</h2><p>这里是团队沟通质量的最新概览，优先关注高风险会话和正在执行的任务。</p></div>
      <div class="banner-orbit"><span>QA</span></div>
    </section>
    <section class="metric-grid">
      <article v-for="metric in metrics" :key="metric.label" class="metric-card">
        <div class="metric-icon" :class="metric.tone">⌁</div>
        <p>{{ metric.label }}</p><strong>{{ metric.value }}</strong><small>{{ metric.trend }}</small>
      </article>
    </section>
    <a-card :bordered="false" style="margin-bottom: 16px"><a-form layout="inline"><a-form-item label="统计开始"><a-input v-model:value="fromDate" type="date" /></a-form-item><a-form-item label="统计结束"><a-input v-model:value="toDate" type="date" /></a-form-item><a-form-item><a-button type="primary" @click="refreshDashboard">应用时间范围</a-button><a-button style="margin-left: 8px" @click="fromDate = ''; toDate = ''; refreshDashboard()">重置</a-button></a-form-item></a-form></a-card>
    <section class="content-grid">
      <article class="surface-card large-card"><div class="card-heading"><div><p class="eyebrow">QUALITY TREND</p><h3>质检趋势</h3></div><a-tag color="green">{{ fromDate || toDate ? "自定义范围" : "近 7 天" }}</a-tag></div><div v-if="trendBars.length" class="chart-placeholder"><div v-for="point in trendBars" :key="point.date" class="bar" :title="`${point.date}：${point.resultCount} 条结果，命中 ${point.hitCount}，高风险 ${point.highRiskCount}，不合格 ${point.unqualifiedCount}，平均 ${point.averageScore} 分`" :style="{ height: `${point.height}%` }"><span /></div></div><a-empty v-else description="暂无趋势数据" /><div v-if="trendBars.length" class="chart-labels"><span v-for="point in trendBars" :key="point.date">{{ point.date.slice(5) }}</span></div></article>
      <article class="surface-card"><div class="card-heading"><div><p class="eyebrow">TASK QUEUE</p><h3>任务动态</h3></div><a-button type="link" @click="$router.push('/tasks')">查看全部</a-button></div><div class="activity-list"><a-empty v-if="!recentTasks.length" description="暂无任务" /><div v-for="task in recentTasks.slice(0, 3)" :key="task.id"><span class="activity-icon" :class="task.status === 'SUCCEEDED' ? 'done' : task.status === 'FAILED' || task.status === 'PARTIAL_FAILED' ? 'warning' : 'running'">{{ task.status === 'SUCCEEDED' ? '✓' : task.status === 'FAILED' || task.status === 'PARTIAL_FAILED' ? '!' : '↗' }}</span><div><strong>{{ task.name }}</strong><p>{{ task.status }} · 已处理 {{ task.processedMessages }}/{{ task.totalMessages }}</p></div><a-progress v-if="['QUEUED', 'RUNNING'].includes(task.status)" :percent="task.totalMessages ? Math.round(task.processedMessages / task.totalMessages * 100) : 0" :show-info="false" :stroke-width="6" /><a-tag v-else :color="task.status === 'SUCCEEDED' ? 'green' : task.status === 'FAILED' || task.status === 'PARTIAL_FAILED' ? 'red' : 'orange'">{{ task.status }}</a-tag></div></div></article>
    </section>
    <section class="content-grid">
      <article class="surface-card ranking-card"><div class="card-heading"><div><p class="eyebrow">QUALITY RANKINGS</p><h3>质检排行</h3></div><a-tag>当前范围 Top 5</a-tag></div><div class="ranking-columns"><div><strong class="ranking-title">Agent</strong><a-empty v-if="!stats.topAgents.length" description="暂无 Agent 数据" /><div v-for="(item, index) in stats.topAgents" :key="item.id" class="ranking-row"><span class="ranking-index">{{ index + 1 }}</span><span class="ranking-id" :title="item.id">{{ item.id }}</span><small>{{ item.resultCount }} 条 · 命中 {{ item.hitCount }} · 高风险 {{ item.highRiskCount }}</small></div></div><div><strong class="ranking-title">质检人员</strong><a-empty v-if="!stats.topOwners.length" description="暂无人员数据" /><div v-for="(item, index) in stats.topOwners" :key="item.id" class="ranking-row"><span class="ranking-index">{{ index + 1 }}</span><span class="ranking-id" :title="item.id">{{ item.id }}</span><small>{{ item.resultCount }} 条 · 命中 {{ item.hitCount }} · 高风险 {{ item.highRiskCount }}</small></div></div></div></article>
    </section>
  </div>
</template>
