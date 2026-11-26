import http from "@/api/http";

export interface AgentSession {
  id: string; agentId: string; versionNo: number; title: string; source: string; owner: string;
  caller?: string; messageCount: number; createdTime: string; lastMessageTime: string;
}
export interface AgentSessionMessage {
  role: "user" | "assistant"; content: string; time: string; model?: string;
  latencyMillis?: number; calledTools?: string[]; requestId?: string;
}
export interface AgentExecutionStep { type: string; name: string; status: string; durationMs: number; errorCode?: string; startedAfterMs: number; }
export interface AgentExecution {
  requestId: string; source: string; caller: string; agentId?: string; versionNo?: number;
  sessionId?: string; businessReference?: string; status: string; errorCode?: string;
  modelName?: string; durationMs?: number; inputTokens?: number; outputTokens?: number;
  startedTime: string; steps: AgentExecutionStep[];
}
export interface AgentSessionDetail { session: AgentSession; messages: AgentSessionMessage[]; executions?: AgentExecution[]; }
export interface AgentExecutionPage { records: AgentExecution[]; current: number; size: number; total: number; }
export const queryAgentExecutions = (params: { requestId?: string; businessReference?: string; current: number; size: number }) =>
  http.get<AgentExecutionPage>("/iac/config/agent-sessions/executions", { params }).then(response => response.data);
export interface AgentSessionPage { records: AgentSession[]; current: number; size: number; total: number; }
export interface AgentSessionFilters {
  current: number; size: number; agentId?: string; sessionId?: string; versionNo?: number; source?: string; executionStatus?: string; caller?: string; title?: string; owner?: string; startedFrom?: string; startedTo?: string;
}
export const listAgentSessions = (agentId: string, params: AgentSessionFilters) =>
  http.get<AgentSessionPage>(`/iac/config/agents/${agentId}/sessions`, { params }).then(response => response.data);
export const getAgentSession = (agentId: string, sessionId: string) =>
  http.get<AgentSessionDetail>(`/iac/config/agents/${agentId}/sessions/${sessionId}`).then(response => response.data);

export const queryAgentSessions = (params: AgentSessionFilters) =>
  http.get<AgentSessionPage>("/iac/config/agent-sessions", { params }).then(response => response.data);
