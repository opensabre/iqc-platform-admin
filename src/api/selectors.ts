import http from '@/api/http';
export type SelectorCondition = {junction:'AND'|'OR';children:SelectorCondition[]} | {field:string;operator:'EQ'|'NE'|'GT'|'GE'|'LT'|'LE'|'IN'|'NOT_IN'|'EXISTS'|'CONTAINS';value?:unknown};
export interface SelectorDefinition {schemaVersion:'iqc-selector-v1';condition?:SelectorCondition;excludeCondition?:SelectorCondition;includeIds:string[];excludeIds:string[];maximumCount:number;timeWindow?:{field:'CREATED'|'STARTED';mode:'ABSOLUTE'|'LAST_HOURS'|'PREVIOUS_DAY'|'PREVIOUS_WEEK';from?:string;to?:string;hours?:number;zoneId:string};sampling:{mode:'ALL'|'FIXED_COUNT'|'RATIO'|'RANDOM'|'EMPLOYEE_UNIFORM'|'TEAM_STRATIFIED'|'RISK_PRIORITY';count?:number;ratio?:number;seed:string}}
export interface SelectorPreview {schemaVersion:string;anchor:string;resolvedWindow:{field:string;from:string;to:string;zoneId:string;storageZoneId:string}|null;candidateCount:number;matchedCount:number;sampledCount:number;selectedCount:number;limited:boolean;matchedDistribution:{employees:Record<string,number>;teams:Record<string,number>;departments:Record<string,number>};selectedDistribution:{employees:Record<string,number>;teams:Record<string,number>;departments:Record<string,number>};preview:Array<{conversationId:string;fileName:string;employeeId:string;employeeGroupId:string;employeeDepartmentId:string;channel:string;startedTime:string;riskLevel:string}>;definitionHash:string}
export async function previewSelector(definition:SelectorDefinition,previewSize=10){const {data}=await http.post<SelectorPreview>('/iqc/selectors/preview',{definition,previewSize});return data;}

export interface SelectorAssetReference {selectorId:string;versionNo:number}
export interface SelectorAsset {id:string;code:string;name:string;draftConfigJson:string;draftRevision:number;activePublishedVersion:number|null;status:string;ownerGroupId?:string|null;createdTime?:string}
export interface SelectorAssetVersion {id:string;selectorId:string;versionNo:number;sourceDraftRevision:number;snapshotJson:string;contentHash:string;createdTime?:string}
export interface PublishedSelector extends SelectorAssetReference {sourceDraftRevision:number;definition:SelectorDefinition;contentHash:string;ownerGroupId:string|null}
const assetPath=(id:string)=>`/iqc/selectors/assets/${encodeURIComponent(id)}`;
export const listSelectorAssets=(current=1,size=20)=>http.get<{records:SelectorAsset[];total:number}>('/iqc/selectors/assets',{params:{current,size}}).then(r=>r.data);
export const getSelectorAsset=(id:string)=>http.get<SelectorAsset>(assetPath(id)).then(r=>r.data);
export const createSelectorAsset=(code:string,name:string,definition?:SelectorDefinition,definitionJson?:string)=>http.post<SelectorAsset>('/iqc/selectors/assets',{code,name,definition,definitionJson}).then(r=>r.data);
export const updateSelectorAsset=(id:string,expectedRevision:number,name:string,definition?:SelectorDefinition,definitionJson?:string)=>http.put<SelectorAsset>(assetPath(id),{expectedRevision,name,definition,definitionJson}).then(r=>r.data);
export const setSelectorAssetAvailability=(id:string,enabled:boolean)=>http.post<SelectorAsset>(`${assetPath(id)}/availability`,{enabled}).then(r=>r.data);
export const listSelectorAssetVersions=(id:string)=>http.get<SelectorAssetVersion[]>(`${assetPath(id)}/versions`).then(r=>r.data);
export const publishSelectorAsset=(id:string,expectedRevision:number)=>http.post<SelectorAssetVersion>(`${assetPath(id)}/publish`,{expectedRevision}).then(r=>r.data);
export const getPublishedSelector=(id:string,versionNo:number)=>http.get<PublishedSelector>(`${assetPath(id)}/versions/${versionNo}`).then(r=>r.data);
export const previewPublishedSelector=(id:string,versionNo:number,previewSize=10)=>http.post<SelectorPreview>(`${assetPath(id)}/versions/${versionNo}/preview`,{previewSize}).then(r=>r.data);

export const previewSelectorJson=(definitionJson:string,previewSize=10)=>http.post<SelectorPreview>('/iqc/selectors/preview',{definitionJson,previewSize}).then(r=>r.data);
/** Asset-local import check: compare decimal tokens, excluding quoted strings, without expanding exponents. */
export function selectorJsonNeedsExactEditor(raw:string):boolean {
  const decimal=(value:string)=>{const match=/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(value);if(!match)return value;let digits=(match[2]+(match[3]??'')).replace(/^0+/,'');if(!digits)return '0';let exponent=BigInt(match[4]??'0')-BigInt((match[3]??'').length);const zeros=/0+$/.exec(digits)?.[0].length??0;digits=digits.slice(0,digits.length-zeros);exponent+=BigInt(zeros);return `${match[1]}${digits}e${exponent}`;};
  let unsafe=false;raw.replace(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,token=>{if(token.startsWith('"'))return token;const number=Number(token);if(!Number.isFinite(number)||decimal(token)!==decimal(String(number)))unsafe=true;return token;});return unsafe;
}
