import http from './http';
export interface RiskEvent {id:string;sourceResultId:string;sourceActionExecutionId:string;category:string;title:string;description:string;riskLevel:string;status:string;version:string}
export async function listRiskEvents(resultId:string){const {data}=await http.get<RiskEvent[]>(`/iqc/conversation-results/${encodeURIComponent(resultId)}/risk-events`);return data;}
export async function handleRiskEvent(resultId:string,id:string,version:string,status:string,reason:string){const {data}=await http.post<{id:string;state:'HANDLED'|'STALE_OBSERVATION'}>(`/iqc/conversation-results/${encodeURIComponent(resultId)}/risk-events/${encodeURIComponent(id)}/handle`,{version,status,reason});return data;}
