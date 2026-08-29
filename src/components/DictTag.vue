<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { useDictionaryStore } from "@/stores/dictionary";

const props = withDefaults(defineProps<{
  code: string;
  value?: string | number | null;
  fallback?: string;
  tag?: boolean;
}>(), { fallback: "—", tag: false });

const dictionaryStore = useDictionaryStore();
const option = computed(() => dictionaryStore.item(props.code, props.value));
const label = computed(() => option.value?.label || props.fallback);

function ensureDictionary(code: string) {
  void dictionaryStore.load([code]).catch(() => undefined);
}

onMounted(() => ensureDictionary(props.code));
watch(() => props.code, ensureDictionary);
</script>

<template>
  <a-tag v-if="tag">{{ label }}</a-tag>
  <span v-else>{{ label }}</span>
</template>
