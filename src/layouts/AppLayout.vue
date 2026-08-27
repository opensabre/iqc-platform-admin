<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { getUserMenus, type AuthorizedMenu } from "@/api/permissions";
import {
  ArrowDownOutlined,
  BarChartOutlined,
  CheckCircleOutlined,
  ClusterOutlined,
  CommentOutlined,
  FileTextOutlined,
  OrderedListOutlined,
  SettingOutlined,
  DownOutlined,
} from "@ant-design/icons-vue";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const dynamicMenuLoaded = ref(false);
onMounted(async () => {
  const userId = auth.user?.userId || auth.user?.id;
  if (!userId) return;
  try { auth.menus = await getUserMenus(String(userId)); } catch { /* permission-only deployments use the local fallback menu */ }
  finally { dynamicMenuLoaded.value = true; }
});

type MenuItem = { key: string; path?: string; label: string; icon?: unknown; permission?: string; children?: MenuItem[] };
const menuItems: MenuItem[] = [
  { key: "dashboard", path: "/dashboard", label: "睿检总览", icon: BarChartOutlined, permission: "iqc:dashboard:view" },
  { key: "conversations", label: "会话中心", icon: CommentOutlined, children: [
    { key: "conversations-api", path: "/conversations/api", label: "接口对接", permission: "iqc:conversation:view" },
    { key: "conversations-upload", path: "/conversations/upload", label: "文本上传", permission: "iqc:conversation:view" },
  ] },
  { key: "tasks", path: "/tasks", label: "质检任务", icon: OrderedListOutlined, permission: "iqc:task:view" },
  { key: "results", path: "/results", label: "质检结果", icon: CheckCircleOutlined, permission: "iqc:result:view" },
  { key: "quality-operations", path: "/quality-operations", label: "质量运营", icon: CheckCircleOutlined, permission: "iqc:review:view" },
  { key: "agents", label: "智能体管理", icon: ClusterOutlined, children: [
    { key: "agents-list", path: "/agents", label: "智能体列表", permission: "iqc:agent:view" },
    { key: "agent-models", path: "/agent-models", label: "模型配置", permission: "iqc:model:view" },
    { key: "agent-mcps", path: "/agent-mcps", label: "MCP 管理", permission: "iqc:mcp:view" },
    { key: "agent-skills", path: "/agent-skills", label: "Skill 管理", permission: "iqc:skill:view" },
  ] },
  { key: "rules", label: "规则中心", icon: SettingOutlined, children: [
    { key: "rules-library", path: "/rules/library", label: "规则库", permission: "iqc:rule:view" },
    { key: "rules-composite", path: "/rules/composite", label: "组合规则", permission: "iqc:rule:view" },
    { key: "rules-sets", path: "/rules/sets", label: "规则集", permission: "iqc:rule:view" },
    { key: "rules-test", path: "/rules/test-center", label: "测试中心", permission: "iqc:rule:test" },
    { key: "rules-approvals", path: "/rules/approvals", label: "审批与发布", permission: "iqc:rule:approve" },
  ] },
  { key: "templates", path: "/templates", label: "模板中心", icon: FileTextOutlined, permission: "iqc:template:view" },
  { key: "settings", path: "/settings", label: "系统设置", icon: SettingOutlined, permission: "iqc:settings:view" },
  { key: "audit-logs", path: "/audit-logs", label: "操作日志", icon: FileTextOutlined, permission: "iqc:settings:view" },
];
const iconMap: Record<string, unknown> = { dashboard: BarChartOutlined, message: CommentOutlined, schedule: OrderedListOutlined, "file-search": CheckCircleOutlined, robot: ClusterOutlined, setting: SettingOutlined, book: FileTextOutlined, "file-text": FileTextOutlined };
const routePaths = new Set(router.getRoutes().map((record) => `/${String(record.path).replace(/^\//, "")}`));
const canonicalLabels: Record<string, string> = {
  "/dashboard": "睿检总览", "/conversations/api": "接口对接", "/conversations/upload": "文本上传",
  "/tasks": "质检任务", "/results": "质检结果", "/agents": "智能体列表", "/agent-models": "模型配置",
  "/agent-mcps": "MCP 管理", "/agent-skills": "Skill 管理", "/rules/library": "规则库", "/rules/composite": "组合规则",
  "/rules/sets": "规则集", "/rules/test-center": "测试中心", "/rules/approvals": "审批与发布",
  "/templates": "模板中心", "/settings": "系统设置", "/audit-logs": "操作日志",
};
const menuPermission = (item: AuthorizedMenu) => {
  if (item.perm) return item.perm;
  if (!item.description) return undefined;
  try { return (JSON.parse(item.description) as { perm?: string }).perm; } catch { return undefined; }
};
function localPath(href?: string) {
  if (!href) return undefined;
  const path = href.replace(/^\/iqc(?=\/|$)/, "") || "/dashboard";
  return routePaths.has(path) ? path : undefined;
}
function fromAuthorized(item: AuthorizedMenu): MenuItem | null {
  if (item.href === "/iqc/conversations" || item.href === "/conversations") {
    return menuItems.find((menu) => menu.key === "conversations") || null;
  }
  const children = (item.children || []).map(fromAuthorized).filter((child): child is MenuItem => Boolean(child));
  const path = localPath(item.href);
  const isMenu = item.type === "MENU" || children.length > 0;
  if (!isMenu || (!path && children.length === 0)) return null;
  return { key: String(item.id ?? item.href ?? item.name), path, label: (path && canonicalLabels[path]) || item.name || "未命名菜单", icon: iconMap[item.icon || ""], permission: menuPermission(item), children: children.length ? children : undefined };
}
function dynamicMenuItems() {
  const iqcRoot = auth.menus.find((item) => item.href === "/iqc" || item.name === "IQC 质检平台");
  const roots = iqcRoot?.children || auth.menus.filter((item) => item.href?.startsWith("/iqc/") || item.name?.includes("IQC"));
  return roots.map(fromAuthorized).filter((item): item is MenuItem => Boolean(item));
}
function dedupeMenuItems(items: MenuItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const identity = item.path || item.key;
    if (seen.has(identity)) return false;
    seen.add(identity);
    if (item.children) item.children = dedupeMenuItems(item.children);
    return true;
  });
}
const visibleMenuItems = computed(() => {
  const dynamic = dynamicMenuItems();
  const source = dynamicMenuLoaded.value && dynamic.length ? dynamic : menuItems;
  const uniqueSource = dedupeMenuItems(source);
  if (!auth.permissionsReady) return uniqueSource;
  return uniqueSource.map((item) => item.children
    ? { ...item, children: item.children.filter((child) => child.permission && auth.permissions.includes(child.permission)) }
    : item).filter((item) => item.children ? item.children.length > 0 : (!item.permission || auth.permissions.includes(item.permission)));
});

const expandedKeys = ref<string[]>([]);
function isActive(item: MenuItem) { return Boolean(item.path && (route.path === item.path || route.path.startsWith(`${item.path}/`))); }
function toggle(item: MenuItem) {
  const key = item.key;
  expandedKeys.value = expandedKeys.value.includes(key) ? expandedKeys.value.filter((value) => value !== key) : [...expandedKeys.value, key];
  localStorage.setItem("iqc-menu-expanded", JSON.stringify(expandedKeys.value));
}
watch(() => route.path, () => {
  const active = visibleMenuItems.value.find((item) => item.children?.some(isActive));
  if (active && !expandedKeys.value.includes(active.key)) expandedKeys.value = [...expandedKeys.value, active.key];
}, { immediate: true });
try { expandedKeys.value = JSON.parse(localStorage.getItem("iqc-menu-expanded") || "[]"); } catch { expandedKeys.value = []; }

const pageTitle = computed(() => canonicalLabels[route.path] || (route.meta.title as string) || "睿检总览");

async function logout() {
  try {
    await fetch("/logout", { method: "DELETE", credentials: "include" });
  } finally {
    auth.clear();
    await router.push("/login");
  }
}

const displayName = computed(() => auth.user?.name || auth.user?.nickname || auth.user?.username || "质检管理员");
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">睿</div>
        <div>
          <strong>睿检</strong>
          <span>SMART QA</span>
        </div>
      </div>
      <div class="workspace-label">质检工作台</div>
      <nav class="nav-list" aria-label="主导航">
        <template v-for="item in visibleMenuItems" :key="item.key">
          <div v-if="item.children" class="nav-group">
            <button type="button" class="nav-group-title" :aria-expanded="expandedKeys.includes(item.key)" @click="toggle(item)"><component :is="item.icon" /><span>{{ item.label }}</span><DownOutlined class="nav-group-chevron" :class="{ rotated: expandedKeys.includes(item.key) }" /></button>
            <div v-show="expandedKeys.includes(item.key)" class="nav-group-children">
              <RouterLink v-for="child in item.children" :key="child.key" :to="child.path!" class="nav-item nav-child">{{ child.label }}</RouterLink>
            </div>
          </div>
          <RouterLink v-else-if="item.path" :to="item.path" class="nav-item"><component :is="item.icon" /><span>{{ item.label }}</span></RouterLink>
        </template>
      </nav>
      <div class="sidebar-footer">
        <span class="status-dot" /> OpenSabre 已连接
      </div>
    </aside>

    <main class="main-content">
      <header class="topbar">
        <div>
          <p class="eyebrow">SMART QUALITY ASSURANCE</p>
          <h1>{{ pageTitle }}</h1>
        </div>
        <div class="topbar-actions">
          <a-button type="text" @click="router.push('/templates')">帮助与模板</a-button>
          <a-dropdown>
            <button class="user-menu" type="button">
              <span class="avatar">检</span>
              <span>{{ displayName }}</span>
              <ArrowDownOutlined />
            </button>
            <template #dropdown>
              <a-menu><a-menu-item key="logout" @click="logout">退出登录</a-menu-item></a-menu>
            </template>
          </a-dropdown>
        </div>
      </header>
      <div class="page-container"><RouterView /></div>
    </main>
  </div>
</template>
