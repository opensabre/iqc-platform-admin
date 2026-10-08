import http from './http';
import type {PageResult} from './tasks';
export type ModelCallStatus='RESERVED'|'CONFIRMED'|'UNKNOWN';
export interface ModelCall {callId:string;modelKey:string;logicalRecordId:string|null;ruleId:string|null;owner:string|null;status:ModelCallStatus;reservedAtUtc:string;settledAtUtc:string|null;inputTokens:string|null;outputTokens:string|null;totalTokens:string|null;responseModelId:string|null;usageStatus:'COMPLETE'|'PARTIAL'|'MISSING'|'INVALID'|null;errorType:string|null;capacityReleasedAtUtc:string|null;capacityReleasedBy:string|null;capacityReleaseReason:string|null;capacityReleaseEvidence:string|null;taskId:string|null;executionId:string|null;nodeId:string|null;runIndex:number|null;conversationId:string|null;modelProfileId:string|null;modelProfileVersion:number|null;pricingHash:string|null;pricingCurrency:string|null;calculatedCost:string|null;costStatus:string|null;requestedModelName:string|null;cacheReadInputTokens:string|null;cacheWriteInputTokens:string|null;maxOutputTokens:number|null;outputTokenParameter:string|null;outputLimitStatus:string|null;toolRoundIndex:number|null;contextWindowTokens:number|null;deploymentRef:string|null;toolExecutionStartedAtUtc:string|null;budgetReservedTokens:string|null;budgetReservedCost:string|null;budgetCurrency:string|null;budgetPolicyVersion:string|null;budgetStatus:string|null;budgetEvidenceRef:string|null;reconciliation:BudgetReconciliation|null}
export interface CurrencyCost {currency:string|null;callCount:string;knownCount:string;unknownCount:string;knownSubtotal:string|null}
export interface CostSummary {callCount:string;knownCount:string;unknownCount:string;currencies:CurrencyCost[]}
export interface ModelCallPage extends PageResult<ModelCall> {costSummary:CostSummary}
export const listModelCalls=(status:ModelCallStatus|undefined,current=1,size=20)=>http.get<ModelCallPage>('/iqc/model-gateway/calls',{params:{status,current,size}}).then(r=>r.data);
export interface BudgetPolicy {tokenLimit:string|null;costLimit:string|null;currency:string|null;contextWindow:number;deploymentRef:string;outputParameter:string;pricingHash:string|null;evidenceRef:string;contractVerified:boolean}
export interface BudgetView {tokenLimit:string|null;tokenCommitted:string|null;tokenRemaining:string|null;costLimit:string|null;costCommitted:string|null;costRemaining:string|null;currency:string|null;contextWindow:number|null;deploymentRef:string|null;outputParameter:string|null;pricingHash:string|null;evidenceRef:string|null;breached:boolean}
export interface ModelCapacity {modelKey:string;occupied:string;concurrencyLimit:number;managed:boolean;version:string;budget:BudgetView}
export type CapacityReleaseReason='REMOTE_COMPLETED'|'REMOTE_CANCELLED'|'REQUEST_NOT_SENT';
export const getModelCapacity=(modelKey:string)=>http.get<ModelCapacity>(`/iqc/model-gateway/capacity/${modelKey}`).then(r=>r.data);
export const configureModelCapacity=(modelKey:string,concurrencyLimit:number,expectedVersion:string,budget?:BudgetPolicy)=>http.put<{before:ModelCapacity;after:ModelCapacity}>(`/iqc/model-gateway/capacity/${modelKey}`,{concurrencyLimit,expectedVersion,...(budget?{budget}:{})}).then(r=>r.data);
export const releaseModelCapacity=(callId:string,modelKey:string,reason:CapacityReleaseReason,evidence:string,remoteStopped:boolean)=>http.post<ModelCapacity>(`/iqc/model-gateway/calls/${callId}/capacity-release`,{modelKey,reason,evidence,remoteStopped}).then(r=>r.data);
export const listTaskModelCalls=(taskId:string,executionId:string|undefined,status:ModelCallStatus|undefined,current=1,size=20)=>http.get<ModelCallPage>(`/iqc/tasks/${taskId}/model-calls`,{params:{executionId,status,current,size}}).then(r=>r.data);

export interface BudgetReconciliation {callId:string;modelKey:string;tokens:string;cost:string|null;currency:string|null;atUtc:string;owner:string;userId:string;evidence:string}
export const reconcileModelBudget=(callId:string,modelKey:string,tokens:string,cost:string|null,currency:string|null,evidence:string,verified:boolean)=>http.post<{before:ModelCapacity;after:ModelCapacity;reconciliation:BudgetReconciliation}>(`/iqc/model-gateway/calls/${callId}/budget-reconciliation`,{modelKey,tokens,cost,currency,evidence,verified}).then(r=>r.data);

export const recoverModelBudget=(modelKey:string,expectedVersion:string,budget:BudgetPolicy)=>http.post<{before:ModelCapacity;after:ModelCapacity}>(`/iqc/model-gateway/capacity/${modelKey}/budget-recovery`,{expectedVersion,budget}).then(r=>r.data);

export interface ModelBudgetSnapshot {modelProfileId:string;modelVersion:number;modelKey:string;contextWindowTokens:number|null;deploymentRef:string|null;maxOutputTokens:number|null;outputTokenParameter:string|null;pricingHash:string|null;pricingCurrency:string|null;capacity:ModelCapacity|null}
export const getModelBudget=(id:string)=>http.get<ModelBudgetSnapshot>(`/iqc/agent-assets/models/${id}/budget`).then(r=>r.data);
export const configureProfileBudget=(source:ModelBudgetSnapshot,capacityVersion:string,concurrencyLimit:number,budget:BudgetPolicy)=>http.post(`/iqc/agent-assets/models/${source.modelProfileId}/budget`,{modelVersion:source.modelVersion,capacityVersion,concurrencyLimit,budget}).then(r=>r.data as {modelProfileId:string;modelVersion:number;capacity:{before:ModelCapacity;after:ModelCapacity}});

export type ModelMonitoringRange='15m'|'1h'|'6h'|'24h'|'7d'|'30d';
export interface ModelMonitoringHistory {range:ModelMonitoringRange;start:string;end:string;stepSeconds:number;series:Record<string,string>}
export const getModelMonitoringHistory=(range:ModelMonitoringRange)=>http.get<ModelMonitoringHistory>('/iqc/model-gateway/monitoring/history',{params:{range}}).then(r=>r.data);
