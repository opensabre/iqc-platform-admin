import http from "@/api/http";

export interface AgentGrant { agentId: string; versionNo?: number; }
export interface AgentApplicationCommand {
  clientId: string;
  displayName: string;
  enabled: boolean;
  perMinute?: number;
  perDay?: number;
  grants: AgentGrant[];
}
export interface AgentApplication extends AgentApplicationCommand {
  requestsThisMinute: number;
  requestsToday: number;
}

const route = "/iac/config/consumer-applications";
export const listAgentApplications = () => http.get<AgentApplication[]>(route).then(response => response.data);
export const createAgentApplication = (command: AgentApplicationCommand) =>
  http.post<AgentApplication>(route, command).then(response => response.data);
export const updateAgentApplication = (command: AgentApplicationCommand) =>
  http.put<AgentApplication>(`${route}/${encodeURIComponent(command.clientId)}`, command).then(response => response.data);
