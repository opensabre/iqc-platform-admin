import http from "@/api/http";

export interface QualityAgent { id: string; name: string; code: string; description?: string; configJson?: string; versionNo?: number; status: string; }
export interface AgentModelConfig { id: string; provider: string; model: string; endpoint: string; temperature: number; enabled: boolean; }
export interface AgentMcpConfig { name: string; transport: string; endpoint: string; enabled: boolean; }
export interface AgentSkillConfig { name: string; description: string; instructions: string; enabled: boolean; }
export interface AgentRuntimeConfig { schemaVersion: "1.0"|"2.0"; mode: "RULE_ONLY"|"RULE_THEN_LLM"|"AGENT_LLM"; systemPrompt: string; primaryModel?: string; models?: AgentModelConfig[]; mcpServers?: AgentMcpConfig[]; skills?: AgentSkillConfig[]; primaryModelProfileId?: string; fallbackModelProfileIds?: string[]; mcpServerIds?: string[]; skillIds?: string[]; ruleSetId?: string; }
export interface QualityAgentVersion { id: string; agentId: string; versionNo: number; name: string; code: string; description?: string; configJson?: string; status: string; createdTime?: string; }
export interface AgentVersionComparison { fromVersion: number; toVersion: number; changedFields: string[]; changedConfigPaths: string[]; }
export interface AgentEffectReport { agentId: string; versionNo: number; taskCount: number; resultCount: number; averageScore: number; hitRate: number; highRiskRate: number; errorRate: number; }
export interface IqcSkill { id: string; name: string; code: string; description?: string; instructions: string; inputSchemaJson?: string; outputSchemaJson?: string; status: "ENABLED" | "DISABLED"; versionNo: number; updatedTime?: string; }
export interface IqcSkillRequest { name: string; code: string; description?: string; instructions: string; inputSchemaJson?: string; outputSchemaJson?: string; }
export interface IqcMcpServer { id: string; name: string; code: string; description?: string; transport: string; endpoint: string; authType: string; secretRef?: string; timeoutSeconds: number; allowedToolsJson?: string; status: "ENABLED" | "DISABLED"; healthStatus: string; versionNo: number; }
export type IqcMcpServerRequest = Omit<IqcMcpServer, "id" | "status" | "healthStatus" | "versionNo">;
export interface IqcModelProfile { id:string; name:string; code:string; description?:string; provider:string; modelName:string; endpoint?:string; secretRef?:string; secretConfigured?:boolean; temperature:number; timeoutSeconds:number; maxRetries:number; status:"ENABLED"|"DISABLED"; versionNo:number; }
export type IqcModelProfileRequest = Omit<IqcModelProfile, "id"|"status"|"versionNo">;
export interface ModelConnectionTestResult { success:boolean; message:string; latencyMillis:number; provider:string; modelName:string; }
export interface QualityRule { id: string; name: string; code: string; category?: string; ruleType: string; targetRole?: string; expression?: string; description?: string; deduction?: number; riskLevel?: string; veto?: boolean; versionNo?: number; status: string; }
export interface QualityRuleVersion { id: string; ruleId: string; versionNo: number; name: string; code: string; category?: string; ruleType: string; targetRole?: string; expression?: string; description?: string; deduction?: number; riskLevel?: string; veto?: boolean; status: string; createdTime?: string; }
export interface QualityRuleSet { id:string; name:string; code:string; description?:string; ruleIdsJson:string; aggregationMode:"ALL"|"ANY"; versionNo:number; status:string; }
export interface QualityRuleSetRequest { name:string; code:string; description?:string; ruleIds:string[]; aggregationMode:"ALL"|"ANY"; }
export const listAgents = () => http.get<QualityAgent[]>("/iqc/config/agents").then((response) => response.data);
export const createAgent = (data: Partial<QualityAgent>) => http.post<QualityAgent>("/iqc/config/agents", data).then((response) => response.data);
export const submitAgent = (id: string) => http.post<QualityAgent>(`/iqc/config/agents/${id}/submit`).then((response) => response.data);
export const approveAgent = (id: string) => http.post<QualityAgent>(`/iqc/config/agents/${id}/approve`).then((response) => response.data);
export const rejectAgent = (id: string) => http.post<QualityAgent>(`/iqc/config/agents/${id}/reject`).then((response) => response.data);
export const disableAgent = (id: string) => http.post<QualityAgent>(`/iqc/config/agents/${id}/disable`).then((response) => response.data);
export const listAgentVersions = (id: string) => http.get<QualityAgentVersion[]>(`/iqc/config/agents/${id}/versions`).then((response) => response.data);
export const createAgentVersion = (id: string, data: Partial<QualityAgent>) => http.post<QualityAgentVersion>(`/iqc/config/agents/${id}/versions`, data).then((response) => response.data);
export const rollbackAgentVersion = (id: string, versionNo: number) => http.post<QualityAgentVersion>(`/iqc/config/agents/${id}/versions/${versionNo}/rollback`).then((response) => response.data);
export const compareAgentVersions = (id: string, fromVersion: number, toVersion: number) => http.get<AgentVersionComparison>(`/iqc/config/agents/${id}/versions/compare`, { params: { fromVersion, toVersion } }).then((response) => response.data);
export const getAgentVersionEffect = (id: string, versionNo: number) => http.get<AgentEffectReport>(`/iqc/config/agents/${id}/versions/${versionNo}/effect`).then((response) => response.data);
export const listSkills = () => http.get<IqcSkill[]>("/iqc/agent-assets/skills").then((response) => response.data);
export const createSkill = (data: IqcSkillRequest) => http.post<IqcSkill>("/iqc/agent-assets/skills", data).then((response) => response.data);
export const updateSkill = (id: string, data: IqcSkillRequest) => http.put<IqcSkill>(`/iqc/agent-assets/skills/${id}`, data).then((response) => response.data);
export const enableSkill = (id: string) => http.post<IqcSkill>(`/iqc/agent-assets/skills/${id}/enable`).then((response) => response.data);
export const disableSkill = (id: string) => http.post<IqcSkill>(`/iqc/agent-assets/skills/${id}/disable`).then((response) => response.data);
export const listMcpServers = () => http.get<IqcMcpServer[]>("/iqc/agent-assets/mcps").then((response) => response.data);
export const createMcpServer = (data: IqcMcpServerRequest) => http.post<IqcMcpServer>("/iqc/agent-assets/mcps", data).then((response) => response.data);
export const updateMcpServer = (id: string, data: IqcMcpServerRequest) => http.put<IqcMcpServer>(`/iqc/agent-assets/mcps/${id}`, data).then((response) => response.data);
export const enableMcpServer = (id: string) => http.post<IqcMcpServer>(`/iqc/agent-assets/mcps/${id}/enable`).then((response) => response.data);
export const disableMcpServer = (id: string) => http.post<IqcMcpServer>(`/iqc/agent-assets/mcps/${id}/disable`).then((response) => response.data);
export const listModelProfiles = () => http.get<IqcModelProfile[]>("/iqc/agent-assets/models").then((response) => response.data);
export const createModelProfile = (data:IqcModelProfileRequest) => http.post<IqcModelProfile>("/iqc/agent-assets/models", data).then((response) => response.data);
export const updateModelProfile = (id:string,data:IqcModelProfileRequest) => http.put<IqcModelProfile>(`/iqc/agent-assets/models/${id}`,data).then((response) => response.data);
export const enableModelProfile = (id:string) => http.post<IqcModelProfile>(`/iqc/agent-assets/models/${id}/enable`).then((response) => response.data);
export const disableModelProfile = (id:string) => http.post<IqcModelProfile>(`/iqc/agent-assets/models/${id}/disable`).then((response) => response.data);
export const testModelProfile = (id:string) => http.post<ModelConnectionTestResult>(`/iqc/agent-assets/models/${id}/test`).then((response) => response.data);
export const listRules = () => http.get<QualityRule[]>("/iqc/config/rules").then((response) => response.data);
export const createRule = (data: Partial<QualityRule>) => http.post<QualityRule>("/iqc/config/rules", data).then((response) => response.data);
export const submitRule = (id: string) => http.post<QualityRule>(`/iqc/config/rules/${id}/submit`).then((response) => response.data);
export const approveRule = (id: string) => http.post<QualityRule>(`/iqc/config/rules/${id}/approve`).then((response) => response.data);
export const rejectRule = (id: string) => http.post<QualityRule>(`/iqc/config/rules/${id}/reject`).then((response) => response.data);
export const listRuleVersions = (id: string) => http.get<QualityRuleVersion[]>(`/iqc/config/rules/${id}/versions`).then((response) => response.data);
export const createRuleVersion = (id: string, data: Partial<QualityRule>) => http.post<QualityRuleVersion>(`/iqc/config/rules/${id}/versions`, data).then((response) => response.data);
export interface RuleTestResult { matched: boolean; resultStatus: string; matchedText?: string; reason: string; }
export const testRule = (id: string, content: string) => http.post<RuleTestResult>(`/iqc/config/rules/${id}/test`, { content }).then((response) => response.data);
export const listRuleSets = () => http.get<QualityRuleSet[]>("/iqc/config/rule-sets").then((response) => response.data);
export const createRuleSet = (data:QualityRuleSetRequest) => http.post<QualityRuleSet>("/iqc/config/rule-sets",data).then(response=>response.data);
export const submitRuleSet = (id:string) => http.post<QualityRuleSet>(`/iqc/config/rule-sets/${id}/submit`).then(response=>response.data);
export const approveRuleSet = (id:string) => http.post<QualityRuleSet>(`/iqc/config/rule-sets/${id}/approve`).then(response=>response.data);
export const rejectRuleSet = (id:string) => http.post<QualityRuleSet>(`/iqc/config/rule-sets/${id}/reject`).then(response=>response.data);
