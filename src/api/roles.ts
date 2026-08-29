import http from "./http";

export interface UserRole {
  id?: string | number;
  code?: string;
  name?: string;
  description?: string;
}

/** 查询指定用户实际拥有的角色，用于展示角色名称而非持久化 ID。 */
export function getUserRoles(userId: string | number) {
  return http.get<UserRole[]>(`/org/role/user/${encodeURIComponent(String(userId))}`).then((response) => response.data);
}
