import http from "@/api/http";
export interface InspectionResult { id: string; taskId: string; conversationId:string; sourceFileName?: string; messageId: string; ruleId?: string; speakerRole: string; resultStatus: string; score: number; riskLevel?: string; deduction?: number; reason: string; evidence?: string; findingJson?: string; evidenceJson?: string; suggestionJson?: string; ruleBreakdownJson?: string; createdTime?: string; }
export interface ConversationResultSummary { conversationId:string; sourceFileName?:string; messageCount:number; resultCount:number; averageScore:number; hitCount:number; highRiskCount:number; errorCount:number; }
export interface BatchResultSummary { taskId:string; status:string; conversationCount:number; totalMessages:number; processedMessages:number; failedMessages:number; averageScore:number; hitCount:number; highRiskCount:number; conversations:ConversationResultSummary[]; }
export interface ConversationResultDetail { conversation:{id:string;sourceFileName:string}; summary:ConversationResultSummary; messages:Array<{id:string;sequenceNo:number;speakerRole:string;relativeTime:string;content:string}>; results:InspectionResult[]; }
export interface ResultFilters { taskId?: string; agentId?: string; ownerId?: string; groupId?: string; status?: string; minScore?: number; maxScore?: number; speakerRole?: string; riskLevel?: string; }
export interface ResultPage { records: InspectionResult[]; current: number; size: number; total: number; }
export async function listResults(filters: ResultFilters = {}, page: { current?: number; size?: number } = {}) { const { data } = await http.get<ResultPage>("/iqc/results", { params: { ...filters, ...page } }); return data; }
export async function getResultDetail(id: string) { const { data } = await http.get(`/iqc/results/${id}`); return data; }
export async function exportResults(filters: ResultFilters = {}) { return http.get<Blob>("/iqc/results/export", { params: filters, responseType: "blob" }); }
export async function getBatchResultSummary(taskId:string){const {data}=await http.get<BatchResultSummary>(`/iqc/tasks/${taskId}/result-summary`);return data;}
export async function getConversationResultDetail(taskId:string,conversationId:string){const {data}=await http.get<ConversationResultDetail>(`/iqc/tasks/${taskId}/conversations/${conversationId}/result-detail`);return data;}
