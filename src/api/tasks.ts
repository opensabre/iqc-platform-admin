import http from "@/api/http";
import type { LabelSelection } from "@/api/labels";

export interface TaskAssetSnapshot {
  id: string;
  code: string;
  name: string;
  versionNo?: number;
  provider?: string;
  modelName?: string;
  temperature?: number;
  transport?: string;
  endpoint?: string;
}

export interface TaskAgentConfigSnapshot {
  schemaVersion?: string;
  mode?: "RULE_ONLY" | "RULE_THEN_LLM" | "LLM_THEN_RULE" | "AGENT_LLM";
  systemPrompt?: string;
  assetSnapshots?: {
    primaryModel?: TaskAssetSnapshot;
    fallbackModels?: TaskAssetSnapshot[];
    mcpServers?: TaskAssetSnapshot[];
    skills?: TaskAssetSnapshot[];
  };
}

export interface TaskAgentSnapshot {
  id?: string;
  name?: string;
  code?: string;
  description?: string;
  versionNo?: number;
  configJson?: string | TaskAgentConfigSnapshot;
}

export interface TaskRuleSnapshot {
  id?: string;
  name?: string;
  code?: string;
  versionNo?: number;
  category?: string;
  ruleType?: string;
  targetRole?: string;
  expression?: string;
  description?: string;
  deduction?: number;
  riskLevel?: string;
  veto?: boolean;
}

export interface InspectionTask {
  taskPresentation?:{bulkShard?:{parentTaskId:string;shardNo:number};bulk?:{schemaVersion:string;scannedConversations:string;selectedConversations:string;scannedPages:number;scanComplete:boolean};schemaVersion:string;kind:string;labelOnly:boolean|null;hasLabels:boolean|null;schemeDraftRevision?:number;selectedVariantCode?:string;conversationCount?:number|null;benchmarkBaselineTaskId?:string;rollout?:{schemaVersion:string;policyRevision:number;side:'BASELINE'|'CANDIDATE';selectedVersionNo:number;selectedReleaseHash:string}};
  privacy?:{policyVersion:string;snapshotsVisible:boolean;canReadFull:boolean;canReadPii:boolean;canReadPrompt:boolean;withheldFields:string[]};
  id: string;
  conversationId?: string;
  conversationIdsJson?: string;
  selectionFilterJson?: string;
  scheduledTime?: string;
  name: string;
  taskType: "PIPELINE_BULK" | "BATCH" | "SCHEDULED" | "SAMPLE" | "PIPELINE" | "PIPELINE_TRIAL" | "PIPELINE_EVALUATION";
  concurrencyLimit: number;
  agentId?: string;
  ruleSetId?: string;
  ruleIdsJson?: string;
  agentSnapshotJson?: string;
  ruleSnapshotJson?: string;
  labelScopeSnapshotJson?: string;
  runCount?: number;
  confidenceThreshold?: number;
  autoExpandEnabled?: boolean;
  autoExpandPrompt?: string;
  queuePriority?: number;
  status: string;
  modelBudgetWaitCode?:string|null;
  modelBudgetWaitKey?:string|null;
  totalMessages: number;
  processedMessages: number;
  failedMessages: number;
  attemptCount?: number;
  currentExecutionId?: string;
  retryPolicyHash?: string;
  automaticRetryEnabled?: boolean;
  retryNotBeforeUtc?: string;
  retryError?: string;
  triggerSource?: string;
  triggerEventId?: string;
  triggerPayloadHash?: string;
  triggerRequestHash?: string;
  triggerError?: string;
  triggerRetryNotBeforeUtc?: string;
  createdTime?: string;
}
export interface TaskExecutionSummary {
  id: string; attemptNo: number; status: string; processedMessages: number; failedMessages: number;
  createdTime?: string; current: boolean;
}

export interface ScheduledSelectionFilter { createdFrom?: string; createdTo?: string; fileName?: string; status?: string; ownerGroupId?: string; limit?: number; employeeId?: string; customerExternalId?: string; channel?: string; businessNo?: string; }
export interface LabelOptions { runCount?:number; confidenceThreshold?:number; autoExpandEnabled?:boolean; autoExpandPrompt?:string; }
export type ExecutionMode = "RULE_ONLY" | "RULE_THEN_LLM" | "LLM_THEN_RULE" | "AGENT_LLM" | "INDEPENDENT";
export interface CreateTaskRequest { name?: string; taskType: "BATCH" | "SCHEDULED" | "SAMPLE"; conversationId?: string; conversationIds?: string[]; selectionFilter?: ScheduledSelectionFilter; scheduledTime?: string; sampleSize?:number; sampleSeed?:string; agentId?: string; executionMode?: ExecutionMode; ruleSetId?: string; ruleIds?: string[]; labelSelection?:LabelSelection; labelOptions?:LabelOptions; concurrencyLimit: number; }
export interface PageResult<T> { records: T[]; current: number; size: number; total: number; }

export interface TaskFilters { parentTaskId?:string;keyword?: string; status?: string; taskType?: string; }

export async function listTasks(params: TaskFilters & { current?: number; size?: number } = {}) {
  const { data } = await http.get<PageResult<InspectionTask>>("/iqc/tasks", { params });
  return data;
}
export async function getTask(id: string) {
  const { data } = await http.get<InspectionTask>(`/iqc/tasks/${id}`);
  return data;
}
export async function getTaskConfiguration(id:string) {
  const {data}=await http.get<InspectionTask>(`/iqc/tasks/${encodeURIComponent(id)}/configuration`);
  return data;
}
export async function listTaskExecutions(id: string) {
  const { data } = await http.get<TaskExecutionSummary[]>(`/iqc/tasks/${id}/executions`);
  return data;
}
export async function createTask(request: CreateTaskRequest) {
  const { data } = await http.post<InspectionTask>("/iqc/tasks", request);
  return data;
}
export async function cancelTask(id: string) {
  const { data } = await http.post<InspectionTask>(`/iqc/tasks/${id}/cancel`);
  return data;
}
export async function runTask(id: string) {
  const { data } = await http.post<InspectionTask>(`/iqc/tasks/${id}/run`);
  return data;
}
export async function pauseTask(id: string) {
  const { data } = await http.post<InspectionTask>(`/iqc/tasks/${id}/pause`);
  return data;
}
export async function resumeTask(id: string) {
  const { data } = await http.post<InspectionTask>(`/iqc/tasks/${id}/resume`);
  return data;
}
export async function changeTaskPriority(id:string, priority:number) {
  const { data } = await http.put<InspectionTask>(`/iqc/tasks/${id}/priority`, { priority });
  return data;
}
export async function deleteTask(id:string) {
  await http.delete(`/iqc/tasks/${id}`);
}
