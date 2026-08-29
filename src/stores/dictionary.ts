import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { getCachedDictionaries, type DictionaryItem } from "@/api/dictionaries";

/**
 * 保存页面已加载的字典选项，供选择和展示组件统一复用。
 */
export const useDictionaryStore = defineStore("iqc-dictionary", () => {
  const dictionaries = ref<Record<string, DictionaryItem[]>>({});
  const loadingCodes = ref<string[]>([]);

  /** 按需加载尚未进入状态的字典；同一批次由 API 缓存负责请求合并。 */
  async function load(codes: string[]) {
    const missing = [...new Set(codes)].filter((code) => !dictionaries.value[code] && !loadingCodes.value.includes(code));
    if (!missing.length) return;
    loadingCodes.value = [...loadingCodes.value, ...missing];
    try {
      const result = await getCachedDictionaries(missing);
      for (const code of missing) dictionaries.value[code] = result[code] || [];
    } finally {
      loadingCodes.value = loadingCodes.value.filter((code) => !missing.includes(code));
    }
  }

  function items(code: string) {
    return dictionaries.value[code] || [];
  }

  function item(code: string, value?: string | number | null) {
    if (value === undefined || value === null || value === "") return undefined;
    return items(code).find((option) => String(option.value) === String(value));
  }

  const loading = computed(() => loadingCodes.value.length > 0);
  return { dictionaries, loadingCodes, loading, load, items, item };
});
