import http from "@/api/http";

export interface AgentSession {
  id: string; agentId: string; versionNo: number; title: string; source: string; owner: string;
  messageCount: number; createdTime: string; lastMessageTime: string;
}
export interface AgentSessionMessage {
  role: "user" | "assistant"; content: string; time: string; model?: string;
  latencyMillis?: number; calledTools?: string[];
}
export interface AgentSessionDetail { session: AgentSession; messages: AgentSessionMessage[]; }
export interface AgentSessionPage { records: AgentSession[]; current: number; size: number; total: number; }
export interface AgentSessionFilters {
  current: number; size: number; agentId?: string; title?: string; owner?: string; startedFrom?: string; startedTo?: string;
}
export const listAgentSessions = (agentId: string, params: AgentSessionFilters) =>
  http.get<AgentSessionPage>(`/iqc/config/agents/${agentId}/sessions`, { params }).then(response => response.data);
export const getAgentSession = (agentId: string, sessionId: string) =>
  http.get<AgentSessionDetail>(`/iqc/config/agents/${agentId}/sessions/${sessionId}`).then(response => response.data);

export const queryAgentSessions = (params: AgentSessionFilters) =>
  http.get<AgentSessionPage>("/iqc/config/agent-sessions", { params }).then(response => response.data);
