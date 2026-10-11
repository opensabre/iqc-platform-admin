import http from './http';
export interface RiskEvent {id:string;sourceResultId:string;sourceActionExecutionId:string;category:string;title:string;description:string;riskLevel:string;status:string;version:string}
export async function listRiskEvents(resultId:string){const {data}=await http.get<RiskEvent[]>(`/iqc/conversation-results/${encodeURIComponent(resultId)}/risk-events`);return data;}
export async function handleRiskEvent(resultId:string,id:string,version:string,status:string,reason:string){const {data}=await http.post<{id:string;state:'HANDLED'|'STALE_OBSERVATION'}>(`/iqc/conversation-results/${encodeURIComponent(resultId)}/risk-events/${encodeURIComponent(id)}/handle`,{version,status,reason});return data;}
export interface RiskHandlingEvent {version:string;previousStatus:string;status:string;reason:string;actor:string;recordedAtUtc:string}
export interface RiskHandlingPage {events:RiskHandlingEvent[];nextBeforeVersion:string|null}
export async function riskHandlingHistory(resultId:string,id:string,beforeVersion?:string){const {data}=await http.get<RiskHandlingPage>(`/iqc/conversation-results/${encodeURIComponent(resultId)}/risk-events/${encodeURIComponent(id)}/history`,{params:{beforeVersion}});return data;}

export interface RiskCenterPage {events:RiskEvent[];nextAfterId:string|null}
export async function riskCenter(afterId?:string,status?:string,riskLevel?:string){const {data}=await http.get<RiskCenterPage>('/iqc/risk-events',{params:{afterId,status,riskLevel}});return data;}
