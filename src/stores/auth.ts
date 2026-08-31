import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { getCurrentUser, type CurrentUser } from "@/api/user";
import { getUserPermissions, type AuthorizedMenu } from "@/api/permissions";
import { getUserMenus } from "@/api/permissions";
import { applyProductBrand, getProductProfile, type ProductProfile } from "@/api/product";

export const useAuthStore = defineStore("iqc-auth", () => {
  const user = ref<CurrentUser | null>(null);
  const loading = ref(false);
  const permissions = ref<string[]>([]);
  const menus = ref<AuthorizedMenu[]>([]);
  const permissionsReady = ref(false);
  const product = ref<ProductProfile | null>(null);
  let pending: Promise<boolean> | null = null;
  const authenticated = computed(() => Boolean(user.value?.id || user.value?.userId));

  async function ensureAuthenticated() {
    if (authenticated.value) return true;
    if (pending) return pending;
    loading.value = true;
    pending = getCurrentUser().then(async (currentUser) => {
        // 未登录时，开发代理/网关可能把接口请求重定向到登录页；浏览器端会将
        // 重定向后的 HTML 作为 200 响应返回，不能把它误当成当前用户对象。
        if (!currentUser || typeof currentUser !== "object" || (!currentUser.userId && !currentUser.id)) {
          throw new Error("当前会话未认证");
        }
        user.value = currentUser;
        const userId = String(currentUser.userId || currentUser.id || "");
        if (userId) {
          try {
            // Load the permission contract first so older organization services remain
            // compatible; the tree enriches the same authorization state when available.
            const [profile, productMenus] = await Promise.all([getProductProfile(), getUserMenus()]);
            product.value = profile;
            applyProductBrand(profile);
            menus.value = productMenus;
            permissions.value = await getUserPermissions(productMenus);
          } catch {
            // 权限服务异常时失败关闭，不能把未确认的操作入口展示给用户。
            permissions.value = [];
            menus.value = [];
            product.value = null;
          } finally {
            permissionsReady.value = true;
          }
        } else {
          permissions.value = [];
          menus.value = [];
          permissionsReady.value = true;
        }
        return true;
    }).catch(() => {
      user.value = null;
      return false;
    }).finally(() => {
      loading.value = false;
      pending = null;
    });
    return pending;
  }

  function clear() {
    user.value = null;
    permissions.value = [];
    menus.value = [];
    product.value = null;
    permissionsReady.value = false;
    localStorage.removeItem("iqc-access-token");
  }

  return { user, loading, permissions, menus, product, permissionsReady, authenticated, ensureAuthenticated, clear };
});
