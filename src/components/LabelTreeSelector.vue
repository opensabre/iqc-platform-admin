<script setup lang="ts">
import { computed } from "vue";
import type { LabelTree } from "@/api/labels";
const props = withDefaults(
  defineProps<{
    taxonomy: LabelTree;
    modelValue: string[];
    publishedOnly?: boolean;
  }>(),
  { publishedOnly: true }
);
const emit = defineEmits<{ "update:modelValue": [value: string[]] }>();
const treeData = computed(() =>
  props.taxonomy.categories.map((category) => ({
    key: `CATEGORY:${category.id}`,
    title: category.name,
    children: props.taxonomy.groups
      .filter((group) => group.categoryId === category.id)
      .map((group) => ({
        key: `GROUP:${group.id}`,
        title: group.name,
        children: props.taxonomy.labels
          .filter(
            (label) =>
              label.groupId === group.id &&
              (!props.publishedOnly || label.status === "PUBLISHED")
          )
          .map((label) => ({ key: `LABEL:${label.id}`, title: label.name })),
      })),
  }))
);
</script>
<template>
  <a-tree
    :checked-keys="modelValue"
    checkable
    check-strictly
    default-expand-all
    :tree-data="treeData"
    @update:checkedKeys="
      emit('update:modelValue', Array.isArray($event) ? $event : $event.checked)
    "
  />
</template>
