import type {ScheduleReadPrivacy} from './periodic-schedules';
import type {AutomaticRetryPolicy} from './automatic-retry';
import http from './http';
import type {InspectionTask,PageResult} from './tasks';
export interface SubscriptionDefinition {retryPolicy?:AutomaticRetryPolicy|null;schemaVersion:'iqc-event-subscription-v1'|'iqc-event-subscription-rollout-v1';eventType:'ConversationCompleted'|'ASRCompleted';effectiveFrom:string;effectiveUntil:string|null;waitSeconds:number;concurrency:number;pipeline:{pipelineId:string;versionNo:number}|null;rollout?:{pipelineId:string}|null;selector?:{selectorId:string;versionNo:number}|null}
export interface EventSubscription {id:string;code:string;name:string;draftRevision:number;draftConfigJson:string|null;privacy?:ScheduleReadPrivacy;activeRevisionId:string|null;status:'ACTIVE'|'DISABLED';retryNotBeforeUtc:string|null;lastError:string|null;ownerGroupId:string|null}
export interface SubscriptionVersion {id:string;subscriptionId:string;versionNo:number;sourceDraftRevision:number;snapshotJson:string|null;privacy?:ScheduleReadPrivacy;contentHash:string;createdTime?:string}
const path=(id:string)=>`/iqc/event-subscriptions/${encodeURIComponent(id)}`;
export const listSchedules=(current=1,size=20)=>http.get<PageResult<EventSubscription>>('/iqc/event-subscriptions',{params:{current,size}}).then(r=>r.data);
export const getSchedule=(id:string)=>http.get<EventSubscription>(path(id)).then(r=>r.data);
export const createSchedule=(code:string,name:string,definition:SubscriptionDefinition)=>http.post<EventSubscription>('/iqc/event-subscriptions',{code,name,definition}).then(r=>r.data);
export const updateSchedule=(id:string,expectedRevision:number,name:string,definition:SubscriptionDefinition)=>http.put<EventSubscription>(path(id),{expectedRevision,name,definition}).then(r=>r.data);
export const publishSchedule=(id:string,expectedRevision:number)=>http.post<SubscriptionVersion>(`${path(id)}/publish`,{expectedRevision}).then(r=>r.data);
export const availabilitySchedule=(id:string,enabled:boolean)=>http.post<EventSubscription>(`${path(id)}/availability`,{enabled}).then(r=>r.data);
export const scheduleVersions=(id:string)=>http.get<SubscriptionVersion[]>(`${path(id)}/versions`).then(r=>r.data);
export const scheduleInstances=(id:string,current=1,size=20)=>http.get<PageResult<InspectionTask>>(`${path(id)}/instances`,{params:{current,size}}).then(r=>r.data);
