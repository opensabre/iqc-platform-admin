import { useAuthStore } from "@/stores/auth";

export function usePermission() {
  const auth = useAuthStore();
  const can = (permission: string) => auth.permissionsReady && auth.permissions.includes(permission);
  return { can };
}
