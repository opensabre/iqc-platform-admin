import http from '@/api/http';
import type {InspectionTask} from './tasks';
export {listPipelines,listPipelineVersions} from './pipeline-policies';
export interface AssetReference {id:string;versionNo:number}
export interface PipelineNode {nodeId:string;type:'RULE'|'DLS'|'LLM';name:string;version:string;dependsOn:string[];inputMapping:Record<string,string>;config:{ruleReference?:AssetReference;findingReference?:AssetReference;agentReference?:AssetReference;inputScope:'MESSAGE'|'CONVERSATION';phase:'DIRECT'|'REVIEW'|'VERIFY';[key:string]:unknown};condition:{pointer:string;operator:'EXISTS'|'EQUALS'|'NOT_EQUALS'|'GREATER_OR_EQUAL'|'LESS_OR_EQUAL';value:unknown}|null;timeoutMs:number;retries:number;onError:'FAIL_PIPELINE'|'CONTINUE'|'MARK_REVIEW'|'FALLBACK';fallbackNodeId:string|null;outputSchema:Record<string,unknown>|null;enabled:boolean}
export interface PipelineRelease {schemaVersion:'iqc-pipeline-release-v1';pipeline:{schemaVersion:'iqc-pipeline-v1';nodes:PipelineNode[]};fusion:{id:string;version:number;method:'PRIORITY'|'CONFIDENCE'|'VOTING'|'OVERRIDE';nodePriority:Record<string,number>;overrideNodeByCode:Record<string,string>;confidenceCalibrationId:string|null;calibratedNodeIds:string[]};scoring:{version:'iqc-score-v2';mode:'DEDUCTION'|'POINTS';baseScore:number;passingScore:number;items:Array<{itemCode:string;points:number;veto:boolean}>};items:Array<{itemCode:string;findingCode:string;hitMeaning:'VIOLATION'|'COMPLIANCE';appliesWhenFindingCode?:string|null}>}
export interface PipelineAsset {id:string;code:string;name:string;draftRevision:number;draftConfigJson:string;activePublishedVersion:number|null;status:string}
export interface PipelineTaskRequest {name:string;conversationIds:string[];requestId:string;expectedRevision?:number;versionNo?:number;concurrency?:number}
const path=(id:string)=>`/iqc/pipelines/${encodeURIComponent(id)}`;
export async function getPipeline(id:string) {const {data}=await http.get<PipelineAsset>(path(id));return data;}
export async function createPipeline(code:string,name:string,release:PipelineRelease) {const {data}=await http.post<PipelineAsset>('/iqc/pipelines',{code,name,release});return data;}
export async function updatePipeline(id:string,expectedRevision:number,name:string,release:PipelineRelease) {const {data}=await http.put<PipelineAsset>(path(id),{expectedRevision,name,release});return data;}
export async function setPipelineAvailability(id:string,enabled:boolean) {const {data}=await http.post<PipelineAsset>(`${path(id)}/availability`,{enabled});return data;}
export async function createPipelineTask(id:string,trial:boolean,body:PipelineTaskRequest) {const {data}=await http.post<InspectionTask>(`${path(id)}/${trial?'trial':'tasks'}`,body);return data;}
export async function publishPipeline(id:string,expectedRevision:number,trialTaskId:string,resultsReviewed:boolean) {const {data}=await http.post(`${path(id)}/publish`,{expectedRevision,trialTaskId,resultsReviewed});return data;}
