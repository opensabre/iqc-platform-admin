import http from './http';
export interface ActionHistory {id:string;actionId:string;type:string;status:string;attemptCount:number|null;nextAttemptAtUtc:string|null;claimedAtUtc:string|null;settledAtUtc:string|null;outcome:string|null;evidenceReference:string|null;resultReference:string|null;errorCode:string|null}
export async function listActionHistory(id:string){const {data}=await http.get<ActionHistory[]>(`/iqc/conversation-results/${encodeURIComponent(id)}/actions`);return data;}

export interface ActionDiscoveryResponse {sourceResultId:string;status:"DISCOVERY_REQUESTED"|"ALREADY_DISCOVERED"}
export async function requestActionDiscovery(id:string){const {data}=await http.post<ActionDiscoveryResponse>(`/iqc/conversation-results/${encodeURIComponent(id)}/actions/enqueue`);return data;}
