<!-- Adapted from opensabre-admin/src/components/ECharts/index.vue.
Copyright © 2021-present youlai / OpenSabre contributors. MIT license.
Original project: https://github.com/opensabre/opensabre-admin
Uses the same ECharts core/line/grid/legend/tooltip integration; native ResizeObserver replaces VueUse. -->
<script setup lang="ts">
import {ref,watch,onMounted,onBeforeUnmount,nextTick} from 'vue';
import * as echarts from 'echarts/core';
import {LineChart} from 'echarts/charts';
import {GridComponent,TooltipComponent,LegendComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';
echarts.use([CanvasRenderer,LineChart,GridComponent,TooltipComponent,LegendComponent]);
const props=defineProps<{options:echarts.EChartsCoreOption}>();
const chartRef=ref<HTMLDivElement>();let chart:echarts.ECharts|undefined;let observer:ResizeObserver|undefined;let disposed=false;
onMounted(async()=>{await nextTick();if(disposed||!chartRef.value)return;chart=echarts.init(chartRef.value);chart.setOption(props.options,true);
  observer=new ResizeObserver(()=>chart?.resize());observer.observe(chartRef.value);});
watch(()=>props.options,value=>chart?.setOption(value,true),{deep:true});
onBeforeUnmount(()=>{disposed=true;observer?.disconnect();chart?.dispose();chart=undefined;});
</script>
<template><div ref="chartRef" class="chart" role="img" aria-label="模型运行指标趋势图"/></template>
<style scoped>.chart{width:100%;height:300px}</style>
