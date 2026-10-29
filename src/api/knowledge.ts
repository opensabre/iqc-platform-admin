import http from './http';
import type {AssetReadPrivacy} from './config';
import type {PageResult} from './tasks';
export interface KnowledgeDocument {documentId:string;title:string;text:string;sourceReference:string}
export interface KnowledgeCorpus {schemaVersion:'iqc-knowledge-corpus-v1';documents:KnowledgeDocument[]}
export interface Knowledge {id:string;code:string;name:string|null;draftRevision:number;activePublishedVersion:number|null;status:'ACTIVE'|'DISABLED';ownerGroupId:string|null;draftConfigJson:string|null;privacy:AssetReadPrivacy}
export interface KnowledgeVersion {id:string;knowledgeBaseId:string;versionNo:number;sourceDraftRevision:number;contentHash:string;snapshotJson:string|null;privacy:AssetReadPrivacy}
export const knowledgeRestricted=(row:Knowledge|KnowledgeVersion)=>!row.privacy||row.privacy.policyVersion!=='iqc-knowledge-read-v1'||!row.privacy.canonicalPayloadVisible||!row.privacy.canReadFull||!row.privacy.canReadPii||!row.privacy.canReadPrompt;
const path=(id:string)=>`/iqc/knowledge-bases/${encodeURIComponent(id)}`;
export const listKnowledge=(current=1,size=20)=>http.get<PageResult<Knowledge>>('/iqc/knowledge-bases',{params:{current,size}}).then(r=>r.data);
export const getKnowledge=(id:string)=>http.get<Knowledge>(path(id)).then(r=>r.data);
export const createKnowledge=(code:string,name:string,corpus:KnowledgeCorpus)=>http.post<Knowledge>('/iqc/knowledge-bases',{code,name,corpusJson:JSON.stringify(corpus)}).then(r=>r.data);
export const updateKnowledge=(id:string,expectedRevision:number,name:string,corpus:KnowledgeCorpus)=>http.put<Knowledge>(path(id),{expectedRevision,name,corpusJson:JSON.stringify(corpus)}).then(r=>r.data);
export const setKnowledgeAvailability=(id:string,enabled:boolean)=>http.post<Knowledge>(`${path(id)}/availability`,{enabled}).then(r=>r.data);
export const listKnowledgeVersions=(id:string)=>http.get<KnowledgeVersion[]>(`${path(id)}/versions`).then(r=>r.data);
export const getKnowledgeVersion=(id:string,version:number)=>http.get<KnowledgeVersion>(`${path(id)}/versions/${version}`).then(r=>r.data);
export const publishKnowledge=(id:string,expectedRevision:number)=>http.post<KnowledgeVersion>(`${path(id)}/publish`,{expectedRevision}).then(r=>r.data);
export const restoreKnowledge=(id:string,version:number,expectedRevision:number)=>http.post<Knowledge>(`${path(id)}/versions/${version}/restore`,{expectedRevision}).then(r=>r.data);
