<script setup lang="ts">
import { ref } from "vue";
import { message, Modal } from "ant-design-vue";
import { decideReview, getQualityReport, listFeedbacks, listReviews, listSamples, type QualityReport, type QualitySample, type ResultFeedback, type ResultReview } from "@/api/quality";
import { usePermission } from "@/composables/permission";
import BusinessReviewQueue from "@/components/BusinessReviewQueue.vue";
import LabelReviewQueue from "@/components/LabelReviewQueue.vue";
import BusinessQualityReport from "@/components/BusinessQualityReport.vue";
import GoldSampleEditor from "@/components/GoldSampleEditor.vue";
const goldSampleId=ref<string>(), goldOpen=ref(false), goldEditor=ref<{hasUnsavedChanges:()=>boolean;isBusy?:()=>boolean}>();
function closeGold(){
  if(goldEditor.value?.isBusy?.())return;
  if(goldEditor.value?.hasUnsavedChanges()){
    Modal.confirm({title:"放弃尚未保存的金标编辑？",onOk:()=>{goldOpen.value=false;goldSampleId.value=undefined;}});
  }else{goldOpen.value=false;goldSampleId.value=undefined;}
}
function openGold(sample:QualitySample){goldSampleId.value=sample.id;goldOpen.value=true;}
const businessReport = ref<InstanceType<typeof BusinessQualityReport>>();
const queue = ref<InstanceType<typeof BusinessReviewQueue>>();
const labelQueue = ref<InstanceType<typeof LabelReviewQueue>>();
const active=ref("business"), loading=ref(false), reviews=ref<ResultReview[]>([]), feedbacks=ref<ResultFeedback[]>([]), samples=ref<QualitySample[]>([]);
const report=ref<QualityReport>();
const decisionOpen=ref(false), selected=ref<ResultReview>(), form=ref({decision:"APPROVED",finalStatus:"HIT",finalScore:100,finalRiskLevel:"LOW",comment:""});
const {can}=usePermission();
async function refresh(){if(active.value==='business-report'){await businessReport.value?.refresh();return;}if(active.value==='business'){await queue.value?.refresh();return;}if(active.value==='labels'){await labelQueue.value?.refresh();return;}loading.value=true;try{[reviews.value,feedbacks.value,samples.value,report.value]=await Promise.all([listReviews(),listFeedbacks(),listSamples(),getQualityReport()]);}catch{message.error("质量运营数据加载失败");}finally{loading.value=false;}}
function openDecision(row:ResultReview){selected.value=row;form.value={decision:"APPROVED",finalStatus:row.originalStatus,finalScore:row.originalScore??100,finalRiskLevel:row.originalRiskLevel||"LOW",comment:""};decisionOpen.value=true;}
async function saveDecision(){if(!selected.value)return;try{await decideReview(selected.value.id,form.value);message.success("复核结论已保存");decisionOpen.value=false;await refresh();}catch{message.error("复核处理失败");}}
</script>
<template>
  <a-alert v-if="['reviews','feedback'].includes(active)" type="info" show-icon message="此页签及下方统计仅包含旧消息结果；业务质检项和标签值请切换对应待办。" style="margin-bottom:16px" />
  <a-alert v-if="active==='samples'" type="info" show-icon message="样本启用或进入候选池不代表金标审核通过。标注后需由另一位审核人确认，评测数据集只冻结精确批准版本。" style="margin-bottom:16px" />
  <section class="page-intro"><div><span class="section-kicker">QUALITY OPERATIONS</span><h2>质量运营</h2><p>集中处理人工复核、误判漏判反馈和标准样本沉淀。</p></div><a-button @click="refresh">刷新</a-button></section>
  <a-row v-if="report && ['reviews','feedback','samples'].includes(active)" :gutter="16" style="margin-bottom: 16px"><a-col :xs="12" :md="6"><a-card><a-statistic title="待复核" :value="report.pendingReviewCount" /></a-card></a-col><a-col :xs="12" :md="6"><a-card><a-statistic title="复核修正率" :value="report.reviewCorrectionRate" suffix="%" /></a-card></a-col><a-col :xs="12" :md="6"><a-card><a-statistic title="确认误判 / 漏判" :value="`${report.falsePositiveCount} / ${report.falseNegativeCount}`" /></a-card></a-col><a-col :xs="12" :md="6"><a-card><a-statistic title="标准样本" :value="report.sampleCount" /></a-card></a-col></a-row>
  <a-card :bordered="false"><a-tabs v-model:active-key="active" @change="refresh">
    <a-tab-pane key="business" tab="业务复核待办"><BusinessReviewQueue ref="queue" /></a-tab-pane>
    <a-tab-pane key="labels" tab="标签复核待办"><LabelReviewQueue ref="labelQueue" /></a-tab-pane>
    <a-tab-pane v-if="can('iqc:report:view')" key="business-report" tab="业务评分统计"><BusinessQualityReport ref="businessReport" /></a-tab-pane>
    <a-tab-pane key="reviews" tab="人工复核"><a-table :data-source="reviews" :loading="loading" row-key="id"><a-table-column title="结果" data-index="resultId"/><a-table-column title="原状态" data-index="originalStatus"/><a-table-column title="原分数" data-index="originalScore"/><a-table-column title="复核状态" data-index="status"><template #default="{text}"><a-tag :color="text==='PENDING'?'orange':text==='CORRECTED'?'blue':'green'">{{text}}</a-tag></template></a-table-column><a-table-column title="复核人" data-index="reviewerId"/><a-table-column title="操作"><template #default="{record}"><a-button v-if="record.status==='PENDING'&&can('iqc:review:decide')" type="link" @click="openDecision(record)">处理</a-button></template></a-table-column></a-table></a-tab-pane>
    <a-tab-pane key="feedback" tab="误判/漏判"><a-table :data-source="feedbacks" :loading="loading" row-key="id"><a-table-column title="结果" data-index="resultId"/><a-table-column title="标注" data-index="feedbackType"/><a-table-column title="说明" data-index="comment"/><a-table-column title="状态" data-index="status"/><a-table-column title="时间" data-index="createdTime"/></a-table></a-tab-pane>
    <a-tab-pane key="samples" tab="样本库"><a-alert type="info" show-icon message="业务复核会话候选保存完整输入与裁决；CANDIDATE 需完成独立金标审核后才能冻结进入数据集。" /><a-table :data-source="samples" :loading="loading" row-key="id"><a-table-column title="名称" data-index="name"/><a-table-column title="类型" data-index="sampleType"/><a-table-column title="内容快照" ellipsis><template #default="{record}">{{record.privacy?.candidateContentVisible===false?"内容受权限限制":record.contentSnapshot||"—"}}</template></a-table-column><a-table-column title="状态" data-index="status"/><a-table-column title="金标状态"><template #default="{record}">{{record.goldStatus||'UNLABELLED'}}</template></a-table-column><a-table-column title="时间" data-index="createdTime"/><a-table-column title="操作"><template #default="{record}"><a-button v-if="can('iqc:gold:view')" type="link" @click="openGold(record)">金标标注与审核</a-button></template></a-table-column></a-table></a-tab-pane>
  </a-tabs></a-card>
  <a-drawer :open="goldOpen" title="金标样本" :width="960" :destroy-on-close="true" :mask-closable="false" :keyboard="false" @close="closeGold"><GoldSampleEditor v-if="goldSampleId" ref="goldEditor" :sample-id="goldSampleId" @changed="refresh" /></a-drawer>
  <a-modal v-model:open="decisionOpen" title="处理人工复核" @ok="saveDecision"><a-form layout="vertical"><a-form-item label="决定"><a-select v-model:value="form.decision"><a-select-option value="APPROVED">确认原结论</a-select-option><a-select-option value="CORRECTED">修正结论</a-select-option><a-select-option value="REJECTED">退回</a-select-option></a-select></a-form-item><template v-if="form.decision==='CORRECTED'"><a-form-item label="结果状态"><a-select v-model:value="form.finalStatus"><a-select-option value="HIT">命中</a-select-option><a-select-option value="NOT_HIT">未命中</a-select-option><a-select-option value="ERROR">错误</a-select-option></a-select></a-form-item><a-form-item label="最终分数"><a-input-number v-model:value="form.finalScore" :min="0" :max="100"/></a-form-item><a-form-item label="风险"><a-select v-model:value="form.finalRiskLevel"><a-select-option value="LOW">低</a-select-option><a-select-option value="MEDIUM">中</a-select-option><a-select-option value="HIGH">高</a-select-option></a-select></a-form-item></template><a-form-item label="复核说明"><a-textarea v-model:value="form.comment" :rows="3"/></a-form-item></a-form></a-modal>
</template>
