import http from '@/api/http';
import type {QualitySample} from './quality';
import type {PageResult} from './tasks';
export type JsonValue=null|boolean|number|string|JsonValue[]|{[key:string]:JsonValue};
export interface GoldFinding {code:string;valueType:'BOOLEAN'|'STRING'|'NUMBER'|'ENUM'|'OBJECT';state:'KNOWN'|'UNKNOWN'|'CONFLICT'|'ERROR'|'NOT_EVALUATED';value:JsonValue;evidenceMessageIds:string[]}
export interface GoldDecision {score?:number|null;scoreStatus?:'FINAL'|'PENDING'|'NOT_APPLICABLE'|null;labels?:Record<string,JsonValue>;risk?:'NONE'|'LOW'|'MEDIUM'|'HIGH'|'CRITICAL'|'UNKNOWN'|null}
export interface GoldDraft {schemaVersion:string;sourceSampleId:string;conversationId:string;messages:Array<{id:string;role:string;content:string;sequence:number;relativeTime?:string}>;businessContext?:Record<string,JsonValue>;findings:GoldFinding[];annotatorId:string;reviewerId?:string;source:string;tags:string[];difficulty:'BASIC'|'INTERMEDIATE'|'HARD';decision?:GoldDecision}
export interface GoldSample extends QualitySample {goldDraftJson?:string;goldDraftRevision:number;goldStatus?:string;goldReviewVersion?:number}
export interface GoldVersion {id:string;sampleId:string;versionNo:number;sourceDraftRevision:number;decision:'APPROVED'|'REJECTED';reviewerId:string;reason:string;snapshotJson?:string;contentHash:string;createdTime?:string}
export interface GoldAnnotation {expectedRevision:number;findings:GoldFinding[];businessContext?:Record<string,JsonValue>;tags:string[];difficulty:GoldDraft['difficulty'];decision?:GoldDecision}
const gold=(id:string)=>`/iqc/quality-operations/samples/${encodeURIComponent(id)}/gold`;
export const getGoldSample=(id:string)=>http.get<GoldSample>(gold(id)).then(r=>r.data);
export const annotateGold=(id:string,data:GoldAnnotation)=>http.put<GoldSample>(gold(id),data).then(r=>r.data);
export const reviewGold=(id:string,data:{expectedRevision:number;approve:boolean;reason:string})=>http.post<GoldVersion>(`${gold(id)}/reviews`,data).then(r=>r.data);
export const listGoldVersions=(id:string,current=1,size=20)=>http.get<PageResult<GoldVersion>>(`${gold(id)}/versions`,{params:{current,size}}).then(r=>r.data);
export const getGoldVersion=(id:string,no:number)=>http.get<GoldVersion>(`${gold(id)}/versions/${no}`).then(r=>r.data);
export interface DatasetDraft {schemaVersion:'iqc-dataset-draft-v1';type:'BASIC'|'BOUNDARY'|'RISK'|'ADVERSARIAL'|'REGRESSION'|'CUSTOM';description?:string;members:Array<{sampleId:string;versionNo:number}>}
export interface Dataset {id:string;name:string;datasetType:DatasetDraft['type'];draftConfigJson:string;draftRevision:number;activeVersion?:number;status:string}
export interface DatasetVersion {id:string;datasetId:string;versionNo:number;sourceDraftRevision:number;sampleCount:number;snapshotJson?:string;contentHash:string;createdTime?:string}
const datasets='/iqc/evaluation/datasets';
export const listDatasets=(current=1,size=20)=>http.get<PageResult<Dataset>>(datasets,{params:{current,size}}).then(r=>r.data);
export const getDataset=(id:string)=>http.get<Dataset>(`${datasets}/${encodeURIComponent(id)}`).then(r=>r.data);
export const createDataset=(name:string,draft:DatasetDraft)=>http.post<Dataset>(datasets,{name,draft}).then(r=>r.data);
export const updateDataset=(id:string,expectedRevision:number,name:string,draft:DatasetDraft)=>http.put<Dataset>(`${datasets}/${encodeURIComponent(id)}`,{name,draft,expectedRevision}).then(r=>r.data);
export const freezeDataset=(id:string,expectedRevision:number)=>http.post<DatasetVersion>(`${datasets}/${encodeURIComponent(id)}/freeze`,{expectedRevision}).then(r=>r.data);
export const setDatasetAvailability=(id:string,enabled:boolean)=>http.post<Dataset>(`${datasets}/${encodeURIComponent(id)}/availability`,{enabled}).then(r=>r.data);
export const listDatasetVersions=(id:string,current=1,size=20)=>http.get<PageResult<DatasetVersion>>(`${datasets}/${encodeURIComponent(id)}/versions`,{params:{current,size}}).then(r=>r.data);
export const getDatasetVersion=(id:string,no:number)=>http.get<DatasetVersion>(`${datasets}/${encodeURIComponent(id)}/versions/${no}`).then(r=>r.data);
