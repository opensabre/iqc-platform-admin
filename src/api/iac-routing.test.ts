import { beforeEach, describe, expect, it, vi } from "vitest";
import http from "./http";
import { listAgents, listAgentVersions, listModelProfiles, listMcpServers, listSkills, getAgentVersionEffect, listRules } from "./config";
import { queryAgentSessions, listAgentSessions, getAgentSession } from "./agent-sessions";
vi.mock("./http", () => ({ default: { get: vi.fn().mockResolvedValue({ data: [] }) } }));

describe("existing frontend routes to each backend owner", () => {
  beforeEach(() => vi.clearAllMocks());
  it("queries IAC capabilities through the existing frontend", async () => {
    await listAgents(); await listAgentVersions("a"); await listModelProfiles(); await listMcpServers(); await listSkills();
    expect(vi.mocked(http.get).mock.calls.map(call => call[0])).toEqual([
      "/iac/config/agents", "/iac/config/agents/a/versions", "/iac/agent-assets/models", "/iac/agent-assets/mcps", "/iac/agent-assets/skills",
    ]);
  });
  it("queries global and agent-specific histories through IAC", async () => {
    const filters = { current: 1, size: 20, owner: "alice" };
    await queryAgentSessions(filters); await listAgentSessions("a", filters); await getAgentSession("a", "s");
    expect(http.get).toHaveBeenNthCalledWith(1, "/iac/config/agent-sessions", { params: filters });
    expect(http.get).toHaveBeenNthCalledWith(2, "/iac/config/agents/a/sessions", { params: filters });
    expect(http.get).toHaveBeenNthCalledWith(3, "/iac/config/agents/a/sessions/s");
  });
  it("retains inspection rules and business effect statistics in IQC", async () => {
    await listRules(); await getAgentVersionEffect("a", 2);
    expect(http.get).toHaveBeenNthCalledWith(1, "/iqc/config/rules");
    expect(http.get).toHaveBeenNthCalledWith(2, "/iqc/config/agents/a/versions/2/effect");
  });
});
