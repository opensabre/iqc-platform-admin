import http from "@/api/http";

export interface IqcSettings {
  application: string;
  model: {
    enabled: boolean;
    endpointConfigured: boolean;
    model: string;
    connectTimeoutMillis: number;
    readTimeoutMillis: number;
    maxAttempts: number;
    rateLimitMaxCount: number;
    rateLimitPeriod: number;
  };
  governance: Record<string, string>;
  timestamp: string;
}

export async function getSettings() {
  const { data } = await http.get<IqcSettings>("/iqc/settings");
  return data;
}
