import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const routes: RouteRecordRaw[] = [
  { path: "/login", component: () => import("@/views/login/index.vue"), meta: { public: true } },
  { path: "/403", component: () => import("@/views/forbidden/index.vue"), meta: { public: true } },
  {
    path: "/",
    component: () => import("@/layouts/AppLayout.vue"),
    redirect: "/dashboard",
    children: [
      { path: "dashboard", component: () => import("@/views/dashboard/index.vue"), meta: { title: "睿检总览", permission: "iqc:dashboard:view" } },
      { path: "conversations", redirect: "/conversations/api" },
      { path: "conversations/api", component: () => import("@/views/conversations/api.vue"), meta: { title: "接口对接", permission: "iqc:conversation:view" } },
      { path: "conversations/upload", component: () => import("@/views/conversations/index.vue"), meta: { title: "文本上传", permission: "iqc:conversation:view" } },
      { path: "tasks", component: () => import("@/views/tasks/index.vue"), meta: { title: "质检任务", permission: "iqc:task:view" } },
      { path: "results", component: () => import("@/views/results/index.vue"), meta: { title: "质检结果", permission: "iqc:result:view" } },
      { path: "quality-operations", component: () => import("@/views/quality-operations/index.vue"), meta: { title: "质量运营", permission: "iqc:review:view" } },
      { path: "agents", component: () => import("@/views/agents/index.vue"), meta: { title: "智能体列表", permission: "iqc:agent:view" } },
      { path: "agent-skills", component: () => import("@/views/agent-skills/index.vue"), meta: { title: "Skill 管理", permission: "iqc:skill:view" } },
      { path: "agent-mcps", component: () => import("@/views/agent-mcps/index.vue"), meta: { title: "MCP 管理", permission: "iqc:mcp:view" } },
      { path: "agent-models", component: () => import("@/views/agent-models/index.vue"), meta: { title: "模型配置", permission: "iqc:model:view" } },
      { path: "rules", redirect: "/rules/library" },
      { path: "rules/library", component: () => import("@/views/rules/index.vue"), meta: { title: "规则库", permission: "iqc:rule:view", ruleView: "library" } },
      { path: "rules/composite", component: () => import("@/views/rules/index.vue"), meta: { title: "组合规则", permission: "iqc:rule:view", ruleView: "composite" } },
      { path: "rules/sets", component: () => import("@/views/rule-sets/index.vue"), meta: { title: "规则集", permission: "iqc:rule:view" } },
      { path: "rules/test-center", component: () => import("@/views/rules/index.vue"), meta: { title: "测试中心", permission: "iqc:rule:test", ruleView: "test" } },
      { path: "rules/approvals", component: () => import("@/views/rules/index.vue"), meta: { title: "审批与发布", permission: "iqc:rule:approve", ruleView: "approval" } },
      { path: "templates", component: () => import("@/views/templates/index.vue"), meta: { title: "模板中心", permission: "iqc:template:view" } },
      { path: "settings", component: () => import("@/views/settings/index.vue"), meta: { title: "系统设置", permission: "iqc:settings:view" } },
      { path: "audit-logs", component: () => import("@/views/audit-logs/index.vue"), meta: { title: "操作日志", permission: "iqc:settings:view" } },
    ],
  },
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (to.meta.public) {
    if (to.path === "/login" && await auth.ensureAuthenticated()) return "/dashboard";
    return true;
  }
  if (!await auth.ensureAuthenticated()) return { path: "/login", query: { redirect: to.fullPath } };
  const requiredPermission = to.meta.permission as string | undefined;
  if (requiredPermission && auth.permissionsReady && !auth.permissions.includes(requiredPermission)) return "/403";
  return true;
});

export default router;
