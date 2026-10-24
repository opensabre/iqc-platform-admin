import http from '@/api/http';
import type {QualitySample,SampleReadPrivacy} from './quality';
import type {PageResult} from './tasks';
export type JsonValue=null|boolean|number|string|JsonValue[]|{[key:string]:JsonValue};
export interface GoldFinding {code:string;valueType:'BOOLEAN'|'STRING'|'NUMBER'|'ENUM'|'OBJECT';state:'KNOWN'|'UNKNOWN'|'CONFLICT'|'ERROR'|'NOT_EVALUATED';value:JsonValue;evidenceMessageIds:string[]}
export interface GoldDecision {score?:number|null;scoreStatus?:'FINAL'|'PENDING'|'NOT_APPLICABLE'|null;labels?:Record<string,JsonValue>;risk?:'NONE'|'LOW'|'MEDIUM'|'HIGH'|'CRITICAL'|'UNKNOWN'|null}
export interface GoldDraft {schemaVersion:string;sourceSampleId:string;conversationId:string;messages:Array<{id:string;role:string;content:string;sequence:number;relativeTime?:string;startMs?:number|null;endMs?:number|null;confidence?:number|null}>;businessContext?:Record<string,JsonValue>;findings:GoldFinding[];annotatorId:string;reviewerId?:string;source:string;tags:string[];difficulty:'BASIC'|'INTERMEDIATE'|'HARD';decision?:GoldDecision}
export interface GoldSample extends QualitySample {goldDraftJson?:string|null;goldDraftRevision:number;goldStatus?:string;goldReviewVersion?:number}
export interface GoldVersion {id:string;sampleId:string;versionNo:number;sourceDraftRevision:number;decision:'APPROVED'|'REJECTED';reviewerId:string;reason:string|null;snapshotJson?:string|null;contentHash:string;privacy?:SampleReadPrivacy;createdTime?:string}
export interface GoldAnnotation {expectedRevision:number;findings:GoldFinding[];businessContext?:Record<string,JsonValue>;tags:string[];difficulty:GoldDraft['difficulty'];decision?:GoldDecision}
const gold=(id:string)=>`/iqc/quality-operations/samples/${encodeURIComponent(id)}/gold`;
export const getGoldSample=(id:string)=>http.get<GoldSample>(gold(id)).then(r=>r.data);
export const annotateGold=(id:string,data:GoldAnnotation)=>http.put<GoldSample>(gold(id),data).then(r=>r.data);
export const reviewGold=(id:string,data:{expectedRevision:number;approve:boolean;reason:string})=>http.post<GoldVersion>(`${gold(id)}/reviews`,data).then(r=>r.data);
export const listGoldVersions=(id:string,current=1,size=20)=>http.get<PageResult<GoldVersion>>(`${gold(id)}/versions`,{params:{current,size}}).then(r=>r.data);
export const getGoldVersion=(id:string,no:number)=>http.get<GoldVersion>(`${gold(id)}/versions/${no}`).then(r=>r.data);
export interface DatasetDraft {schemaVersion:'iqc-dataset-draft-v1';type:'BASIC'|'BOUNDARY'|'RISK'|'ADVERSARIAL'|'REGRESSION'|'CUSTOM';description?:string;members:Array<{sampleId:string;versionNo:number}>}
export interface Dataset {id:string;name:string;datasetType:DatasetDraft['type'];draftConfigJson:string|null;draftRevision:number;activeVersion?:number;status:string;privacy?:{policyVersion:string;canonicalPayloadVisible:boolean;canReadFull:boolean;canReadPii:boolean;withheldFields:string[];previewState:string;members?:Array<{sampleId:string;versionNo:number}>}}
export interface DatasetVersionPrivacy {policyVersion:string;canonicalPayloadVisible:boolean;canReadFull:boolean;canReadPii:boolean;withheldFields:string[];previewState?:string;members?:Array<{sampleId:string;versionNo:number;contentHash:string;privacy:SampleReadPrivacy}>}
export interface DatasetVersion {id:string;datasetId:string;versionNo:number;sourceDraftRevision:number;sampleCount:number;snapshotJson?:string|null;contentHash:string;privacy?:DatasetVersionPrivacy;createdTime?:string}
const datasets='/iqc/evaluation/datasets';
export const listDatasets=(current=1,size=20)=>http.get<PageResult<Dataset>>(datasets,{params:{current,size}}).then(r=>r.data);
export const getDataset=(id:string)=>http.get<Dataset>(`${datasets}/${encodeURIComponent(id)}`).then(r=>r.data);
export const createDataset=(name:string,draft:DatasetDraft)=>http.post<Dataset>(datasets,{name,draft}).then(r=>r.data);
export const updateDataset=(id:string,expectedRevision:number,name:string,draft:DatasetDraft)=>http.put<Dataset>(`${datasets}/${encodeURIComponent(id)}`,{name,draft,expectedRevision}).then(r=>r.data);
export const freezeDataset=(id:string,expectedRevision:number)=>http.post<DatasetVersion>(`${datasets}/${encodeURIComponent(id)}/freeze`,{expectedRevision}).then(r=>r.data);
export const setDatasetAvailability=(id:string,enabled:boolean)=>http.post<Dataset>(`${datasets}/${encodeURIComponent(id)}/availability`,{enabled}).then(r=>r.data);
export const listDatasetVersions=(id:string,current=1,size=20)=>http.get<PageResult<DatasetVersion>>(`${datasets}/${encodeURIComponent(id)}/versions`,{params:{current,size}}).then(r=>r.data);
export const getDatasetVersion=(id:string,no:number)=>http.get<DatasetVersion>(`${datasets}/${encodeURIComponent(id)}/versions/${no}`).then(r=>r.data);

export interface EvaluationTaskRequest {datasetId:string;datasetVersion:number;pipelineId:string;pipelineVersion?:number;draftRevision?:number;name?:string;concurrency:number;requestId:string}
export interface EvaluationResult {id:string;taskId:string;executionId:string;datasetId:string;datasetVersion:number;sampleId:string;sampleVersion:number;conversationId:string;status:string;durationMs:number;actualJson?:string|null;actualHash:string;goldHash:string;datasetHash:string;privacy?:{policyVersion:string;canonicalPayloadVisible:boolean;canReadFull:boolean;canReadPii:boolean;canReadPrompt:boolean;withheldFields:string[];previewState:string;preview?:{runStatus:string;traceCount:number;findingCount:number;completionReason?:string}}}
export interface FindingSummary {counts:Record<string,number>;precision:number|null;recall:number|null;f1:number|null;coverage:number|null;valueAccuracy:number|null;stateAccuracy:number|null;evidenceAccuracy:number|null}
export interface ConfidenceCalibrationCandidate {
 schemaVersion:string;method:string;event:string;eligibleKnownGold:number;scored:number;minimumBinSamples:number;contentHash:string;
 source:{taskId:string;executionId:string;datasetHash:string;pipelineHash:string;evidenceHash:string;nodeId:string;nodeHash:string;findingCode:string};
 bins:Array<{index:number;samples:number;correct:number;calibratedProbability:number|null}>;
}
export interface CalibrationComparison {
 schemaVersion:string;artifactHash:string;originalMeasured:number;mappedCoverage:number|null;
 pairedRaw:FindingConfidenceDiagnostics;pairedCalibrated:FindingConfidenceDiagnostics;brierDelta:number|null;expectedCalibrationErrorDelta:number|null;
}
export interface FindingConfidenceDiagnostics {schemaVersion:string;scope:string;eligibleKnownGold:number;scored:number;unscored:number;
 coverage:number|null;brierScore:number|null;expectedCalibrationError:number|null;
 bins:Array<{index:number;lowerInclusive:number;upperBound:number;upperInclusive:boolean;count:number;meanConfidence:number|null;observedAccuracy:number|null}>}
export interface CitationGroundingSummary {
 schemaVersion:string;scope:string;expectedNodeSamples:number;observedNodeSamples:number;measuredNodeSamples:number;
 partialNodeSamples:number;unmeasuredNodeSamples:number;invalidDiagnosticNodeSamples:number;outputs:number;
 recognizedOutputs:number;unmeasuredOutputs:number;claimedQuotes:number;invalidQuotes:number;malformedContainers:number;
 measurementCoverage:number|null;observedQuoteErrorRate:number|null;
}
export interface InputCompletenessSummary {
 schemaVersion:string;scope:string;expectedSamples:number;measuredSamples:number;unmeasuredSamples:number;invalidManifestSamples:number;
 completeSamples:number;deficientSamples:number;excessSamples:number;expectedMessages:number;observedMessages:number;
 missingMessages:number;extraMessages:number;measurementCoverage:number|null;completeConversationRate:number|null;declaredMessageCoverage:number|null;
}
export interface EvaluationReport {nodeConfidenceMetrics?:{schemaVersion:string;nodes:Array<{nodeId:string;engineType:string;engineVersion:string;findingCode:string;diagnostics:FindingConfidenceDiagnostics;calibrationCandidate?:ConfidenceCalibrationCandidate|null;calibrationComparison?:CalibrationComparison|null}>}|null;inputCompletenessMetrics?:InputCompletenessSummary|null;citationGroundingMetrics?:CitationGroundingSummary|null;taskId:string;executionId:string;datasetHash:string;expectedSamples:number;availableSamples:number;successfulSamples:number;complete:boolean;missingSampleIds:string[];sourceExecutionIds:Record<string,string>;findingMetrics:{aggregate:FindingSummary;byCode:Record<string,FindingSummary>;unlabelledOutputs:number;confidenceDiagnostics?:FindingConfidenceDiagnostics|null};businessMetrics:Record<string,number|null>;latencyMetrics:{scope:string;measuredSamples:number;p50Ms:number|null;p95Ms:number|null;p99Ms:number|null;executionFailureRate:number|null};structuredMetrics?:{scope:string;declaredLlmNodes:number;logicalInvocations:number;validOutputs:number;invalidOrFailedOutputs:number;unmeasuredAttempts:number;successRate:number|null};regressionMetrics?:{scope:string;expectedSamples:number;passedSamples:number;passRate:number|null;failedSampleIds:string[]}}
const evaluationTasks='/iqc/evaluation/tasks';
export const createEvaluationTask=(body:EvaluationTaskRequest)=>http.post<import('./tasks').InspectionTask>(evaluationTasks,body).then(r=>r.data);
export const listEvaluationResults=(id:string,executionId?:string,current=1)=>http.get<PageResult<EvaluationResult>>(`${evaluationTasks}/${encodeURIComponent(id)}/results`,{params:{executionId,current,size:20}}).then(r=>r.data);
export const getEvaluationResult=(id:string,resultId:string)=>http.get<EvaluationResult>(`${evaluationTasks}/${encodeURIComponent(id)}/results/${encodeURIComponent(resultId)}`).then(r=>r.data);
export const getEvaluationReport=(id:string,executionId?:string)=>http.get<EvaluationReport>(`${evaluationTasks}/${encodeURIComponent(id)}/report`,{params:{executionId}}).then(r=>r.data);

export interface ModelConsistencyReport {schemaVersion:string;scope:string;expectedPairs:number;comparablePairs:number;agreeingPairs:number;comparisonCoverage:number|null;agreementRate:number|null;excludedReasons:Record<string,number>}
export const getModelConsistency=(id:string,executionId:string,referenceTaskId:string,referenceExecutionId:string)=>http.get<ModelConsistencyReport>(`${evaluationTasks}/${encodeURIComponent(id)}/report`,{params:{executionId,referenceTaskId,referenceExecutionId}}).then(r=>r.data);
