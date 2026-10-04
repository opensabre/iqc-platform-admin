import http from "@/api/http";
import type { InspectionTask } from "@/api/tasks";

export interface SchemeItem {
  itemCode: string; name: string; rule: { id: string; versionNo: number }; hitMeaning: "VIOLATION" | "COMPLIANCE";
  appliesWhen?: { id: string; versionNo: number } | null;
  inputScope?: "MESSAGE" | "CONVERSATION" | null;
  execution?: SchemeExecution | null;
}
export interface SchemeExecution { route: "RULE_ONLY" | "LLM_ONLY" | "RULE_THEN_LLM" | "LLM_THEN_RULE";
  prefilter?: { id: string; versionNo: number }; candidate?: { id: string; versionNo: number };
  stageInputScope?: "MESSAGE" | "CONVERSATION"; prefilterCoversViolation?: boolean }
export interface SchemeExecutionVariant { code: string; name: string; coverage: string; cost: string;
  routes: Record<string, SchemeExecution> }
export interface SchemeExecutionVariants { recommendedCode: string; variants: SchemeExecutionVariant[] }
export interface SchemeDefinition {
  executionVariants?: SchemeExecutionVariants | null;
  runLimits?: { maxConversations: number; defaultConcurrency: number; maxConcurrency: number } | null;
  schemaVersion: "iqc-scheme-v2";
  items: SchemeItem[];
  labels?: Array<{ id: string; versionNo: number }>;
  agent: { id: string; versionNo: number } | null;
  scoring: { version: "iqc-score-v2"; mode: "DEDUCTION" | "POINTS"; baseScore: number; passingScore: number;
    items: Array<{ itemCode: string; points: number; veto: boolean }> };
}
export interface SchemeDraftRequest { name: string; code: string; description?: string; businessScene: string; definition: SchemeDefinition }
export interface SchemeDerivationRequest { name: string; code: string; description?: string; sourceSchemeId: string; sourceVersionNo: number }
export interface InspectionScheme { id: string; name: string; code: string; description?: string; businessScene: string;
  draftRevision: number; activePublishedVersion?: number; draftConfigJson: string; status: string;
  sourceSchemeId?: string | null; sourceSchemeName?: string | null; sourceSchemeCode?: string | null;
  sourceVersionNo?: number | null; sourceContentHash?: string | null }
export interface SchemeRelease extends SchemeDraftRequest { selectedVariantCode?: string; dependencies: { executionMode: string;
  rules?: Array<{ id: string; versionNo: number; name?: string }> } }
export interface PublishedTemplate { schemeId: string; versionNo: number; contentHash: string; snapshot: SchemeRelease }
export interface PublishedVersionHistory { versions: PublishedTemplate[]; nextBeforeVersion: number | null }
export interface ReleasedSchemeVersion { versionNo: number; sourceDraftRevision?: number | null; sourceTrialTaskId?: string | null;
  contentHash: string; snapshot: SchemeRelease; archived?: boolean }
export interface SchemeVersionHistory { versions: ReleasedSchemeVersion[]; nextBeforeVersion: number | null }
export interface SchemeScheduledFilter { createdFrom?: string; createdTo?: string; fileName?: string; status: "IMPORTED"; limit: number }
export type SchemeTaskRequest =
  | { requestId: string; name: string; conversationIds: string[]; concurrency: number; taskType?: "BATCH"; variantCode?: string }
  | { requestId: string; name: string; concurrency: number; taskType: "SCHEDULED";
      scheduledTime: string; selectionFilter: SchemeScheduledFilter; variantCode?: string };

export const listSchemes = () => http.get<InspectionScheme[]>("/iqc/schemes").then(r => r.data);
/** Expert-only immutable history; availability and mutable dependencies are not re-resolved. */
export const listSchemeVersions = (id: string, beforeVersion?: number) =>
  http.get<SchemeVersionHistory>(`/iqc/schemes/${id}/versions`, { params: { beforeVersion } }).then(r => r.data);
export const listPublishedTemplates = () => http.get<PublishedTemplate[]>("/iqc/schemes/published").then(r => r.data);
/** Paged immutable releases for an active template; reuses the ordinary template-view permission. */
export const listPublishedVersionHistory = (id: string, beforeVersion?: number) =>
  http.get<PublishedVersionHistory>("/iqc/schemes/published", { params: { schemeId: id, beforeVersion } }).then(r => r.data);
export const createScheme = (request: SchemeDraftRequest | SchemeDerivationRequest) => http.post<InspectionScheme>("/iqc/schemes", request).then(r => r.data);
export const reviseScheme = (id: string, expectedRevision: number, draft: SchemeDraftRequest) =>
  http.put<InspectionScheme>(`/iqc/schemes/${id}`, { expectedRevision, draft }).then(r => r.data);
export const previewScheme = (id: string, expectedRevision: number) =>
  http.post<SchemeRelease>(`/iqc/schemes/${id}/preview`, { expectedRevision }).then(r => r.data);
export const trialScheme = (id: string, expectedRevision: number, conversationIds: string[], requestId?: string,
                            variantCode?: string, runCount?: number, confidenceThreshold?: number) =>
  http.post<InspectionTask>(`/iqc/schemes/${id}/trials`, { expectedRevision, conversationIds, ...(requestId ? { requestId } : {}),
    ...(variantCode !== undefined ? { variantCode } : {}), ...(runCount !== undefined ? { runCount } : {}),
    ...(confidenceThreshold !== undefined ? { confidenceThreshold } : {}) }).then(r => r.data);
export const listSchemeTrials = (id: string) => http.get<InspectionTask[]>(`/iqc/schemes/${id}/trials`).then(r => r.data);
export const publishScheme = (id: string, expectedRevision: number, trialTaskId: string, resultsReviewed: boolean) =>
  http.post<{ versionNo: number }>(`/iqc/schemes/${id}/publish`, { expectedRevision, trialTaskId, resultsReviewed }).then(r => r.data);
/** Availability uses the publication permission but never carries a trial or publishes draft content. */
export const changeSchemeAvailability = (id: string, expectedRevision: number, enabled: boolean) =>
  http.post<InspectionScheme>(`/iqc/schemes/${id}/publish`, { expectedRevision, action: enabled ? "ENABLE" : "DISABLE" }).then(r => r.data);
/** Hides a superseded release from ordinary selection while preserving immutable history and existing tasks. */
export const changeSchemeVersionArchive = (id: string, expectedRevision: number, versionNo: number, archived: boolean) =>
  http.post<ReleasedSchemeVersion>(`/iqc/schemes/${id}/publish`, {
    expectedRevision, action: archived ? "ARCHIVE_VERSION" : "RESTORE_VERSION", versionNo
  }).then(r => r.data);
export const createSchemeTask = (id: string, versionNo: number, request: SchemeTaskRequest) =>
  http.post<InspectionTask>(`/iqc/schemes/${id}/versions/${versionNo}/tasks`, request).then(r => r.data);
