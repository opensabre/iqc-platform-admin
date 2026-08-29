import { beforeEach, describe, expect, it, vi } from "vitest";
import http from "@/api/http";
import { getUserRoles } from "@/api/roles";

vi.mock("@/api/http", () => ({ default: { get: vi.fn() } }));

describe("roles api", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads the roles assigned to the current user", async () => {
    vi.mocked(http.get).mockResolvedValue({ data: [{ id: "101", name: "质检管理员" }] });

    await expect(getUserRoles("user/1")).resolves.toEqual([{ id: "101", name: "质检管理员" }]);
    expect(http.get).toHaveBeenCalledWith("/org/role/user/user%2F1");
  });
});
