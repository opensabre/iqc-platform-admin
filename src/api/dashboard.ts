import http from "@/api/http";
export interface DashboardTrendPoint { date: string; resultCount: number; hitCount: number; highRiskCount: number; unqualifiedCount: number; averageScore: number; }
export interface DashboardRanking { id: string; resultCount: number; hitCount: number; highRiskCount: number; }
export interface DashboardStats { conversationCount: number; taskCount: number; runningTaskCount: number; resultCount: number; hitCount: number; highRiskCount: number; unqualifiedCount: number; unqualifiedRate: number; averageScore: number; trend: DashboardTrendPoint[]; topAgents: DashboardRanking[]; topOwners: DashboardRanking[]; }
export interface DashboardFilters { from?: string; to?: string; }
export async function getDashboardStats(filters: DashboardFilters = {}) { const { data } = await http.get<DashboardStats>("/iqc/dashboard", { params: filters }); return data; }
