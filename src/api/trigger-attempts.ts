import http from './http';
import type {PageResult} from './tasks';
export type TriggerKind='PERIODIC'|'SUBSCRIPTION'|'TASK';
export interface TriggerAttempt {attemptId:string;triggerKind:TriggerKind;parentId:string;revisionId:string|null;evidenceHash:string;plannedAtUtc:string|null;startedAtUtc:string;finishedAtUtc:string|null;outcome:'DOMAIN_COMMITTED'|'NO_CHANGE'|'FAILED'|'UNCONFIRMED';processedUnits:number|null;errorType:string|null;failureStage:'AUTHORIZATION'|'EXPIRATION'|'MATERIALIZATION'|null;errorCode:string|null}
export const listTriggerAttempts=(kind:TriggerKind,parentId:string,current=1,size=20)=>http.get<PageResult<TriggerAttempt>>('/iqc/trigger-attempts',{params:{kind,parentId,current,size}}).then(r=>r.data);
