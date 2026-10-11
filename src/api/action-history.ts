import http from './http';
export interface ActionHistory {id:string;version?:number|null;actionId:string;type:string;status:string;attemptCount:number|null;nextAttemptAtUtc:string|null;claimedAtUtc:string|null;settledAtUtc:string|null;outcome:string|null;evidenceReference:string|null;resultReference:string|null;errorCode:string|null;history?:ActionEventPage|null;attempts?:ActionAttemptPage|null}
export interface ActionEventState {status:string;attemptCount:number;claimedAtUtc:string|null;settledAtUtc:string|null;nextAttemptAtUtc:string|null;outcome:string|null;evidenceReference:string|null;resultReference:string|null;errorCode:string|null}
export interface ActionStateEvent {version:string;previousVersion:string|null;previousState:ActionEventState|null;state:ActionEventState;actor:string|null;recordedAtUtc:string;reconciliationReason?:string|null;recoveryReason?:string|null}
export interface ActionEventPage {events:ActionStateEvent[];nextBeforeVersion:string|null;earlierHistoryUnavailable:boolean}
export interface ActionAttempt {id:string;observedVersion:string;actor:string;reason:string;state:'STARTED'|'CONFIRMED'|'UNCONFIRMED'|'STALE_OBSERVATION'|'LOOKUP_FAILED';startedAtUtc:string;finishedAtUtc:string|null;confirmedVersion:string|null}
export interface ActionAttemptPage {attempts:ActionAttempt[];nextBeforeAttempt:string|null}
export interface ActionHistoryOptions {actionExecutionId:string;includeHistory?:true;beforeVersion?:string;includeAttempts?:true;beforeAttempt?:string}
export async function listActionHistory(id:string,options?:ActionHistoryOptions){const {data}=await http.get<ActionHistory[]>(`/iqc/conversation-results/${encodeURIComponent(id)}/actions`,options?{params:options}:undefined);return data;}

export interface ActionDiscoveryResponse {sourceResultId:string;status:"DISCOVERY_REQUESTED"|"ALREADY_DISCOVERED"}
export async function requestActionDiscovery(id:string){const {data}=await http.post<ActionDiscoveryResponse>(`/iqc/conversation-results/${encodeURIComponent(id)}/actions/enqueue`);return data;}

export interface ActionReconciliationResponse {id:string;state:'CONFIRMED'|'UNCONFIRMED'|'STALE_OBSERVATION'}
export async function reconcileAction(resultId:string,actionExecutionId:string,version:number,reason:string){
 const {data}=await http.post<ActionReconciliationResponse>(`/iqc/conversation-results/${encodeURIComponent(resultId)}/actions/${encodeURIComponent(actionExecutionId)}/reconcile`,{version,reason});
 return data;
}

export interface ActionRecoveryResponse {id:string;state:'RECOVERED'|'NOT_RECOVERED'}
export async function recoverAction(resultId:string,actionExecutionId:string,version:number,reason:string){
 const {data}=await http.post<ActionRecoveryResponse>(`/iqc/conversation-results/${encodeURIComponent(resultId)}/actions/${encodeURIComponent(actionExecutionId)}/recover`,{version,reason});
 return data;
}
