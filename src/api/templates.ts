import http from "@/api/http";

export interface TemplateRule {
  code: string;
  name: string;
  description: string;
  riskLevel: string;
  ruleType: string;
  targetRole: string;
  expression: string;
  deduction: number;
  veto: boolean;
}

export interface TemplateMaterializationResult {
  templateId: string;
  total: number;
  created: number;
  existing: number;
}

export interface QualityTemplate {
  id: string;
  name: string;
  type: string;
  description: string;
  rules: TemplateRule[];
}

export async function listTemplates() {
  const { data } = await http.get<QualityTemplate[]>("/iqc/templates");
  return data;
}

export async function materializeTemplateRules(id: string) {
  const { data } = await http.post<TemplateMaterializationResult>(`/iqc/templates/${id}/rules`);
  return data;
}
