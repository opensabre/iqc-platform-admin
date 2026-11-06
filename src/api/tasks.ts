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
export type CreateTaskRequest = ((LegacyCreateTaskRequest & { dataSelection?: never }) | SelectedCreateTaskRequest)
  & { processingConfiguration?: never; resultProcessing?: never } | WizardCreateTaskRequest;
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

/** Task-type step: array position is execution order independently within inspection and labeling. */
export interface TaskEngineConfiguration {
  schemaVersion: "iqc-task-processing-v1";
  inspection?: { engines: TaskEngine[] };
  labeling?: { engines: TaskEngine[] };
}
export interface TaskEngine {
  id: string;
  name?: string;
  type: "REGEX" | "DLS" | "LLM";
  parameters: { targetId?: string; ruleId?: string; agentId?: string; prompt?:string; temperature?:number; timeoutSeconds?:number };
}

export type LabelValueType = import("./labels").LabelValueRequest["valueType"];
export type TaskMappedValue = string | number | boolean | null;
export interface TaskResultProcessingConfiguration {
  schemaVersion: "iqc-task-result-processing-v1";
  inspection?: {
    aggregation: "REQUIRE_AGREEMENT";
    scoring: { version: "iqc-score-v2"; mode: "DEDUCTION" | "POINTS"; baseScore: number; passingScore: number;
      items: { itemCode: string; points: number; veto: boolean }[] };
    checks: { targetId: string; engines: { engineInstanceId: string; onHit: "PASS" | "FAIL"; onMiss: "PASS" | "FAIL" }[] }[];
  };
  labeling: { targetId: string; valueCode: string; valueType: LabelValueType; aggregation: "REQUIRE_AGREEMENT";
    engines: { engineInstanceId: string; onHit: TaskMappedValue; onMiss: TaskMappedValue }[] }[];
}
/** Prototype creation sends separate operation and result policies, never the legacy mutually exclusive task fields. */
export interface WizardCreateTaskRequest {
  name: string;
  dataSelection: Omit<TaskDataSelection, "sampleSeed"> & { sampleSeed?: never };
  processingConfiguration: TaskEngineConfiguration;
  resultProcessing: TaskResultProcessingConfiguration;
  concurrencyLimit: number;
  taskType?: never; conversationId?: never; conversationIds?: never; selectionFilter?: never; scheduledTime?: never;
  sampleSize?: never; sampleSeed?: never; agentId?: never; ruleSetId?: never; ruleIds?: never;
  labelSelection?: never; labelOptions?: never; executionMode?: never;
}

/** Server-frozen task snapshot returned by the existing task detail endpoint. */
export interface TaskWizardSnapshot {
  schemaVersion: "iqc-task-wizard-v1";
  enginePlan: { schemaVersion: "iqc-task-engine-plan-v1"; engines: {
    operation: "INSPECTION" | "LABELING"; instanceId: string; type: TaskEngine["type"]; sequence: number;
    configuration: { engineName?: string; targetId: string; ruleId: string; rule: TaskRuleSnapshot; agentSnapshot?: TaskAgentSnapshot & { taskOverrides?: {prompt?:string;temperature?:number;timeoutSeconds?:number} } };
  }[] };
  resultProcessing: { configuration: TaskResultProcessingConfiguration; labelSnapshot: { labels: { id: string; name: string }[] } | null };
}
