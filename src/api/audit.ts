import http from "@/api/http";

export interface AuditLogItem {
  id?: string;
  operationType?: string;
  operationTime?: string;
  operatorUsername?: string;
  description?: string;
  module?: string;
  clientIp?: string;
  requestMethod?: string;
  requestUrl?: string;
  targetKey?: string;
  executionTime?: number;
}

interface AuditPage {
  records?: AuditLogItem[];
  current?: number;
  size?: number;
  total?: number;
}

export async function searchAuditLogs(params: { current: number; size: number; module?: string; operatorUsername?: string; operationType?: string }) {
  const { data } = await http.post<AuditPage>("/sysadmin/audit/log/conditions", params);
  return { records: data.records || [], current: data.current || params.current, size: data.size || params.size, total: data.total || 0 };
}
