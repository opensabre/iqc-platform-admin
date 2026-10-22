import http from "@/api/http";
import type { BusinessItemResult, BusinessScoringResult } from "./results";
import type { PageResult } from "./tasks";

export interface ResultFeedback { id:string; resultId:string; feedbackType:string; comment?:string; status:string; createdTime?:string }
export interface ResultReview { privacy?:import("@/api/config").AssetReadPrivacy; id:string; resultId:string; status:string; originalStatus:string; originalScore?:number; originalRiskLevel?:string; finalStatus?:string; finalScore?:number; finalRiskLevel?:string; reviewComment?:string|null; reviewerId?:string; reviewedTime?:string }
export interface SampleReadPrivacy {
 policyVersion:string;canonicalPayloadVisible:boolean;canReadFull:boolean;canReadPii:boolean;withheldFields:string[];candidateContentVisible?:boolean;
 previewState?:'NOT_INCLUDED'|'INVALID_GOLD'|'AVAILABLE'|'GOLD_ENDPOINT_REQUIRED'|'RELOAD_REQUIRED'|'SUMMARY_ONLY';
 preview?:{source:string;messages:Array<{id:string;sequenceNo:number;speakerRole:string;content:string|null}>;
  privacy:{contentLimited:boolean;piiMasked:boolean;visibleMessageCount:number;totalMessageCount:number};
  findings:Array<{code:string;valueType:string;state:string;evidenceMessageIds:string[]}>;findingValuesWithheld:boolean};
}
export interface QualitySample { id:string; name:string; sampleType:string; sourceResultId?:string; contentSnapshot:string|null; expectedJson?:string|null; tagsJson?:string|null; privacy?:SampleReadPrivacy; status:string; createdTime?:string }
export interface QualityReport { pendingReviewCount:number; completedReviewCount:number; correctedReviewCount:number; reviewCorrectionRate:number; falsePositiveCount:number; falseNegativeCount:number; confirmedFeedbackCount:number; sampleCount:number }

export const createFeedback = (resultId:string, data:{feedbackType:string;comment?:string;evidenceJson?:string}) => http.post<ResultFeedback>(`/iqc/quality-operations/results/${resultId}/feedback`,data).then(r=>r.data);
export const listFeedbacks = (params:{resultId?:string;type?:string}={}) => http.get<ResultFeedback[]>("/iqc/quality-operations/feedback",{params}).then(r=>r.data);
export const requestReview = (resultId:string, comment?:string) => http.post<ResultReview>(`/iqc/quality-operations/results/${resultId}/reviews`,{comment}).then(r=>r.data);
export const listReviews = (status?:string) => http.get<ResultReview[]>("/iqc/quality-operations/reviews",{params:{status}}).then(r=>r.data);
export const decideReview = (reviewId:string,data:{decision:string;finalStatus?:string;finalScore?:number;finalRiskLevel?:string;comment?:string}) => http.post<ResultReview>(`/iqc/quality-operations/reviews/${reviewId}/decision`,data).then(r=>r.data);
export const createSample = (resultId:string,data:{name?:string;sampleType:string;expectedJson?:string;tagsJson?:string}) => http.post<QualitySample>(`/iqc/quality-operations/results/${resultId}/samples`,data).then(r=>r.data);
export const listSamples = (params:{type?:string;status?:string}={}) => http.get<QualitySample[]>("/iqc/quality-operations/samples",{params}).then(r=>r.data);
export const getQualityReport = () => http.get<QualityReport>("/iqc/quality-operations/report").then(r=>r.data);

export interface BusinessScoreSummary {
  resultCount: number; finalCount: number; pendingCount: number; notApplicableCount: number;
  qualifiedCount: number; averageScore: number | null; qualifiedRate: number | null;
  manualOverrides?:{appliedCount:number;staleCount:number;averageOverrideScore:number|null;effectiveNumericCount:number;averageEffectiveScore:number|null}|null;
}
export interface BusinessPolicyGroup {
  groupKey: string; schemeId: string; pipelineId?:string|null; versionNo: string; draftRevision: string; kind: string;
  mode: string; baseScore?: number; passingScore: number; taskIds: string[]; conversationCount: number; executionIds: string[];
  missingResultCount: number; missingReviewCount: number; pendingReviewCount: number;
  machine: BusinessScoreSummary; reviewed: BusinessScoreSummary;
  reviewChanges?:{schemaVersion:string;scope:string;reviewedResults:number;modifiedResults:number;itemOrScoreChangedResults:number;findingChangedResults:number;effectiveNumericScoreChangedResults:number;modificationRate:number|null;reviewCoverage:number|null}|null;
  items?: BusinessReportItem[];
}
export interface BusinessItemSummary {
  resultCount: number; passCount: number; failCount: number; notApplicableCount: number;
  notEvaluatedCount: number; reviewRequiredCount: number; errorCount: number; failureRate: number | null;
}
export interface BusinessReportItem {
  itemCode: string; name: string; scored: boolean; points?: number | null; veto?: boolean;
  machine: BusinessItemSummary; reviewed: BusinessItemSummary;
}
export interface BusinessQualityReport {
  scope: "SELECTED_TASK_RUNS"; runPolicy: "SELECTED_RUNS" | "FIRST_PER_CONVERSATION" | "LATEST_PER_CONVERSATION";
  taskCount: number; conversationCount: number; groups: BusinessPolicyGroup[];
}
/** Explicit bounded business view; the default message report contract stays unchanged. */
export const getBusinessQualityReport = (taskIds: string[], executionSelections?: Record<string, string>, runPolicy?: BusinessQualityReport["runPolicy"]) =>
  http.get<BusinessQualityReport>("/iqc/quality-operations/report", {
    params: { view: "BUSINESS", taskIds: taskIds.join(","),
      ...(executionSelections ? { executionSelections: JSON.stringify(executionSelections) } : {}), ...(runPolicy ? { runPolicy } : {}) }
  }).then(r => r.data);

export type ReviewFeedbackCategory='AI_FALSE_POSITIVE'|'AI_FALSE_NEGATIVE'|'EVIDENCE_WRONG'|'SCORE_POLICY_WRONG'|'DATA/ASR_ERROR'|'RULE_ERROR'|'BUSINESS_STANDARD_CHANGED';
export type ReviewStage='INITIAL'|'SECOND_REVIEW'|'ARBITRATION';
export interface ReviewWorkflow {schemaVersion:'iqc-review-workflow-v1';stage:'SECOND_REVIEW'|'ARBITRATION';parentReviewId:string;parentRevision:number;parentDecisionHash:string}
export interface BusinessReviewDecision {
  sourceResultId: string; itemCode: string; expectedStatus: BusinessItemResult["status"];
  finalStatus: "PASS" | "FAIL" | "NOT_APPLICABLE"; reason: string; evidenceMessageIds: string[]; feedbackCategory?: ReviewFeedbackCategory | null;
}
export interface BusinessReview {
  privacy?:import("@/api/config").AssetReadPrivacy;
  reviewPresentation?:{policyVersion:string;state:string;stage:ReviewStage|"INVALID";workflow?:ReviewWorkflow|null};
  id: string; targetType: "BUSINESS"; businessResultId: string; reviewRevision: number;
  status: "PENDING" | "COMPLETED" | "REJECTED"; requestComment?: string|null; reviewComment?: string|null;
  createdBy?: string; reviewerId?: string; reviewedTime?: string; reviewedResultJson?: string|null;
}
export interface BusinessReviewProjection {
  sourceResultId: string;
  original: { items: BusinessItemResult[]; scoring: BusinessScoringResult };
  reviewed: { items: BusinessItemResult[]; scoring: BusinessScoringResult };
  decisions: BusinessReviewDecision[]; manualScore?:ManualScoreProjection|null; workflow?:ReviewWorkflow|null;
}
export interface BusinessReviewRequest { expectedRevision: number; requestId: string; comment: string; stage?:ReviewStage; parentReviewId?:string }
export interface BusinessReviewVerdict { expectedRevision: number; decision: "COMPLETED" | "REJECTED"; items: BusinessReviewDecision[]; findingDecisions?:HumanFindingDecision[]; scoreAdjustment?:ScoreAdjustment; comment: string }
export const listBusinessReviews = (resultId: string) => http.get<BusinessReview[]>("/iqc/quality-operations/reviews", { params: { targetType: "BUSINESS", resultId } }).then(r => r.data);
export const requestBusinessReview = (resultId: string, data: BusinessReviewRequest) => http.post<BusinessReview>(`/iqc/quality-operations/results/${resultId}/reviews`, { ...data, targetType: "BUSINESS" }).then(r => r.data);
export const decideBusinessReview = (reviewId: string, data: BusinessReviewVerdict) => http.post<BusinessReview>(`/iqc/quality-operations/reviews/${reviewId}/decision`, { ...data, targetType: "BUSINESS" }).then(r => r.data);

export interface LabelValueReview {
  privacy?:import("@/api/config").AssetReadPrivacy;
  id: string; targetType: "LABEL"; labelResultId: string; reviewRevision: number;
  status: "PENDING" | "COMPLETED" | "REJECTED"; requestComment?: string|null;
  reviewComment?: string|null; createdBy?: string; reviewerId?: string; reviewedTime?: string;
  reviewedResultJson?: string|null;
}
export interface LabelValueDecision {
  status: "KNOWN" | "UNKNOWN"; value: string | number | boolean | null; evidenceMessageIds: string[];
}
export const listLabelValueReviews = (labelResultId: string) =>
  http.get<LabelValueReview[]>(`/iqc/quality-operations/label-results/${labelResultId}/reviews`).then(r => r.data);
export const requestLabelValueReview = (labelResultId: string, data: { expectedRevision: number; requestId: string; comment: string }) =>
  http.post<LabelValueReview>(`/iqc/quality-operations/label-results/${labelResultId}/reviews`, data).then(r => r.data);
export const decideLabelValueReview = (reviewId: string, data: {
  expectedRevision: number; decision: "COMPLETED" | "REJECTED"; labelDecision?: LabelValueDecision; comment: string;
}) => http.post<LabelValueReview>(`/iqc/quality-operations/label-reviews/${reviewId}/decision`, data).then(r => r.data);

export interface LabelReviewQueueItem {
  reviewId: string; labelResultId: string; taskId: string; taskName: string; conversationId: string;
  labelId: string; labelVersionNo?: number; labelName?: string; valueCode: string; valueDescription?: string;
  reviewRevision: number; status: LabelValueReview["status"];
  requestComment?: string; createdBy?: string; createdTime?: string; currentResult: boolean;
}
export type ReviewQueuePage<T> = PageResult<T> & { privacy?: import("@/api/config").AssetReadPrivacy };
export const listLabelReviewQueue = (params: { status: string; taskId?: string; current: number; size: number }) =>
  http.get<ReviewQueuePage<LabelReviewQueueItem>>("/iqc/quality-operations/label-reviews", { params }).then(r => r.data);

export interface BusinessReviewQueueItem {
  reviewId: string; resultId: string; taskId: string; taskName: string; conversationId: string;
  reviewRevision: number; status: BusinessReview["status"]; requestComment?: string; createdBy?: string;
  createdTime?: string; taskStatus: string; currentResult: boolean; stage?:ReviewStage|'INVALID';
}
export const listBusinessReviewQueue = (params: { status: string; taskId?: string; current: number; size: number }) =>
  http.get<ReviewQueuePage<BusinessReviewQueueItem>>("/iqc/quality-operations/reviews", {
    params: { ...params, targetType: "BUSINESS", view: "QUEUE" }
  }).then(r => r.data);

export interface BusinessCandidateRequest { reviewId: string; requestId: string; sampleType: "POSITIVE" | "NEGATIVE" | "FALSE_POSITIVE" | "FALSE_NEGATIVE"; name?: string; tagsJson?: string; }
export const createBusinessCandidate = (resultId: string, data: BusinessCandidateRequest) =>
  http.post<QualitySample>(`/iqc/quality-operations/results/${resultId}/samples`, { ...data, targetType: "BUSINESS" }).then(r => r.data);

export interface HumanFindingDecision {
 sourceResultId:string;findingCode:string;expectedFindingHash:string;state:'KNOWN'|'UNKNOWN';valueJson:string;
 severity:'NONE'|'LOW'|'MEDIUM'|'HIGH'|'CRITICAL';reason:string;retainedEvidenceIds:string[];addedMessageIds:string[];
}
export interface HumanFindingContext {
 privacy?:import("@/api/config").AssetReadPrivacy;
 sourceResultId:string;sourceHash:string;available:boolean;message?:string;
 findings:Array<{code:string;valueType:string;state:'KNOWN'|'UNKNOWN'|'CONFLICT'|'ERROR'|'NOT_EVALUATED';valueJson:string;
 severity:HumanFindingDecision['severity'];expectedFindingHash:string;allowedValues:string[];allowedEvidenceTypes:string[];evidenceRequired:boolean;
 evidence:Array<{id:string;type:string;reference:string}>;retainedEvidenceIds:string[];addedMessageIds:string[]}>;
 messages:Array<{id:string;sequenceNo:number;speakerRole:string;content:string}>;
}
export const getHumanFindingContext=(resultId:string)=>http.get<HumanFindingContext>('/iqc/quality-operations/reviews',
 {params:{targetType:'BUSINESS',resultId,view:'FINDING_CONTEXT'}}).then(response=>response.data);

export interface ScoreAdjustment {sourceResultId:string;expectedScoringHash:string;finalScore:string;reason:string}
export interface ManualScoreProjection {adjustment:ScoreAdjustment;status:'APPLIED'|'STALE';computedScoringHash:string;effectiveScore:number|null}
export interface ScoreReviewContext {privacy?:import("@/api/config").AssetReadPrivacy;sourceResultId:string;sourceHash:string;computedScoringHash:string;computedScoreStatus:string;computedScore:string|null;manualScore:(Omit<ManualScoreProjection,"adjustment"> & {adjustment:Omit<ScoreAdjustment,"reason"> & {reason?:string|null}})|null}
export const getScoreReviewContext=(resultId:string)=>http.get<ScoreReviewContext>('/iqc/quality-operations/reviews',
 {params:{targetType:'BUSINESS',resultId,view:'SCORE_CONTEXT'}}).then(response=>response.data);
