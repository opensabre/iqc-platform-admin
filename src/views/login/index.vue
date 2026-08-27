<script setup lang="ts">
import { onMounted } from "vue";
import { useRoute } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const route = useRoute();
const auth = useAuthStore();

onMounted(async () => {
  const redirect = typeof route.query.redirect === "string" && route.query.redirect.startsWith("/")
    ? route.query.redirect
    : "/dashboard";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await auth.ensureAuthenticated()) {
      window.location.replace(redirect);
      return;
    }
    if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 300));
  }
});

function enterPlatform() {
  const configuredRegistrationId = import.meta.env.VITE_OAUTH2_REGISTRATION_ID;
  const registrationId = configuredRegistrationId || (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "iqc-platform-local"
    : "iqc-platform");
  window.location.assign(`/oauth2/authorization/${registrationId}`);
}
</script>

<template>
  <main class="login-page">
    <section class="login-intro">
      <div class="brand brand-light"><div class="brand-mark">睿</div><div><strong>睿检</strong><span>SMART QA</span></div></div>
      <div class="intro-copy">
        <p class="eyebrow">SMART QUALITY ASSURANCE</p>
        <h1>让每一次沟通<br /><em>都变成改进的依据。</em></h1>
        <p>用可解释的智能质检，帮助团队发现风险、统一标准，持续提升服务与销售质量。</p>
      </div>
      <div class="intro-note"><span class="status-dot" /> 基于 OpenSabre 平台安全接入</div>
    </section>
    <section class="login-panel">
      <div class="login-card">
        <p class="eyebrow">WELCOME BACK</p>
        <h2>进入质检工作台</h2>
        <p class="muted">使用 OpenSabre 账号登录 IQC</p>
        <a-button type="primary" size="large" class="login-button" @click="enterPlatform">使用 OpenSabre 登录 <span aria-hidden="true">→</span></a-button>
        <p class="login-hint">登录由 OpenSabre 统一认证，成功后返回 IQC 工作台。</p>
      </div>
    </section>
  </main>
</template>
