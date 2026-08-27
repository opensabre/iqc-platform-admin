import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/stores/auth";
import { usePermission } from "@/composables/permission";
import { getCurrentUser } from "@/api/user";
import { getUserPermissions } from "@/api/permissions";

vi.mock("@/api/user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/api/permissions", () => ({ getUserPermissions: vi.fn() }));

describe("IQC authentication and permission gate", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("restores the authenticated user and fails closed until permissions load", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", userId: "u1", username: "tester" });
    vi.mocked(getUserPermissions).mockResolvedValue(["iqc:agent:view"]);
    const store = useAuthStore();
    const { can } = usePermission();

    expect(can("iqc:agent:view")).toBe(false);
    await expect(store.ensureAuthenticated()).resolves.toBe(true);
    expect(store.authenticated).toBe(true);
    expect(can("iqc:agent:view")).toBe(true);
    expect(can("iqc:agent:manage")).toBe(false);
  });

  it("does not authenticate an HTML/login-shaped response", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue("<html>login</html>" as never);
    const store = useAuthStore();

    await expect(store.ensureAuthenticated()).resolves.toBe(false);
    expect(store.authenticated).toBe(false);
    expect(store.permissionsReady).toBe(false);
  });

  it("keeps operation permissions closed when permission service fails", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", username: "tester" });
    vi.mocked(getUserPermissions).mockRejectedValue(new Error("unavailable"));
    const store = useAuthStore();

    await expect(store.ensureAuthenticated()).resolves.toBe(true);
    expect(store.permissionsReady).toBe(true);
    expect(store.permissions).toEqual([]);
  });

  it("clears token and all authorization state", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", username: "tester" });
    vi.mocked(getUserPermissions).mockResolvedValue(["iqc:dashboard:view"]);
    localStorage.setItem("iqc-access-token", "secret");
    const store = useAuthStore();
    await store.ensureAuthenticated();

    store.clear();

    expect(store.authenticated).toBe(false);
    expect(store.permissionsReady).toBe(false);
    expect(localStorage.getItem("iqc-access-token")).toBeNull();
  });
});
