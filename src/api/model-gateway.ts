import http from './http';
import type {PageResult} from './tasks';
export type ModelCallStatus='RESERVED'|'CONFIRMED'|'UNKNOWN';
export interface ModelCall {callId:string;modelKey:string;logicalRecordId:string|null;ruleId:string|null;owner:string|null;status:ModelCallStatus;reservedAtUtc:string;settledAtUtc:string|null;inputTokens:string|null;outputTokens:string|null;totalTokens:string|null;responseModelId:string|null;usageStatus:'COMPLETE'|'PARTIAL'|'MISSING'|'INVALID'|null;errorType:string|null}
export const listModelCalls=(status:ModelCallStatus|undefined,current=1,size=20)=>http.get<PageResult<ModelCall>>('/iqc/model-gateway/calls',{params:{status,current,size}}).then(r=>r.data);
