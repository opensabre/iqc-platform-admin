import http from "@/api/http";
export interface BusinessConversationResult { id:string; taskId:string; taskName?:string; conversationId:string; sourceFileName?:string; executionId?:string; scoreStatus:"FINAL"|"PENDING"|"NOT_APPLICABLE"; finalScore:number|null; itemCount:number; failureCount:number; errorCount:number; riskLevel?:string; }
export interface BusinessResultFilters { taskId?:string; scoreStatus?:string; riskLevel?:string; minScore?:number; maxScore?:number; }
export async function listBusinessResults(filters:BusinessResultFilters = {}, page:{current?:number;size?:number} = {}) {
  const {data} = await http.get<{records:BusinessConversationResult[];current:number;size:number;total:number}>("/iqc/results/business", {params:{...filters,...page}});
  return data;
}
export interface ResultReadPrivacy {
  policyVersion: string;
  contentLimited?: boolean;
  piiMasked?: boolean;
  messageContentCount?: number;
  totalMessageCount?: number;
  withheldFields?: string[];
  canReadFull?: boolean;
  canReadPii?: boolean;
}
export interface InspectionResult { privacy?: ResultReadPrivacy; id: string; taskId: string; conversationId:string; sourceFileName?: string; messageId: string; ruleId?: string; speakerRole: string; resultStatus: string; score: number | null; riskLevel?: string; deduction?: number; reason: string; evidence?: string; findingJson?: string; evidenceJson?: string; suggestionJson?: string; ruleBreakdownJson?: string; createdTime?: string; }
export interface ConversationResultSummary { conversationId:string; sourceFileName?:string; messageCount:number; resultCount:number; averageScore:number | null; scoreStatus?:string; hitCount:number; highRiskCount:number; errorCount:number; }
export interface BatchResultSummary { taskId:string; status:string; conversationCount:number; totalMessages:number; processedMessages:number; failedMessages:number; averageScore:number | null; hitCount:number; highRiskCount:number; conversations:ConversationResultSummary[]; }
export interface ConversationResultDetail { privacy?: ResultReadPrivacy; conversation:{id:string;sourceFileName:string}; task?:{id?:string;name?:string;status?:string;ruleSnapshotJson?:string;agentSnapshotJson?:string}; summary:ConversationResultSummary; messages:Array<{id:string;sequenceNo:number;speakerRole:string;relativeTime:string;content:string|null}>; results:InspectionResult[]; }
export interface HierarchicalRuleResult { id:string; ruleId:string; ruleVersionNo?:number; ruleType:string; evaluationScope:"MESSAGE"|"CONVERSATION"|"CONTEXT"; resultStatus:string; score:number | null; riskLevel:string; deduction:number; reason:string; findingJson?:string; }
export interface HierarchicalEvidence { ruleResultId:string; messageId:string; sequenceNo?:number; internalDefinition?:string; evidenceType:string; matchedText?:string; startOffset?:number; endOffset?:number; }
export interface BusinessItemResult { itemCode:string; name:string; ruleId:string; ruleVersionNo:number; status:"PASS"|"FAIL"|"NOT_APPLICABLE"|"NOT_EVALUATED"|"REVIEW_REQUIRED"|"ERROR"; matchedMessageIds:string[]; }
export interface AdvancedScoringResult {schemaVersion:'iqc-score-result-v3';rawScore:number|null;rawNumerator:number|null;rawDenominator:number|null;grade:string|null;lines:Array<{itemCode:string;originalStatus:string;status:string;applicability:'MATCH'|'NO_MATCH'|'UNKNOWN';configuredPoints:number;weight:number;baseContribution:number|null;adjustment:number|null;vetoTriggered:boolean;dimensionCode:string|null}>;dimensions:Array<{code:string;scoreStatus:string;rawScore:number|null;rawNumerator:number|null;rawDenominator:number|null;finalScore:number|null;conclusion:string;vetoTriggered:boolean;coverage:{expected:number;completed:number;notApplicable:number;pending:number}}>}
export interface BusinessScoringResult {advanced?:AdvancedScoringResult|null; mode:"DEDUCTION"|"POINTS"; scoreStatus:string; finalScore:number|null; conclusion:string; lines:Array<{itemCode:string;configuredPoints:number;contribution:number|null;vetoTriggered:boolean}>; }
export interface ResultHierarchy { privacy?: ResultReadPrivacy; conversation:{id:string;resultStatus:string;score:number|null;finalScore?:number|null;scoreStatus?:string;scoringResultJson?:string;businessItemResultsJson?:string;executionTraceJson?:string|null;riskLevel:string;deduction:number;reason:string;aggregationMode:string}; rules:HierarchicalRuleResult[]; evidenceByRuleResult:Record<string,HierarchicalEvidence[]>; }
export interface ResultFilters { taskId?: string; agentId?: string; ownerId?: string; groupId?: string; status?: string; minScore?: number; maxScore?: number; speakerRole?: string; riskLevel?: string; }
export interface ResultPage { records: InspectionResult[]; current: number; size: number; total: number; }
export interface LabelReviewOverlay { latestRevision:number; latestStatus:string; effectiveReviewId?:string; effectiveRevision?:number; effectiveStatus?:"KNOWN"|"UNKNOWN"; effectiveValue?:string|number|boolean|null; evidenceMessageIds:string[]; }
export interface FindingLabelSource { findingCode:string; actionExecutionId:string; executionId:string; inputHash:string; projectionHash:string; }
export interface LabelResult { id:string; conversationId:string; sourceFileName?:string; labelId:string; labelName:string; labelCode?:string; labelPath?:string; labelVersionNo:number; valueCode?:string; valueJson?:string; confidence?:number; generationSource:string; sourceRuleResultId?:string; evidenceJson?:string; status?:"HIT"|"KNOWN"|"UNKNOWN"|"CONFLICT"|"ERROR"|"NOT_EVALUATED"; reviewOverlay?:LabelReviewOverlay|null; findingSource?:FindingLabelSource|null; }
export interface LabelInsightSummary { conversationCount:number; detectedConversationCount:number; detectionRate:number; labelDistribution:Record<string,number>; groupDistribution:Record<string,number>; coverageValueCount:number; coverageStatusCounts:Record<string,number>; reviewed?:{correctedValueCount:number;pendingReviewCount:number;detectedConversationCount:number;detectionRate:number;coverageValueCount:number;coverageStatusCounts:Record<string,number>}|null; }
export async function listResults(filters: ResultFilters = {}, page: { current?: number; size?: number } = {}) { const { data } = await http.get<ResultPage>("/iqc/results", { params: { ...filters, ...page } }); return data; }
export async function getResultDetail(id: string) { const { data } = await http.get(`/iqc/results/${id}`); return data; }
export async function exportResults(filters: ResultFilters = {}) { return http.get<Blob>("/iqc/results/export", { params: filters, responseType: "blob" }); }
export async function exportSchemeResults(taskId: string) { return http.get<Blob>("/iqc/results/export", { params: { taskId, view: "SCHEME" }, responseType: "blob" }); }
export async function exportBusinessReview(reviewId: string) { return http.get<Blob>("/iqc/results/export", { params: { reviewId, view: "BUSINESS_REVIEW" }, responseType: "blob" }); }
export async function exportTaskBusinessReviews(taskId: string) { return http.get<Blob>("/iqc/results/export", { params: { taskId, view: "BUSINESS_REVIEW_TASK" }, responseType: "blob" }); }
export async function getBatchResultSummary(taskId:string){const {data}=await http.get<BatchResultSummary>(`/iqc/tasks/${taskId}/result-summary`);return data;}
export async function getTaskLabelResults(taskId:string){const {data}=await http.get<LabelResult[]>(`/iqc/tasks/${taskId}/label-results`);return data;}
export async function getTaskLabelInsights(taskId:string){const {data}=await http.get<LabelInsightSummary>(`/iqc/tasks/${taskId}/label-insights`);return data;}
export async function exportTaskLabelResults(taskId:string){return http.get<Blob>(`/iqc/tasks/${taskId}/label-results/export`,{responseType:"blob"});}
export async function getConversationResultDetail(taskId:string,conversationId:string){const {data}=await http.get<ConversationResultDetail>(`/iqc/tasks/${taskId}/conversations/${conversationId}/result-detail`);return data;}
export function normalizeResultHierarchy(value: ResultHierarchy | string | undefined) {
  if (typeof value !== "string") return value;
  const parsed = JSON.parse(value);
  return parsed && typeof parsed === "object" && "code" in parsed ? parsed.data as ResultHierarchy | undefined : parsed as ResultHierarchy;
}
export async function getResultHierarchy(taskId:string,conversationId:string){const {data}=await http.get<ResultHierarchy|string|undefined>(`/iqc/tasks/${taskId}/conversations/${conversationId}/result-hierarchy`);return normalizeResultHierarchy(data);}
export async function getConversationResults(conversationId:string){const {data}=await http.get<ConversationResultDetail>(`/iqc/conversations/${conversationId}/result-detail`);return data;}

export interface RouteTraceNode { nodeId:string;runIndex:number;ruleId:string;ruleVersion:number;engineType:string;phase:string;inputScope:string;upstreamNodeId?:string|null;executed:boolean;executionStatus:"SUCCESS"|"FAILED"|"SKIPPED";resultStatus:string;factState:"POSITIVE"|"NEGATIVE"|"UNKNOWN"|"ERROR"|"NOT_EVALUATED";reason?:string|null;inputHash?:string|null;durationNanos:number;startedAt?:string|null;rawFinding?:unknown;evidence?:unknown;rawFindingParseError?:boolean;evidenceParseError?:boolean;findings?:TraceFinding[]; }
export interface TraceFinding { id:string;code:string;category:string;valueType:"BOOLEAN"|"STRING"|"NUMBER"|"ENUM"|"OBJECT";value:unknown;state:"KNOWN"|"UNKNOWN"|"CONFLICT"|"ERROR"|"NOT_EVALUATED";confidence:number|null;severity:"NONE"|"LOW"|"MEDIUM"|"HIGH"|"CRITICAL";reason?:string|null;evidence:Array<{id:string;type:string;reference:string;details:unknown}>;source:{nodeId:string;engineType:string;engineVersion:string;runIndex:number;inputHash?:string|null}; }
export interface RouteExecutionTrace {schemaVersion:"iqc-route-execution-trace-v1";findingSchemaVersion?:string;taskId:string;executionId:string;conversationId:string;planSchemaVersion:string;inputHash:string;ruleSnapshotHash:string;agentSnapshotHash?:string|null;nodes:RouteTraceNode[];}
