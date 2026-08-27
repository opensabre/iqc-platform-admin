import http from "./http";

export interface DictionaryItem {
  value: string;
  label: string;
  sort?: number;
  tagType?: string;
  status?: number;
}

const dictionaryCache = new Map<string, Promise<Record<string, DictionaryItem[]>>>();

export function getDictionaries(codes: string[]) {
  return http.get<Record<string, DictionaryItem[]>>("/iqc/dictionaries", { params: { codes: codes.join(",") } }).then((response) => response.data);
}

export function getCachedDictionaries(codes: string[]) {
  const key = [...codes].sort().join(",");
  const cached = dictionaryCache.get(key);
  if (cached) return cached;
  const request = getDictionaries(codes).catch((error) => {
    dictionaryCache.delete(key);
    throw error;
  });
  dictionaryCache.set(key, request);
  return request;
}

export function dictionaryLabel(items: DictionaryItem[], value?: string) {
  return items.find((item) => item.value === value)?.label || value || "—";
}
