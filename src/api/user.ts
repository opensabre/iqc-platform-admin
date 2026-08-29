import http from "./http";

export interface CurrentUser {
  id?: string | number;
  userId?: string | number;
  username?: string;
  name?: string;
  nickname?: string;
  avatar?: string;
  mobile?: string;
  description?: string;
  gender?: string;
  groupId?: string | number;
  groupName?: string;
  roleIds?: Array<string | number>;
  createdTime?: string;
}

export function getCurrentUser() {
  return http.get<CurrentUser>("/org/user/current").then((response) => response.data);
}
