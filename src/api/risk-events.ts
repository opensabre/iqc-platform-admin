import http from './http';
export interface RiskEvent {id:string;sourceResultId:string;sourceActionExecutionId:string;category:string;title:string;description:string;riskLevel:string;status:string;version:string}
export async function listRiskEvents(resultId:string){const {data}=await http.get<RiskEvent[]>(`/iqc/conversation-results/${encodeURIComponent(resultId)}/risk-events`);return data;}
