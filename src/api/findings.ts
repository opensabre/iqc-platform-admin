import http from '@/api/http';
export type FindingValueType='BOOLEAN'|'STRING'|'NUMBER'|'ENUM'|'OBJECT';
export type FindingSeverity='NONE'|'LOW'|'MEDIUM'|'HIGH'|'CRITICAL';
export type EvidenceType='CONVERSATION'|'RULE_MATCH'|'METRIC'|'KNOWLEDGE'|'BUSINESS_FIELD'|'EXTERNAL_RESULT';
export interface FindingDefinition {schemaVersion:'iqc-finding-definition-v1';code:string;name:string;category:string;description:string|null;valueType:FindingValueType;allowedValues:string[];defaultSeverity:FindingSeverity;evidenceRequired:boolean;evidenceTypes:EvidenceType[]}
export interface FindingCatalog {id:string;code:string;name:string;category:string;draftConfigJson:string;draftRevision:number;activePublishedVersion:number|null;status:string}
export interface FindingVersion {id:string;catalogId:string;versionNo:number;sourceDraftRevision:number;snapshotJson:string;contentHash:string;createdTime?:string}
export async function listFindings(current=1,size=20) {const {data}=await http.get<{records:FindingCatalog[];total:number}>('/iqc/findings/catalog',{params:{current,size}});return data;}
export async function getFinding(id:string) {const {data}=await http.get<FindingCatalog>(`/iqc/findings/catalog/${encodeURIComponent(id)}`);return data;}
export async function createFinding(definition:FindingDefinition) {const {data}=await http.post<FindingCatalog>('/iqc/findings/catalog',definition);return data;}
export async function updateFinding(id:string,expectedRevision:number,definition:FindingDefinition) {const {data}=await http.put<FindingCatalog>(`/iqc/findings/catalog/${encodeURIComponent(id)}`,{expectedRevision,definition});return data;}
export async function publishFinding(id:string,expectedRevision:number) {const {data}=await http.post<FindingVersion>(`/iqc/findings/catalog/${encodeURIComponent(id)}/publish`,{expectedRevision});return data;}
export async function setFindingAvailability(id:string,enabled:boolean) {const {data}=await http.post<FindingCatalog>(`/iqc/findings/catalog/${encodeURIComponent(id)}/availability`,{enabled});return data;}
export async function listFindingVersions(id:string) {const {data}=await http.get<FindingVersion[]>(`/iqc/findings/catalog/${encodeURIComponent(id)}/versions`);return data;}
