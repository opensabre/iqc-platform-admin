import http from "@/api/http";

export interface AuthorizedMenu {
  id?: string | number;
  parentId?: string | number;
  type?: string;
  href?: string;
  icon?: string;
  name?: string;
  description?: string;
  orderNum?: number;
  perm?: string;
  children?: AuthorizedMenu[];
}

function collectPermissions(items: AuthorizedMenu[], result = new Set<string>()) {
  for (const item of items) {
    if (item.perm) result.add(item.perm);
    if (item.description) {
      try { const extra = JSON.parse(item.description) as { perm?: string }; if (extra.perm) result.add(extra.perm); } catch { /* legacy menu description */ }
    }
    if (item.children) collectPermissions(item.children, result);
  }
  return result;
}

export async function getUserPermissions(userId: string) {
  const menus = await getUserMenus(userId);
  return [...collectPermissions(menus)];
}

/** Loads the user's authorized menu tree; permissions are carried by menu descriptions. */
export async function getUserMenus(userId: string) {
  const { data } = await http.get<AuthorizedMenu[]>(`/org/menu/user/${userId}`);
  return Array.isArray(data) ? data : [];
}
