import http from './http';
export interface PipelineReadPrivacy {policyVersion:string;canonicalPayloadVisible:boolean;canReadFull:boolean;canReadPii:boolean;canReadPrompt:boolean;withheldFields:string[]}
export function pipelinePayloadRestricted(value:{privacy?:PipelineReadPrivacy}){const p=value.privacy;return !!p&&(p.policyVersion!=='iqc-pipeline-read-v1'||!p.canonicalPayloadVisible||!p.canReadFull||!p.canReadPii||!p.canReadPrompt);}
export interface PublishedPipeline {id:string;code:string;name:string;status:string;activePublishedVersion:number|null}
export interface PipelineVersion {id:string;pipelineId:string;versionNo:number;contentHash:string;snapshotJson:string|null;privacy?:PipelineReadPrivacy;sourceDraftRevision:number;createdTime?:string;publicationDecisionJson?:string|null;publicationDecisionHash?:string|null}
export interface DecisionRevision {id:string;sourceResultId:string;taskId:string;sourceHash:string;targetPolicyJson:string;projectionJson:string;reason:string;createdBy:string;createdTime?:string}
export interface RecalculatePolicy {targetPipelineId:string;targetVersion:number;requestId:string;reason:string}
export async function listPipelines(current=1,size=20) {const {data}=await http.get<{records:PublishedPipeline[];total:number}>('/iqc/pipelines',{params:{current,size}});return data;}
export async function listPipelineVersions(id:string) {const {data}=await http.get<PipelineVersion[]>(`/iqc/pipelines/${encodeURIComponent(id)}/versions`);return data;}
export async function listDecisionRevisions(id:string) {const {data}=await http.get<DecisionRevision[]>(`/iqc/conversation-results/${encodeURIComponent(id)}/decision-revisions`);return data;}
export async function recalculatePolicy(id:string,body:RecalculatePolicy) {const {data}=await http.post<DecisionRevision>(`/iqc/conversation-results/${encodeURIComponent(id)}/decision-revisions`,body);return data;}
