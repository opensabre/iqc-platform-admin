import http from "@/api/http";

export interface ConversationMessageDraft {
  sequence: number;
  speakerRole: string;
  relativeTime: string;
  content: string;
  rawLine: string;
  lineNumber: number;
}

export interface ConversationParseError {
  lineNumber: number;
  rawLine: string;
  reason: string;
}

export interface ConversationImportResult {
  conversationId: string;
  fileName: string;
  messageCount: number;
  errorCount: number;
  ignoredBlankLines: number;
  messages: ConversationMessageDraft[];
  errors: ConversationParseError[];
}
export interface ConversationMetadata { employeeId?: string; employeeName?: string; employeeGroupId?: string; customerExternalId?: string; customerName?: string; customerContactMasked?: string; channel?: string; startedTime?: string; endedTime?: string; businessType?: string; businessNo?: string; tags?: string[]; }
export interface ConversationSummary extends ConversationMetadata { id: string; batchNo?: string; sourceType?: string; externalId?: string; sourceFileName: string; messageCount: number; errorCount: number; status: string; tagsJson?: string; createdTime?: string; }
export interface ConversationPage { records: ConversationSummary[]; current: number; size: number; total: number; }
export interface ConversationMessage { id: string; sequenceNo: number; speakerRole: string; relativeTime: string; content: string; }
export interface ConversationDetail { conversation: ConversationSummary; messages: ConversationMessage[]; }
export interface ConversationBatchResult { batchNo: string; totalCount: number; successCount: number; failureCount: number; items: ConversationImportResult[]; }
export interface ApiConversationStats { start: string; end: string; conversationCount: number; messageCount: number; batchCount: number; externalIdCount: number; }
export interface RealtimeConversation extends ConversationMetadata { externalId?: string; batchNo?: string; title?: string; messages: Array<{ role: string; time?: string; content: string }> }
export interface RealtimeBatchResult { batchNo: string; totalCount: number; successCount: number; failureCount: number; items: Array<Record<string, unknown>> }

export async function importConversation(file: File, metadata?: ConversationMetadata) {
  const formData = new FormData();
  formData.append("file", file);
  appendMetadata(formData, metadata);
  const { data } = await http.post<ConversationImportResult>("/iqc/conversations/import", formData);
  localStorage.setItem("iqc-last-conversation-id", data.conversationId);
  return data;
}
export async function listConversations(params: { current?: number; size?: number; employeeId?: string; customerExternalId?: string; channel?: string; businessNo?: string; fileName?: string; startedFrom?: string; startedTo?: string } = {}) { const { data } = await http.get<ConversationPage>("/iqc/conversations", { params }); return data; }
function appendMetadata(formData: FormData, metadata?: ConversationMetadata) { if (metadata) formData.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" })); }
export async function batchImportConversations(files: File[], metadata?: ConversationMetadata) {
  const formData = new FormData(); files.forEach((file) => formData.append("files", file)); appendMetadata(formData, metadata);
  const { data } = await http.post<ConversationBatchResult>("/iqc/conversations/batch-import", formData);
  return data;
}
export async function getConversation(id: string) { const { data } = await http.get<ConversationDetail>(`/iqc/conversations/${id}`); return data; }
export async function importConversationZip(file: File, metadata?: ConversationMetadata) { const formData = new FormData(); formData.append("file", file); appendMetadata(formData, metadata); const { data } = await http.post<ConversationBatchResult>("/iqc/conversations/zip-import", formData); return data; }
export async function getApiConversationStats(start: string, end: string) { const { data } = await http.get<ApiConversationStats>("/iqc/conversations/api-stats", { params: { start, end } }); return data; }
export async function ingestConversation(conversation: RealtimeConversation) { const { data } = await http.post("/iqc/conversations/ingest", conversation); return data; }
export async function ingestConversationBatch(batchNo: string | undefined, conversations: RealtimeConversation[]) { const { data } = await http.post<RealtimeBatchResult>("/iqc/conversations/ingest-batch", { batchNo, conversations }); return data; }
