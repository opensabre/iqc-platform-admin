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
  id: string;
  conversationId?: string;
  conversationIdsJson?: string;
  selectionFilterJson?: string;
  scheduledTime?: string;
  name: string;
  taskType: "BATCH" | "SCHEDULED" | "SAMPLE";
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
  totalMessages: number;
  processedMessages: number;
  failedMessages: number;
  attemptCount?: number;
  currentExecutionId?: string;
  createdTime?: string;
}
export interface TaskExecutionSummary {
  id: string; attemptNo: number; status: string; processedMessages: number; failedMessages: number;
  createdTime?: string; current: boolean;
}

export interface ScheduledSelectionFilter { createdFrom?: string; createdTo?: string; fileName?: string; status?: string; ownerGroupId?: string; limit?: number; employeeId?: string; customerExternalId?: string; channel?: string; businessNo?: string; }
export interface LabelOptions { runCount?:number; confidenceThreshold?:number; autoExpandEnabled?:boolean; autoExpandPrompt?:string; }
export type ExecutionMode = "RULE_ONLY" | "RULE_THEN_LLM" | "LLM_THEN_RULE" | "AGENT_LLM" | "INDEPENDENT";
export interface LegacyCreateTaskRequest { name?: string; taskType: "BATCH" | "SCHEDULED" | "SAMPLE"; conversationId?: string; conversationIds?: string[]; selectionFilter?: ScheduledSelectionFilter; scheduledTime?: string; sampleSize?:number; sampleSeed?:string; agentId?: string; executionMode?: ExecutionMode; ruleSetId?: string; ruleIds?: string[]; labelSelection?:LabelSelection; labelOptions?:LabelOptions; concurrencyLimit: number; }
/** The runtime-selection contract cannot accidentally submit legacy creation-time sampling fields. */
export type SelectedCreateTaskRequest = Omit<LegacyCreateTaskRequest,
  "taskType" | "conversationId" | "conversationIds" | "selectionFilter" | "scheduledTime" | "sampleSize" | "sampleSeed"> & {
  dataSelection: Omit<TaskDataSelection, "sampleSeed"> & { sampleSeed?: never };
  taskType?: never; conversationId?: never; conversationIds?: never; selectionFilter?: never;
  scheduledTime?: never; sampleSize?: never; sampleSeed?: never;
};
export type CreateTaskRequest = (LegacyCreateTaskRequest & { dataSelection?: never }) | SelectedCreateTaskRequest;
export interface PageResult<T> { records: T[]; current: number; size: number; total: number; }

export interface TaskFilters { keyword?: string; status?: string; taskType?: string; }

export async function listTasks(params: TaskFilters & { current?: number; size?: number } = {}) {
  const { data } = await http.get<PageResult<InspectionTask>>("/iqc/tasks", { params });
  return data;
}
export async function getTask(id: string) {
  const { data } = await http.get<InspectionTask>(`/iqc/tasks/${id}`);
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

/** Selection mode is separate from inspection/labeling and from the execution schedule. */
export interface TaskConversationFilter {
  fileName?: string; employeeId?: string; customerExternalId?: string; channel?: string;
  businessNo?: string; startedFrom?: string; startedTo?: string;
}
export interface TaskDataSelection {
  mode: "BATCH" | "RANDOM" | "FILTER";
  conversationIds?: string[];
  filter?: TaskConversationFilter;
  sampleSize?: number;
  /** Preview stability only; formal random selection is resolved when execution starts. */
  sampleSeed?: string;
}
export interface SelectionPreview {
  mode: "RANDOM" | "FILTER"; matchedTotal: number; selectedTotal: number; sampleSeed?: string;
  conversations: PageResult<import("./conversations").ConversationSummary>;
}
export async function previewTaskSelection(selection: TaskDataSelection, current = 1, size = 10) {
  const { data } = await http.post<SelectionPreview>("/iqc/conversations/selection-preview", selection,
    { params: { current, size } });
  return data;
}
