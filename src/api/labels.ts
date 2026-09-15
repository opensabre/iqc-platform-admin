import http from "@/api/http";

export interface LabelCategory { id:string; name:string; code:string; prompt?:string; maxChildCount:number; allowAutoExpand:boolean; status:string; versionNo:number; }
export interface LabelGroup { id:string; categoryId:string; name:string; code:string; description?:string; maxChildCount:number; allowAutoExpand:boolean; status:string; versionNo:number; }
export interface InsightLabel { id:string; groupId:string; name:string; code:string; description?:string; targetRole:string; weight:number; status:string; versionNo:number; sourceType:string; }
export interface LabelTree { categories:LabelCategory[]; groups:LabelGroup[]; labels:InsightLabel[]; }
export interface LabelValueRequest { valueCode:string; valueType:"FIXED"|"BOOLEAN"|"PERCENTAGE"|"DURATION_MONTHS"|"MONTH"|"DATE"; description?:string; configJson?:string; }
export interface LabelRuleBinding { id:string; labelId:string; ruleId:string; ruleVersionNo:number; bindingRole:string; displayOrder:number; }
export interface LabelMember { id?:string; memberType:"CATEGORY"|"GROUP"|"LABEL"; memberId:string; displayOrder?:number; }
export interface LabelCollection { id:string; name:string; code:string; description?:string; status:string; versionNo:number; }
export interface LabelCollectionDetail { collection:LabelCollection; members:LabelMember[]; }
export interface LabelDetail { label:InsightLabel; values:LabelValueRequest[]; bindings:LabelRuleBinding[]; }
export interface LabelSelection { categoryIds?:string[]; groupIds?:string[]; labelIds?:string[]; collectionIds?:string[]; }
export interface LabelCandidate { id:string; taskId:string; conversationId:string; groupId?:string; suggestedName:string; suggestedCode:string; description?:string; evidenceJson?:string; confidence:number; status:string; mergedLabelId?:string; createdLabelId?:string; reviewComment?:string; createdTime?:string; }
export interface LabelSimilarity { labelId:string; name:string; code:string; score:number; }

export const getLabelTree = (keyword?:string) => http.get<LabelTree>("/iqc/labels/tree", { params:{ keyword:keyword || undefined } }).then(r=>r.data);
export const getLabelDetail = (id:string) => http.get<LabelDetail>(`/iqc/labels/${id}`).then(r=>r.data);
export const createLabelCategory = (data:{name:string;code:string;prompt?:string;maxChildCount:number;allowAutoExpand:boolean}) => http.post<LabelCategory>("/iqc/labels/categories",data).then(r=>r.data);
export const createLabelGroup = (data:{categoryId:string;name:string;code:string;description?:string;maxChildCount:number;allowAutoExpand:boolean}) => http.post<LabelGroup>("/iqc/labels/groups",data).then(r=>r.data);
export const createInsightLabel = (data:{groupId:string;name:string;code:string;description?:string;targetRole:string;weight:number}) => http.post<InsightLabel>("/iqc/labels",data).then(r=>r.data);
export const reviseLabelCategory = (id:string,data:{name:string;code:string;prompt?:string;maxChildCount:number;allowAutoExpand:boolean}) => http.put<LabelCategory>(`/iqc/labels/categories/${id}`,data).then(r=>r.data);
export const reviseLabelGroup = (id:string,data:{categoryId:string;name:string;code:string;description?:string;maxChildCount:number;allowAutoExpand:boolean}) => http.put<LabelGroup>(`/iqc/labels/groups/${id}`,data).then(r=>r.data);
export const reviseInsightLabel = (id:string,data:{groupId:string;name:string;code:string;description?:string;targetRole:string;weight:number}) => http.put<InsightLabel>(`/iqc/labels/${id}`,data).then(r=>r.data);
export const disableLabelCategory = (id:string) => http.post<LabelCategory>(`/iqc/labels/categories/${id}/disable`).then(r=>r.data);
export const disableLabelGroup = (id:string) => http.post<LabelGroup>(`/iqc/labels/groups/${id}/disable`).then(r=>r.data);
export const disableInsightLabel = (id:string) => http.post<InsightLabel>(`/iqc/labels/${id}/disable`).then(r=>r.data);
export const replaceLabelValues = (id:string,data:LabelValueRequest[]) => http.put(`/iqc/labels/${id}/values`,data).then(r=>r.data);
export const replaceLabelBindings = (id:string,ruleIds:string[]) => http.put<LabelRuleBinding[]>(`/iqc/labels/${id}/bindings`,ruleIds.map(ruleId=>({ruleId}))).then(r=>r.data);
export const publishLabel = (id:string) => http.post<InsightLabel>(`/iqc/labels/${id}/publish`).then(r=>r.data);
export const listLabelCollections = () => http.get<LabelCollection[]>("/iqc/label-collections").then(r=>r.data);
export const getLabelCollection = (id:string) => http.get<LabelCollectionDetail>(`/iqc/label-collections/${id}`).then(r=>r.data);
export const createLabelCollection = (data:{name:string;code:string;description?:string;members:LabelMember[]}) => http.post<LabelCollectionDetail>("/iqc/label-collections",data).then(r=>r.data);
export const reviseLabelCollection = (id:string,data:{name:string;code:string;description?:string;members:LabelMember[]}) => http.put<LabelCollectionDetail>(`/iqc/label-collections/${id}`,data).then(r=>r.data);
export const disableLabelCollection = (id:string) => http.post<LabelCollection>(`/iqc/label-collections/${id}/disable`).then(r=>r.data);
export const publishLabelCollection = (id:string) => http.post<LabelCollection>(`/iqc/label-collections/${id}/publish`).then(r=>r.data);
export const listLabelCandidates = (status?:string) => http.get<LabelCandidate[]>("/iqc/label-candidates",{params:{status:status||undefined}}).then(r=>r.data);
export const listCandidateSimilarities = (id:string) => http.get<LabelSimilarity[]>(`/iqc/label-candidates/${id}/similarities`).then(r=>r.data);
export const rejectLabelCandidate = (id:string,comment?:string) => http.post<LabelCandidate>(`/iqc/label-candidates/${id}/reject`,{comment}).then(r=>r.data);
export const mergeLabelCandidate = (id:string,labelId:string,comment?:string) => http.post<LabelCandidate>(`/iqc/label-candidates/${id}/merge`,{labelId,comment}).then(r=>r.data);
export const approveLabelCandidate = (id:string,data:{groupId:string;targetRole:string;weight:number;comment?:string}) => http.post<LabelCandidate>(`/iqc/label-candidates/${id}/approve`,data).then(r=>r.data);
