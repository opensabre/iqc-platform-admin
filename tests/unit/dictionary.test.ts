import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCachedDictionaries } from "@/api/dictionaries";
import { useDictionaryStore } from "@/stores/dictionary";

vi.mock("@/api/dictionaries", () => ({ getCachedDictionaries: vi.fn() }));

describe("dictionary store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("loads dictionary options and resolves labels by string-compatible values", async () => {
    vi.mocked(getCachedDictionaries).mockResolvedValue({
      gender: [
        { value: "M", label: "男" },
        { value: "F", label: "女" },
      ],
    });
    const store = useDictionaryStore();

    await store.load(["gender"]);

    expect(store.item("gender", "M")?.label).toBe("男");
    expect(store.item("gender", "UNKNOWN")).toBeUndefined();
  });

  it("does not reload a dictionary already held in page state", async () => {
    vi.mocked(getCachedDictionaries).mockResolvedValue({ gender: [{ value: "M", label: "男" }] });
    const store = useDictionaryStore();

    await store.load(["gender"]);
    await store.load(["gender"]);

    expect(getCachedDictionaries).toHaveBeenCalledTimes(1);
  });
});
