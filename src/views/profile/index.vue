<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { IdcardOutlined, PhoneOutlined, SafetyCertificateOutlined, TeamOutlined, UserOutlined } from "@ant-design/icons-vue";
import DictTag from "@/components/DictTag.vue";
import { getUserRoles } from "@/api/roles";
import { useAuthStore } from "@/stores/auth";
import { useDictionaryStore } from "@/stores/dictionary";

const auth = useAuthStore();
const dictionaryStore = useDictionaryStore();
const user = computed(() => auth.user);
const roleNames = ref<string[]>([]);
const rolesLoaded = ref(false);
const displayName = computed(() => user.value?.name || user.value?.nickname || user.value?.username || "质检管理员");
const avatarText = computed(() => displayName.value.trim().slice(0, 1) || "检");
const roleDisplay = computed(() => {
  if (roleNames.value.length) return roleNames.value.join("、");
  return rolesLoaded.value ? "未分配" : "加载中…";
});
const createdTime = computed(() => {
  if (!user.value?.createdTime) return "未提供";
  const date = new Date(user.value.createdTime);
  return Number.isNaN(date.getTime()) ? user.value.createdTime : date.toLocaleString("zh-CN", { hour12: false });
});

async function loadRoles() {
  const userId = user.value?.userId || user.value?.id;
  if (!userId) {
    rolesLoaded.value = true;
    return;
  }
  try {
    const roles = await getUserRoles(userId);
    roleNames.value = [...new Set(roles.map((role) => role.name).filter((name): name is string => Boolean(name)))];
  } finally {
    rolesLoaded.value = true;
  }
}

onMounted(() => {
  void dictionaryStore.load(["gender"]).catch(() => undefined);
  void loadRoles().catch(() => undefined);
});
</script>

<template>
  <section class="profile-page">
    <a-card :bordered="false" class="profile-summary">
      <div class="profile-identity">
        <a-avatar v-if="user?.avatar" :size="88" :src="user.avatar" />
        <a-avatar v-else :size="88" class="profile-avatar">{{ avatarText }}</a-avatar>
        <div>
          <p class="section-kicker">MY PROFILE</p>
          <h2>{{ displayName }}</h2>
          <p>{{ user?.description || "查看当前登录账号的基本资料与组织身份。" }}</p>
        </div>
      </div>
    </a-card>

    <a-row :gutter="20">
      <a-col :xs="24" :lg="16">
        <a-card title="基本信息" :bordered="false" class="profile-card">
          <a-descriptions :column="{ xs: 1, sm: 2 }" bordered>
            <a-descriptions-item label="用户名"><UserOutlined /> {{ user?.username || "未提供" }}</a-descriptions-item>
            <a-descriptions-item label="用户 ID"><IdcardOutlined /> {{ user?.userId || user?.id || "未提供" }}</a-descriptions-item>
            <a-descriptions-item label="姓名">{{ user?.name || user?.nickname || "未设置" }}</a-descriptions-item>
            <a-descriptions-item label="性别"><DictTag code="gender" :value="user?.gender" fallback="未设置" /></a-descriptions-item>
            <a-descriptions-item label="手机号"><PhoneOutlined /> {{ user?.mobile || "未绑定" }}</a-descriptions-item>
            <a-descriptions-item label="创建时间">{{ createdTime }}</a-descriptions-item>
          </a-descriptions>
        </a-card>
      </a-col>
      <a-col :xs="24" :lg="8">
        <a-card title="组织与身份" :bordered="false" class="profile-card">
          <div class="profile-meta">
            <div><TeamOutlined /><span>所属部门</span><strong>{{ user?.groupName || user?.groupId || "未分配" }}</strong></div>
            <div><SafetyCertificateOutlined /><span>角色</span><strong>{{ roleDisplay }}</strong></div>
          </div>
        </a-card>
      </a-col>
    </a-row>
  </section>
</template>

<style scoped>
.profile-page { display: grid; gap: 20px; }
.profile-summary { overflow: hidden; background: linear-gradient(120deg, #f4f8fc, #e8f1f8); }
.profile-identity { display: flex; align-items: center; gap: 22px; min-height: 112px; }
.profile-avatar { color: #fff; background: #2a4c73; font-size: 32px; }
.profile-identity h2 { margin: 4px 0 8px; color: var(--iqc-slate-900); font-size: 25px; }
.profile-identity p { margin: 0; color: var(--iqc-slate-600); }
.profile-identity .section-kicker { color: var(--iqc-navy-700); font-size: 11px; letter-spacing: .16em; }
.profile-card { height: 100%; }
.profile-meta { display: grid; gap: 18px; }
.profile-meta > div { display: grid; grid-template-columns: 22px 1fr; gap: 4px 8px; align-items: center; }
.profile-meta span { color: var(--iqc-slate-600); font-size: 12px; }
.profile-meta strong { grid-column: 2; color: var(--iqc-slate-900); font-weight: 600; word-break: break-word; }
@media (max-width: 576px) { .profile-identity { align-items: flex-start; flex-direction: column; } }
</style>
