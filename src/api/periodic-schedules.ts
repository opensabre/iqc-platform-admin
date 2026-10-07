import type {AutomaticRetryPolicy} from './automatic-retry';
import http from './http';
import type {InspectionTask,PageResult} from './tasks';
export interface PeriodicDefinition {retryPolicy?:AutomaticRetryPolicy|null;schemaVersion:'iqc-periodic-definition-v1';cron:string;zoneId:string;effectiveFrom:string;effectiveUntil:string|null;misfirePolicy:'SKIP'|'FIRE_LATEST'|'CATCH_UP';maximumCatchUp:number;concurrency:number;pipeline:{pipelineId:string;versionNo:number};selector:{selectorId:string;versionNo:number}}
export interface PeriodicSchedule {id:string;code:string;name:string;draftRevision:number;draftConfigJson:string;activeRevisionId:string|null;status:'ACTIVE'|'DISABLED';nextPlannedAtUtc:string|null;lastError:string|null;ownerGroupId:string|null}
export interface PeriodicVersion {id:string;scheduleId:string;versionNo:number;sourceDraftRevision:number;snapshotJson:string;contentHash:string;createdTime?:string}
const path=(id:string)=>`/iqc/periodic-schedules/${encodeURIComponent(id)}`;
export const listSchedules=(current=1,size=20)=>http.get<PageResult<PeriodicSchedule>>('/iqc/periodic-schedules',{params:{current,size}}).then(r=>r.data);
export const getSchedule=(id:string)=>http.get<PeriodicSchedule>(path(id)).then(r=>r.data);
export const createSchedule=(code:string,name:string,definition:PeriodicDefinition)=>http.post<PeriodicSchedule>('/iqc/periodic-schedules',{code,name,definition}).then(r=>r.data);
export const updateSchedule=(id:string,expectedRevision:number,name:string,definition:PeriodicDefinition)=>http.put<PeriodicSchedule>(path(id),{expectedRevision,name,definition}).then(r=>r.data);
export const publishSchedule=(id:string,expectedRevision:number)=>http.post<PeriodicVersion>(`${path(id)}/publish`,{expectedRevision}).then(r=>r.data);
export const availabilitySchedule=(id:string,enabled:boolean)=>http.post<PeriodicSchedule>(`${path(id)}/availability`,{enabled}).then(r=>r.data);
export const scheduleVersions=(id:string)=>http.get<PeriodicVersion[]>(`${path(id)}/versions`).then(r=>r.data);
export const scheduleInstances=(id:string,current=1,size=20)=>http.get<PageResult<InspectionTask>>(`${path(id)}/instances`,{params:{current,size}}).then(r=>r.data);
export const previewSchedule=(definition:PeriodicDefinition,from:string,size=10)=>http.post<string[]>('/iqc/periodic-schedules/preview',{definition,from,size}).then(r=>r.data);
